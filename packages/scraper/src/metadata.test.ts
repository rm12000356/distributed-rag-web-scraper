import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { extractMetadata } from "./metadata.js";

function load(html: string) {
  return cheerio.load(html);
}

describe("extractMetadata", () => {
  it("extracts language from html lang", () => {
    const $ = load('<html lang="en"><head></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.language).toBe("en");
  });

  it("extracts language from meta content-language", () => {
    const $ = load('<html><head><meta http-equiv="content-language" content="de"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.language).toBe("de");
  });

  it("extracts language from og:locale", () => {
    const $ = load('<html><head><meta property="og:locale" content="fr_FR"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.language).toBe("fr_FR");
  });

  it("extracts author from meta name=author", () => {
    const $ = load('<html><head><meta name="author" content="John Doe"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.author).toBe("John Doe");
  });

  it("extracts author from article:author", () => {
    const $ = load('<html><head><meta property="article:author" content="Jane Smith"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.author).toBe("Jane Smith");
  });

  it("extracts publishedDate from article:published_time", () => {
    const $ = load('<html><head><meta property="article:published_time" content="2026-07-20T10:00:00Z"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.publishedDate).toBe("2026-07-20T10:00:00Z");
  });

  it("extracts modifiedDate from article:modified_time", () => {
    const $ = load('<html><head><meta property="article:modified_time" content="2026-07-21T14:30:00Z"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.modifiedDate).toBe("2026-07-21T14:30:00Z");
  });

  it("extracts siteName from og:site_name", () => {
    const $ = load('<html><head><meta property="og:site_name" content="Space Times"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.siteName).toBe("Space Times");
  });

  it("extracts type from og:type", () => {
    const $ = load('<html><head><meta property="og:type" content="article"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.type).toBe("article");
  });

  it("extracts canonicalUrl from link rel=canonical", () => {
    const $ = load('<html><head><link rel="canonical" href="https://example.com/page"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.canonicalUrl).toBe("https://example.com/page");
  });

  it("extracts keywords from meta name=keywords", () => {
    const $ = load('<html><head><meta name="keywords" content="space, NASA, Mars"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.keywords).toEqual(["space", "NASA", "Mars"]);
  });

  it("returns empty keywords array when no keywords meta", () => {
    const $ = load("<html><head></head><body></body></html>");
    const result = extractMetadata($, 100);
    expect(result.keywords).toEqual([]);
  });

  it("extracts robots from meta name=robots", () => {
    const $ = load('<html><head><meta name="robots" content="index, follow"></head><body></body></html>');
    const result = extractMetadata($, 100);
    expect(result.robots).toBe("index, follow");
  });

  it("computes estimatedReadingTime from wordCount", () => {
    const $ = load("<html><head></head><body></body></html>");
    const result = extractMetadata($, 400);
    expect(result.estimatedReadingTime).toBe(2);
  });

  it("rounds up reading time", () => {
    const $ = load("<html><head></head><body></body></html>");
    const result = extractMetadata($, 201);
    expect(result.estimatedReadingTime).toBe(2);
  });

  it("returns null reading time for zero wordCount", () => {
    const $ = load("<html><head></head><body></body></html>");
    const result = extractMetadata($, 0);
    expect(result.estimatedReadingTime).toBeNull();
  });

  it("returns null for missing fields", () => {
    const $ = load("<html><head></head><body></body></html>");
    const result = extractMetadata($, 100);
    expect(result.language).toBeNull();
    expect(result.author).toBeNull();
    expect(result.publishedDate).toBeNull();
    expect(result.modifiedDate).toBeNull();
    expect(result.siteName).toBeNull();
    expect(result.type).toBeNull();
    expect(result.canonicalUrl).toBeNull();
    expect(result.robots).toBeNull();
  });

  it("extracts all fields from sample article HTML", () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="author" content="Dr. Jane Smith" />
  <meta property="article:author" content="Jane Smith" />
  <meta property="article:published_time" content="2026-07-20T10:00:00Z" />
  <meta property="article:modified_time" content="2026-07-21T14:30:00Z" />
  <meta property="og:site_name" content="Space Times" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="en_US" />
  <link rel="canonical" href="https://example.com/mars-mission-2026" />
  <meta name="keywords" content="space, NASA, Mars, exploration" />
  <meta name="robots" content="index, follow" />
</head><body><p>Content</p></body></html>`;
    const $ = load(html);
    const result = extractMetadata($, 500);
    expect(result.language).toBe("en");
    expect(result.author).toBe("Dr. Jane Smith");
    expect(result.publishedDate).toBe("2026-07-20T10:00:00Z");
    expect(result.modifiedDate).toBe("2026-07-21T14:30:00Z");
    expect(result.siteName).toBe("Space Times");
    expect(result.type).toBe("article");
    expect(result.canonicalUrl).toBe("https://example.com/mars-mission-2026");
    expect(result.keywords).toEqual(["space", "NASA", "Mars", "exploration"]);
    expect(result.robots).toBe("index, follow");
    expect(result.estimatedReadingTime).toBe(3);
  });
});
