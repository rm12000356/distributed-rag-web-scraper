import { Router } from "express";
import { getPublisher } from "../services/queue.js";
import { randomUUID } from "node:crypto";
import { validate } from "../middleware/validate.js";
import { sendOk, sendError } from "../lib/response.js";
import { crawlBodySchema } from "@rag/shared/api.js";
import type { CrawlJobMessage } from "@rag/shared";
import { createLogger } from "@rag/shared";

const logger = createLogger("api:crawl");

const router = Router();

router.post("/", validate({ body: crawlBodySchema }), async (req, res) => {
  try {
    const { url, depth, websiteId } = req.body as { url: string; depth: number; websiteId?: string };

    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      sendError(res, "url must be an http or https URL", 400);
      return;
    }

    const jobId = randomUUID();
    const traceId = randomUUID();
    const publisher = getPublisher();
    await publisher.publish<CrawlJobMessage>("crawl", {
      jobId,
      websiteId: websiteId ?? randomUUID(),
      url: parsed.href,
      depth,
      traceId,
    });

    logger.info("Crawl job published", { jobId, traceId, url: parsed.href, depth });
    sendOk(res, { jobId, url: parsed.href, depth, traceId });
  } catch (err) {
    logger.error("Failed to publish crawl job", { error: (err as Error).message });
    sendError(res, "Failed to publish crawl job", 500);
  }
});

export default router;
