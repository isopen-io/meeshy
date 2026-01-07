# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB - Next.js Application
# Build context: apps/web/ directory (shared/ copied during CI)
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

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Note: shared/ directory is copied by CI before Docker build
RUN mkdir -p ./shared
COPY shared/package.json ./shared/

# Create workspace config
RUN printf 'packages:\n  - "."\n  - "shared"\n' > pnpm-workspace.yaml

# Install dependencies
RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate && pnpm i --no-frozen-lockfile

# ===== BUILDER STAGE =====
FROM base AS builder
ARG PNPM_VERSION=9.15.0
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Recreate correct pnpm-workspace.yaml (COPY may overwrite it with wrong format)
RUN printf 'packages:\n  - "."\n  - "shared"\n' > pnpm-workspace.yaml

# Build with PLACEHOLDER values - replaced at runtime by entrypoint script
# This allows the same image to be used with different environment configurations
# lib/config.ts checks env vars first, then falls back to dynamic derivation
ENV NEXT_PUBLIC_BACKEND_URL=__RUNTIME_BACKEND_URL__ \
    NEXT_PUBLIC_WS_URL=__RUNTIME_WS_URL__ \
    NEXT_PUBLIC_FRONTEND_URL=__RUNTIME_FRONTEND_URL__ \
    NEXT_PUBLIC_TRANSLATION_URL=__RUNTIME_TRANSLATION_URL__ \
    NEXT_PUBLIC_STATIC_URL=__RUNTIME_STATIC_URL__ \
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

# Copy entrypoint script for runtime env var injection
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/logs && chown nextjs:nodejs /app/logs

USER nextjs

EXPOSE 3100

# Entrypoint replaces __RUNTIME_*__ placeholders with actual env var values
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "const http=require('http');const req=http.get({hostname:'0.0.0.0',port:3100,path:'/api/health',timeout:5000},(res)=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

CMD ["node", "server.js"]
