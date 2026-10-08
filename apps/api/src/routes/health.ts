import { Router } from "express";
import { prisma } from "@rag/database";
import { isQueueHealthy } from "../services/queue.js";
import { createQdrantStore } from "@rag/vector";
import { sendOk } from "../lib/response.js";

const router = Router();

router.get("/", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {
    database: "error",
    queue: "error",
    vectorDb: "error",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks["database"] = "ok";
  } catch {
    checks["database"] = "error";
  }

  checks["queue"] = isQueueHealthy() ? "ok" : "error";

  try {
    const store = createQdrantStore();
    const healthy = await store.healthCheck();
    checks["vectorDb"] = healthy ? "ok" : "error";
  } catch {
    checks["vectorDb"] = "error";
  }

  const allOk = Object.values(checks).every((c) => c === "ok");

  if (allOk) {
    sendOk(res, { service: "api", checks, uptime: process.uptime() });
  } else {
    res.status(500).json({
      status: "degraded",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
