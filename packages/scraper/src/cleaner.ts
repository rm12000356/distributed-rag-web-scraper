import * as cheerio from "cheerio";

const REMOVE_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "canvas", "video", "audio",
  "nav", "header", "footer", "aside", "form",
  "sup", "sub",
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  ".sidebar", ".nav", ".footer", ".header", ".menu",
  ".advertisement", ".ad", ".cookie-banner", ".cookie-consent",
  ".social-share", ".comments", ".related-posts", ".breadcrumb",
];

const DEFAULT_BOILERPLATE_PHRASES = [
  "Accept cookies",
  "Cookie settings",
  "Subscribe to our newsletter",
  "Click here to accept",
  "We use cookies",
];

const BLOCK_ELEMENTS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "th", "dt", "dd", "blockquote", "pre", "figcaption", "div", "span"];

export interface CleanResult {
  title: string;
  cleanedText: string;
  language: string | null;
  sectionTitles: (string | null)[];
}

export function cleanHtml(
  rawHtml: string,
  boilerplatePhrases?: string[],
): CleanResult {
  const $ = cheerio.load(rawHtml);

  const phrases = boilerplatePhrases ?? DEFAULT_BOILERPLATE_PHRASES;

  for (const sel of REMOVE_SELECTORS) {
    $(sel).remove();
  }

  $("[hidden], [aria-hidden='true']").remove();
  $('[style*="display:none"], [style*="display: none"]').remove();

  const title = $("title").first().text().trim();

  let language: string | null = null;
  const htmlLang = $("html").attr("lang");
  if (htmlLang) {
    language = htmlLang;
  } else {
    const contentLang = $('meta[http-equiv="content-language"]').attr("content");
    if (contentLang) {
      language = contentLang;
    } else {
      const ogLocale = $('meta[property="og:locale"]').attr("content");
      if (ogLocale) {
        language = ogLocale;
      }
    }
  }

  const contentSelectors = ["#mw-content-text .mw-parser-output", "main", '[role="main"]', "span.text", "article", ".content", ".post", ".article", "body"];

  let container = $("body");
  let matchedSelector: string | null = null;
  for (const sel of contentSelectors) {
    const el = $(sel).first();
    if (el.length > 0) {
      container = el as typeof container;
      matchedSelector = sel;
      break;
    }
  }

  const REMOVED_PARENTS = "header, footer, nav, aside, .sidebar, .nav, .footer, .header, .menu, .advertisement, .ad, .cookie-banner, .cookie-consent, .social-share, .comments, .related-posts, .breadcrumb";

  const texts: string[] = [];
  const sectionTitles: (string | null)[] = [];

  container.find("table").each((_, tableEl) => {
    const $table = $(tableEl);
    if ($table.closest(REMOVED_PARENTS).length > 0) return;

    const rows: string[][] = [];
    $table.find("tr").each((_, trEl) => {
      const cells: string[] = [];
      $(trEl).find("th, td").each((_, cellEl) => {
        cells.push($(cellEl).text().trim().replace(/\n/g, " ").replace(/\|/g, "\\|"));
      });
      if (cells.length > 0) rows.push(cells);
    });

    if (rows.length === 0) return;

    const colCount = Math.max(...rows.map((r) => r.length));
    const markdownRows: string[] = [];
    const hasHeader = $table.find("thead, th").length > 0;

    if (hasHeader && rows.length > 0) {
      markdownRows.push("| " + (rows[0] ?? []).map((c) => c || "").join(" | ") + " |");
      markdownRows.push("|" + Array(colCount).fill("---").join("|") + "|");
      rows.shift();
    }

    for (const row of rows) {
      const padded = [...row];
      while (padded.length < colCount) padded.push("");
      markdownRows.push("| " + padded.map((c) => c || "").join(" | ") + " |");
    }

    texts.push(markdownRows.join("\n"));
    sectionTitles.push(null);
  });

  function cssEscape(value: string): string {
    return value.replace(/[!"#$%&'()*+,./:;<=>?@[\]^`{|}~\s]/g, "\\$&");
  }

  function resolveSectionTitle($section: cheerio.Cheerio<any>, defaultTitle: string): string | null {
    const labelledBy = $section.attr("aria-labelledby");
    if (!labelledBy) return defaultTitle;
    const $heading = $section.closest(".mw-parser-output").find(`#${cssEscape(labelledBy)}`);
    const text = $heading.text().trim();
    return text || defaultTitle;
  }

  function extractBlocks(root: cheerio.Cheerio<any>, sectionTitle: string | null): void {
    root.find(BLOCK_ELEMENTS.join(",")).each((_, el) => {
      const $el = $(el);
      if ($el.closest(REMOVED_PARENTS).length > 0) return;
      if ($el.find(BLOCK_ELEMENTS.join(",")).length > 0) return;
      let text = $el.text().trim();
      if (!text) return;

      for (const phrase of phrases) {
        text = text.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
      }

      text = text.trim();
      if (text) {
        texts.push(text);
        sectionTitles.push(sectionTitle);
      }
    });
  }

  const sections = container.find(".mw-parser-output > section[data-mw-section-id]");
  if (sections.length > 0) {
    sections.each((_, sectionEl) => {
      const $section = $(sectionEl);
      const sectionId = $section.attr("data-mw-section-id");
      const sectionTitle = sectionId === "0" ? "Lead" : resolveSectionTitle($section, "Section");
      extractBlocks($section, sectionTitle);
    });
  } else {
    extractBlocks(container, null);
  }

  if (texts.length === 0) {
    if (matchedSelector && matchedSelector !== "body") {
      $(matchedSelector).each((_, el) => {
        const text = $(el).text().trim();
        if (text) {
          texts.push(text);
          sectionTitles.push(null);
        }
      });
    }
    if (texts.length === 0) {
      const containerText = container.text().trim();
      if (containerText) {
        texts.push(containerText);
        sectionTitles.push(null);
      }
    }
  }

  let cleanedText = texts.join("\n\n");
  cleanedText = cleanedText.replace(/\r\n/g, "\n");
  cleanedText = cleanedText.replace(/[ \t]+/g, " ");
  cleanedText = cleanedText.replace(/\n{3,}/g, "\n\n");
  cleanedText = cleanedText.trim();

  return { title, cleanedText, language, sectionTitles };
}
