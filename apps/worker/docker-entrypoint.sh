#!/bin/sh
set -e

echo "Waiting for database schema to be ready..."
MAX_RETRIES=30
RETRY_DELAY=2

for i in $(seq 1 $MAX_RETRIES); do
  if node -e "
  import('@rag/database')
    .then(({ prisma }) => prisma.\$queryRaw\`SELECT 1\`)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
" 2>/dev/null; then
    echo "Database schema is ready."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "Schema not ready after $MAX_RETRIES attempts, exiting."
    exit 1
  fi
  echo "Schema not ready (attempt $i/$MAX_RETRIES), retrying in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done

echo "Starting worker..."
exec node apps/worker/dist/index.js
