# Phase A Progress

## Pre-work

- [x] Create docs/roadmap/ directory and files
- [x] Add `title String?` to Page model in schema.prisma
- [ ] Run Prisma migration `add_title_to_page` (deferred — needs running postgres; schema is correct, client regenerated)

## Step 9 — Structured Logging

- [x] Create `packages/shared/src/logger.ts` (Logger interface + console implementation)
- [x] Add `traceId?: string` to `CrawlJobMessage` in `packages/shared/src/index.ts`
- [x] Add `traceId?: string` to `ProcessJobMessage` in `packages/shared/src/index.ts`
- [x] Export Logger type and createLogger from `packages/shared/src/index.ts`
- [x] Wire traceId generation in `apps/api/src/routes/crawl.ts`
- [x] Wire traceId extraction in `apps/worker/src/index.ts` (pass to handlers)
- [x] Replace key console.log calls in `apps/worker/src/services/crawler.ts` with structured logger

## Step 1 — Page Status Lifecycle

- [x] Add `title: cleaned.title` to page create in crawler.ts
- [x] Add `title: cleaned.title` to unchanged-page update in crawler.ts
- [x] Add `title: cleaned.title` to changed-page update in crawler.ts
- [x] Set page status to `PROCESSING` via processing-worker.ts before chunking
- [x] Remove fire-and-forget `processChunks()` call, replace with queue publish
- [x] Added `PROCESSING` to Prisma PageStatus enum
- [x] Added `PROCESSING` to shared PageStatus type
- [x] Updated pages.ts route zod schema with PROCESSING
- [x] Updated frontend Pages.tsx filter dropdown with PROCESSING

## Step 2 — Processing Queue Topology

- [x] Add `PROCESSING_QUEUE`, `PROCESSING_DLX_EXCHANGE`, `PROCESSING_DLQ_QUEUE` constants in `packages/queue/src/topology.ts`
- [x] Add `setupProcessingTopology()` function in `packages/queue/src/topology.ts`
- [x] Export new constants + function from `packages/queue/src/index.ts`
- [x] Add `ProcessJobMessage` type to `packages/shared/src/index.ts`
- [x] Wire `setupProcessingTopology()` in `apps/worker/src/index.ts`
- [x] Wire `setupProcessingTopology()` in `apps/api/src/services/worker-monitor.ts`

## Step 3 — Processing Worker Consumer

- [x] Create `apps/worker/src/services/processing-worker.ts` with `handleProcessJob()`
- [x] Add `PROCESSING_WORKER_ENABLED`, `PROCESSING_MAX_ATTEMPTS`, `PROCESSING_PREFETCH` env vars
- [x] Subscribe to `PROCESSING_QUEUE` conditionally in `apps/worker/src/index.ts`
- [x] Update `apps/worker/src/index.ts` shutdown to handle both consumers
- [x] Clean up unused `processChunks` import from `crawler.ts`
- [x] Update `.env.example` with new processing env vars
- [x] Duplicate processing guard: checks `page.status === "PROCESSED"` at top of handler

## Chunker Fix

- [x] Modify `apps/worker/src/services/chunker.ts` to re-throw errors (remove silent catch)

## Verification

- [x] TypeScript compiles across all packages (shared, queue, database, scraper, worker, api, web)
- [ ] Manual test: crawl page, verify status lifecycle via API (needs running services)
- [ ] Manual test: kill Qdrant mid-processing, verify FAILED status and retry (needs running services)
- [ ] Manual test: republish message for PROCESSED page, verify duplicate guard (needs running services)
- [ ] Manual test: `PROCESSING_WORKER_ENABLED=false`, verify only crawl queue consumed (needs running services)
- [ ] Manual test: traceId appears across all log stages (needs running services)

## Deviations from plan

1. **Schema: Added `PROCESSING` to PageStatus enum.** The original plan only added `PROCESSING` to the TypeScript type, but the Prisma schema enum also needed it. Both are updated. This requires a migration (`npx prisma migrate dev --name add_processing_status` when postgres is available).

2. **`exactOptionalPropertyTypes` fixes.** The root tsconfig enables `exactOptionalPropertyTypes: true`, which rejects `{ traceId: string | undefined }` where `{ traceId?: string }` is expected. Fixed with conditional spread `...(traceId ? { traceId } : {})` in both the processing queue publish and child crawl job publish in crawler.ts.

3. **`pageTitle` fallback.** The processing worker re-reads Page from DB which has a nullable `title` column. If NULL (old rows from before migration), it falls back to `page.url` as the chunk title.

4. **No intermediate `updatedAt` heartbeat during chunking.** The chunk→embed→Qdrant pipeline completes in seconds. The reconciler's 15-minute stale window (Step 4) is more than sufficient. Evaluated and found unnecessary for Phase A.

5. **Added duplicate-chunk guard in processing-worker.** If a retry message arrives for a pageVersion that already has Chunk records (e.g. crash after Qdrant upsert but before status update), the handler skips processing and just marks the page PROCESSED. This prevents duplicate chunks/vectors from retried messages.

6. **Removed unused `NormalizedBlock` import from crawler.ts.** Dead import left over from the removed direct `processChunks()` call.

## Migration note

When postgres is running, run:
```
cd packages/database
npx prisma migrate dev --name add_processing_status_and_title
```

This will cover both the `title` column addition to Page and the `PROCESSING` enum value addition to PageStatus.
