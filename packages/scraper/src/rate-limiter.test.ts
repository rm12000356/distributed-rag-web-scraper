import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  it("waitForSlot resolves for an invalid URL", async () => {
    const limiter = new RateLimiter(500);
    await expect(limiter.waitForSlot("not-a-url")).resolves.toBeUndefined();
  });

  it("waitForSlot resolves immediately for first request", async () => {
    const limiter = new RateLimiter(1000);
    const start = Date.now();
    await limiter.waitForSlot("https://example.com/page1");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("waits for default delay between requests to same domain", async () => {
    const limiter = new RateLimiter(200);
    await limiter.waitForSlot("https://example.com/page1");
    const start = Date.now();
    await limiter.waitForSlot("https://example.com/page2");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });

  it("does not wait between requests to different domains", async () => {
    const limiter = new RateLimiter(500);
    await limiter.waitForSlot("https://example.com/page1");
    const start = Date.now();
    await limiter.waitForSlot("https://other.com/page1");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("setDomainDelay overrides default delay per domain", async () => {
    const limiter = new RateLimiter(1000);
    limiter.setDomainDelay("example.com", 50);
    await limiter.waitForSlot("https://example.com/page1");
    const start = Date.now();
    await limiter.waitForSlot("https://example.com/page2");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("serializes concurrent waiters for the same domain", async () => {
    const limiter = new RateLimiter(150);
    const start = Date.now();
    await Promise.all([
      limiter.waitForSlot("https://example.com/a"),
      limiter.waitForSlot("https://example.com/b"),
      limiter.waitForSlot("https://example.com/c"),
    ]);
    const elapsed = Date.now() - start;
    // First is immediate; second and third each wait ~150ms → ~300ms total
    expect(elapsed).toBeGreaterThanOrEqual(280);
  });
});
