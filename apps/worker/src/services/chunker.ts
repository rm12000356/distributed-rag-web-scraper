import { prisma } from "@rag/database";
import { chunkPage, createLocalEmbedder } from "@rag/rag";
import type { NormalizedBlock, EnhancedMetadata } from "@rag/scraper";
import { createQdrantStore } from "@rag/vector";

export async function processChunks(
  pageVersionId: string,
  plainText: string,
  normalizedSections: NormalizedBlock[],
  metadata: EnhancedMetadata,
  pageUrl: string,
  websiteId: string,
  pageTitle: string,
): Promise<void> {
  try {
    console.log(`[Chunker] Processing chunks for ${pageUrl} (${plainText.length} chars)`);

    // maxChunkSize: 150 words — safe below all-MiniLM-L6-v2 256-token limit
    // TODO: replace word-count with AutoTokenizer for exact token boundaries
    const chunks = chunkPage(
      plainText,
      normalizedSections,
      metadata,
      pageUrl,
      websiteId,
      pageVersionId,
      pageTitle,
      { maxChunkSize: 150, overlapWords: 30 },
    );

    if (chunks.length === 0) return;

    console.log(`[Chunker] Split into ${chunks.length} chunks, starting batched embeddings...`);
    const batchSize = parseInt(process.env["EMBED_BATCH_SIZE"] || "16", 10);
    const embedder = createLocalEmbedder();
    let totalEmbedTime = 0;

    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`[Chunker] Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${batch.length} chunks)...`);
      const embedStart = Date.now();
      const texts = batch.map((c) => c.text);
      const batchVectors = await embedder.embed(texts);
      totalEmbedTime += Date.now() - embedStart;
      vectors.push(...batchVectors);
    }

    console.log(`[Chunker] Embeddings generated for ${vectors.length} chunks in ${totalEmbedTime}ms`);

    console.log(`[Chunker] Upserting ${vectors.length} vectors to Qdrant...`);
    const store = createQdrantStore();
    const points = chunks.map((chunk, i) => ({
      id: chunk.chunkId,
      vector: vectors[i] ?? [],
      payload: {
        pageUrl: chunk.pageUrl,
        websiteId: chunk.websiteId,
        pageVersionId: chunk.pageVersionId,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.metadata.heading,
        pageTitle: chunk.metadata.pageTitle,
        sectionTitle: chunk.metadata.sectionTitle,
      },
    }));
    await store.upsert("pages", points);

    console.log(`[Chunker] Storing ${chunks.length} chunk records to DB...`);
    await prisma.$transaction(
      chunks.map((chunk) =>
        prisma.chunk.create({
          data: {
            chunkId: chunk.chunkId,
            pageVersionId: chunk.pageVersionId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            heading: chunk.metadata.heading,
            pageTitle: chunk.metadata.pageTitle,
            sectionTitle: chunk.metadata.sectionTitle ?? null,
            pageUrl: chunk.pageUrl,
            websiteId: chunk.websiteId,
            qdrantPointId: chunk.chunkId,
          },
        }),
      ),
    );

    console.log(`[Chunker] Created ${chunks.length} chunks for ${pageUrl}`);
  } catch (err) {
    console.error(`[Chunker] Failed to process chunks for ${pageUrl}:`, (err as Error).message);
    throw err;
  }
}
