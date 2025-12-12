# =============================================================================
# MEESHY GATEWAY - Fastify Service
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/gateway/Dockerfile
# Supports: bun (default) or pnpm via PACKAGE_MANAGER build arg
# =============================================================================
FROM node:22-alpine

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Gateway - Fastify API Service" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy"

# Package manager configuration (bun or pnpm)
ARG PACKAGE_MANAGER=bun
ARG NODE_ENV=production
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

ENV NODE_ENV=${NODE_ENV} \
    PNPM_HOME="/pnpm" \
    BUN_INSTALL="/bun" \
    PATH="/pnpm:/bun/bin:$PATH"

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
        bash \
        python3 \
        make \
        g++ \
        ffmpeg \
    && addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S -G nodejs gateway \
    && mkdir -p /app/logs \
    && chown -R gateway:nodejs /app

WORKDIR /app

# Copy monorepo package files
COPY --chown=gateway:nodejs pnpm-lock.yaml* ./
COPY --chown=gateway:nodejs bun.lock* ./
COPY --chown=gateway:nodejs services/gateway/package.json ./
COPY --chown=gateway:nodejs packages/shared/package.json ./packages/shared/
COPY --chown=gateway:nodejs packages/shared/prisma ./packages/shared/prisma/

# Create workspace config for gateway only (printf for proper newlines)
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
      pnpm install --no-frozen-lockfile --prod=false && \
      pnpm store prune; \
    fi

# Copy source code
COPY --chown=gateway:nodejs services/gateway/src/ ./src/
COPY --chown=gateway:nodejs services/gateway/tsconfig.json ./
COPY --chown=gateway:nodejs packages/shared/ ./packages/shared/

# Copy entrypoint script
COPY --chown=gateway:nodejs services/gateway/docker-entrypoint.sh ./

# Build with appropriate package manager
RUN echo "Building TypeScript..." \
    && PRISMA_CLIENT_OUTPUT_DIRECTORY=./packages/shared/prisma npx prisma generate --schema=./packages/shared/prisma/schema.prisma 2>/dev/null || true \
    && if [ "$PACKAGE_MANAGER" = "bun" ]; then \
         bun run tsc; \
       else \
         pnpm exec tsc; \
       fi \
    && cp -ar packages/shared/prisma dist/packages/shared/ 2>/dev/null || true \
    && echo "Build completed" \
    && rm -rf src/ tsconfig.json \
    && if [ "$PACKAGE_MANAGER" = "bun" ]; then \
         bun install --production --no-save; \
       else \
         pnpm install --prod --ignore-scripts && \
         pnpm store prune; \
       fi \
    && chmod +x /app/docker-entrypoint.sh 2>/dev/null || true

RUN chown -R gateway:nodejs /app

EXPOSE ${FASTIFY_PORT}

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${FASTIFY_PORT}/health || exit 1

CMD ["sh", "-c", "node dist/src/server.js"]
