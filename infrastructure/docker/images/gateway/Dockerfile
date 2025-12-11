# =============================================================================
# MEESHY GATEWAY - Fastify Service
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/gateway/Dockerfile
# =============================================================================
FROM node:22-alpine

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Gateway - Fastify API Service" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy"

ARG NODE_ENV=production
ARG PNPM_VERSION=9.15.0

ENV NODE_ENV=${NODE_ENV} \
    PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

# Runtime configuration
ARG FASTIFY_PORT=3000
ARG FASTIFY_HOST=0.0.0.0
ARG LOG_LEVEL=info

ENV FASTIFY_PORT=${FASTIFY_PORT} \
    FASTIFY_HOST=${FASTIFY_HOST} \
    LOG_LEVEL=${LOG_LEVEL} \
    PORT=${FASTIFY_PORT}

# System setup
RUN apk add --no-cache \
        tini \
        curl \
        python3 \
        make \
        g++ \
        ffmpeg \
    && corepack enable pnpm \
    && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S -G nodejs gateway \
    && mkdir -p /app/logs \
    && chown -R gateway:nodejs /app

WORKDIR /app

# Copy monorepo package files
COPY --chown=gateway:nodejs pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=gateway:nodejs services/gateway/package.json ./
COPY --chown=gateway:nodejs packages/shared/package.json ./packages/shared/
COPY --chown=gateway:nodejs packages/shared/prisma ./packages/shared/prisma/

# Create workspace config for gateway only
RUN echo 'packages:\n  - "."\n  - "packages/shared"' > pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --no-frozen-lockfile --prod=false \
    && pnpm store prune

# Copy source code
COPY --chown=gateway:nodejs services/gateway/src/ ./src/
COPY --chown=gateway:nodejs services/gateway/tsconfig.json ./
COPY --chown=gateway:nodejs packages/shared/ ./packages/shared/

# Copy entrypoint if exists
COPY --chown=gateway:nodejs services/gateway/docker-entrypoint.sh ./ 2>/dev/null || true

# Build
RUN echo "Building TypeScript..." \
    && PRISMA_CLIENT_OUTPUT_DIRECTORY=./packages/shared/prisma npx prisma generate --schema=./packages/shared/prisma/schema.prisma 2>/dev/null || true \
    && pnpm exec tsc \
    && cp -ar packages/shared/prisma dist/packages/shared/ 2>/dev/null || true \
    && echo "Build completed" \
    && rm -rf src/ tsconfig.json \
    && pnpm install --prod --ignore-scripts \
    && pnpm store prune \
    && chmod +x /app/docker-entrypoint.sh 2>/dev/null || true

RUN chown -R gateway:nodejs /app

EXPOSE ${FASTIFY_PORT}

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${FASTIFY_PORT}/health || exit 1

CMD ["sh", "-c", "node dist/src/server.js"]
