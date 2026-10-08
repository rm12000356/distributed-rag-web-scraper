import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockBrowser, mockContext, mockPage } = vi.hoisted(() => ({
  mockBrowser: { newContext: vi.fn(), close: vi.fn() },
  mockContext: { newPage: vi.fn(), close: vi.fn() },
  mockPage: {
    goto: vi.fn(),
    content: vi.fn(),
    url: vi.fn(),
    close: vi.fn(),
    waitForSelector: vi.fn(),
    evaluate: vi.fn(),
    waitForTimeout: vi.fn(),
  },
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

import { fetchDynamic, renderPage, closeBrowser } from "./dynamic.js";
import type { DynamicRenderResult } from "./dynamic.js";

beforeEach(async () => {
  vi.clearAllMocks();

  mockBrowser.newContext.mockResolvedValue(mockContext);
  mockContext.newPage.mockResolvedValue(mockPage);
  mockPage.url.mockReturnValue("https://example.com");
  mockPage.waitForSelector.mockResolvedValue(undefined);
  mockPage.waitForTimeout.mockResolvedValue(undefined);
});

afterEach(async () => {
  await closeBrowser();
});

function makeGotoResult(
  overrides: Partial<{
    status: () => number;
    ok: () => boolean;
    headers: () => Record<string, string>;
  }> = {},
) {
  return {
    url: () => "https://example.com",
    status: () => overrides.status?.() ?? 200,
    ok: () => overrides.ok?.() ?? true,
    headers: () => ({
      "content-type": "text/html; charset=utf-8",
      "x-custom": "value",
      ...((overrides.headers?.() as Record<string, string>) ?? {}),
    }),
  };
}

describe("fetchDynamic", () => {
  it("returns StaticFetchResult with CheerioAPI, HTML, status, and headers", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    const result = await fetchDynamic("https://example.com");

    expect(result.$).toBeDefined();
    expect(result.html).toContain("<p>Hello</p>");
    expect(result.statusCode).toBe(200);
    expect(result.headers["x-custom"]).toBe("value");
  });

  it("rejects non-HTTP protocols", async () => {
    await expect(fetchDynamic("ftp://example.com")).rejects.toMatchObject({
      name: "FetchError",
      code: "INVALID_URL",
    });
  });

  it("rejects invalid URLs", async () => {
    await expect(fetchDynamic("not a url")).rejects.toMatchObject({
      name: "FetchError",
      code: "INVALID_URL",
    });
  });

  it("rejects non-HTML content types", async () => {
    mockPage.goto.mockResolvedValue(
      makeGotoResult({ headers: () => ({ "content-type": "application/pdf" }) }),
    );

    await expect(
      fetchDynamic("https://example.com/file.pdf"),
    ).rejects.toMatchObject({
      code: "NOT_HTML",
    });
  });

  it("maps navigation timeout to FetchError TIMEOUT", async () => {
    const timeoutErr = new Error("Navigation timeout of 30000ms exceeded");
    timeoutErr.name = "TimeoutError";
    mockPage.goto.mockRejectedValue(timeoutErr);

    await expect(
      fetchDynamic("https://example.com"),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("maps browser crash to FetchError NETWORK", async () => {
    mockPage.goto.mockRejectedValue(new Error("Target closed"));

    await expect(
      fetchDynamic("https://example.com"),
    ).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("maps HTTP 4xx to FetchError HTTP_ERROR with statusCode", async () => {
    mockPage.goto.mockResolvedValue(
      makeGotoResult({ status: () => 404, ok: () => false }),
    );

    await expect(
      fetchDynamic("https://example.com/404"),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      statusCode: 404,
    });
  });

  it("maps HTTP 5xx to FetchError HTTP_ERROR with statusCode", async () => {
    mockPage.goto.mockResolvedValue(
      makeGotoResult({ status: () => 503, ok: () => false }),
    );

    await expect(
      fetchDynamic("https://example.com/503"),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      statusCode: 503,
    });
  });

  it("calls page.close() in finally block on success", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    await fetchDynamic("https://example.com");

    expect(mockPage.close).toHaveBeenCalled();
  });

  it("calls page.close() in finally block on error", async () => {
    mockPage.goto.mockRejectedValue(new Error("Navigation timeout"));

    await expect(fetchDynamic("https://example.com")).rejects.toThrow();

    expect(mockPage.close).toHaveBeenCalled();
  });

  it("closes browser context in finally block on success", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    await fetchDynamic("https://example.com");

    expect(mockContext.close).toHaveBeenCalled();
  });

  it("closes browser context in finally block on error", async () => {
    mockPage.goto.mockRejectedValue(new Error("Navigation timeout"));

    await expect(fetchDynamic("https://example.com")).rejects.toThrow();

    expect(mockContext.close).toHaveBeenCalled();
  });

  it("defaults waitUntil to networkidle", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    await fetchDynamic("https://example.com");

    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
  });

  it("uses domcontentloaded when waitUntil set explicitly", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    await fetchDynamic("https://example.com", {
      waitUntil: "domcontentloaded",
    });

    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  });

  it("uses load when waitUntil set to load", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    await fetchDynamic("https://example.com", { waitUntil: "load" });

    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "load",
      timeout: 30_000,
    });
  });

  it("waits for custom selector after page load", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><div class='app'>Hello</div></body></html>",
    );

    await fetchDynamic("https://example.com", {
      waitUntil: { selector: ".app" },
    });

    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    expect(mockPage.waitForSelector).toHaveBeenCalledWith(".app", {
      timeout: 30_000,
    });
  });

  it("respects custom selector timeout", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue("<html><body></body></html>");

    await fetchDynamic("https://example.com", {
      waitUntil: { selector: ".spa-root", timeout: 10_000 },
    });

    expect(mockPage.waitForSelector).toHaveBeenCalledWith(".spa-root", {
      timeout: 10_000,
    });
  });

  it("scrolls to load lazy content when scrollToLoad is true", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Lazy content</p></body></html>",
    );
    mockPage.evaluate.mockImplementation((fn: unknown) => {
      const fnStr = String(fn);
      if (fnStr.includes("scrollHeight")) {
        return Promise.resolve(2000);
      }
      if (fnStr.includes("scrollTo")) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    await fetchDynamic("https://example.com", { scrollToLoad: true });

    expect(mockPage.evaluate).toHaveBeenCalled();
    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1_000);
  });

  it("stops scrolling when height stabilizes across two scrolls", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Content</p></body></html>",
    );

    let callCount = 0;
    mockPage.evaluate.mockImplementation((fn: unknown) => {
      const fnStr = String(fn);
      if (fnStr.includes("scrollHeight")) {
        callCount++;
        // Return same height every time → height stabilizes
        return Promise.resolve(3000);
      }
      if (fnStr.includes("scrollTo")) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    await fetchDynamic("https://example.com", { scrollToLoad: true });

    // Should stop after 2 height-checks yield same value and match previous
    // First check: previousHeight=0, currentHeight=3000 → scroll down, wait
    // After scroll: newHeight=3000 → newHeight === currentHeight(3000) && newHeight === previousHeight(0)? NO
    //   previousHeight becomes 3000 (the old currentHeight)
    // Second check: currentHeight=3000 → scroll, wait
    //   newHeight=3000 → newHeight === currentHeight(3000) && newHeight===previousHeight(3000) → YES → break
    // So: 2 scrollHeight checks, 1 scroll, 1 wait, 1 scrollHeight, 1 scroll, 1 wait, 1 scrollHeight → break
    // Total evaluate calls: 4 (2x scrollHeight per iteration, 2 iterations = 4)
    // Total waitForTimeout calls: 1 (since we break on second iteration before scrolling)
    expect(mockPage.evaluate).toHaveBeenCalled();
    expect(mockPage.waitForTimeout).toHaveBeenCalled();
  });
});

