#!/bin/sh
# Applies pending migrations and the idempotent seed, then starts the given command.
set -e

echo "[entrypoint] applying database migrations"
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] seeding"
node prisma/seed.mjs

exec "$@"
