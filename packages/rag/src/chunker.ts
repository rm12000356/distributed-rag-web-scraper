import { randomUUID } from "node:crypto";
import type { NormalizedBlock, EnhancedMetadata } from "@rag/scraper";

export interface Chunk {
  chunkId: string;
  pageUrl: string;
  websiteId: string;
  pageVersionId: string;
  text: string;
  chunkIndex: number;
  metadata: {
    sectionType: string;
    heading: string | null;
    wordCount: number;
    pageTitle: string;
    keywords: string[];
    sectionTitle?: string;
  };
}

export interface ChunkOptions {
  maxChunkSize?: number;
  overlapWords?: number;
}

function findLastSentenceEnd(text: string): number {
  const matches = [...text.matchAll(/[.!?]\s/g)];
  if (matches.length === 0) return -1;
  const last = matches[matches.length - 1]!;
  return last.index! + last[0].length - 1;
}

function splitAtSentenceBoundary(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const parts: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const slice = words.slice(start, end).join(" ");

    if (end >= words.length) {
      parts.push(slice);
      break;
    }

    const pos = findLastSentenceEnd(slice);
    if (pos !== -1) {
      const breakChar = slice[pos]!;
      const breakPoint = slice.lastIndexOf(breakChar) + 1;
      const chunkText = slice.slice(0, breakPoint).trim();
      parts.push(chunkText);
      start += chunkText.split(/\s+/).filter(Boolean).length;
    } else {
      parts.push(slice);
      start = end;
    }
  }

  return parts;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function chunkPage(
  plainText: string,
  normalizedSections: NormalizedBlock[],
  metadata: EnhancedMetadata,
  pageUrl: string,
  websiteId: string,
  pageVersionId: string,
  pageTitle: string,
  options?: ChunkOptions,
): Chunk[] {
  const maxChunkSize = options?.maxChunkSize ?? 500;
  const overlapWords = options?.overlapWords ?? 50;
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  if (normalizedSections.length > 0) {
    let currentChunk = "";
    let currentHeading: string | null = null;
    let lastHeading: string | null = null;
    let currentSectionTitle: string | undefined;

    function flushChunk(): void {
      if (!currentChunk) return;
      const wc = wordCount(currentChunk);
      const chunk: Chunk = {
        chunkId: randomUUID(),
        pageUrl,
        websiteId,
        pageVersionId,
        text: currentChunk.trim(),
        chunkIndex: chunkIndex++,
        metadata: {
          sectionType: "mixed",
          heading: lastHeading,
          wordCount: wc,
          pageTitle,
          keywords: metadata.keywords,
        },
      };
      if (currentSectionTitle) chunk.metadata.sectionTitle = currentSectionTitle;
      chunks.push(chunk);
    }

    for (const section of normalizedSections) {
      if (section.sectionTitle && section.sectionTitle !== currentSectionTitle) {
        flushChunk();
        currentSectionTitle = section.sectionTitle;
        currentChunk = "";
      }

      if (section.type === "heading" || section.type === "subheading") {
        flushChunk();
        currentHeading = section.content;
        lastHeading = currentHeading;
        currentChunk = section.content + "\n\n";
      } else if (section.type === "paragraph") {
        const sectionWc = wordCount(section.content);
        const currentWc = wordCount(currentChunk);

        if (sectionWc > maxChunkSize) {
          flushChunk();
          const subParts = splitAtSentenceBoundary(section.content, maxChunkSize);
          for (let i = 0; i < subParts.length; i++) {
            const part = subParts[i] ?? "";
            const subChunk: Chunk = {
              chunkId: randomUUID(),
              pageUrl,
              websiteId,
              pageVersionId,
              text: part,
              chunkIndex: chunkIndex++,
              metadata: {
                sectionType: "paragraph",
                heading: lastHeading,
                wordCount: wordCount(part),
                pageTitle,
                keywords: metadata.keywords,
              },
            };
            if (currentSectionTitle) subChunk.metadata.sectionTitle = currentSectionTitle;
            chunks.push(subChunk);
          }
          currentChunk = "";
        } else if (currentWc + sectionWc > maxChunkSize) {
          flushChunk();
          currentChunk = section.content + "\n\n";
        } else {
          currentChunk += section.content + "\n\n";
        }
      } else if (section.type === "list") {
        const sectionWc = wordCount(section.content);
        const currentWc = wordCount(currentChunk);

        if (currentWc + sectionWc > maxChunkSize && currentChunk) {
          flushChunk();
          currentChunk = "";
        }
        currentChunk += section.content + "\n\n";
      }
    }

    if (currentChunk) {
      flushChunk();
    }
  } else {
    const paragraphs = plainText.split(/\n\n+/).filter((p) => p.trim());
    let buffer = "";

    for (const para of paragraphs) {
      const paraWc = wordCount(para);
      const bufferWc = wordCount(buffer);

      if (paraWc > maxChunkSize) {
        if (buffer) {
          chunks.push(makeChunk(buffer, pageUrl, websiteId, pageVersionId, chunkIndex++, pageTitle, metadata, null, undefined));
          buffer = "";
        }
        const subParts = splitAtSentenceBoundary(para, maxChunkSize);
        for (let i = 0; i < subParts.length; i++) {
          const part = subParts[i] ?? "";
          chunks.push(makeChunk(part, pageUrl, websiteId, pageVersionId, chunkIndex++, pageTitle, metadata, null, undefined));
        }
      } else if (bufferWc + paraWc > maxChunkSize && buffer) {
        chunks.push(makeChunk(buffer, pageUrl, websiteId, pageVersionId, chunkIndex++, pageTitle, metadata, null, undefined));
        buffer = para;
      } else {
        buffer = buffer ? buffer + "\n\n" + para : para;
      }
    }

    if (buffer) {
      chunks.push(makeChunk(buffer, pageUrl, websiteId, pageVersionId, chunkIndex++, pageTitle, metadata, null, undefined));
    }
  }

  if (overlapWords > 0) {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const curr = chunks[i];
      if (prev && curr) {
        const prevWords = prev.text.trim().split(/\s+/).filter(Boolean);
        if (prevWords.length > 0) {
          const overlap = prevWords.slice(-overlapWords).join(" ");
          if (overlap) {
            curr.text = overlap + "\n" + curr.text.trim();
            curr.metadata.wordCount = wordCount(curr.text);
          }
        }
      }
    }
  }

  return chunks;
}

function makeChunk(
  text: string,
  pageUrl: string,
  websiteId: string,
  pageVersionId: string,
  chunkIndex: number,
  pageTitle: string,
  metadata: EnhancedMetadata,
  heading: string | null,
  sectionTitle?: string,
): Chunk {
  const chunk: Chunk = {
    chunkId: randomUUID(),
    pageUrl,
    websiteId,
    pageVersionId,
    text: text.trim(),
    chunkIndex,
    metadata: {
      sectionType: "paragraph",
      heading,
      wordCount: wordCount(text),
      pageTitle,
      keywords: metadata.keywords,
    },
  };
  if (sectionTitle) chunk.metadata.sectionTitle = sectionTitle;
  return chunk;
}
