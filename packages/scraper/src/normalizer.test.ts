import { describe, it, expect } from "vitest";
import { normalizeContent } from "./normalizer.js";

describe("normalizeContent", () => {
  it("detects a single heading", () => {
    const result = normalizeContent("Breaking News: Major Discovery");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("heading");
    expect(result.sections[0]?.content).toBe("Breaking News: Major Discovery");
  });

  it("detects heading followed by paragraph", () => {
    const text = "Breaking News\n\nThis is the first paragraph of the article with enough text to be a paragraph.";
    const result = normalizeContent(text);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.type).toBe("heading");
    expect(result.sections[1]?.type).toBe("paragraph");
  });

  it("classifies a single line ending with . as paragraph not heading", () => {
    const result = normalizeContent("This is a complete sentence ending with a period.");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("paragraph");
  });

  it("classifies a single line ending with ? as paragraph not heading", () => {
    const result = normalizeContent("Is this a heading?");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("paragraph");
  });

  it("classifies a single line ending with ! as paragraph not heading", () => {
    const result = normalizeContent("Wow what a story!");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("paragraph");
  });

  it("classifies a long single line over 120 chars as paragraph", () => {
    const longLine = "A".repeat(121);
    const result = normalizeContent(longLine);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("paragraph");
  });

  it("detects a short heading (≤120 chars, no terminal punctuation)", () => {
    const result = normalizeContent("What This Means");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("heading");
  });

  it("detects a list: 2+ lines with bullet markers", () => {
    const text = "- First item\n- Second item\n- Third item";
    const result = normalizeContent(text);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("list");
    expect(result.sections[0]?.items).toEqual(["First item", "Second item", "Third item"]);
  });

  it("detects a list with • markers", () => {
    const text = "• Point one\n• Point two";
    const result = normalizeContent(text);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("list");
  });

  it("does NOT treat mid-sentence dashes as list items", () => {
    const text = "The experiment — which took three years — was a success.\n\nAnother paragraph here.";
    const result = normalizeContent(text);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.type).toBe("paragraph");
    expect(result.sections[1]?.type).toBe("paragraph");
  });

  it("classifies single line as heading with short text even when it has multiple lines later", () => {
    const text = "The Discovery\n\nScientists found evidence of ancient water on Mars in a groundbreaking study that changes everything we know about the planet.";
    const result = normalizeContent(text);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.type).toBe("heading");
    expect(result.sections[1]?.type).toBe("paragraph");
  });

  it("computes wordCount correctly", () => {
    const result = normalizeContent("one two three four five");
    expect(result.wordCount).toBe(5);
  });

  it("computes wordCount for multi-block text", () => {
    const text = "Heading here\n\nParagraph with multiple words for counting purposes.";
    const result = normalizeContent(text);
    expect(result.wordCount).toBe(9);
  });

  it("returns sectionCount equal to number of sections", () => {
    const text = "Heading\n\nPara one.\n\nPara two.\n\n- Item 1\n- Item 2";
    const result = normalizeContent(text);
    expect(result.sectionCount).toBe(result.sections.length);
  });

  it("generates plainText including heading text", () => {
    const text = "The Title\n\nBody paragraph here.";
    const result = normalizeContent(text);
    expect(result.plainText).toContain("The Title");
    expect(result.plainText).toContain("Body paragraph here.");
  });

  it("returns sections in document order", () => {
    const text = "First Heading\n\nFirst paragraph here with enough text.\n\nSecond Heading\n\nSecond paragraph here with enough text.\n\n- Item A\n- Item B";
    const result = normalizeContent(text);
    expect(result.sections.map((s) => s.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "list",
    ]);
  });

  it("handles empty string", () => {
    const result = normalizeContent("");
    expect(result.sections).toHaveLength(0);
    expect(result.wordCount).toBe(0);
    expect(result.plainText).toBe("");
  });

  it("handles single paragraph", () => {
    const result = normalizeContent("Just a single paragraph of text here.");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.type).toBe("paragraph");
  });
});
