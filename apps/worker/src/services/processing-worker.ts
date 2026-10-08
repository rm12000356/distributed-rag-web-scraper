import { prisma } from "@rag/database";
import { isRetryableError, type HandleResult } from "@rag/queue";
import type { ProcessJobMessage } from "@rag/shared";
import { createLogger } from "@rag/shared";
import { processChunks } from "./chunker.js";

const logger = createLogger("processing-worker");

const PROCESSING_MAX_ATTEMPTS = parseInt(process.env["PROCESSING_MAX_ATTEMPTS"] || "5", 10);

export async function handleProcessJob(
  msg: ProcessJobMessage,
  meta: { attempt: number; raw: unknown },
): Promise<HandleResult | void> {
  const attempt = msg.attempt ?? meta.attempt ?? 1;
  const maxAttempts = msg.maxAttempts ?? PROCESSING_MAX_ATTEMPTS;
  const log = msg.traceId
    ? logger.child({ traceId: msg.traceId, pageVersionId: msg.pageVersionId })
    : logger.child({ pageVersionId: msg.pageVersionId });

  log.info(`Processing job (attempt ${attempt}/${maxAttempts})`);

  const pageVersion = await prisma.pageVersion.findUnique({
    where: { id: msg.pageVersionId },
    include: {
      page: { select: { id: true, status: true, url: true, websiteId: true, title: true } },
    },
  });

  if (!pageVersion) {
    log.warn(`PageVersion not found — may have been deleted`);
    return { action: "ack" };
  }

  if (pageVersion.page.status === "PROCESSED") {
    log.info(`Page already PROCESSED — skipping`);
    return { action: "ack" };
  }

  const sections = JSON.parse(pageVersion.normalizedJson ?? "[]");
  const metadata = JSON.parse(pageVersion.metadataJson ?? "{}");

  await prisma.page.update({
    where: { id: pageVersion.page.id },
    data: { status: "PROCESSING" },
  });

  const existingChunks = await prisma.chunk.count({
    where: { pageVersionId: msg.pageVersionId },
  });
  if (existingChunks > 0) {
    await prisma.page
      .update({
        where: { id: pageVersion.page.id },
        data: { status: "PROCESSED" },
      })
      .catch(() => {});
    log.info(`Chunks already exist — marking PROCESSED (crash recovery)`);
    return { action: "ack" };
  }

  try {
    await processChunks(
      pageVersion.id,
      pageVersion.plainText,
      sections,
      metadata,
      pageVersion.page.url,
      pageVersion.page.websiteId,
      pageVersion.page.title ?? pageVersion.page.url,
    );

    await prisma.page.update({
      where: { id: pageVersion.page.id },
      data: { status: "PROCESSED" },
    });

    log.info(`Page processed successfully`);
    return { action: "ack" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error(`Processing failed`, { error: error.message });

    if (isRetryableError(error) && attempt < maxAttempts) {
      return { action: "retry", error };
    }

    await prisma.page
      .update({
        where: { id: pageVersion.page.id },
        data: { status: "FAILED" },
      })
      .catch(() => {});

    return { action: "dead", error };
  }
}
