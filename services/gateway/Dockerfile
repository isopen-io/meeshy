# =============================================================================
# MEESHY GATEWAY - Fastify Service
# Build context: services/gateway/ directory (shared/ copied during CI)
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

# Create workspace config
RUN echo 'packages:\n  - "."\n  - "shared"' > pnpm-workspace.yaml

# Copy package files
COPY --chown=gateway:nodejs package.json pnpm-lock.yaml* ./
COPY --chown=gateway:nodejs shared/package.json ./shared/ 2>/dev/null || true

# Install dependencies
RUN pnpm install --no-frozen-lockfile --prod=false \
    && pnpm store prune

# Copy source code
COPY --chown=gateway:nodejs src/ ./src/
COPY --chown=gateway:nodejs shared/ ./shared/
COPY --chown=gateway:nodejs tsconfig.json ./
COPY --chown=gateway:nodejs docker-entrypoint.sh ./

# Build
RUN echo "Building TypeScript..." \
    && PRISMA_CLIENT_OUTPUT_DIRECTORY=./shared/prisma npx prisma generate --schema=./shared/prisma/schema.prisma 2>/dev/null || true \
    && pnpm exec tsc \
    && cp -ar shared/prisma dist/shared/ 2>/dev/null || true \
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
