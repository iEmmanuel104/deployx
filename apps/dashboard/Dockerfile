FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY tsconfig.base.json turbo.json ./
COPY packages/types/ ./packages/types/
COPY apps/dashboard/ ./apps/dashboard/
RUN pnpm turbo build --filter=@deployx/dashboard

FROM node:22-slim AS runner
RUN addgroup --system --gid 1001 deployx && adduser --system --uid 1001 deployx
WORKDIR /app
COPY --from=builder --chown=deployx:deployx /app/apps/dashboard/build ./build
COPY --from=builder --chown=deployx:deployx /app/apps/dashboard/package.json ./
USER deployx
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "build/index.js"]
