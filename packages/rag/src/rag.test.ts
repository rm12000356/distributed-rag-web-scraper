import { describe, it, expect, vi } from "vitest";
import { RAGPipeline } from "./rag.js";
import type { Embedder } from "./embedder.js";
import type { VectorStore, SearchResult } from "@rag/vector";
import type { LLMProvider } from "./llm.js";

function createMockEmbedder(): Embedder {
  return {
    dimensions: 1536,
    embed: vi.fn().mockResolvedValue([[0.1]]),
    embedSingle: vi.fn().mockResolvedValue([0.1]),
  };
}

function createMockStore(): VectorStore {
  return {
    upsert: vi.fn(),
    search: vi.fn().mockResolvedValue([
      {
        id: "1",
        score: 0.9,
        payload: {
          text: "Mars rovers found evidence of ancient water.",
          pageUrl: "https://example.com/mars",
          pageTitle: "Mars Mission",
          heading: "Discovery",
          chunkIndex: 0,
        },
      },
    ] as SearchResult[]),
    deleteCollection: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

function createMockLLM(): LLMProvider {
  return {
    model: "gpt-test",
    generate: vi.fn().mockResolvedValue("Based on [1], Mars had ancient water."),
  };
}

describe("RAGPipeline", () => {
  it("returns answer with citations", async () => {
    const pipeline = new RAGPipeline(createMockEmbedder(), createMockStore(), createMockLLM());
    const result = await pipeline.ask("What did Mars rovers find?");
    expect(result.answer).toBe("Based on [1], Mars had ancient water.");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.url).toBe("https://example.com/mars");
    expect(result.citations[0]?.title).toBe("Mars Mission");
  });

  it("measures retrieval and generation time", async () => {
    const pipeline = new RAGPipeline(createMockEmbedder(), createMockStore(), createMockLLM());
    const result = await pipeline.ask("test?");
    expect(result.retrievalTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("includes score in citations", async () => {
    const pipeline = new RAGPipeline(createMockEmbedder(), createMockStore(), createMockLLM());
    const result = await pipeline.ask("test?");
    expect(result.citations[0]?.score).toBe(0.9);
  });
});
