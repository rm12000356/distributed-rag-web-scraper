import { QualityRegistry, wikipediaRules, defaultRules } from "@rag/rag";
import type { CleanResult } from "@rag/scraper";

const registry = new QualityRegistry(defaultRules);
registry.register(wikipediaRules);

const MIN_PAGE_WORDS = parseInt(process.env["MIN_PAGE_WORDS"] ?? "50", 10);

export function shouldSkipUrl(url: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  const rules = registry.match(hostname);
  for (const { pattern, label } of rules.skipUrlPatterns) {
    if (pattern.test(url)) return label;
  }
  return null;
}

export function shouldSkipSection(url: string, sectionTitle: string | null): boolean {
  if (!sectionTitle) return false;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const rules = registry.match(hostname);
  const lower = sectionTitle.toLowerCase();
  return rules.skipSectionTitles?.some((t) => t.toLowerCase() === lower) ?? false;
}

export function filterSections(cleaned: CleanResult, url: string): CleanResult {
  if (cleaned.sectionTitles.length === 0) return cleaned;

  const blocks = cleaned.cleanedText.split("\n\n");
  const skipped = new Set<number>();

  for (let i = 0; i < cleaned.sectionTitles.length; i++) {
    if (shouldSkipSection(url, cleaned.sectionTitles[i]!)) {
      skipped.add(i);
    }
  }

  if (skipped.size === 0) return cleaned;

  const filteredTexts: string[] = [];
  const filteredTitles: (string | null)[] = [];

  for (let i = 0; i < blocks.length; i++) {
    if (!skipped.has(i)) {
      filteredTexts.push(blocks[i]!);
      filteredTitles.push(cleaned.sectionTitles[i] ?? null);
    }
  }

  return {
    title: cleaned.title,
    cleanedText: filteredTexts.join("\n\n"),
    language: cleaned.language,
    sectionTitles: filteredTitles,
  };
}

export function shouldKeepContent(
  wordCount: number,
  cleanedText: string,
  url?: string,
): { keep: boolean; reason: string; shouldRetryDynamic: boolean } {
  let hostname: string | undefined;
  if (url) {
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      // fall back to default
    }
  }

  const rules = hostname ? registry.match(hostname) : defaultRules;

  if (rules.shouldKeepContent) {
    return rules.shouldKeepContent({
      wordCount,
      textHead: cleanedText.slice(0, 300),
      fullText: cleanedText,
    });
  }

  if (wordCount < MIN_PAGE_WORDS) {
    return { keep: false, reason: `stub: ${wordCount} words (min ${MIN_PAGE_WORDS})`, shouldRetryDynamic: true };
  }

  return { keep: true, reason: "", shouldRetryDynamic: false };
}

export function filterChildLinks(links: string[], seedDomain: string): { kept: string[]; discarded: number } {
  const kept: string[] = [];
  let discarded = 0;

  for (const link of links) {
    try {
      if (new URL(link).hostname.toLowerCase() !== seedDomain) {
        discarded++;
        continue;
      }
    } catch {
      discarded++;
      continue;
    }

    if (shouldSkipUrl(link)) {
      discarded++;
      continue;
    }

    kept.push(link);
  }

  return { kept, discarded };
}
