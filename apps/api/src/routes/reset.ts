import { Router } from "express";
import { prisma } from "@rag/database";
import { createQdrantStore } from "@rag/vector";
import { purgeResetQueues } from "../services/queue.js";
import { sendOk, sendError } from "../lib/response.js";

const router = Router();

router.post("/", async (_req, res) => {
  if (process.env["RESET_ENABLED"] !== "true") {
    return sendError(res, "Reset endpoint is disabled. Set RESET_ENABLED=true to enable.", 403);
  }

  const result: {
    message: string;
    database: "ok" | "error";
    vectorDb: "ok" | "error";
    queue: "ok" | "error";
    messagesPurged: number;
    collectionsDeleted: string[];
    errors: string[];
  } = {
    message: "",
    database: "ok",
    vectorDb: "ok",
    queue: "ok",
    messagesPurged: 0,
    collectionsDeleted: [],
    errors: [],
  };

  // Step 1: Purge RabbitMQ queues (stop pending jobs before clearing data)
  try {
    const purged = await purgeResetQueues();
    result.messagesPurged = purged.crawl + purged.dlq;
  } catch (err) {
    result.queue = "error";
    result.errors.push(`queue: ${(err as Error).message}`);
  }

  // Step 2: Clear PostgreSQL tables
  try {
    await prisma.$transaction([
      prisma.chunk.deleteMany({}),
      prisma.pageVersion.deleteMany({}),
      prisma.page.deleteMany({}),
      prisma.crawlJob.deleteMany({}),
      prisma.website.deleteMany({}),
      prisma.worker.deleteMany({}),
    ]);
  } catch (err) {
    result.database = "error";
    result.errors.push(`database: ${(err as Error).message}`);
  }

  try {
    const store = createQdrantStore();
    const names = await store.listCollections();
    for (const name of names) {
      await store.deleteCollection(name);
      result.collectionsDeleted.push(name);
    }
  } catch (err) {
    result.vectorDb = "error";
    result.errors.push(`vectorDb: ${(err as Error).message}`);
  }

  if (result.database === "error" || result.vectorDb === "error" || result.queue === "error") {
    result.message = "Reset completed with errors";
    return sendOk(res, result, 207);
  }

  result.message = "All data reset";
  return sendOk(res, result);
});

export default router;
