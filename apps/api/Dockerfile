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
# The runtime keeps only @prisma/client + its query engine. The client is generated in a scratch
# deploy that still has the CLI (a dev dependency) and then copied over the production one.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @routinely/api deploy --prod --legacy /out \
    && pnpm --filter @routinely/api deploy --legacy /gen \
    && (cd /gen && node_modules/.bin/prisma generate) \
    && for dir in /gen/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma; do \
         target="/out/node_modules/.pnpm/$(basename "$(dirname "$(dirname "$dir")")")/node_modules"; \
         rm -rf "$target/.prisma" && cp -r "$dir" "$target/.prisma"; \
       done \
    # @prisma/client declares the CLI as a peer, so pnpm still installs it (plus its engines and
    # config toolchain). Only the library query engine copied above is needed at runtime.
    && cd /out/node_modules/.pnpm \
    && rm -rf prisma@* @prisma+config@* @prisma+engines@* @prisma+engines-version@* \
              @prisma+fetch-engine@* @prisma+get-platform@* effect@* fast-check@* pure-rand@* \
              typescript@* \
    # Driver-adapter / edge WASM bundles of the client runtime are unused with the library engine.
    && find @prisma+client@*/node_modules/@prisma/client/runtime -name '*wasm-base64*' -delete

# ─── migrate: one-shot job (migrations + idempotent seed), then exits ─────────
# docker compose runs it before the API starts; on a platform it is the release command.
FROM deps AS migrate
COPY apps/api/prisma apps/api/prisma
WORKDIR /repo/apps/api
USER root
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node prisma/seed.mjs"]

# ─── prod: minimal runtime image, non-root ────────────────────────────────────
FROM node:24-alpine AS prod
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
