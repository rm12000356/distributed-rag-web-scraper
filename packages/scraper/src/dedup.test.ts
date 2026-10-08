import { describe, it, expect } from "vitest";
import { contentHash, DedupChecker } from "./dedup.js";

describe("contentHash", () => {
  it("returns a 64-character hex string", () => {
    const hash = contentHash("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for same input", () => {
    const a = contentHash("hello world");
    const b = contentHash("hello world");
    expect(a).toBe(b);
  });

  it("normalizes case (lowercase)", () => {
    const a = contentHash("Hello World");
    const b = contentHash("hello world");
    expect(a).toBe(b);
  });

  it("normalizes whitespace (collapse)", () => {
    const a = contentHash("hello    world");
    const b = contentHash("hello world");
    expect(a).toBe(b);
  });

  it("normalizes whitespace (newlines)", () => {
    const a = contentHash("hello\nworld");
    const b = contentHash("hello world");
    expect(a).toBe(b);
  });

  it("trims leading/trailing whitespace", () => {
    const a = contentHash("  hello world  ");
    const b = contentHash("hello world");
    expect(a).toBe(b);
  });

  it("different content produces different hash", () => {
    const a = contentHash("hello world");
    const b = contentHash("goodbye world");
    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const hash = contentHash("");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("DedupChecker", () => {
  it("isDuplicate returns false for unseen content", () => {
    const checker = new DedupChecker();
    expect(checker.isDuplicate("hello world")).toBe(false);
  });

  it("isDuplicate returns true after markAsSeen", () => {
    const checker = new DedupChecker();
    checker.markAsSeen("hello world");
    expect(checker.isDuplicate("hello world")).toBe(true);
  });

  it("isDuplicate returns false for different content", () => {
    const checker = new DedupChecker();
    checker.markAsSeen("hello world");
    expect(checker.isDuplicate("goodbye world")).toBe(false);
  });

  it("detects duplicate ignoring case and whitespace", () => {
    const checker = new DedupChecker();
    checker.markAsSeen("Hello World");
    expect(checker.isDuplicate("  hello   world  ")).toBe(true);
  });

  it("handles multiple entries", () => {
    const checker = new DedupChecker();
    checker.markAsSeen("a");
    checker.markAsSeen("b");
    checker.markAsSeen("c");
    expect(checker.isDuplicate("a")).toBe(true);
    expect(checker.isDuplicate("b")).toBe(true);
    expect(checker.isDuplicate("c")).toBe(true);
    expect(checker.isDuplicate("d")).toBe(false);
  });
});
