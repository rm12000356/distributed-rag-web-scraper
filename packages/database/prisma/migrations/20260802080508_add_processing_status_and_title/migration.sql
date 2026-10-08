-- AlterEnum
ALTER TYPE "PageStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "title" TEXT;
