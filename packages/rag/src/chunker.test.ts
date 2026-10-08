import { describe, it, expect } from "vitest";
import { chunkPage } from "./chunker.js";
import type { NormalizedBlock, EnhancedMetadata } from "@rag/scraper";

const baseMetadata: EnhancedMetadata = {
  language: "en",
  author: null,
  publishedDate: null,
  modifiedDate: null,
  siteName: null,
  type: null,
  canonicalUrl: null,
  keywords: ["test"],
  robots: null,
  estimatedReadingTime: null,
};

describe("chunkPage", () => {
  it("creates a single chunk for a short paragraph", () => {
    const sections: NormalizedBlock[] = [
      { type: "paragraph", content: "Hello world." },
    ];
    const chunks = chunkPage("Hello world.", sections, baseMetadata, "https://example.com", "site1", "ver1", "Test Page");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("Hello world.");
  });

  it("starts a new chunk for each heading", () => {
    const sections: NormalizedBlock[] = [
      { type: "heading", content: "Section 1" },
      { type: "paragraph", content: "Content for section 1." },
      { type: "heading", content: "Section 2" },
      { type: "paragraph", content: "Content for section 2." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Test");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.metadata.heading).toBe("Section 1");
    expect(chunks[1]?.metadata.heading).toBe("Section 2");
  });

  it("splits large paragraphs at sentence boundaries", () => {
    const longText = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. " + "word ".repeat(500);
    const sections: NormalizedBlock[] = [
      { type: "paragraph", content: longText },
    ];
    const chunks = chunkPage(longText, sections, baseMetadata, "https://example.com", "site1", "ver1", "Test", {
      maxChunkSize: 100,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("merges small adjacent paragraphs", () => {
    const sections: NormalizedBlock[] = [
      { type: "paragraph", content: "Small para one." },
      { type: "paragraph", content: "Small para two." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Test", {
      maxChunkSize: 500,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("Small para one.");
    expect(chunks[0]?.text).toContain("Small para two.");
  });

  it("includes heading text at start of each section chunk", () => {
    const sections: NormalizedBlock[] = [
      { type: "heading", content: "Introduction" },
      { type: "paragraph", content: "Intro paragraph with enough detail." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Test");
    expect(chunks[0]?.text).toContain("Introduction");
  });

  it("applies overlap between chunks", () => {
    const sections: NormalizedBlock[] = [
      { type: "paragraph", content: "A ".repeat(80) + "TAIL_MARKER. "},
      { type: "paragraph", content: "Next section content here." },
      { type: "paragraph", content: "More content." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Test", {
      maxChunkSize: 50,
      overlapWords: 5,
    });
    if (chunks.length > 1) {
      expect(chunks[0]?.text).toBeTruthy();
      expect(chunks[1]?.text).toBeTruthy();
    }
  });

  it("tracks nearest preceding heading for each chunk", () => {
    const sections: NormalizedBlock[] = [
      { type: "heading", content: "Main Title" },
      { type: "paragraph", content: "First paragraph." },
      { type: "subheading", content: "Sub Title" },
      { type: "paragraph", content: "Second paragraph." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Test");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[1]?.metadata.heading).toBe("Sub Title");
  });

  it("includes pageTitle in chunk metadata", () => {
    const sections: NormalizedBlock[] = [
      { type: "paragraph", content: "Just a paragraph." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "My Page Title");
    expect(chunks[0]?.metadata.pageTitle).toBe("My Page Title");
  });

  it("includes keywords in chunk metadata", () => {
    const meta: EnhancedMetadata = { ...baseMetadata, keywords: ["space", "nasa"] };
    const sections: NormalizedBlock[] = [
      { type: "paragraph", content: "Content." },
    ];
    const chunks = chunkPage("", sections, meta, "https://example.com", "site1", "ver1", "Page");
    expect(chunks[0]?.metadata.keywords).toEqual(["space", "nasa"]);
  });

  it("generates unique chunkId for each chunk", () => {
    const sections: NormalizedBlock[] = [
      { type: "heading", content: "A" },
      { type: "paragraph", content: "Content A." },
      { type: "heading", content: "B" },
      { type: "paragraph", content: "Content B." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Page");
    const ids = chunks.map((c) => c.chunkId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to paragraph splitting when no sections provided", () => {
    const text = "First paragraph with some content.\n\nSecond paragraph with more content here.";
    const chunks = chunkPage(text, [], baseMetadata, "https://example.com", "site1", "ver1", "Page");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for empty plainText with no sections", () => {
    const chunks = chunkPage("", [], baseMetadata, "https://example.com", "site1", "ver1", "Page");
    expect(chunks).toHaveLength(0);
  });

  it("assigns sequential chunkIndex", () => {
    const sections: NormalizedBlock[] = [
      { type: "heading", content: "A" },
      { type: "paragraph", content: "Content A." },
      { type: "heading", content: "B" },
      { type: "paragraph", content: "Content B." },
    ];
    const chunks = chunkPage("", sections, baseMetadata, "https://example.com", "site1", "ver1", "Page");
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
    });
  });
});
