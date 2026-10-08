import { describe, it, expect, vi } from "vitest";
import {
  computeBackoffDelay,
  withRetry,
  isRetryableError,
  type RetryOptions,
} from "./retry.js";

class TestError extends Error {
  code: string;
  statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "TestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

describe("computeBackoffDelay", () => {
  it("returns base delay for attempt 1", () => {
    const delay = computeBackoffDelay(1, { jitter: false });
    expect(delay).toBe(1000);
  });

  it("doubles each attempt", () => {
    const d1 = computeBackoffDelay(1, { baseDelayMs: 100, factor: 2, jitter: false });
    const d2 = computeBackoffDelay(2, { baseDelayMs: 100, factor: 2, jitter: false });
    const d3 = computeBackoffDelay(3, { baseDelayMs: 100, factor: 2, jitter: false });
    expect(d1).toBe(100);
    expect(d2).toBe(200);
    expect(d3).toBe(400);
  });

  it("caps at maxDelayMs", () => {
    const delay = computeBackoffDelay(10, {
      baseDelayMs: 1000,
      factor: 2,
      maxDelayMs: 5000,
      jitter: false,
    });
    expect(delay).toBe(5000);
  });

  it("applies jitter between 50% and 100%", () => {
    const results = Array.from({ length: 100 }, () =>
      computeBackoffDelay(2, { baseDelayMs: 1000, factor: 2, jitter: true }),
    );
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(1000);
      expect(r).toBeLessThanOrEqual(2000);
    }
  });

  it("disables jitter when false", () => {
    const delay = computeBackoffDelay(2, { baseDelayMs: 500, factor: 2, jitter: false });
    expect(delay).toBe(1000);
  });
});

describe("withRetry", () => {
  it("resolves on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxAttempts: 5, jitter: false });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts exhausted", async () => {
    const err = new Error("always fail");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 3, jitter: false })).rejects.toThrow("always fail");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry callback", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");

    const onRetry = vi.fn();
    await withRetry(fn, { maxAttempts: 3, jitter: false }, onRetry);

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 1000);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 2000);
  });
});

describe("isRetryableError", () => {
  it("returns false for INVALID_URL", () => {
    expect(isRetryableError(new TestError("bad url", "INVALID_URL"))).toBe(false);
  });

  it("returns false for NOT_HTML", () => {
    expect(isRetryableError(new TestError("not html", "NOT_HTML"))).toBe(false);
  });

  it("returns false for HTTP_ERROR with 4xx (non-429)", () => {
    expect(isRetryableError(new TestError("not found", "HTTP_ERROR", 404))).toBe(false);
    expect(isRetryableError(new TestError("forbidden", "HTTP_ERROR", 403))).toBe(false);
  });

  it("returns true for HTTP_ERROR with 5xx", () => {
    expect(isRetryableError(new TestError("server error", "HTTP_ERROR", 500))).toBe(true);
    expect(isRetryableError(new TestError("bad gateway", "HTTP_ERROR", 502))).toBe(true);
  });

  it("returns true for HTTP_ERROR 429 (rate limit)", () => {
    expect(isRetryableError(new TestError("too many", "HTTP_ERROR", 429))).toBe(true);
  });

  it("returns true for TIMEOUT", () => {
    expect(isRetryableError(new TestError("timeout", "TIMEOUT"))).toBe(true);
  });

  it("returns true for NETWORK", () => {
    expect(isRetryableError(new TestError("network error", "NETWORK"))).toBe(true);
  });

  it("returns true for generic errors", () => {
    expect(isRetryableError(new Error("something broke"))).toBe(true);
  });

  it("returns true for Prisma connection errors", () => {
    expect(isRetryableError(new Error("PrismaClientInitializationError: connection terminated"))).toBe(true);
  });
});
