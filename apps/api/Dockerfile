# Requires BuildKit for wildcard COPY directory structure preservation
FROM node:22.14.0-slim AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json ./

COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json

COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/vector/package.json ./packages/vector/package.json
COPY packages/rag/package.json ./packages/rag/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/scraper/package.json ./packages/scraper/package.json
COPY packages/config/package.json ./packages/config/package.json

RUN npm ci --install-strategy=hoisted
RUN npm ls openai

COPY . .
RUN npm run build --filter=@rag/api --filter=!@rag/web

RUN for pkg in shared queue vector rag database scraper config; do \
      sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' /app/packages/$pkg/package.json; \
    done && \
    sed -i 's|src/index.ts|dist/index.js|g; s|src/api.ts|dist/api.js|g' /app/packages/shared/package.json

FROM node:22.14.0-slim

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist

COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/database/dist ./packages/database/dist/
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma/
COPY --from=builder /app/packages/database/prisma.config.ts ./packages/database/prisma.config.ts
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist/
COPY --from=builder /app/packages/queue/package.json ./packages/queue/
COPY --from=builder /app/packages/queue/dist ./packages/queue/dist/
COPY --from=builder /app/packages/rag/package.json ./packages/rag/
COPY --from=builder /app/packages/rag/dist ./packages/rag/dist/
COPY --from=builder /app/packages/rag/node_modules ./packages/rag/node_modules

COPY --from=builder /app/packages/vector/package.json ./packages/vector/
COPY --from=builder /app/packages/vector/dist ./packages/vector/dist/
COPY --from=builder /app/packages/scraper/package.json ./packages/scraper/
COPY --from=builder /app/packages/scraper/dist ./packages/scraper/dist/
COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/config/dist ./packages/config/dist/

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser \
 && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

ENTRYPOINT ["docker-entrypoint.sh"]
