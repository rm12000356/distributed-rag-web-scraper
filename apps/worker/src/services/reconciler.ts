import { prisma } from "@rag/database";
import { createQdrantStore } from "@rag/vector";
import { createLocalEmbedder } from "@rag/rag";
import { createLogger } from "@rag/shared";

const logger = createLogger("reconciler");

const RECONCILE_INTERVAL_MS = parseInt(process.env["RECONCILE_INTERVAL_MS"] || "300000", 10);
const RECONCILE_STALE_MS = parseInt(process.env["RECONCILE_STALE_MS"] || "900000", 10);

export function startReconciler(): void {
  logger.info(`Starting reconciler`, { interval: RECONCILE_INTERVAL_MS, stale: RECONCILE_STALE_MS });

  const interval = setInterval(async () => {
    try {
      await reconcile();
    } catch (err) {
      logger.error("Reconcile cycle failed", { error: (err as Error).message });
    }
  }, RECONCILE_INTERVAL_MS);

  process.on("SIGTERM", () => clearInterval(interval));
  process.on("SIGINT", () => clearInterval(interval));
}

async function reconcile(): Promise<void> {
  const staleThreshold = new Date(Date.now() - RECONCILE_STALE_MS);

  const stuckPages = await prisma.page.findMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: staleThreshold },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { _count: { select: { chunks: true } } },
      },
    },
  });

  if (stuckPages.length === 0) return;

  const store = createQdrantStore();
  let fixed = 0;

  for (const page of stuckPages) {
    const version = page.versions[0];
    if (!version) {
      await prisma.page.update({ where: { id: page.id }, data: { status: "FAILED" } }).catch(() => {});
      logger.info(`Fixed: no version found — marked FAILED`, { pageId: page.id });
      fixed++;
      continue;
    }

    const dbChunkCount = version._count.chunks;
    const filter = { must: [{ key: "pageVersionId", match: { value: version.id } }] };
    const qdrantCount = await store.countByFilter("pages", filter).catch(() => -1);

    if (dbChunkCount > 0 && qdrantCount > 0) {
      await prisma.page
        .update({ where: { id: page.id }, data: { status: "PROCESSED" } })
        .catch(() => {});
      logger.info(`Fixed: chunks+vectors existed — marked PROCESSED`, { pageId: page.id });
      fixed++;
    } else if (dbChunkCount > 0 && qdrantCount === 0) {
      try {
        await reUpsertChunksFromDb(store, version.id);
        await prisma.page
          .update({ where: { id: page.id }, data: { status: "PROCESSED" } })
          .catch(() => {});
        logger.info(`Fixed: re-upserted to Qdrant from DB chunks`, { pageId: page.id, chunks: dbChunkCount });
        fixed++;
      } catch (err) {
        logger.error(`Re-upsert failed — will retry next cycle`, { pageId: page.id, error: (err as Error).message });
      }
    } else if (dbChunkCount === 0 && qdrantCount > 0) {
      await store.deleteByFilter("pages", filter).catch(() => {});
      await prisma.page
        .update({ where: { id: page.id }, data: { status: "FAILED" } })
        .catch(() => {});
      logger.info(`Fixed: deleted orphaned Qdrant points — marked FAILED`, { pageId: page.id });
      fixed++;
    } else {
      await prisma.page
        .update({ where: { id: page.id }, data: { status: "FAILED" } })
        .catch(() => {});
      logger.info(`Fixed: no chunks, no vectors — marked FAILED`, { pageId: page.id });
      fixed++;
    }
  }

  if (fixed > 0) {
    logger.info(`Reconcile cycle complete`, { stuckFound: stuckPages.length, fixed });
  }
}

async function reUpsertChunksFromDb(
  store: ReturnType<typeof createQdrantStore>,
  pageVersionId: string,
): Promise<void> {
  const chunks = await prisma.chunk.findMany({
    where: { pageVersionId },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) return;

  const embedder = createLocalEmbedder();
  const texts = chunks.map((c) => c.text);
  const vectors = await embedder.embed(texts);

  const points = chunks.map((chunk, i) => ({
    id: chunk.chunkId,
    vector: vectors[i] ?? [],
    payload: {
      pageUrl: chunk.pageUrl,
      websiteId: chunk.websiteId,
      pageVersionId: chunk.pageVersionId,
      text: chunk.text,
      chunkIndex: chunk.chunkIndex,
      heading: chunk.heading,
      pageTitle: chunk.pageTitle,
    },
  }));

  await store.upsert("pages", points);
}
