import "./load-env.js";
import { ConnectionManager, Consumer, Publisher, setupCrawlTopology, setupProcessingTopology, CRAWL_QUEUE, PROCESSING_QUEUE, isRetryableError, type HandleResult } from "@rag/queue";
import { prisma } from "@rag/database";
import { closeBrowser } from "@rag/scraper";
import type { CrawlJobMessage, ProcessJobMessage } from "@rag/shared";
import { createLogger } from "@rag/shared";
import { createServer } from "node:http";
import { processCrawlJob } from "./services/crawler.js";
import { handleProcessJob } from "./services/processing-worker.js";
import { startReconciler } from "./services/reconciler.js";

const logger = createLogger("worker");

const stats = { processed: 0, failed: 0, startedAt: Date.now() };
let modelLoaded = false;

async function checkModelHealth(): Promise<boolean> {
  if (modelLoaded) return true;
  try {
    const { createLocalEmbedder } = await import("@rag/rag");
    const embedder = createLocalEmbedder();
    await embedder.embedSingle("health check");
    modelLoaded = true;
    logger.info("Embedding model loaded and verified");
    return true;
  } catch {
    return false;
  }
}

const RABBITMQ_URL = process.env["RABBITMQ_URL"] || "amqp://guest:guest@localhost:5672";
const WORKER_NAME = process.env["WORKER_NAME"] || `worker-${Math.random().toString(36).slice(2, 8)}`;
const HEARTBEAT_INTERVAL = parseInt(process.env["HEARTBEAT_INTERVAL_MS"] || "30000", 10);
const CRAWL_MAX_ATTEMPTS = parseInt(process.env["CRAWL_MAX_ATTEMPTS"] || "5", 10);
const CRAWL_PREFETCH = parseInt(process.env["CRAWL_PREFETCH"] || "1", 10);
const PROCESSING_WORKER_ENABLED = process.env["PROCESSING_WORKER_ENABLED"] !== "false";
const PROCESSING_PREFETCH = parseInt(process.env["PROCESSING_PREFETCH"] || "1", 10);

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(fn: () => Promise<T>, label: string, max = 10, delay = 3000): Promise<T> {
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === max) throw err;
      console.error(`${label} failed (attempt ${attempt}/${max}):`, (err as Error).message);
      console.log(`Retrying in ${delay}ms...`);
      await wait(delay);
    }
  }
  throw new Error(`Exhausted retries for: ${label}`);
}

const cm = new ConnectionManager(RABBITMQ_URL);

let healthServer: ReturnType<typeof createServer> | null = null;

function startHealthServer(port: number): void {
  healthServer = createServer(async (_req, res) => {
    const uptime = Date.now() - stats.startedAt;
    const modelHealthy = await checkModelHealth();

    if (!modelHealthy && uptime > 60_000) {
      const body = JSON.stringify({ status: "unhealthy", reason: "embedding model not loaded", worker: WORKER_NAME, uptime });
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    const body = JSON.stringify({
      status: modelHealthy ? "ok" : "starting",
      worker: WORKER_NAME,
      uptime,
      processed: stats.processed,
      failed: stats.failed,
      modelLoaded,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  healthServer.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });
  healthServer.on("error", (err: Error) => {
    logger.warn(`Health server error`, { error: err.message });
  });
}

const shutdown = async () => {
  console.log("Shutting down worker gracefully...");
  if (healthServer) {
    await new Promise<void>((resolve) => healthServer!.close(() => resolve()));
  }
  await closeBrowser().catch(() => {});
  await prisma.worker.update({
    where: { name: WORKER_NAME },
    data: { status: "IDLE" },
  }).catch(() => {});
  await cm.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function handleCrawlJob(
  job: CrawlJobMessage,
  meta: { attempt: number; raw: unknown },
): Promise<HandleResult | void> {
  const attempt = job.attempt ?? meta.attempt ?? 1;
  const maxAttempts = job.maxAttempts ?? CRAWL_MAX_ATTEMPTS;
  const log = job.traceId
    ? logger.child({ traceId: job.traceId, jobId: job.jobId })
    : logger.child({ jobId: job.jobId });

  log.info(`Processing crawl job (attempt ${attempt}/${maxAttempts}): ${job.url}`);

  const channel = cm.getChannel();
  const publisher = new Publisher(channel);

  try {
    await processCrawlJob(job, publisher);
    stats.processed++;
    return { action: "ack" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error(`Job failed`, { error: error.message });

    if (isRetryableError(error) && attempt < maxAttempts) {
      return {
        action: "retry",
        error,
      };
    }

    stats.failed++;

    try {
      await prisma.crawlJob.update({
        where: { id: job.jobId },
        data: {
          status: "FAILED",
          attempts: attempt,
          lastError: error.message,
        },
      });
    } catch {
      // ignore db error during failure handling
    }

    return {
      action: "dead",
      error,
    };
  }
}

async function startHeartbeat(): Promise<void> {
  await prisma.worker.upsert({
    where: { name: WORKER_NAME },
    update: { lastHeartbeat: new Date(), status: "ACTIVE" },
    create: {
      name: WORKER_NAME,
      status: "ACTIVE",
      lastHeartbeat: new Date(),
    },
  }).catch((err) => {
    console.error("Heartbeat upsert failed:", (err as Error).message);
  });
}

async function main(): Promise<void> {
  const HEALTH_PORT = parseInt(process.env["WORKER_HEALTH_PORT"] || "3001", 10);
  startHealthServer(HEALTH_PORT);

  logger.info(
    `Starting ${WORKER_NAME}`, { prefetch: CRAWL_PREFETCH, maxAttempts: CRAWL_MAX_ATTEMPTS, heartbeat: HEARTBEAT_INTERVAL, processingWorker: PROCESSING_WORKER_ENABLED },
  );
  logger.info(`Connecting to RabbitMQ at ${RABBITMQ_URL}`);
  const channel = await cm.connect();
  logger.info("RabbitMQ connected, setting up topology");
  await setupCrawlTopology(channel);
  await setupProcessingTopology(channel);
  logger.info("Topology ready, registering consumers");

  await retry(() => startHeartbeat(), "Initial heartbeat");
  setInterval(startHeartbeat, HEARTBEAT_INTERVAL);
  logger.info(`Heartbeat started (interval=${HEARTBEAT_INTERVAL}ms)`);

  const crawlConsumer = new Consumer(channel);
  await crawlConsumer.consume<CrawlJobMessage>(CRAWL_QUEUE, handleCrawlJob, CRAWL_PREFETCH);
  logger.info(`Listening on "${CRAWL_QUEUE}"`);

  if (PROCESSING_WORKER_ENABLED) {
    const processConsumer = new Consumer(channel);
    await processConsumer.consume<ProcessJobMessage>(PROCESSING_QUEUE, handleProcessJob, PROCESSING_PREFETCH);
    logger.info(`Listening on "${PROCESSING_QUEUE}"`);
  }

  logger.info(`${WORKER_NAME} ready`);

  startReconciler();
}

main().catch((err) => {
  console.error("Worker failed to start:", (err as Error).message);
  process.exit(1);
});