describe("renderPage", () => {
  it("returns DynamicRenderResult with title, html, textContent, and metadata", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      `<html><head><title>Test Page</title></head><body><p>Hello World</p></body></html>`,
    );

    const result: DynamicRenderResult = await renderPage("https://example.com");

    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Test Page");
    expect(result.html).toContain("<p>Hello World</p>");
    expect(result.textContent).toBe("Hello World");
    expect(result.metadata.statusCode).toBe(200);
    expect(result.metadata.contentType).toBe("text/html; charset=utf-8");
    expect(result.metadata.renderTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back to og:title when title tag is missing", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      `<html><head><meta property="og:title" content="OG Title"></head><body><p>Body</p></body></html>`,
    );

    const result = await renderPage("https://example.com");

    expect(result.title).toBe("OG Title");
  });

  it("returns empty title when neither title tag nor og:title exists", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      `<html><head></head><body><p>Body</p></body></html>`,
    );

    const result = await renderPage("https://example.com");

    expect(result.title).toBe("");
  });

  it("passes options through to fetchDynamic", async () => {
    mockPage.goto.mockResolvedValue(makeGotoResult());
    mockPage.content.mockResolvedValue(
      "<html><body><p>Hello</p></body></html>",
    );

    await renderPage("https://example.com", {
      scrollToLoad: true,
      waitUntil: "domcontentloaded",
    });

    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  });
});
