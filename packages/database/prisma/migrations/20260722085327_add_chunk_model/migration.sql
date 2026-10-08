-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "pageVersionId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "heading" TEXT,
    "pageTitle" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "qdrantPointId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chunk_chunkId_key" ON "Chunk"("chunkId");

-- CreateIndex
CREATE INDEX "Chunk_pageVersionId_idx" ON "Chunk"("pageVersionId");

-- CreateIndex
CREATE INDEX "Chunk_chunkId_idx" ON "Chunk"("chunkId");

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "PageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
