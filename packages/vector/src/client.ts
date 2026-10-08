import { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorStore, VectorPoint, SearchResult } from "./index.js";

const DEFAULT_COLLECTION = "pages";
const VECTOR_SIZE = parseInt(process.env["EMBEDDING_DIMENSIONS"] ?? "1536", 10);

export function createQdrantStore(url?: string): VectorStore {
  const client = new QdrantClient({
    url: url ?? process.env["QDRANT_URL"] ?? "http://localhost:6333",
  });

  let collectionInitialized = false;

  async function ensureCollection(collection: string): Promise<void> {
    if (collectionInitialized) return;
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === collection);
    if (!exists) {
      await client.createCollection(collection, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
    }
    collectionInitialized = true;
  }

  return {
    async upsert(collection: string, points: VectorPoint[]): Promise<void> {
      await ensureCollection(collection ?? DEFAULT_COLLECTION);
      await client.upsert(collection ?? DEFAULT_COLLECTION, {
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
        wait: true,
      });
    },

    async search(
      collection: string,
      vector: number[],
      limit = 5,
    ): Promise<SearchResult[]> {
      await ensureCollection(collection ?? DEFAULT_COLLECTION);
      const results = await client.search(collection ?? DEFAULT_COLLECTION, {
        vector,
        limit,
        score_threshold: 0.3,
        with_payload: true,
      });
      return results.map((r) => ({
        id: String(r.id),
        score: r.score ?? 0,
        payload: (r.payload ?? {}) as Record<string, unknown>,
      }));
    },

    async deleteCollection(collection: string): Promise<void> {
      await client.deleteCollection(collection ?? DEFAULT_COLLECTION);
      collectionInitialized = false;
    },

    async listCollections(): Promise<string[]> {
      const { collections } = await client.getCollections();
      return collections.map((c) => c.name);
    },

    async healthCheck(): Promise<boolean> {
      try {
        await client.getCollections();
        return true;
      } catch {
        return false;
      }
    },

    async countByFilter(
      collection: string,
      filter: Record<string, unknown>,
    ): Promise<number> {
      await ensureCollection(collection ?? DEFAULT_COLLECTION);
      const result = await client.scroll(collection ?? DEFAULT_COLLECTION, {
        filter: filter as Record<string, unknown>,
        limit: 100,
        with_payload: false,
        with_vector: false,
      });
      return result.points.length;
    },

    async deleteByFilter(
      collection: string,
      filter: Record<string, unknown>,
    ): Promise<void> {
      await ensureCollection(collection ?? DEFAULT_COLLECTION);
      await client.delete(collection ?? DEFAULT_COLLECTION, {
        filter: filter as Record<string, unknown>,
      });
    },
  };
}
