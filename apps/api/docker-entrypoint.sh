#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy
cd /app

echo "Starting API..."
exec node apps/api/dist/index.js
