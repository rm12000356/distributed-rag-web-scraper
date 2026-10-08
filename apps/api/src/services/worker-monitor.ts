import { prisma } from "@rag/database";
import { setupCrawlTopology, setupProcessingTopology, CRAWL_QUEUE, Publisher, ConnectionManager } from "@rag/queue";

const HEARTBEAT_TIMEOUT_MS = parseInt(process.env["HEARTBEAT_TIMEOUT_MS"] || "90000", 10);
const STALE_JOB_MS = parseInt(process.env["STALE_JOB_MS"] || "600000", 10);
const MONITOR_INTERVAL = 30_000;
const STALE_MAX_ATTEMPTS = 3;

export function startWorkerMonitor(rabbitmqUrl: string): void {
  console.log("[Monitor] Starting worker monitor");

  const interval = setInterval(async () => {
    try {
      await checkStaleWorkers();
      await recoverStaleJobs(rabbitmqUrl);
    } catch (err) {
      console.error("[Monitor] Error in monitor cycle:", (err as Error).message);
    }
  }, MONITOR_INTERVAL);

  process.on("SIGTERM", () => clearInterval(interval));
  process.on("SIGINT", () => clearInterval(interval));
}

async function checkStaleWorkers(): Promise<void> {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const stale = await prisma.worker.updateMany({
    where: {
      status: "ACTIVE",
      lastHeartbeat: { lt: cutoff },
    },
    data: { status: "OFFLINE" },
  });

  if (stale.count > 0) {
    console.log(`[Monitor] Marked ${stale.count} stale worker(s) as OFFLINE`);
  }
}

async function recoverStaleJobs(rabbitmqUrl: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);

  const staleJobs = await prisma.crawlJob.findMany({
    where: {
      status: "RUNNING",
      updatedAt: { lt: cutoff },
    },
  });

  if (staleJobs.length === 0) return;

  let cm: ConnectionManager | null = null;

  try {
    cm = new ConnectionManager(rabbitmqUrl);
    const channel = await cm.connect();
    await setupCrawlTopology(channel);
    await setupProcessingTopology(channel);
    const publisher = new Publisher(channel);

    for (const job of staleJobs) {
      const attempts = (job as { attempts?: number }).attempts ?? 0;

      if (attempts >= STALE_MAX_ATTEMPTS) {
        await prisma.crawlJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            lastError: `stale_running: exceeded ${STALE_MAX_ATTEMPTS} recovery attempts`,
          },
        });
        console.log(`[Monitor] Failed stale job ${job.id} after ${attempts} recovery attempts`);
        continue;
      }

      const page = await prisma.page.findFirst({
        where: { crawlJobId: job.id },
        select: { url: true },
      });

      if (!page) {
        await prisma.crawlJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            lastError: "stale_running: no page URL found for recovery",
          },
        });
        console.log(`[Monitor] Failed stale job ${job.id} — no page URL`);
        continue;
      }

      await prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          attempts: attempts + 1,
          lastError: `stale_running: recovered by monitor (attempt ${attempts + 1})`,
        },
      });

      await publisher.publish(CRAWL_QUEUE, {
        jobId: job.id,
        websiteId: job.websiteId,
        url: page.url,
        depth: job.depth,
        attempt: attempts + 1,
        lastError: `stale_running: recovered by monitor`,
      });

      console.log(`[Monitor] Re-enqueued stale job ${job.id} (attempt ${attempts + 1}): ${page.url}`);
    }
  } finally {
    if (cm) await cm.close();
  }
}
