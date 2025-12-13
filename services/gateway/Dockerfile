# =============================================================================
# MEESHY GATEWAY - Fastify Service (Optimized Multi-Stage Build)
# Build context: services/gateway/ directory (shared/ copied during CI)
# =============================================================================

# ===== BASE STAGE =====
FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Gateway - Fastify API Service" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy"

ARG PNPM_VERSION=9.15.0

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate

# ===== DEPS STAGE (with build tools) =====
FROM base AS deps

# Build tools for native modules (bcrypt, sharp, zeromq)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake

WORKDIR /app

# Create workspace config
RUN printf 'packages:\n  - "."\n  - "shared"\n' > pnpm-workspace.yaml

# Copy package files
COPY package.json pnpm-lock.yaml* ./
RUN mkdir -p ./shared
COPY shared/package.json ./shared/

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --no-frozen-lockfile && pnpm store prune

# ===== BUILDER STAGE =====
FROM deps AS builder

WORKDIR /app

# Copy source code
COPY src/ ./src/
COPY shared/ ./shared/
COPY tsconfig.json ./

# Generate Prisma client and build TypeScript
RUN PRISMA_CLIENT_OUTPUT_DIRECTORY=./shared/prisma npx prisma generate --schema=./shared/prisma/schema.prisma 2>/dev/null || true \
    && pnpm exec tsc \
    && cp -ar shared/prisma dist/shared/ 2>/dev/null || true

# ===== PROD-DEPS STAGE (production dependencies only) =====
FROM base AS prod-deps

# Build tools needed for native module installation
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake

WORKDIR /app

# Create workspace config
RUN printf 'packages:\n  - "."\n  - "shared"\n' > pnpm-workspace.yaml

# Copy package files
COPY package.json pnpm-lock.yaml* ./
RUN mkdir -p ./shared
COPY shared/package.json ./shared/

# Install ONLY production dependencies
RUN pnpm install --no-frozen-lockfile --prod \
    && pnpm store prune

# ===== RUNNER STAGE (minimal runtime) =====
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

# Copy production node_modules from prod-deps stage
COPY --from=prod-deps --chown=gateway:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=gateway:nodejs /app/shared/node_modules ./shared/node_modules 2>/dev/null || true

# Copy built application from builder stage
COPY --from=builder --chown=gateway:nodejs /app/dist ./dist
COPY --from=builder --chown=gateway:nodejs /app/shared ./shared

# Copy entrypoint if exists
COPY --chown=gateway:nodejs docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh 2>/dev/null || true

# Copy package.json for runtime metadata
COPY --chown=gateway:nodejs package.json ./

USER gateway

EXPOSE ${FASTIFY_PORT}

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${FASTIFY_PORT}/health || exit 1

CMD ["node", "dist/src/server.js"]
