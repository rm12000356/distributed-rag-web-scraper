import * as cheerio from "cheerio";

export interface EnhancedMetadata {
  language: string | null;
  author: string | null;
  publishedDate: string | null;
  modifiedDate: string | null;
  siteName: string | null;
  type: string | null;
  canonicalUrl: string | null;
  keywords: string[];
  robots: string | null;
  estimatedReadingTime: number | null;
}

export function extractMetadata(
  $: cheerio.CheerioAPI,
  wordCount: number,
): EnhancedMetadata {
  const language =
    $("html").attr("lang") ??
    $('meta[http-equiv="content-language"]').attr("content") ??
    $('meta[property="og:locale"]').attr("content") ??
    null;

  const author =
    $('meta[name="author"]').attr("content") ??
    $('meta[property="article:author"]').attr("content") ??
    null;

  const publishedDate =
    $('meta[property="article:published_time"]').attr("content") ??
    null;

  const modifiedDate =
    $('meta[property="article:modified_time"]').attr("content") ??
    null;

  const siteName =
    $('meta[property="og:site_name"]').attr("content") ??
    null;

  const type =
    $('meta[property="og:type"]').attr("content") ??
    null;

  const canonicalUrl =
    $('link[rel="canonical"]').attr("href") ??
    null;

  const keywordsRaw = $('meta[name="keywords"]').attr("content") ?? "";
  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const robots =
    $('meta[name="robots"]').attr("content") ??
    null;

  const estimatedReadingTime =
    wordCount > 0 ? Math.ceil(wordCount / 200) : null;

  return {
    language,
    author,
    publishedDate,
    modifiedDate,
    siteName,
    type,
    canonicalUrl,
    keywords,
    robots,
    estimatedReadingTime,
  };
}
