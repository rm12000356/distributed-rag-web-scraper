import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@qdrant/js-client-rest", () => {
  return {
    QdrantClient: class {
      getCollections = vi.fn().mockResolvedValue({ collections: [] });
      createCollection = vi.fn().mockResolvedValue(undefined);
      upsert = vi.fn().mockResolvedValue(undefined);
      search = vi.fn().mockResolvedValue([
        { id: "1", score: 0.9, payload: { text: "test", pageUrl: "https://x.com", pageTitle: "X", heading: null, chunkIndex: 0 } },
      ]);
      deleteCollection = vi.fn().mockResolvedValue(undefined);
    },
  };
});

import { createQdrantStore } from "./client.js";

describe("createQdrantStore", () => {
  let store: ReturnType<typeof createQdrantStore>;

  beforeEach(() => {
    store = createQdrantStore("http://127.0.0.1:6333");
  });

  it("upserts vectors", async () => {
    await expect(
      store.upsert("col", [{ id: "1", vector: [0.1, 0.2], payload: { text: "hello", pageUrl: "", pageTitle: "", heading: null, chunkIndex: 0 } }]),
    ).resolves.toBeUndefined();
  });

  it("searches vectors", async () => {
    const results = await store.search("col", [0.1, 0.2], 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBe(0.9);
  });

  it("deletes collection", async () => {
    await expect(store.deleteCollection("col")).resolves.toBeUndefined();
  });
});
