FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/docker/package.json ./packages/docker/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/docker/node_modules ./packages/docker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY tsconfig.base.json turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm turbo build --filter=@deployx/api

FROM node:22-slim AS runner
RUN addgroup --system --gid 1001 deployx && adduser --system --uid 1001 deployx
WORKDIR /app
COPY --from=builder --chown=deployx:deployx /app/apps/api/dist ./dist
COPY --from=builder --chown=deployx:deployx /app/apps/api/package.json ./
COPY --from=builder --chown=deployx:deployx /app/node_modules ./node_modules
USER deployx
EXPOSE 3001
ENV NODE_ENV=production
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD curl -sf http://localhost:3001/healthz || exit 1
CMD ["node", "dist/index.js"]
