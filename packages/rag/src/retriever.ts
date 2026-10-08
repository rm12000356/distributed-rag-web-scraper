import type { Embedder } from "./embedder.js";
import type { VectorStore } from "@rag/vector";
import { RETRIEVAL_BOILERPLATE } from "./quality/boilerplate.js";

export interface RetrievedChunk {
  text: string;
  pageUrl: string;
  pageTitle: string;
  heading: string | null;
  score: number;
  chunkIndex: number;
}

function isBoilerplate(text: string): boolean {
  const short = text.slice(0, 200);
  return RETRIEVAL_BOILERPLATE.some((p) => p.test(short));
}

export class Retriever {
  constructor(
    private embedder: Embedder,
    private store: VectorStore,
  ) {}

  async retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
    const vector = await this.embedder.embedSingle(query);
    const results = await this.store.search("pages", vector, topK);

    const chunks: RetrievedChunk[] = results.map((r) => ({
      text: (r.payload["text"] as string) ?? "",
      pageUrl: (r.payload["pageUrl"] as string) ?? "",
      pageTitle: (r.payload["pageTitle"] as string) ?? "",
      heading: (r.payload["heading"] as string) ?? null,
      score: r.score,
      chunkIndex: (r.payload["chunkIndex"] as number) ?? 0,
    }));

    const filtered = chunks.filter((c) => !isBoilerplate(c.text));
    filtered.sort((a, b) => b.score - a.score);

    const seen = new Map<string, number>();
    return filtered.filter((c) => {
      const count = seen.get(c.pageUrl) ?? 0;
      if (count >= 3) return false;
      seen.set(c.pageUrl, count + 1);
      return true;
    });
  }
}
