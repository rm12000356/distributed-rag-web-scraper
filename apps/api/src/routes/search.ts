import { Router } from "express";
import { z } from "zod";
import { prisma } from "@rag/database";
import { validate } from "../middleware/validate.js";
import { sendPaginated } from "../lib/response.js";
import { searchQuerySchema } from "@rag/shared/api.js";
import { createLocalEmbedder, RETRIEVAL_BOILERPLATE } from "@rag/rag";
import { createQdrantStore } from "@rag/vector";

const router = Router();

function isBoilerplate(text: string): boolean {
  return RETRIEVAL_BOILERPLATE.some((p) => p.test(text.slice(0, 200)));
}

const MAX_SEMANTIC_LIMIT = 500;

router.get("/", validate({ query: searchQuerySchema }), async (req, res) => {
  const { q, page, pageSize, mode } = (req as any).validatedQuery as z.infer<typeof searchQuerySchema>;

  if (mode === "fulltext") {
    const where = {
      content: { contains: q, mode: "insensitive" as const },
      status: { not: "FAILED" as const },
    };

    const skip = (page - 1) * pageSize;

    const [results, total] = await Promise.all([
      prisma.page.findMany({
        where,
        select: {
          id: true,
          url: true,
          websiteId: true,
          status: true,
          contentHash: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.page.count({ where }),
    ]);

    const data = results.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    sendPaginated(res, data, total, page, pageSize);
    return;
  }

  const limit = Math.min(page * pageSize, MAX_SEMANTIC_LIMIT);

  const embedder = createLocalEmbedder();
  const store = createQdrantStore();

  const vector = await embedder.embedSingle(q);
  const results = await store.search("pages", vector, limit);

  const chunks = results
    .map((r) => ({
      text: (r.payload["text"] as string) ?? "",
      pageUrl: (r.payload["pageUrl"] as string) ?? "",
      pageTitle: (r.payload["pageTitle"] as string) ?? "",
      heading: (r.payload["heading"] as string) ?? null,
      score: r.score,
      chunkIndex: (r.payload["chunkIndex"] as number) ?? 0,
    }))
    .filter((c) => !isBoilerplate(c.text));

  const total = chunks.length;
  const start = (page - 1) * pageSize;
  const paged = chunks.slice(start, start + pageSize);

  sendPaginated(res, paged, total, page, pageSize);
});

export default router;
