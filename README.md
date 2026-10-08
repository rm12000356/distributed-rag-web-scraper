# Distributed RAG-Based Web Scraper Framework

A production-style distributed web scraping framework with Retrieval-Augmented Generation (RAG), built as a monorepo with npm workspaces, Turbo, TypeScript, Express, React, and Prisma.

## Demo Video

https://drive.google.com/file/d/1xfSelmzps7Dwj-LTeYcdHl72zdbTp43L/view?usp=sharing

## Tech Stack

| Category | Technology |
|---|---|---|
| Runtime | Node.js 22, TypeScript 6 |
| Backend | Express 5 |
| Frontend | React 19, Vite 8 |
| Database | PostgreSQL 16, Prisma 7 |
| Queue | RabbitMQ |
| Vector DB | Qdrant |
| Scraping | Axios + Cheerio (static), Playwright (dynamic) |
| Data Processing | Deep HTML cleaning, content normalization, metadata extraction, page versioning — Phase 5 |
| LLM | OpenAI GPT (abstracted) |
| Containers | Docker Compose |
| Monorepo | npm workspaces + Turbo 2 |

## Project Structure

```
apps/
  api/          Express API — 9 endpoints: crawl, ask, search, pages, jobs, workers, websites, reset, health
  web/          React 19 dashboard — 8 views: dashboard, crawl jobs, pages, search, ask, workers, detail pages
  worker/       Background worker — consumes crawl jobs, full data pipeline
packages/
  config/       Shared configuration (AppConfig stub)
  database/     Prisma schema (6 models), client, and 7 migrations
  queue/        RabbitMQ — connection, publisher, consumer, retry/DLQ, topology, purger
  rag/          RAG pipeline — chunker, embedders (OpenAI + local HuggingFace), LLM, retriever
  scraper/      Web scraper — static fetch, robots.txt, rate limiter, extractor, dedup, cleaner, normalizer, metadata
  shared/       TypeScript types (146 lines) + Zod validation schemas
  vector/       Qdrant REST client
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- npm >= 10

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/rm12000356/distributed-rag-web-scraper.git
cd distributed-rag-web-scraper

# 2. Install dependencies
npm ci

# 3. Start infrastructure (PostgreSQL, RabbitMQ, Qdrant)
docker-compose up -d postgres rabbitmq qdrant

# 4. Apply database migrations
cd packages/database && npx prisma migrate deploy && cd ../..

# 5. Generate Prisma client
cd packages/database && npx prisma generate && cd ../..
```

## Run Locally

```bash
# Start infrastructure (if not already running)
docker-compose up -d postgres rabbitmq qdrant

# Start API and workers via Turbo
npm run dev
```

Or run services individually:

```bash
# Terminal 1: API
cd apps/api ; npx tsx src/index.ts

# Terminal 2: Worker 1
cd apps/worker ; npx tsx src/index.ts

# Terminal 3: Worker 2 (different WORKER_NAME)
$env:WORKER_NAME = "worker-2"; npx tsx src/index.ts

# terminal 4: web
cd apps/web ; npm run dev
```


### Multi-Worker (Docker)

```bash
docker-compose up -d --build worker-1 worker-2
```

Both workers consume from the same `crawl` queue. RabbitMQ distributes messages fairly via `prefetch=1`.

### Monitor Workers

Check worker status in the database:

```bash
docker exec -it rag-postgres psql -U rag -d ragdb -c "SELECT name, status, last_heartbeat FROM \"Worker\";"
```

Or watch the RabbitMQ Management UI at http://localhost:15672 (guest/guest).

## Docker Commands

```bash
# Start all services (including API and Worker containers)
docker-compose up -d --build

# Start only infrastructure
docker-compose up -d postgres rabbitmq qdrant

# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Stop and remove volumes (wipes database)
docker-compose down -v
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start all workspaces in dev mode |
| `npm run build` | Build all workspaces |
| `npm run lint` | Type-check all workspaces |
| `npm run type-check` | Type-check all workspaces (alias for lint) |
| `npm run test` | Run all workspace tests (~185 unit tests — 115 scraper + 18 queue + 46 rag + 6 vector) |
| `npm run test:scraper` | Run scraper tests only (cd packages/scraper && npx vitest run) |
| `npm run test:queue` | Run queue tests only (cd packages/queue && npx vitest run) |
| `npm run test:rag` | Run RAG tests only (cd packages/rag && npx vitest run) |
| `npm run test:vector` | Run vector tests only (cd packages/vector && npx vitest run) |
| `npm run clean` | Clean all build artifacts |

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://rag:rag@localhost:5433/ragdb` | PostgreSQL connection string |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection string |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector DB URL |
| `PORT` | `3000` | API server port |
| `WORKER_NAME` | random | Unique worker id |
| `HEARTBEAT_INTERVAL_MS` | `30000` | Heartbeat period |
| `HEARTBEAT_TIMEOUT_MS` | `90000` | Mark worker OFFLINE after silence |
| `CRAWL_MAX_ATTEMPTS` | `5` | Message retry cap |
| `CRAWL_PREFETCH` | `1` | Fair dispatch |
| `MAX_CHILD_LINKS` | `50` | Fan-out guard |
| `STALE_JOB_MS` | `600000` | Recover RUNNING jobs (10 min) |

Copy `.env.example` to set custom values for each app.

---

## Fault Tolerance

### Retry Strategy

When a crawl job fails, the worker classifies the error:

| Error | Retryable? | Action |
|---|---|---|
| Network timeout (TIMEOUT) | ✅ Yes | Re-publish with backoff |
| DNS / connection error (NETWORK) | ✅ Yes | Re-publish with backoff |
| HTTP 5xx or 429 | ✅ Yes | Re-publish with backoff |
| HTTP 4xx (except 429) | ❌ No | Route to DLQ |
| Invalid URL / non-HTML | ❌ No | Route to DLQ |
| Prisma connection error | ✅ Yes | Re-publish with backoff |

