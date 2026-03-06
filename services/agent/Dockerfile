# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY AGENT - Conversation Agent Service (Multi-Stage Build)
# Build context: monorepo root (../../)
# Dockerfile: services/agent/Dockerfile
# =============================================================================

# ===== BASE STAGE =====
FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Agent - Autonomous conversation agent service" \
      version="1.0.0" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy" \
      org.opencontainers.image.title="Meeshy Agent"

ARG PNPM_VERSION=9.15.0

# ===== DEPS STAGE (with build tools) =====
FROM base AS deps

ARG PNPM_VERSION=9.15.0

# Build tools for native modules (zeromq)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    bash

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY services/agent/package.json services/agent/

RUN printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml && \
    corepack enable pnpm && \
    corepack prepare pnpm@${PNPM_VERSION} --activate && \
    pnpm install --no-frozen-lockfile && \
    pnpm store prune

# ===== BUILDER STAGE =====
FROM deps AS builder

WORKDIR /app

# Build shared package
RUN echo "=== Building shared package ===" && \
    cd packages/shared && \
    pnpm exec tsc --project tsconfig.json

# Copy agent source code
COPY services/agent/src/ ./src/
COPY services/agent/tsconfig.json ./

# Build agent
RUN echo "=== Generating Prisma client ===" && \
    npx prisma generate --generator client --schema=./packages/shared/prisma/schema.prisma && \
    echo "=== Building TypeScript ===" && \
    pnpm exec tsc && \
    echo "=== Copying Prisma client to dist ===" && \
    mkdir -p dist/packages/shared/prisma && \
    cp -ar packages/shared/prisma/client dist/packages/shared/prisma/ && \
    cp packages/shared/prisma/schema.prisma dist/packages/shared/prisma/ && \
    echo "=== Build completed ==="

# ===== PROD-DEPS STAGE (production dependencies only) =====
FROM base AS prod-deps

ARG PNPM_VERSION=9.15.0

# Build tools for native modules (zeromq)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    bash

WORKDIR /app

COPY services/agent/package.json ./
COPY packages/shared/package.json ./packages/shared/

RUN printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml && \
    corepack enable pnpm && \
    corepack prepare pnpm@${PNPM_VERSION} --activate && \
    pnpm install --no-frozen-lockfile --prod && \
    pnpm store prune

# ===== RUNNER STAGE (minimal runtime - NO build tools) =====
# Using Debian-slim for glibc compatibility with zeromq native module
FROM node:22-slim AS runner

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs -m agent \
    && mkdir -p /app \
    && chown -R agent:nodejs /app

WORKDIR /app

# Copy production node_modules from prod-deps
COPY --from=prod-deps --chown=agent:nodejs /app/node_modules ./node_modules

# Copy built artifacts from builder
COPY --from=builder --chown=agent:nodejs /app/dist ./dist
COPY --from=builder --chown=agent:nodejs /app/packages/shared ./packages/shared

# Fix @meeshy/shared symlink: Docker COPY resolves symlinks to copies
RUN rm -rf node_modules/@meeshy/shared && \
    mkdir -p node_modules/@meeshy && \
    ln -s ../../packages/shared node_modules/@meeshy/shared

# Copy package.json for runtime metadata
COPY --chown=agent:nodejs services/agent/package.json ./

USER agent

EXPOSE 3200

ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3200/health || exit 1

CMD ["node", "-r", "dotenv/config", "dist/src/server.js"]
