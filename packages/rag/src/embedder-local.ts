import type { Embedder } from "./embedder.js";

let pipe: unknown = null;

async function getPipeline() {
  if (!pipe) {
    const { pipeline } = await import("@xenova/transformers");
    console.log("[Local Embedder] Loading model (first run downloads ~80MB)...");
    pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("[Local Embedder] Model loaded.");
  }
  return pipe as { (texts: string[], opts?: { pooling?: string; normalize?: boolean }): Promise<{ tolist(): number[][] }> };
}

const USE_LOCAL_EMBEDDER = process.env["USE_LOCAL_EMBEDDER"] !== "false";

export function createLocalEmbedder(): Embedder {
  if (!USE_LOCAL_EMBEDDER) {
    return {
      dimensions: 384,
      async embed(texts: string[]): Promise<number[][]> {
        console.log(`[Local Embedder] Skipped (USE_LOCAL_EMBEDDER=false) — ${texts.length} texts`);
        return texts.map(() => new Array(384).fill(0));
      },
      async embedSingle(_text: string): Promise<number[]> {
        return new Array(384).fill(0);
      },
    };
  }
  return {
    dimensions: 384,

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const p = await getPipeline();
      const result = await p(texts, { pooling: "mean", normalize: true });
      return result.tolist();
    },

    async embedSingle(text: string): Promise<number[]> {
      const results = await this.embed([text]);
      return results[0] ?? [];
    },
  };
}
