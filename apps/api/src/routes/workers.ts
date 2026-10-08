import { Router } from "express";
import { prisma } from "@rag/database";
import { sendOk } from "../lib/response.js";

const router = Router();

router.get("/", async (_req, res) => {
  const workers = await prisma.worker.findMany({
    orderBy: { createdAt: "desc" },
  });

  const data = workers.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    lastHeartbeat: w.lastHeartbeat?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
  }));

  sendOk(res, data);
});

export default router;
