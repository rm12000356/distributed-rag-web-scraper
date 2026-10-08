import { Router } from "express";
import { z } from "zod";
import { prisma } from "@rag/database";
import { validate } from "../middleware/validate.js";
import { sendOk, sendError, sendPaginated } from "../lib/response.js";
import { paginationSchema } from "@rag/shared/api.js";

const router = Router();

const jobsQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).optional(),
});

router.get("/", validate({ query: jobsQuerySchema }), async (req, res) => {
  const { page, pageSize, status } = (req as any).validatedQuery as z.infer<typeof jobsQuerySchema>;

  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;

  const skip = (page - 1) * pageSize;

  const [jobs, total] = await Promise.all([
    prisma.crawlJob.findMany({
      where,
      include: {
        website: { select: { url: true } },
        _count: { select: { pages: true } },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.crawlJob.count({ where }),
  ]);

  const data = jobs.map((j) => ({
    id: j.id,
    status: j.status,
    depth: j.depth,
    attempts: j.attempts,
    lastError: j.lastError,
    websiteId: j.websiteId,
    websiteUrl: j.website.url,
    pageCount: j._count.pages,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  }));

  sendPaginated(res, data, total, page, pageSize);
});

router.get("/:id", validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const { id } = (req as any).validatedParams as { id: string };

  const job = await prisma.crawlJob.findUnique({
    where: { id },
    include: {
      website: { select: { id: true, url: true } },
      pages: true,
    },
  });

  if (!job) {
    sendError(res, "Job not found", 404);
    return;
  }

  const data = {
    ...job,
    website: job.website,
    pages: job.pages.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };

  sendOk(res, data);
});

export default router;
