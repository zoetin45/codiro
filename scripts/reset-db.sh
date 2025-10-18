#!/bin/bash

# Database reset script for Codiro
# Usage:
#   ./scripts/reset-db.sh local   - Reset local database
#   ./scripts/reset-db.sh remote  - Reset production database

set -e

ENV=${1:-local}

if [ "$ENV" != "local" ] && [ "$ENV" != "remote" ]; then
    echo "Error: Invalid environment. Use 'local' or 'remote'"
    exit 1
fi

FLAG=""
if [ "$ENV" = "remote" ]; then
    FLAG="--remote"
    echo "⚠️  WARNING: You are about to reset the PRODUCTION database!"
    read -p "Are you sure? (type 'yes' to confirm): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi
fi

echo "🗑️  Dropping existing tables from $ENV database..."
pnpm wrangler d1 execute codiro-db $FLAG --command="DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS github_identities; DROP TABLE IF EXISTS users;"

echo "🚀 Applying migrations to $ENV database..."
if [ "$ENV" = "local" ]; then
    pnpm db:migrate:local
else
    pnpm db:migrate:production
fi

echo "✅ Database reset complete!"
