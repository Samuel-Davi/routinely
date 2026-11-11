# syntax=docker/dockerfile:1
# Build context: the repository root (see docker-compose.yml).

# ─── base: Node + pnpm + what Prisma needs at runtime ─────────────────────────
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache openssl && npm install -g pnpm@12.14.0
WORKDIR /repo

# ─── deps: install once, cached by the lockfile ───────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# The postinstall script runs `prisma generate`, which needs the schema.
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@routinely/api..."

# ─── dev: hot reload; source is bind-mounted by docker-compose.dev.yml ────────
FROM deps AS dev
ENV NODE_ENV=development
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @routinely/shared build
WORKDIR /repo/apps/api
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pnpm", "exec", "nest", "start", "--watch"]

# ─── build: compile and produce a pruned, self-contained deployment ───────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @routinely/shared build && pnpm --filter @routinely/api build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @routinely/api deploy --prod --legacy /out \
    && cd /out && node_modules/.bin/prisma generate

# ─── prod: minimal runtime image, non-root ────────────────────────────────────
FROM node:24-alpine AS prod
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
