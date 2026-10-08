import axios from "axios";

export interface RobotsRule {
  disallows: string[];
  allows: string[];
  crawlDelay?: number;
}

const DEFAULT_USER_AGENT = "Distributed-RAG-Crawler/1.0";

export function parseRobotsTxt(content: string, userAgent: string): RobotsRule {
  const disallows: string[] = [];
  const allows: string[] = [];
  let crawlDelay: number | undefined;
  let currentAgent: string | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const field = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (field === "user-agent") {
      currentAgent = value.toLowerCase();
      continue;
    }

    if (currentAgent !== null && currentAgent !== "*" && currentAgent !== userAgent.toLowerCase()) {
      continue;
    }

    if (field === "disallow") {
      disallows.push(value);
    } else if (field === "allow") {
      allows.push(value);
    } else if (field === "crawl-delay") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        crawlDelay = parsed * 1000;
      }
    }
  }

  return { disallows, allows, ...(crawlDelay !== undefined ? { crawlDelay } : {}) };
}

export function pathMatches(pattern: string, path: string): boolean {
  if (!path.startsWith(pattern)) return false;
  if (pattern === "") return true;
  if (pattern.endsWith("/")) return true;
  return path.length === pattern.length || path[pattern.length] === "/";
}

function isPathBlocked(path: string, rule: RobotsRule): boolean {
  const normalizedPath = path.split("?")[0] ?? path;

  for (const allow of rule.allows) {
    if (allow && pathMatches(allow, normalizedPath)) {
      return false;
    }
  }

  for (const disallow of rule.disallows) {
    if (disallow === "") continue;
    if (pathMatches(disallow, normalizedPath)) {
      return true;
    }
  }

  return false;
}

const MAX_ROBOTS_CACHE = 1_000;

export class RobotsTxtManager {
  private cache: Map<string, RobotsRule> = new Map();
  private cacheOrder: string[] = [];
  private fetchInProgress: Map<string, Promise<RobotsRule>> = new Map();

  private setCache(origin: string, rule: RobotsRule): void {
    if (this.cache.size >= MAX_ROBOTS_CACHE) {
      const oldest = this.cacheOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(origin, rule);
    this.cacheOrder.push(origin);
  }

  async isAllowed(url: string, userAgent?: string): Promise<boolean> {
    const ua = userAgent ?? DEFAULT_USER_AGENT;
    const parsed = new URL(url);
    const origin = parsed.origin;

    const rule = await this.getRule(origin, ua);
    return !isPathBlocked(parsed.pathname, rule);
  }

  async getCrawlDelay(url: string): Promise<number | undefined> {
    const parsed = new URL(url);
    const origin = parsed.origin;

    const rule = await this.getRule(origin);
    return rule.crawlDelay;
  }

  private async getRule(origin: string, userAgent?: string): Promise<RobotsRule> {
    const ua = userAgent ?? DEFAULT_USER_AGENT;
    const cached = this.cache.get(origin);
    if (cached) return cached;

    const inFlight = this.fetchInProgress.get(origin);
    if (inFlight) return inFlight;

    const promise = this.fetchRule(origin, ua);
    this.fetchInProgress.set(origin, promise);

    try {
      const rule = await promise;
      this.setCache(origin, rule);
      return rule;
    } finally {
      this.fetchInProgress.delete(origin);
    }
  }

  private async fetchRule(origin: string, userAgent: string): Promise<RobotsRule> {
    const robotsUrl = `${origin}/robots.txt`;

    try {
      const response = await axios.get(robotsUrl, {
        timeout: 5_000,
        headers: { "User-Agent": userAgent },
        responseType: "text",
        validateStatus: (status) => status < 400,
      });

      return parseRobotsTxt(response.data, userAgent);
    } catch {
      return { disallows: [], allows: [] };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
