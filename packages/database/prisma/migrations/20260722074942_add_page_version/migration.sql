-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "plainText" TEXT NOT NULL,
    "normalizedJson" TEXT,
    "metadataJson" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageVersion_pageId_idx" ON "PageVersion"("pageId");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_versionNumber_idx" ON "PageVersion"("pageId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_pageId_contentHash_key" ON "PageVersion"("pageId", "contentHash");

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
