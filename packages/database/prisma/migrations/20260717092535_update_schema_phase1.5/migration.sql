-- CreateEnum
CREATE TYPE "CrawlJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'IDLE', 'OFFLINE');
CREATE TYPE "PageStatus" AS ENUM ('QUEUED', 'SCRAPED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Website" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CrawlJob" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CrawlJob" ALTER COLUMN "status" TYPE "CrawlJobStatus" USING "status"::text::"CrawlJobStatus";
ALTER TABLE "CrawlJob" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Page" ADD COLUMN "crawlJobId" TEXT;
ALTER TABLE "Page" ADD COLUMN "status" "PageStatus" NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "Page" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Page" ALTER COLUMN "content" TYPE TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Worker" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Worker" ALTER COLUMN "status" TYPE "WorkerStatus" USING "status"::text::"WorkerStatus";
ALTER TABLE "Worker" ALTER COLUMN "status" SET DEFAULT 'IDLE';

-- CreateIndex
CREATE INDEX "CrawlJob_websiteId_idx" ON "CrawlJob"("websiteId");
CREATE INDEX "CrawlJob_status_idx" ON "CrawlJob"("status");
CREATE INDEX "Page_websiteId_idx" ON "Page"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_websiteId_url_key" ON "Page"("websiteId", "url");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "CrawlJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
