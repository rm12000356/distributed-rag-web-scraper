import { Router } from "express";
import { z } from "zod";
import { prisma } from "@rag/database";
import { validate } from "../middleware/validate.js";
import { sendOk, sendError, sendPaginated } from "../lib/response.js";
import { paginationSchema } from "@rag/shared/api.js";

const router = Router();

const pagesQuerySchema = paginationSchema.extend({
  websiteId: z.string().optional(),
  status: z.enum(["QUEUED", "SCRAPED", "PROCESSING", "PROCESSED", "FAILED"]).optional(),
  search: z.string().optional(),
});

router.get("/", validate({ query: pagesQuerySchema }), async (req, res) => {
  const { page, pageSize, websiteId, status, search } = (req as any).validatedQuery as z.infer<typeof pagesQuerySchema>;

  const where: Record<string, unknown> = {};
  if (websiteId) where["websiteId"] = websiteId;
  if (status) where["status"] = status;
  if (search) where["url"] = { contains: search, mode: "insensitive" };

  const skip = (page - 1) * pageSize;

  const [pages, total] = await Promise.all([
    prisma.page.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.page.count({ where }),
  ]);

  sendPaginated(res, pages, total, page, pageSize);
});

router.get("/:id", validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  const { id } = (req as any).validatedParams as { id: string };

  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      website: { select: { id: true, url: true } },
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });

  if (!page) {
    sendError(res, "Page not found", 404);
    return;
  }

  const data = {
    ...page,
    website: page.website,
    versions: page.versions.map((v) => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
    })),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };

  sendOk(res, data);
});

export default router;
