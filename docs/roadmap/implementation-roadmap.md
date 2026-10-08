# Implementation Roadmap

## Phase A — Critical path

- [ ] Step 9: Structured logging foundation (traceId propagation, Logger interface)
- [ ] Step 1: Page status lifecycle (QUEUED -> SCRAPED -> PROCESSING -> PROCESSED/FAILED)
- [ ] Step 2: Processing queue topology (RabbitMQ `processing` queue + DLX/DLQ, `ProcessJobMessage`)
- [ ] Step 3: Processing worker consumer (`processing-worker.ts`, `PROCESSING_WORKER_ENABLED` flag)

## Phase B — Consistency

- [ ] Step 4: Saga reconciler (Qdrant <-> DB drift detection and repair, 5-min interval / 15-min stale threshold)

## Phase C — Independent cleanup

- [ ] Step 5: Quality rules extension system (Wikipedia rules -> plugin, registry, default ruleset)
- [ ] Step 6: Frontend API URL configuration (Vite env var + proxy)
- [ ] Step 7: Bounded in-memory caches (LRU caps on dedup/robots/ssrf caches — no Redis)
- [ ] Step 8: HTML table -> markdown conversion
- [ ] Step 10: CORS restriction, LLM retry with backoff, boilerplate pattern DRY

## Dependency graph

```
Step 9 (logging, pulled forward)
Step 1 (status) -> Step 2 (queue) -> Step 3 (worker) -> Step 4 (reconciler)
Step 5, 6, 7, 8, 10 — independent, any time
```

## Known open items

- [ ] Reconciler Compensation C (Step 4) needs an attempt cap to avoid infinite republish loops
- [ ] Reconciler Compensation B (Step 4) deletes Qdrant points on DB-chunk absence — confirm hard delete vs. read-and-confirm
- [ ] `PROCESSING_PREFETCH=2` default is untested against actual embedding model memory footprint
- [ ] Step 5 domain glob matching — confirm subdomain handling (e.g. `simple.m.wikipedia.org`)
