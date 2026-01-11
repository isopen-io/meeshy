# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB - Next.js Application
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/web/Dockerfile
# Supports: bun (default) or pnpm via PACKAGE_MANAGER build arg
# =============================================================================
FROM node:22-alpine AS base

# === MAINTAINER INFORMATION ===
LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Web - Next.js Application with SSR/SSG support" \
      version="1.0.0" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.documentation="https://docs.meeshy.me/web" \
      org.opencontainers.image.vendor="Meeshy" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="Meeshy Web" \
      org.opencontainers.image.description="Next.js web application for Meeshy platform"

# === BUILD ARGUMENTS ===
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38
ARG NEXT_TELEMETRY_DISABLED=1

# === ENVIRONMENT VARIABLES ===
ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME="/pnpm" \
    BUN_INSTALL="/bun" \
    PATH="/pnpm:/bun/bin:$PATH" \
    NPM_CONFIG_CACHE="/tmp/.npm" \
    NEXT_CACHE_DIR="/app/.next/cache"

# ===== DEPS STAGE =====
FROM base AS deps
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

RUN apk add --no-cache libc6-compat tini curl bash

WORKDIR /app

# Copy package files from monorepo (not lockfiles - they're for full monorepo workspace)
COPY apps/web/package.json ./

# Copy shared package (full source for building)
COPY packages/shared/ ./packages/shared/

# === SETUP WORKSPACE CONFIG ===
# For bun: add workspaces to package.json (bun also reads pnpm-workspace.yaml)
# For pnpm: create pnpm-workspace.yaml
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Configuring bun workspace ===" && \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    else \
      echo "=== Configuring pnpm workspace ===" && \
      printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    fi

# === INSTALL DEPENDENCIES ===
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Installing with bun ===" && \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
      ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
      bun install --no-save; \
    else \
      echo "=== Installing with pnpm ===" && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm install --no-frozen-lockfile; \
    fi

# === BUILD SHARED PACKAGE ===
# Use the build script defined in package.json which runs tsc
RUN echo "=== Building shared package (v3) ===" && \
    cd packages/shared && \
    if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      bun run build; \
    else \
      pnpm run build; \
    fi && \
    cd /app

# ===== BUILDER STAGE =====
FROM base AS builder
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

RUN apk add --no-cache curl bash

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Install package manager binary if using bun
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
      ln -s /root/.bun/bin/bun /usr/local/bin/bun; \
    fi

# Copy web app source
COPY apps/web/ ./

# === RECREATE WORKSPACE CONFIG ===
# apps/web/ copy overwrites workspace config with wrong paths
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    else \
      printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    fi

# === BUILD ENVIRONMENT VARIABLES ===
ARG NEXT_PUBLIC_API_URL=https://gate.meeshy.me
ARG NEXT_PUBLIC_WS_URL=wss://gate.meeshy.me
ARG NEXT_PUBLIC_BACKEND_URL=https://gate.meeshy.me
ARG NEXT_PUBLIC_DISABLE_CLIENT_TRANSLATION=false
ARG NEXT_PUBLIC_USE_API_TRANSLATION_ONLY=true

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL} \
    NEXT_PUBLIC_DISABLE_CLIENT_TRANSLATION=${NEXT_PUBLIC_DISABLE_CLIENT_TRANSLATION} \
    NEXT_PUBLIC_USE_API_TRANSLATION_ONLY=${NEXT_PUBLIC_USE_API_TRANSLATION_ONLY} \
    NEXT_TELEMETRY_DISABLED=1

# Build with appropriate package manager
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Building with bun ===" && \
      bun run build; \
    else \
      echo "=== Building with pnpm ===" && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm run build; \
    fi

# ===== RUNNER STAGE =====
FROM base AS runner
WORKDIR /app

# === PRODUCTION ENVIRONMENT ===
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME="0.0.0.0"

# Create nextjs user and install tini
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    apk add --no-cache tini

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy entrypoint script for runtime URL injection
COPY infrastructure/docker/images/web/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create logs directory and set permissions
RUN mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3100

# Use tini as entrypoint for proper signal handling, then our entrypoint script
ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]

# === HEALTH CHECK ===
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "const http=require('http');const req=http.get({hostname:'0.0.0.0',port:3100,path:'/api/health',timeout:5000},(res)=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"

# Start Next.js in production mode (standalone)
CMD ["node", "server.js"]
