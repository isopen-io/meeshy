# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY GATEWAY - Fastify Service (Optimized Multi-Stage Build)
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/gateway/Dockerfile
# Supports: bun (default) or pnpm via PACKAGE_MANAGER build arg
# =============================================================================

# ===== BASE STAGE =====
FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Gateway - Fastify API Service with WebSocket support" \
      version="1.0.0" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.documentation="https://docs.meeshy.me/gateway" \
      org.opencontainers.image.vendor="Meeshy" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="Meeshy Gateway" \
      org.opencontainers.image.description="Fastify API gateway for Meeshy platform"

ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

ENV PNPM_HOME="/pnpm" \
    BUN_INSTALL="/bun" \
    PATH="/pnpm:/bun/bin:$PATH"

# ===== DEPS STAGE (with build tools) =====
FROM base AS deps

ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

# Build tools for native modules (bcrypt, sharp, zeromq)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    bash \
    curl

WORKDIR /app

# Copy package files
COPY pnpm-lock.yaml* bun.lock* ./
COPY services/gateway/package.json ./
COPY packages/shared/ ./packages/shared/

# Setup workspace config and install dependencies
# Note: CI="" unsets CI env var that causes bun to use frozen lockfile by default
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Configuring bun workspace ===" && \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/shared"\n' > pnpm-workspace.yaml && \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
      ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
      CI="" bun install --no-save; \
    else \
      echo "=== Configuring pnpm workspace ===" && \
      printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm install --no-frozen-lockfile && \
      pnpm store prune; \
    fi

# ===== BUILDER STAGE =====
FROM deps AS builder

ARG PACKAGE_MANAGER=bun

WORKDIR /app

# Build shared package
RUN echo "=== Building shared package ===" && \
    cd packages/shared && \
    if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      bun run tsc --project tsconfig.json; \
    else \
      pnpm exec tsc --project tsconfig.json; \
    fi

# Copy gateway source code
COPY services/gateway/src/ ./src/
COPY services/gateway/tsconfig.json ./
COPY services/gateway/docker-entrypoint.sh ./

# Build gateway
RUN echo "=== Generating Prisma client ===" && \
    npx prisma generate --schema=./packages/shared/prisma/schema.prisma && \
    echo "=== Building TypeScript ===" && \
    if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      bun run tsc; \
    else \
      pnpm exec tsc; \
    fi && \
    echo "=== Copying Prisma client to dist ===" && \
    mkdir -p dist/packages/shared/prisma && \
    cp -ar packages/shared/prisma/client dist/packages/shared/prisma/ && \
    cp packages/shared/prisma/schema.prisma dist/packages/shared/prisma/ && \
    echo "=== Build completed ==="

# ===== PROD-DEPS STAGE (production dependencies only) =====
FROM base AS prod-deps

ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

# Build tools for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    bash \
    curl

WORKDIR /app

# Copy package files
COPY pnpm-lock.yaml* bun.lock* ./
COPY services/gateway/package.json ./
COPY packages/shared/package.json ./packages/shared/

# Setup workspace and install production dependencies only
# Note: CI="" unsets CI env var that causes bun to use frozen lockfile by default
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Installing production deps with bun ===" && \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/shared"\n' > pnpm-workspace.yaml && \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
      ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
      CI="" bun install --production --no-save; \
    else \
      echo "=== Installing production deps with pnpm ===" && \
      printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm install --no-frozen-lockfile --prod && \
      pnpm store prune; \
    fi

# ===== RUNNER STAGE (minimal runtime - NO build tools) =====
FROM node:22-alpine AS runner

ARG FASTIFY_PORT=3000
ARG FASTIFY_HOST=0.0.0.0
ARG LOG_LEVEL=info

ENV NODE_ENV=production \
    FASTIFY_PORT=${FASTIFY_PORT} \
    FASTIFY_HOST=${FASTIFY_HOST} \
    LOG_LEVEL=${LOG_LEVEL} \
    PORT=${FASTIFY_PORT}

# Runtime dependencies only (no build tools!)
RUN apk add --no-cache \
    tini \
    curl \
    ffmpeg \
    && addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S -G nodejs gateway \
    && mkdir -p /app/logs \
    && chown -R gateway:nodejs /app

WORKDIR /app

# Copy production node_modules from prod-deps
COPY --from=prod-deps --chown=gateway:nodejs /app/node_modules ./node_modules

# Copy built artifacts from builder
COPY --from=builder --chown=gateway:nodejs /app/dist ./dist
COPY --from=builder --chown=gateway:nodejs /app/packages/shared ./packages/shared

# Fix @meeshy/shared symlink: Docker COPY resolves symlinks to copies,
# so we need to recreate the symlink to point to the built packages/shared
# which contains the generated Prisma client
RUN rm -rf node_modules/@meeshy/shared && \
    ln -s ../../packages/shared node_modules/@meeshy/shared

# Copy entrypoint and set permissions
COPY --from=builder --chown=gateway:nodejs /app/docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh || true

# Copy package.json for runtime metadata
COPY --chown=gateway:nodejs services/gateway/package.json ./

USER gateway

EXPOSE ${FASTIFY_PORT}

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${FASTIFY_PORT}/health || exit 1

CMD ["node", "dist/src/server.js"]
