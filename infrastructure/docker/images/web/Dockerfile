# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB - Next.js Application
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/web/Dockerfile
# Supports: bun (default) or pnpm via PACKAGE_MANAGER build arg
# =============================================================================
FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Web - Next.js Application" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy"

# Package manager configuration (bun or pnpm)
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME="/pnpm" \
    BUN_INSTALL="/bun" \
    PATH="/pnpm:/bun/bin:$PATH"

# ===== DEPS STAGE =====
FROM base AS deps
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

RUN apk add --no-cache libc6-compat tini curl bash

WORKDIR /app

# Copy package files from monorepo
COPY apps/web/package.json ./

# Copy lock files (both for flexibility)
COPY pnpm-lock.yaml* ./
COPY bun.lock* ./

# Copy shared package
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/

# Setup workspace for web only (printf for proper newlines)
RUN printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml

# Install package manager and dependencies based on PACKAGE_MANAGER arg
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "Installing with bun..." && \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
      ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
      bun install --no-save; \
    else \
      echo "Installing with pnpm..." && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm install --no-frozen-lockfile; \
    fi

# ===== BUILDER STAGE =====
FROM base AS builder
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

RUN apk add --no-cache curl bash

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy bun binary if using bun
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
      ln -s /root/.bun/bin/bun /usr/local/bin/bun; \
    fi

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

# Build with appropriate package manager
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "Building with bun..." && \
      bun run build; \
    else \
      echo "Building with pnpm..." && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm run build; \
    fi

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
