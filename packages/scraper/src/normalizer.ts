export interface NormalizedBlock {
  type: "heading" | "subheading" | "paragraph" | "list";
  content: string;
  items?: string[];
  sectionTitle?: string;
}

export interface NormalizedContent {
  sections: NormalizedBlock[];
  plainText: string;
  sectionCount: number;
  wordCount: number;
}

function isListBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;

  const listLinePattern = /^[•\-*→]\s+/;
  const listLineCount = lines.filter((l) => listLinePattern.test(l)).length;

  if (listLineCount >= 2) return true;

  return false;
}

function isHeadingBlock(line: string): boolean {
  if (line.length > 120) return false;

  const terminalChars = [".", "?", "!", ":", "…"];
  const lastChar = line.trim().slice(-1);
  if (terminalChars.includes(lastChar)) return false;

  return true;
}

function isSubheadingBlock(line: string, nextBlock: string | null): boolean {
  if (line.length > 200 || line.length <= 120) return false;

  if (!nextBlock) return false;

  const nextWords = nextBlock.split(/\s+/).length;
  return nextWords > 30;
}

export function normalizeContent(cleanedText: string, sectionTitles?: (string | null)[]): NormalizedContent {
  const rawBlocks = cleanedText.split(/\n\n+/);
  const sections: NormalizedBlock[] = [];

  const recognized: ("list" | "heading" | "subheading" | "paragraph" | null)[] = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i]?.trim() ?? "";
    if (!block) {
      recognized.push(null);
      continue;
    }

    const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) {
      recognized.push(null);
      continue;
    }

    if (isListBlock(lines)) {
      recognized.push("list");
      continue;
    }

    if (lines.length === 1) {
      const nextRaw = i + 1 < rawBlocks.length ? rawBlocks[i + 1]?.trim() ?? null : null;

      if (isHeadingBlock(lines[0] ?? "")) {
        recognized.push("heading");
        continue;
      }

      if (isSubheadingBlock(lines[0] ?? "", nextRaw)) {
        recognized.push("subheading");
        continue;
      }
    }

    recognized.push("paragraph");
  }

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i]?.trim() ?? "";
    if (!block) continue;

    const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    const type = recognized[i];
    if (!type) continue;

    if (type === "list") {
      const items = lines
        .filter((l) => /^[•\-*→]\s+/.test(l))
        .map((l) => l.replace(/^[•\-*→]\s+/, "").trim());
      const listBlock: NormalizedBlock = { type: "list", content: block, items };
      if (sectionTitles?.[i] != null) listBlock.sectionTitle = sectionTitles[i]!;
      sections.push(listBlock);
    } else if (type === "heading") {
      const headingBlock: NormalizedBlock = { type: "heading", content: lines[0] ?? "" };
      if (sectionTitles?.[i] != null) headingBlock.sectionTitle = sectionTitles[i]!;
      sections.push(headingBlock);
    } else if (type === "subheading") {
      const subheadingBlock: NormalizedBlock = { type: "subheading", content: lines[0] ?? "" };
      if (sectionTitles?.[i] != null) subheadingBlock.sectionTitle = sectionTitles[i]!;
      sections.push(subheadingBlock);
    } else {
      const paraBlock: NormalizedBlock = { type: "paragraph", content: block };
      if (sectionTitles?.[i] != null) paraBlock.sectionTitle = sectionTitles[i]!;
      sections.push(paraBlock);
    }
  }

  const headingParts: string[] = [];
  const nonHeadingParts: string[] = [];

  for (const s of sections) {
    if (s.type === "heading" || s.type === "subheading") {
      headingParts.push(s.content);
    } else if (s.type === "paragraph") {
      nonHeadingParts.push(s.content);
    } else if (s.type === "list") {
      nonHeadingParts.push(s.items?.join("\n") ?? s.content);
    }
  }

  const plainTextParts: string[] = [];
  for (const s of sections) {
    if (s.type === "list") {
      plainTextParts.push(s.items?.join("\n") ?? s.content);
    } else {
      plainTextParts.push(s.content);
    }
  }
  const plainText = plainTextParts.join("\n\n");

  const wordCount = cleanedText.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    sections,
    plainText,
    sectionCount: sections.length,
    wordCount,
  };
}
