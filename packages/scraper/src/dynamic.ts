import * as cheerio from "cheerio";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { FetchError, type StaticFetchResult, checkSSRF } from "./static.js";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise!;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {
      // Browser may already be closed or crashed
    }
    browserPromise = null;
  }
}

export type WaitUntil =
  | "networkidle"
  | "domcontentloaded"
  | "load"
  | { selector: string; timeout?: number };

export interface DynamicFetchOptions {
  userAgent?: string;
  timeout?: number;
  waitUntil?: WaitUntil;
  scrollToLoad?: boolean;
  scrollDelay?: number;
}

export interface DynamicRenderResult {
  url: string;
  title: string;
  html: string;
  textContent: string;
  metadata: {
    statusCode: number;
    contentType: string;
    renderTimeMs: number;
  };
}

const DEFAULT_GOTO_TIMEOUT = 30_000;
const DEFAULT_USER_AGENT = "Distributed-RAG-Crawler/1.0";
const DEFAULT_SCROLL_DELAY = 1_000;

async function waitForReadyState(
  page: Page,
  waitUntil: WaitUntil,
  defaultTimeout: number,
): Promise<void> {
  if (typeof waitUntil === "string") {
    return;
  }

  const { selector, timeout = defaultTimeout } = waitUntil;
  try {
    await page.waitForSelector(selector, { timeout });
  } catch (err) {
    console.log(
      `[Dynamic] Selector "${selector}" not found within ${timeout}ms; proceeding with current DOM`,
    );
  }
}

async function scrollToLoadLazyContent(
  page: Page,
  delay: number,
): Promise<void> {
  let previousHeight = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 20;

  while (scrollAttempts < maxScrollAttempts) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(delay);

    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    if (newHeight === currentHeight && newHeight === previousHeight) {
      break;
    }

    previousHeight = currentHeight;
    scrollAttempts++;
  }
}

export async function fetchDynamic(
  url: string,
  options?: DynamicFetchOptions,
): Promise<StaticFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new FetchError(
        `Unsupported protocol: ${parsed.protocol}`,
        "INVALID_URL",
      );
    }
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(`Invalid URL: ${url}`, "INVALID_URL");
  }

  await checkSSRF(url);

  const gotoTimeout = options?.timeout ?? DEFAULT_GOTO_TIMEOUT;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
  const waitUntil = options?.waitUntil ?? "networkidle";
  const scrollToLoad = options?.scrollToLoad ?? false;
  const scrollDelay = options?.scrollDelay ?? DEFAULT_SCROLL_DELAY;

  console.log(
    `[Dynamic] Navigating to ${url} (headless chromium, timeout=${gotoTimeout}ms, waitUntil=${typeof waitUntil === "object" ? waitUntil.selector : waitUntil}, scrollToLoad=${scrollToLoad})`,
  );

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();

    context = await browser.newContext({ userAgent });
    page = await context.newPage();

    let gotoResult: Awaited<ReturnType<Page["goto"]>> | null = null;

    try {
      const effectiveWaitUntil = typeof waitUntil === "object" ? "networkidle" : waitUntil;
      gotoResult = await page.goto(url, {
        waitUntil: effectiveWaitUntil,
        timeout: gotoTimeout,
      });

      // Custom selector wait after navigation
      if (typeof waitUntil === "object") {
        await waitForReadyState(page, waitUntil, gotoTimeout);
      }
    } catch (gotoErr) {
      const isTimeout =
        (gotoErr as { message?: string }).message?.includes("Timeout");
      if (isTimeout && page.url() === url) {
        console.log(
          `[Dynamic] ${waitUntil} timed out after ${gotoTimeout}ms, falling back to domcontentloaded for: ${url}`,
        );
        gotoResult = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: gotoTimeout,
        });
        if (typeof waitUntil === "object") {
          await waitForReadyState(page, waitUntil, gotoTimeout);
        }
      } else {
        throw gotoErr;
      }
    }

    if (!gotoResult || !gotoResult.ok()) {
      const status = gotoResult?.status() ?? 0;
      throw new FetchError(
        `HTTP ${status}: Navigation to ${url}`,
        "HTTP_ERROR",
        status,
      );
    }

    const response = gotoResult;
    const statusCode = response.status();

    const contentType = response.headers()["content-type"] ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new FetchError(
        `Unexpected Content-Type: ${contentType}`,
        "NOT_HTML",
        statusCode,
      );
    }

    if (scrollToLoad) {
      await scrollToLoadLazyContent(page, scrollDelay);
    }

    const html = await page.content();
    const $ = cheerio.load(html);

    console.log(
      `[Dynamic] Page loaded: status=${statusCode}, ${html.length} bytes`,
    );

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers())) {
      headers[key] = String(value);
    }

    return { $, html, statusCode, headers };
  } catch (err) {
    if (err instanceof FetchError) throw err;

    const msg = (err as Error).message ?? "";

    if (
      msg.includes("Timeout") ||
      msg.includes("timeout") ||
      msg.includes("Navigation timeout")
    ) {
      throw new FetchError(`Navigation timeout: ${msg}`, "TIMEOUT");
    }

    if (
      msg.includes("Target closed") ||
      msg.includes("Target page, context or browser has been closed") ||
      msg.includes("Browser has been closed") ||
      msg.includes("Protocol error")
    ) {
      throw new FetchError(`Browser connection error: ${msg}`, "NETWORK");
    }

    throw new FetchError(`Playwright error: ${msg}`, "NETWORK");
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // page may already be closed
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        // context may already be closed
      }
    }
  }
}

export async function renderPage(
  url: string,
  options?: DynamicFetchOptions,
): Promise<DynamicRenderResult> {
  const startTime = performance.now();

  const { $, html, statusCode, headers } = await fetchDynamic(url, options);

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";

  const textContent = $("body").text().replace(/\s+/g, " ").trim();

  const renderTimeMs = Math.round(performance.now() - startTime);

  const contentType = headers["content-type"] ?? "text/html";

  return {
    url,
    title,
    html,
    textContent,
    metadata: {
      statusCode,
      contentType,
      renderTimeMs,
    },
  };
}
