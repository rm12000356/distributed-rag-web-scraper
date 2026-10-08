import { prisma } from "@rag/database";
import { Publisher, PROCESSING_QUEUE } from "@rag/queue";
import type { CrawlJobMessage, ProcessJobMessage } from "@rag/shared";
import { createLogger } from "@rag/shared";
import {
  fetchStatic,
  fetchDynamic,
  FetchError,
  RobotsTxtManager,
  RateLimiter,
  extract,
  type ExtractedData,
  DedupChecker,
  contentHash,
  cleanHtml,
  normalizeContent,
  extractMetadata,
  type CleanResult,
  type NormalizedContent,
  type EnhancedMetadata,
} from "@rag/scraper";
import { shouldSkipUrl, shouldKeepContent, filterChildLinks, filterSections } from "./quality.js";
import { randomUUID } from "node:crypto";

const DEFAULT_CRAWL_DELAY_MS = 1_000;
const ROBOTS_USER_AGENT = "Distributed-RAG-Crawler/1.0";
const MAX_CHILD_LINKS = parseInt(process.env["MAX_CHILD_LINKS"] || "50", 10);

const logger = createLogger("crawler");

const robotsManager = new RobotsTxtManager();
const rateLimiter = new RateLimiter(DEFAULT_CRAWL_DELAY_MS);
const dedupChecker = new DedupChecker();

