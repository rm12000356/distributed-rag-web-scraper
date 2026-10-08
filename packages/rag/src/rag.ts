import type { Embedder } from "./embedder.js";
import type { VectorStore } from "@rag/vector";
import type { LLMProvider } from "./llm.js";
import { Retriever } from "./retriever.js";

const SYSTEM_TEMPLATE = `You are a knowledgeable research assistant. Answer the user's question using ONLY the provided context below.

Question: {question}

IMPORTANT RULES:
- Synthesize information from ALL chunks provided. Different chunks contain different details — combine them to form a complete answer.
- If the context contains ANY relevant information (even partial names, dates, or roles), use it. Do not refuse to answer just because no single chunk contains everything.
- Only say "I don't have enough information to answer that question" if the context has ZERO relevant content about what was asked.
- Cite specific sources inline using [1], [2], etc.
- For biography questions: include full name, birth year, nationality, current/past roles, education, and notable events.

Context:
{context}

Sources:
{sources}`;

export interface RAGAnswer {
  answer: string;
  citations: Array<{
    text: string;
    url: string;
    title: string;
    score: number;
  }>;
  retrievalTimeMs: number;
  generationTimeMs: number;
}

export class RAGPipeline {
  private retriever: Retriever;

  constructor(
    private embedder: Embedder,
    private store: VectorStore,
    private llm: LLMProvider,
  ) {
    this.retriever = new Retriever(embedder, store);
  }

  async ask(question: string, topK = 10): Promise<RAGAnswer> {
    const retrievalStart = Date.now();
    const retrieved = await this.retriever.retrieve(question, topK);
    const retrievalTimeMs = Date.now() - retrievalStart;

    const contextLines = retrieved.map(
      (c, i) => `[${i + 1}] ${c.heading ? c.heading + ": " : ""}${c.text}`,
    );
    const context = contextLines.join("\n\n");

    const sourceLines = retrieved.map(
      (c, i) => `[${i + 1}] ${c.pageTitle} - ${c.pageUrl}`,
    );
    const sources = sourceLines.join("\n");

    const prompt = SYSTEM_TEMPLATE
      .replace("{question}", question)
      .replace("{context}", context)
      .replace("{sources}", sources);

    const generationStart = Date.now();
    const answer = await this.llm.generate(prompt);
    const generationTimeMs = Date.now() - generationStart;

    const citations = retrieved.map((c) => ({
      text: c.text,
      url: c.pageUrl,
      title: c.pageTitle,
      score: c.score,
    }));

    return {
      answer,
      citations,
      retrievalTimeMs,
      generationTimeMs,
    };
  }
}
