import axios, { type AxiosError, isAxiosError } from "axios";
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";

export interface StaticFetchResult {
  $: cheerio.CheerioAPI;
  html: string;
  statusCode: number;
  headers: Record<string, string>;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code: "TIMEOUT" | "NETWORK" | "HTTP_ERROR" | "INVALID_URL" | "NOT_HTML",
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_USER_AGENT = "Distributed-RAG-Crawler/1.0";
const DEFAULT_MAX_BODY_LENGTH = 10 * 1024 * 1024;

const MAX_SSRF_CACHE = 10_000;
const ssrfCache = new Map<string, boolean>();
const ssrfCacheOrder: string[] = [];

function setSsrfCache(hostname: string, allowed: boolean): void {
  if (ssrfCache.size >= MAX_SSRF_CACHE) {
    const oldest = ssrfCacheOrder.shift();
    if (oldest) ssrfCache.delete(oldest);
  }
  ssrfCache.set(hostname, allowed);
  ssrfCacheOrder.push(hostname);
}

function isPrivateIP(ip: string): boolean {
  if (ip === "0.0.0.0" || ip === "::1" || ip === "::") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) {
    return true;
  }
  // 172.16.0.0/12 → 172.16.x.x – 172.31.x.x
  const match = ip.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export async function checkSSRF(url: string): Promise<void> {
  if (process.env["ALLOW_PRIVATE_IPS"] === "true") return;

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]"
  ) {
    throw new FetchError(`Blocked private hostname: ${hostname}`, "INVALID_URL");
  }

  const cached = ssrfCache.get(hostname);
  if (cached !== undefined) {
    if (cached === false) {
      throw new FetchError(`Blocked private IP: ${hostname} (cached)`, "INVALID_URL");
    }
    return;
  }

  const ipMatch = hostname.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipMatch) {
    const ip = ipMatch[0] ?? hostname;
    if (isPrivateIP(ip)) {
      setSsrfCache(hostname, false);
      throw new FetchError(`Blocked private IP: ${ip}`, "INVALID_URL");
    }
    setSsrfCache(hostname, true);
    return;
  }

  try {
    const { address } = await lookup(hostname, 4);
    if (isPrivateIP(address)) {
      setSsrfCache(hostname, false);
      throw new FetchError(`Blocked private IP: ${address} (resolved from ${hostname})`, "INVALID_URL");
    }
    setSsrfCache(hostname, true);
  } catch {
    // DNS lookup failed — let Axios handle it naturally
  }
}

export async function fetchStatic(
  url: string,
  options?: { timeout?: number; userAgent?: string },
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

  try {
    const response = await axios.get(url, {
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        "User-Agent": options?.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 10,
      maxContentLength: DEFAULT_MAX_BODY_LENGTH,
      maxBodyLength: DEFAULT_MAX_BODY_LENGTH,
      responseType: "text",
      validateStatus: (status) => status < 400,
    });

    const contentType = String(response.headers["content-type"] ?? "");
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new FetchError(
        `Unexpected Content-Type: ${contentType}`,
        "NOT_HTML",
        response.status,
      );
    }

    const $ = cheerio.load(response.data);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }

    return {
      $,
      html: response.data,
      statusCode: response.status,
      headers,
    };
  } catch (err) {
    if (err instanceof FetchError) throw err;

    if (isAxiosError(err)) {
      const axiosErr = err as AxiosError;

      if (axiosErr.code === "ECONNABORTED") {
        throw new FetchError(`Request timed out after ${options?.timeout ?? DEFAULT_TIMEOUT}ms`, "TIMEOUT");
      }

      if (axiosErr.code === "ENOTFOUND" || axiosErr.code === "EAI_AGAIN") {
        throw new FetchError(`DNS resolution failed for ${url}`, "NETWORK");
      }

      if (axiosErr.code === "ECONNREFUSED" || axiosErr.code === "ECONNRESET" || axiosErr.code === "ERR_NETWORK") {
        throw new FetchError(`Network error: ${axiosErr.message}`, "NETWORK");
      }

      if (axiosErr.response) {
        throw new FetchError(
          `HTTP ${axiosErr.response.status}: ${axiosErr.response.statusText}`,
          "HTTP_ERROR",
          axiosErr.response.status,
        );
      }

      if (axiosErr.code === "ERR_BAD_RESPONSE" && axiosErr.message.includes("maxContentLength")) {
        throw new FetchError("Response exceeded maximum allowed size", "NETWORK");
      }

      throw new FetchError(`Axios error: ${axiosErr.message}`, "NETWORK");
    }

    throw new FetchError(
      `Unexpected error: ${(err as Error).message}`,
      "NETWORK",
    );
  }
}