Retry uses **exponential backoff**: `baseDelay × 2^(attempt-1)` with 50% jitter, capped at 30s. After exhausting `CRAWL_MAX_ATTEMPTS` (default 5), the job is routed to the **Dead Letter Queue**.

### Dead Letter Queue (DLQ)

Failed messages land in the `crawl.dlq` queue. Inspection:

```bash
# RabbitMQ Management UI
http://localhost:15672 (guest/guest) → Queues → crawl.dlq

# RabbitMQ CLI (inside container)
docker exec rag-rabbitmq rabbitmqadmin get queue=crawl.dlq
```

**Important:** If upgrading from Phase 3, you must delete the existing `crawl` queue once to apply DLX arguments:

```bash
docker exec rag-rabbitmq rabbitmqctl delete_queue crawl
```

### Worker Failure Detection

- Each worker writes a heartbeat to the `Worker` table every 30s.
- The API runs a background monitor every 30s that:
  1. Sets `status = OFFLINE` for workers with no heartbeat for 90s
  2. Recovers CrawlJobs stuck in `RUNNING` for > 10 min (re-enqueues up to 3 times, then FAILs)
- RabbitMQ redelivers unacknowledged messages to remaining workers when a worker dies (thanks to `noAck: false` + `prefetch: 1`).

### Multi-Worker Deduplication

Content deduplication is DB-backed via `contentHash` (SHA-256 of normalized text) stored on the `Page` table. The in-memory `DedupChecker` acts as a fast path only. Before upserting a page, the worker queries for existing content with the same `websiteId + contentHash`, preventing duplicate storage across workers.

## Submit a Crawl Job

```bash
curl -X POST http://localhost:3000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "depth": 1}'
```

Expected response:

```json
{
  "status": "ok",
  "data": { "jobId": "<uuid>", "url": "https://example.com", "depth": 1 },
  "timestamp": "2026-07-20T..."
}
```

The worker will:

1. Validate the URL and enforce HTTP/HTTPS protocol
2. Filter out non-content URLs (Wikipedia namespaces, disambiguation pages)
3. Check robots.txt permission
4. Apply domain rate limiting (1s default, respects Crawl-delay)
5. Fetch the page HTML (Axios, 10s timeout, 10MB limit, SSRF protection)
6. Parse with Cheerio and extract title, description, metadata, OG tags, links, and raw text
7. Deep-clean HTML: strip nav/sidebars/ads/cookie banners/boilerplate
8. Normalize content into structured sections (headings, paragraphs, lists)
9. Extract enhanced metadata (language, author, dates, reading time)
10. Quality gate: discard stubs (<300 words), disambiguation pages, link farms (>40% links)
11. Deduplicate by content hash (SHA-256 of cleaned text) — in-memory + DB-backed
12. Upsert Page record + create PageVersion (versioning with change detection)
13. Chunk content (150-word, sentence-boundary-aware, 30-word overlap)
14. Generate embeddings (local HuggingFace all-MiniLM-L6-v2, 384-dim)
15. Upsert embeddings to Qdrant + create Chunk DB records
16. Publish child crawl jobs for same-domain links (up to MAX_CHILD_LINKS=50, depth-1)
17. Mark the CrawlJob as COMPLETED

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | System health (DB, queue, Qdrant) |
| POST | `/api/crawl` | Submit crawl job `{ url, depth }` |
| POST | `/api/ask` | RAG Q&A `{ question, topK? }` |
| GET | `/api/search?q=&page=&pageSize=` | Full-text search |
| GET | `/api/pages?websiteId=&status=&search=&page=&pageSize=` | Paginated pages |
| GET | `/api/pages/:id` | Page detail with versions |
| GET | `/api/jobs?status=&page=&pageSize=` | Paginated jobs |
| GET | `/api/jobs/:id` | Job detail with pages |
| GET | `/api/workers` | Worker list |
| GET | `/api/websites` | Website list |
| POST | `/api/reset` | Destructive reset (guarded by `RESET_ENABLED`)

## Technology Choices & Justifications

| Choice | Why |
|---|---|
| TypeScript / Node.js 22 | Type safety across monorepo; shared types between worker, API, and frontend |
| Express 5 | Broad ecosystem; sufficient for a 9-route API |
| PostgreSQL 16 + Prisma 7 | Relational integrity for CrawlJob-Page-Chunk chains; typed queries + migrations |
| RabbitMQ (amqplib) | Native DLX support; prefetch=1 for fair work distribution |
| Qdrant | Self-hosted via Docker; purpose-built HNSW outperforms pgvector |
| Axios + Cheerio | Keep entire pipeline in Node.js; Playwright reserved for dynamic pages only |
| HuggingFace all-MiniLM-L6-v2 | Free local embeddings (384-dim), proven for RAG chunk retrieval |
| OpenAI GPT (DeepSeek-compat) | Abstracted provider; swap `OPENAI_BASE_URL` for cost flexibility |
| React 19 + Vite 8 | Simple SPA; no SSR needed for a dashboard behind an API |
| npm Workspaces + Turbo | Task caching + parallel execution; native npm 11 workspace support |

## Web Dashboard

Run the frontend alongside the API:

```bash
cd apps/web && npm run dev
```

The React SPA provides:
- **Dashboard** — system health, stats overview
- **Crawl Jobs** — submit and monitor crawl jobs
- **Pages** — browse and filter scraped pages with version history
- **Search** — full-text search across all pages
- **Ask** — RAG question answering with citations
- **Workers** — worker heartbeat monitoring

