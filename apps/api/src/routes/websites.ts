import { Router } from "express";
import { prisma } from "@rag/database";
import { sendOk } from "../lib/response.js";

const router = Router();

router.get("/", async (_req, res) => {
  const websites = await prisma.website.findMany({
    include: {
      _count: { select: { pages: true, crawlJobs: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = websites.map((w) => ({
    id: w.id,
    url: w.url,
    pageCount: w._count.pages,
    jobCount: w._count.crawlJobs,
    createdAt: w.createdAt.toISOString(),
  }));

  sendOk(res, data);
});

export default router;
