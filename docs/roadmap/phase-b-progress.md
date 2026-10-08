# Phase B Progress

## Step 4 — Saga Reconciler

- [x] Add `countByFilter` and `deleteByFilter` to VectorStore interface
- [x] Implement both methods in Qdrant client (scroll + delete with payload filter)
- [x] Create `apps/worker/src/services/reconciler.ts` with reconciliation logic
- [x] Wire `startReconciler()` into `apps/worker/src/index.ts` main()
- [x] Update `.env.example` with `RECONCILE_INTERVAL_MS` and `RECONCILE_STALE_MS`
- [x] TypeScript compiles across worker, vector, api, rag packages

## Compensation scenarios implemented

| Scenario | DB Chunks | Qdrant Points | Action |
|----------|-----------|---------------|--------|
| D | exist | exist | Mark PROCESSED |
| A | exist | 0 | Re-embed chunks from DB, upsert to Qdrant, mark PROCESSED |
| B | 0 | exist | Delete orphaned Qdrant points, mark FAILED |
| C | 0 | 0 | Mark FAILED |

## Design decisions

1. **No queue dependency.** The reconciler doesn't need RabbitMQ access. Reads state from DB + Qdrant, writes corrections directly. Scenario C just marks FAILED — no re-publish to processing queue.

2. **3x stale margin.** Interval=5min, stale=15min. Ensures reconciler never races with in-flight processing.

3. **Re-upsert re-uses same chunk IDs.** Reads existing Chunk rows, re-embeds `.text`, upserts to Qdrant with same `chunkId` as point ID. Idempotent.

4. **Filter uses `pageVersionId` in payload.** Confirmed that every Qdrant point carries `pageVersionId` (set in `chunker.ts` and `processing-worker.ts`).

## Verification

- [ ] TypeScript compiles (confirmed)
- [ ] Manual: set a page to PROCESSING with old updatedAt, verify reconciler fixes it
- [ ] Manual: create DB chunks without Qdrant points, verify re-upsert
- [ ] Manual: create Qdrant points without DB chunks, verify cleanup
