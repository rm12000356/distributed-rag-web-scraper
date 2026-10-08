import { describe, it, expect, vi } from "vitest";
import { Retriever } from "./retriever.js";
import type { Embedder } from "./embedder.js";
import type { VectorStore, SearchResult } from "@rag/vector";

function createMockEmbedder(): Embedder {
  return {
    dimensions: 1536,
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    embedSingle: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };
}

function createMockStore(results: SearchResult[]): VectorStore {
  return {
    upsert: vi.fn(),
    search: vi.fn().mockResolvedValue(results),
    deleteCollection: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Retriever", () => {
  it("returns topK results sorted by score descending", async () => {
    const results: SearchResult[] = [
      { id: "1", score: 0.5, payload: { text: "Low score", pageUrl: "https://a.com", pageTitle: "A", heading: null, chunkIndex: 0 } },
      { id: "2", score: 0.9, payload: { text: "High score", pageUrl: "https://b.com", pageTitle: "B", heading: null, chunkIndex: 0 } },
    ];
    const retriever = new Retriever(createMockEmbedder(), createMockStore(results));
    const chunks = await retriever.retrieve("test query", 5);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.score).toBe(0.9);
    expect(chunks[0]?.text).toBe("High score");
  });

  it("deduplicates: keeps max 3 chunks per page URL", async () => {
    const results: SearchResult[] = [
      { id: "1", score: 0.9, payload: { text: "A1", pageUrl: "https://a.com", pageTitle: "A", heading: null, chunkIndex: 0 } },
      { id: "2", score: 0.8, payload: { text: "A2", pageUrl: "https://a.com", pageTitle: "A", heading: null, chunkIndex: 1 } },
      { id: "3", score: 0.7, payload: { text: "A3", pageUrl: "https://a.com", pageTitle: "A", heading: null, chunkIndex: 2 } },
      { id: "4", score: 0.6, payload: { text: "A4", pageUrl: "https://a.com", pageTitle: "A", heading: null, chunkIndex: 3 } },
      { id: "5", score: 0.5, payload: { text: "B1", pageUrl: "https://b.com", pageTitle: "B", heading: null, chunkIndex: 0 } },
    ];
    const retriever = new Retriever(createMockEmbedder(), createMockStore(results));
    const chunks = await retriever.retrieve("test", 5);
    expect(chunks).toHaveLength(4);
    const aChunks = chunks.filter((c) => c.pageUrl === "https://a.com");
    expect(aChunks).toHaveLength(3);
  });

  it("returns empty array for no results", async () => {
    const retriever = new Retriever(createMockEmbedder(), createMockStore([]));
    const chunks = await retriever.retrieve("nothing", 5);
    expect(chunks).toHaveLength(0);
  });
});
