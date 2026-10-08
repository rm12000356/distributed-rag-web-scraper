import { z } from "zod";

export const crawlBodySchema = z.object({
  url: z.string().url(),
  depth: z.number().int().min(1).max(5).default(1),
  websiteId: z.string().optional(),
});

export const askBodySchema = z.object({
  question: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchQuerySchema = paginationSchema.extend({
  q: z.string().min(1),
  mode: z.enum(["fulltext", "semantic"]).default("fulltext"),
});