function getDomain(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

async function ensureJobRecords(
  jobId: string,
  pageUrl: string,
  depth: number,
): Promise<{ websiteId: string; renderMode: string }> {
  const origin = new URL(pageUrl).origin;

  const website = await prisma.website.upsert({
    where: { url: origin },
    update: {},
    create: { url: origin, renderMode: "dynamic" },
  });

  await prisma.crawlJob.upsert({
    where: { id: jobId },
    update: { status: "RUNNING", depth },
    create: {
      id: jobId,
      websiteId: website.id,
      depth,
      status: "RUNNING",
    },
  });

  return { websiteId: website.id, renderMode: website.renderMode };
}

async function createPageVersion(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  data: {
    pageId: string;
    contentHash: string;
    plainText: string;
    normalizedJson: string;
    metadataJson: string;
    versionNumber?: number;
  },
): Promise<{ pageVersionId: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const maxVersion = await tx.pageVersion.findFirst({
        where: { pageId: data.pageId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });

      const created = await tx.pageVersion.create({
        data: {
          pageId: data.pageId,
          contentHash: data.contentHash,
          plainText: data.plainText,
          normalizedJson: data.normalizedJson,
          metadataJson: data.metadataJson,
          versionNumber: data.versionNumber ?? (maxVersion?.versionNumber ?? 0) + 1,
        },
      });
      return { pageVersionId: created.id };
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === "P2002" && attempt < 2) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable: createPageVersion loop exhausted");
}

export async function processCrawlJob(
  job: CrawlJobMessage,
  publisher: Publisher,
): Promise<void> {
  const { jobId, url, depth, traceId } = job;
  const log = traceId ? logger.child({ traceId, jobId }) : logger.child({ jobId });
  log.info(`Processing job: ${url}`, { depth });

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      log.error(`Invalid protocol for "${url}"`);
      return;
    }
  } catch (err) {
    log.error(`Invalid URL "${url}"`, { error: (err as Error).message });
    return;
  }

  let websiteId: string;
  let renderMode: string;
  try {
    ({ websiteId, renderMode } = await ensureJobRecords(jobId, url, depth));
    log.info(`Records ready`, { renderMode, websiteId });
  } catch (err) {
    log.error(`Failed to create job records`, { error: (err as Error).message });
    throw err;
  }

  const skipReason = shouldSkipUrl(url);
  if (skipReason) {
    log.info(`Discarding: ${url} — ${skipReason}`);
    await markJobCompleted(jobId);
    return;
  }

  try {
    const allowed = await robotsManager.isAllowed(url, ROBOTS_USER_AGENT);
    if (!allowed) {
      log.info(`robots.txt blocks: ${url}`);
      await markJobCompleted(jobId);
      return;
    }

    const crawlDelay = await robotsManager.getCrawlDelay(url);
    if (crawlDelay !== undefined) {
      rateLimiter.setDomainDelay(parsed.hostname.toLowerCase(), crawlDelay);
    }
  } catch {
    log.info(`robots.txt check failed, allowing: ${url}`);
  }

  await rateLimiter.waitForSlot(url);
  log.info(`Rate-limit slot acquired, fetching...`);

  const fetchStart = Date.now();
  let fetchResult;
  let usedDynamic = false;

  if (renderMode === "dynamic") {
    try {
      fetchResult = await fetchDynamic(url, { userAgent: ROBOTS_USER_AGENT });
      usedDynamic = true;
    } catch (err) {
      if (err instanceof FetchError && err.code === "NOT_HTML") {
        log.info(`Skipping non-HTML (dynamic): ${url} (${err.message})`);
        await markJobCompleted(jobId);
        return;
      }
      throw err;
    }
  } else {
    // static or auto: try static first
    try {
      fetchResult = await fetchStatic(url, { userAgent: ROBOTS_USER_AGENT });
    } catch (err) {
      if (err instanceof FetchError && err.code === "NOT_HTML") {
        log.info(`Skipping non-HTML: ${url} (${err.message})`);
        await markJobCompleted(jobId);
        return;
      }
      // On auto mode, retryable errors → try dynamic as fallback
      if (
        renderMode === "auto" &&
        err instanceof FetchError &&
        (err.code === "TIMEOUT" || err.code === "NETWORK")
      ) {
        log.info(`Static fetch failed (${err.code}), falling back to dynamic: ${url}`);
        try {
          fetchResult = await fetchDynamic(url, { userAgent: ROBOTS_USER_AGENT });
          usedDynamic = true;
        } catch (dynamicErr) {
          if (dynamicErr instanceof FetchError && dynamicErr.code === "NOT_HTML") {
            log.info(`Skipping non-HTML (dynamic fallback): ${url} (${(dynamicErr as Error).message})`);
            await markJobCompleted(jobId);
            return;
          }
          throw dynamicErr;
        }
      } else {
        throw err;
      }
    }

    // Static succeeded — on auto mode, check if content is sparse (likely an SPA shell)
    if (!usedDynamic && renderMode === "auto") {
      try {
        const $ = (fetchResult as { $: any }).$;

        const bodyText = $("body").text().trim();
        const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

        const contentSelectors = ["main", '[role="main"]', "span.text", "article", ".content", ".post", ".article", "body"];
        let contentContainer = $("body");
        for (const sel of contentSelectors) {
          const el = $(sel).first();
          if (el.length > 0) {
            contentContainer = el;
            break;
          }
        }
        const containerText = contentContainer.text().trim();
        const containerWords = containerText.split(/\s+/).filter(Boolean).length;

        const totalChars = bodyText.length;
        const linkChars = $("a").text().trim().length;
        const linkCharRatio = totalChars > 0 ? linkChars / totalChars : 0;

        const isShell = wordCount < 20 || containerWords < 5 || linkCharRatio > 0.5;

        if (isShell) {
          log.info(
            `SPA shell detected (words=${wordCount}, contentWords=${containerWords}, linkRatio=${Math.round(linkCharRatio * 100)}%), falling back to dynamic: ${url}`,
          );
          try {
            fetchResult = await fetchDynamic(url, { userAgent: ROBOTS_USER_AGENT });
            usedDynamic = true;
          } catch (dynamicErr) {
            // Dynamic fallback failed, keep the static result
            log.info(`Dynamic fallback failed, keeping static result: ${url}`);
          }
        }
      } catch {
        // Cheerio extraction failed — keep static result
      }
    }
  }

  if (usedDynamic) {
    log.info(`Rendered in ${Date.now() - fetchStart}ms`, { bytes: (fetchResult as { html: string }).html.length, status: (fetchResult as { statusCode: number }).statusCode });
  } else {
    log.info(`Fetched in ${Date.now() - fetchStart}ms`, { bytes: (fetchResult as { html: string }).html.length, status: (fetchResult as { statusCode: number }).statusCode });
  }

  let extracted: ExtractedData;
  try {
    extracted = extract(fetchResult.$, url);
    log.info(`Extracted title`, { title: extracted.title.slice(0, 60), links: extracted.links.length });
  } catch (err) {
    log.error(`Extraction failed for ${url}`, { error: (err as Error).message });
    throw err;
  }

  const cleanStart = Date.now();
  let cleaned: CleanResult;
  try {
    cleaned = cleanHtml(fetchResult.html);
    cleaned = filterSections(cleaned, url);
  } catch (err) {
    log.error(`HTML cleaning failed for ${url}`, { error: (err as Error).message });
    throw err;
  }

  let normalized: NormalizedContent;
  try {
    normalized = normalizeContent(cleaned.cleanedText, cleaned.sectionTitles);
  } catch (err) {
    log.error(`Normalization failed for ${url}`, { error: (err as Error).message });
    throw err;
  }

  let metadata: EnhancedMetadata;
  try {
    metadata = extractMetadata(fetchResult.$, normalized.wordCount);
  } catch (err) {
    log.error(`Metadata extraction failed for ${url}`, { error: (err as Error).message });
    throw err;
  }

  log.info(
    `Processed in ${Date.now() - cleanStart}ms`, { title: cleaned.title.slice(0, 60), words: normalized.wordCount, sections: normalized.sectionCount },
  );

  let contentCheck = shouldKeepContent(normalized.wordCount, cleaned.cleanedText, url);
  if (!contentCheck.keep && contentCheck.shouldRetryDynamic && !usedDynamic && renderMode === "auto") {
    log.info(`Static content rejected (${contentCheck.reason}), falling back to dynamic: ${url}`);
    try {
      fetchResult = await fetchDynamic(url, { userAgent: ROBOTS_USER_AGENT });
      usedDynamic = true;
    } catch (dynamicErr) {
      log.info(`Dynamic fallback also failed: ${url}`, { error: (dynamicErr as Error).message });
      await markJobCompleted(jobId);
      return;
    }

    try {
      extracted = extract(fetchResult.$, url);
    } catch (err) {
      log.error(`Re-extraction failed for ${url}`, { error: (err as Error).message });
      throw err;
    }

    try {
      cleaned = cleanHtml(fetchResult.html);
      cleaned = filterSections(cleaned, url);
    } catch (err) {
      log.error(`Re-cleaning failed for ${url}`, { error: (err as Error).message });
      throw err;
    }

    try {
      normalized = normalizeContent(cleaned.cleanedText, cleaned.sectionTitles);
    } catch (err) {
      log.error(`Re-normalization failed for ${url}`, { error: (err as Error).message });
      throw err;
    }

    try {
      metadata = extractMetadata(fetchResult.$, normalized.wordCount);
    } catch (err) {
      log.error(`Re-metadata failed for ${url}`, { error: (err as Error).message });
      throw err;
    }

    contentCheck = shouldKeepContent(normalized.wordCount, cleaned.cleanedText, url);
  }

  if (!contentCheck.keep) {
    log.info(`Discarding: ${url} — ${contentCheck.reason}`);
    await markJobCompleted(jobId);
    return;
  }

  const hash = cleaned.cleanedText.length > 0 ? contentHash(cleaned.cleanedText) : null;
  if (hash) {
    log.info(`Content hash=${hash.slice(0, 12)}...`);
  }

  let isDuplicate = false;
  if (hash && dedupChecker.isDuplicate(cleaned.cleanedText)) {
    isDuplicate = true;
  }

  if (!isDuplicate && hash) {
    dedupChecker.markAsSeen(cleaned.cleanedText);
  }

  if (!isDuplicate) {
    try {
      if (hash) {
        const existing = await prisma.page.findFirst({
          where: { websiteId, contentHash: hash },
          select: { id: true },
        });
        if (existing) {
          isDuplicate = true;
          log.info(`DB dedup hit for same content: ${url}`);
        }
      }

      if (!isDuplicate) {
        const normalizedJson = JSON.stringify(normalized.sections);
        const metadataJson = JSON.stringify(metadata);

        const existingPage = hash
          ? await prisma.page.findFirst({
              where: { websiteId, url },
              select: { id: true, contentHash: true, content: true },
            })
          : null;

        let createdPageVersionId: string | null = null;

        if (!existingPage) {
          createdPageVersionId = await prisma.$transaction(async (tx) => {
            const page = await tx.page.create({
              data: {
                url,
                title: cleaned.title,
                content: cleaned.cleanedText,
                status: "SCRAPED",
                websiteId,
                crawlJobId: jobId,
                ...(hash ? { contentHash: hash } : {}),
              },
            });

            const { pageVersionId } = await createPageVersion(tx, {
              pageId: page.id,
              contentHash: hash ?? "",
              plainText: normalized.plainText,
              normalizedJson,
              metadataJson,
              versionNumber: 1,
            });
            log.info(`New page created`, { pageId: page.id, version: 1 });
            return pageVersionId;
          });
        } else if (hash && existingPage.contentHash === hash) {
          await prisma.page.update({
            where: { id: existingPage.id },
            data: { title: cleaned.title, status: "SCRAPED", crawlJobId: jobId },
          });
          log.info(`Content unchanged, no new version`);
        } else {
          createdPageVersionId = await prisma.$transaction(async (tx) => {
            await tx.page.update({
              where: { id: existingPage!.id },
              data: {
                title: cleaned.title,
                content: cleaned.cleanedText,
                contentHash: hash,
                status: "SCRAPED",
                crawlJobId: jobId,
              },
            });

            const { pageVersionId } = await createPageVersion(tx, {
              pageId: existingPage!.id,
              contentHash: hash ?? "",
              plainText: normalized.plainText,
              normalizedJson,
              metadataJson,
            });
            log.info(`Content changed, created version`);
            return pageVersionId;
          });
        }

        if (createdPageVersionId) {
          log.info(`Dispatching to processing queue`, { pageVersionId: createdPageVersionId });
          await publisher.publish<ProcessJobMessage>(PROCESSING_QUEUE, {
            pageVersionId: createdPageVersionId,
            ...(traceId ? { traceId } : {}),
          });
        }
      } else {
        log.info(`Duplicate content, skipping storage: ${url}`);
      }
    } catch (err) {
      log.error(`Failed to store page for ${url}`, { error: (err as Error).message });
      throw err;
    }
  } else {
    log.info(`In-memory duplicate, skipping storage: ${url}`);
  }

  await markJobCompleted(jobId);

  if (depth > 1) {
    const domain = getDomain(url);
    const { kept: filteredLinks, discarded } = filterChildLinks(extracted.links, domain);
    const capped = filteredLinks.slice(0, MAX_CHILD_LINKS);

    if (discarded > 0 || capped.length < filteredLinks.length) {
      log.info(
        `Child links: ${capped.length} kept / ${filteredLinks.length} filtered / ${discarded} discarded`, { max: MAX_CHILD_LINKS },
      );
    }

    const publishPromises = capped.map((link) =>
      publisher.publish<CrawlJobMessage>("crawl", {
        jobId: randomUUID(),
        websiteId,
        url: link,
        depth: depth - 1,
        ...(traceId ? { traceId } : {}),
      }),
    );

    await Promise.all(publishPromises);
    log.info(`Published ${publishPromises.length} child jobs from ${url}`);
  }
}

async function markJobCompleted(jobId: string): Promise<void> {
  try {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED" },
    });
    console.log(`[Crawler] ${jobId}: job marked COMPLETED`);
  } catch (err) {
    console.error(`[Crawler] Failed to mark job ${jobId} completed:`, (err as Error).message);
  }
}
