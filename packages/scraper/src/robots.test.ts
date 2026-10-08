import { describe, it, expect } from "vitest";
import { RobotsTxtManager, parseRobotsTxt, pathMatches } from "./robots.js";

describe("pathMatches", () => {
  it("exact match", () => {
    expect(pathMatches("/admin", "/admin")).toBe(true);
  });

  it("pattern with trailing slash matches subdirectories", () => {
    expect(pathMatches("/admin/", "/admin/page")).toBe(true);
  });

  it("partial prefix does not match different path segment", () => {
    expect(pathMatches("/admin", "/adminpage")).toBe(false);
  });

  it("pattern matches subdirectory with slash", () => {
    expect(pathMatches("/admin", "/admin/page")).toBe(true);
  });

  it("root pattern matches everything", () => {
    expect(pathMatches("/", "/any/path")).toBe(true);
  });

  it("empty pattern matches everything", () => {
    expect(pathMatches("", "/anything")).toBe(true);
  });

  it("pattern with trailing slash matches exact", () => {
    expect(pathMatches("/admin/", "/admin/")).toBe(true);
  });
});

describe("parseRobotsTxt", () => {
  const defaultUA = "test-bot";

  it("extracts disallow rules", () => {
    const content = `User-agent: *\nDisallow: /admin\nDisallow: /private`;
    const rules = parseRobotsTxt(content, defaultUA);
    expect(rules.disallows).toContain("/admin");
    expect(rules.disallows).toContain("/private");
  });

  it("extracts allow rules", () => {
    const content = `User-agent: *\nAllow: /public\nDisallow: /`;
    const rules = parseRobotsTxt(content, defaultUA);
    expect(rules.allows).toContain("/public");
  });

  it("parses crawl-delay in seconds and converts to ms", () => {
    const content = `User-agent: *\nCrawl-Delay: 10`;
    const rules = parseRobotsTxt(content, defaultUA);
    expect(rules.crawlDelay).toBe(10000);
  });

  it("ignores crawl-delay for non-matching user-agent", () => {
    const content = `User-agent: other-bot\nCrawl-Delay: 10\nUser-agent: *\nCrawl-Delay: 5`;
    const rules = parseRobotsTxt(content, defaultUA);
    expect(rules.crawlDelay).toBe(5000);
  });

  it("handles empty content", () => {
    const rules = parseRobotsTxt("", defaultUA);
    expect(rules.disallows).toEqual([]);
    expect(rules.allows).toEqual([]);
  });

  it("handles comments", () => {
    const content = `# This is a comment\nUser-agent: *\nDisallow: /admin`;
    const rules = parseRobotsTxt(content, defaultUA);
    expect(rules.disallows).toContain("/admin");
  });

  it("handles malformed lines (no colon)", () => {
    const content = `User-agent *\nDisallow /admin`;
    const rules = parseRobotsTxt(content, defaultUA);
    expect(rules.disallows).toEqual([]);
  });

  it("handles only matching specific user-agent", () => {
    const content = `User-agent: my-bot\nDisallow: /private\nUser-agent: *\nAllow: /`;
    const rules = parseRobotsTxt(content, "my-bot");
    expect(rules.disallows).toContain("/private");
  });

  it("skips non-matching user-agent rules", () => {
    const content = `User-agent: other-bot\nDisallow: /private\nUser-agent: *\nAllow: /`;
    const rules = parseRobotsTxt(content, "my-bot");
    expect(rules.disallows).not.toContain("/private");
  });
});

describe("RobotsTxtManager", () => {
  it("constructor creates instance", () => {
    const manager = new RobotsTxtManager();
    expect(manager).toBeInstanceOf(RobotsTxtManager);
  });

  it("has clearCache method", () => {
    const manager = new RobotsTxtManager();
    expect(typeof manager.clearCache).toBe("function");
  });

  it("has isAllowed method", () => {
    const manager = new RobotsTxtManager();
    expect(typeof manager.isAllowed).toBe("function");
  });

  it("has getCrawlDelay method", () => {
    const manager = new RobotsTxtManager();
    expect(typeof manager.getCrawlDelay).toBe("function");
  });
});
