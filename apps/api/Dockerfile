FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
RUN apt-get update -qq && apt-get install -y -qq python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/docker/package.json ./packages/docker/
COPY packages/db/package.json ./packages/db/
COPY packages/builder/package.json ./packages/builder/
COPY packages/crypto/package.json ./packages/crypto/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/docker/node_modules ./packages/docker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/builder/node_modules ./packages/builder/node_modules
COPY --from=deps /app/packages/crypto/node_modules ./packages/crypto/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm turbo build --filter=@deployx/api

FROM base AS runner
RUN apt-get update -qq && apt-get install -y -qq curl git && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 deployx && adduser --system --uid 1001 deployx
WORKDIR /app

# Copy everything from builder (preserves pnpm symlink structure)
COPY --from=builder --chown=deployx:deployx /app ./

# Nixpacks is needed at runtime for building user projects
RUN curl -fsSL https://nixpacks.com/install.sh | bash

RUN mkdir -p /data /builds && chown deployx:deployx /data /builds
USER deployx
EXPOSE 3001
ENV NODE_ENV=production
WORKDIR /app/apps/api
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD curl -sf http://localhost:3001/healthz || exit 1
CMD ["node", "dist/index.js"]
