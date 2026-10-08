import * as cheerio from "cheerio";

export interface ExtractedData {
  title: string;
  description: string;
  metadata: Record<string, string>;
  textContent: string;
  links: string[];
  ogTags: Record<string, string>;
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(resolved.protocol)) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

export function extract($: cheerio.CheerioAPI, baseUrl: string): ExtractedData {
  const title = $("title").first().text().trim();

  const description =
    $('meta[name="description"]').attr("content")?.trim() ?? "";

  const metadata: Record<string, string> = {};
  $("meta").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name") || $el.attr("property") || "";
    const content = $el.attr("content") || "";
    if (name && content) {
      metadata[name] = content;
    }
  });

  const ogTags: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("og:")) {
      ogTags[key] = value;
    }
  }

  const links: string[] = [];
  const seenLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const trimmed = href.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("mailto:")) return;
    if (trimmed.startsWith("javascript:")) return;
    if (trimmed === "#" || trimmed.startsWith("#")) return;

    const resolved = resolveUrl(trimmed, baseUrl);
    if (!resolved) return;
    if (seenLinks.has(resolved)) return;

    seenLinks.add(resolved);
    links.push(resolved);
  });

  const contentSelectors = ["main", "[role=main]", "span.text", "article", "body"];
  let textContent = "";

  const $body = $("body");
  if ($body.length > 0) {
    const cleanedBody = $body.clone();
    cleanedBody.find("script, style, nav, header, footer, aside, noscript").remove();

    for (const selector of contentSelectors) {
      const $el = selector === "body" ? cleanedBody : cleanedBody.find(selector);
      if ($el.length === 0) continue;

      const raw = $el.text();
      const cleaned = raw
        .replace(/[\r\n]+/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (cleaned.length > 0) {
        textContent = cleaned;
        break;
      }
    }
  }

  return {
    title,
    description,
    metadata,
    textContent,
    links,
    ogTags,
  };
}
