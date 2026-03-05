# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY AGENT - Conversation Agent Service (Multi-Stage Build)
# Build context: monorepo root (../../)
# Dockerfile: services/agent/Dockerfile
# =============================================================================

# ===== BUILDER STAGE =====
FROM node:22-alpine AS builder

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Agent - Autonomous conversation agent service" \
      version="1.0.0" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy" \
      org.opencontainers.image.title="Meeshy Agent"

# Build tools for native modules (zeromq)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    bash

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/shared/prisma/ packages/shared/prisma/
COPY services/agent/package.json services/agent/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY services/agent/ services/agent/

RUN pnpm --filter @meeshy/shared build
RUN pnpm --filter @meeshy/agent build

# ===== RUNTIME STAGE =====
# Using Debian-slim for glibc compatibility with zeromq native module
FROM node:22-slim AS runtime

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
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder --chown=agent:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/shared ./packages/shared
COPY --from=builder --chown=agent:nodejs /app/services/agent ./services/agent

# Fix @meeshy/shared symlink: Docker COPY resolves symlinks to copies
RUN rm -rf node_modules/@meeshy/shared && \
    mkdir -p node_modules/@meeshy && \
    ln -s ../../packages/shared node_modules/@meeshy/shared

WORKDIR /app/services/agent

USER agent

EXPOSE 3200

ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3200/health || exit 1

CMD ["node", "-r", "dotenv/config", "dist/src/server.js"]
