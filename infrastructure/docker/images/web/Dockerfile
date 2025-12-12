# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB - Next.js Application
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/web/Dockerfile
# =============================================================================
FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Web - Next.js Application" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy"

ARG PNPM_VERSION=9.15.0

ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

# ===== DEPS STAGE =====
FROM base AS deps
ARG PNPM_VERSION=9.15.0
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

# Copy package files from monorepo
COPY apps/web/package.json ./
COPY pnpm-lock.yaml ./

# Copy shared package
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/

# Setup workspace for web only (printf for proper newlines)
RUN printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml

# Install dependencies
RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate && pnpm install --no-frozen-lockfile

# ===== BUILDER STAGE =====
FROM base AS builder
ARG PNPM_VERSION=9.15.0
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy web app source
COPY apps/web/ ./

# Recreate correct pnpm-workspace.yaml (apps/web/ copy overwrites it with wrong paths)
RUN printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml

ARG NEXT_PUBLIC_API_URL=https://gate.meeshy.me
ARG NEXT_PUBLIC_WS_URL=wss://gate.meeshy.me
ARG NEXT_PUBLIC_BACKEND_URL=https://gate.meeshy.me

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL} \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate && pnpm run build

# ===== RUNNER STAGE =====
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    apk add --no-cache tini

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /app/logs && chown nextjs:nodejs /app/logs

USER nextjs

EXPOSE 3100

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "const http=require('http');const req=http.get({hostname:'0.0.0.0',port:3100,path:'/api/health',timeout:5000},(res)=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

CMD ["node", "server.js"]
