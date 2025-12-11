# =============================================================================
# MEESHY TRANSLATOR - FastAPI ML Service
# Build context: monorepo root
# Dockerfile: infrastructure/docker/images/translator/Dockerfile
# =============================================================================
FROM python:3.12-slim

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Translator - FastAPI ML Service" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy"

ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.0

ENV HOME=/workspace \
    PYTHONPATH=/workspace:/workspace/generated \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CACHE_DIR=/workspace/cache \
    LOG_DIR=/workspace/logs \
    MODELS_PATH=/workspace/models \
    TORCH_HOME=/workspace/models \
    HF_HOME=/workspace/models

# Runtime configuration
ARG GRPC_HOST=0.0.0.0
ARG GRPC_PORT=50051
ARG HTTP_PORT=8000
ARG LOG_LEVEL=info
ARG WORKERS=2

ENV GRPC_HOST=${GRPC_HOST} \
    GRPC_PORT=${GRPC_PORT} \
    HTTP_PORT=${HTTP_PORT} \
    FASTAPI_PORT=${HTTP_PORT} \
    LOG_LEVEL=${LOG_LEVEL} \
    WORKERS=${WORKERS}

# System setup
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        wget \
        tini \
        curl \
        git \
        ca-certificates \
        openssl \
        libopenblas-dev \
        liblapack-dev \
        netcat-openbsd \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pnpm@${PNPM_VERSION} prisma@latest \
    && groupadd translator \
    && useradd -g translator -m translator \
    && mkdir -p /workspace/{logs,cache,models,shared,generated} \
    && chown -R translator:translator /workspace \
    && update-ca-certificates \
    && apt-get purge -y --auto-remove build-essential wget curl git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /workspace

# Copy requirements from monorepo
COPY --chown=translator:translator services/translator/requirements.txt ./

# Install Python dependencies
RUN pip install --upgrade pip --no-cache-dir \
    && pip install --no-cache-dir prisma hf_transfer python-dotenv \
    && pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && pip install --default-timeout=300 --no-cache-dir -r requirements.txt \
    && pip install pymongo \
    && rm -rf ~/.cache/pip

# Copy translator source code
COPY --chown=translator:translator services/translator/ ./

# Copy shared package for Prisma schema
COPY --chown=translator:translator packages/shared/prisma ./shared/prisma/

# Generate Prisma client
RUN if [ -f "/workspace/shared/prisma/schema.prisma" ]; then \
        prisma generate --schema=/workspace/shared/prisma/schema.prisma; \
    fi

# Set permissions
RUN chown -R translator:translator /workspace \
    && chmod +x /workspace/docker-entrypoint-mongodb.sh 2>/dev/null || true \
    && mkdir -p /workspace/models /workspace/cache /workspace/logs \
    && chmod -R 755 /workspace/models /workspace/cache /workspace/logs

EXPOSE ${HTTP_PORT} ${GRPC_PORT}

USER translator:translator

ENTRYPOINT ["/usr/bin/tini", "-s", "--"]

CMD ["/workspace/docker-entrypoint-mongodb.sh"]
