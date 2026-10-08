-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_pageId_versionNumber_key" ON "PageVersion"("pageId", "versionNumber");