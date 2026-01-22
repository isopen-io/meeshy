# =============================================================================
# MEESHY TRANSLATOR - FastAPI ML Service (Multi-Stage Optimized)
# =============================================================================
# Build context: monorepo root (../../)
# Package manager: uv (10-100x faster than pip)
#
# BUILD VARIANTS:
# ---------------
# CPU (default, smaller image ~2GB):
#   docker build --build-arg TORCH_BACKEND=cpu -t meeshy-translator:cpu .
#
# GPU with CUDA 12.4 (larger image ~8GB, requires nvidia-docker):
#   docker build --build-arg TORCH_BACKEND=gpu -t meeshy-translator:gpu .
#
# GPU with CUDA 12.1:
#   docker build --build-arg TORCH_BACKEND=gpu-cu121 -t meeshy-translator:gpu-cu121 .
#
# RUN GPU CONTAINER:
#   docker run --gpus all meeshy-translator:gpu
#
# =============================================================================

# -----------------------------------------------------------------------------
# Build Arguments
# -----------------------------------------------------------------------------
ARG TORCH_BACKEND=cpu
ARG PYTHON_VERSION=3.11
ARG NODE_VERSION=22

# =============================================================================
# Stage 1: Builder - Install dependencies
# =============================================================================
FROM python:${PYTHON_VERSION}-slim AS builder

# Install uv - ultra-fast Python package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Build dependencies for native extensions (PyAV, grpcio, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        git \
        libavformat-dev \
        libavcodec-dev \
        libavdevice-dev \
        libavutil-dev \
        libswscale-dev \
        libswresample-dev \
        libavfilter-dev \
        libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy dependency files first for layer caching
COPY services/translator/requirements.txt ./
COPY services/translator/pyproject.toml ./

# Re-declare ARG after FROM
ARG TORCH_BACKEND

# Set PyTorch index based on backend
# CPU: https://download.pytorch.org/whl/cpu
# GPU: https://download.pytorch.org/whl/cu124
# GPU-CU121: https://download.pytorch.org/whl/cu121
ENV PYTORCH_INDEX_CPU="https://download.pytorch.org/whl/cpu" \
    PYTORCH_INDEX_GPU="https://download.pytorch.org/whl/cu124" \
    PYTORCH_INDEX_GPU_CU121="https://download.pytorch.org/whl/cu121" \
    PYTORCH_INDEX_GPU_CU118="https://download.pytorch.org/whl/cu118"

# Install dependencies with selected backend
# Note: Using requirements.txt instead of pyproject.toml because:
# - uv pip install -r works with requirements.txt format
# - requirements.txt has all necessary deps including chatterbox-tts
RUN --mount=type=cache,target=/root/.cache/uv \
    echo "Installing with TORCH_BACKEND=${TORCH_BACKEND}" && \
    case "${TORCH_BACKEND}" in \
        gpu) PYTORCH_INDEX="${PYTORCH_INDEX_GPU}" ;; \
        gpu-cu121) PYTORCH_INDEX="${PYTORCH_INDEX_GPU_CU121}" ;; \
        gpu-cu118) PYTORCH_INDEX="${PYTORCH_INDEX_GPU_CU118}" ;; \
        *) PYTORCH_INDEX="${PYTORCH_INDEX_CPU}" ;; \
    esac && \
    echo "Using PyTorch index: ${PYTORCH_INDEX}" && \
    uv pip install --system --index-url "${PYTORCH_INDEX}" torch torchaudio && \
    uv pip install --system -r requirements.txt

# =============================================================================
# Stage 2a: CPU Runtime Base
# =============================================================================
FROM python:${PYTHON_VERSION}-slim AS runtime-cpu

# =============================================================================
# Stage 2b: GPU Runtime Base (CUDA 12.4)
# =============================================================================
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS runtime-gpu

# Install Python 3.11 on CUDA base (including libpython for shared library support)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-venv \
        python3.11-dev \
        libpython3.11 \
        python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Stage 2c: GPU Runtime Base (CUDA 12.1)
# =============================================================================
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04 AS runtime-gpu-cu121

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-venv \
        python3.11-dev \
        libpython3.11 \
        python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Stage 2d: GPU Runtime Base (CUDA 11.8)
# =============================================================================
FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04 AS runtime-gpu-cu118

RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-venv \
        python3.11-dev \
        libpython3.11 \
        python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Stage 3: Final Runtime (selected by TORCH_BACKEND)
# =============================================================================
ARG TORCH_BACKEND
FROM runtime-${TORCH_BACKEND} AS runtime

# Re-declare ARGs after FROM (they don't persist across stages)
ARG TORCH_BACKEND

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=1.0.0

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Translator - FastAPI ML Service with Diarization" \
      version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.documentation="https://docs.meeshy.me/translator" \
      org.opencontainers.image.vendor="Meeshy" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="Meeshy Translator" \
      org.opencontainers.image.description="FastAPI ML service for translation, transcription and voice cloning" \
      torch.backend="${TORCH_BACKEND}" \
      python.version="3.11" \
      diarization.enabled="true" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}"

ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION=22

# Environment variables
ENV HOME=/workspace \
    PYTHONPATH=/workspace:/workspace/generated \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Application paths
    CACHE_DIR=/workspace/cache \
    LOG_DIR=/workspace/logs \
    MODELS_PATH=/workspace/models \
    # ML framework paths
    TORCH_HOME=/workspace/models \
    HF_HOME=/workspace/models \
    TRANSFORMERS_CACHE=/workspace/models \
    # Performance optimizations
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    TOKENIZERS_PARALLELISM=false \
    # Diarization
    ENABLE_DIARIZATION=true

# Runtime configuration
ARG GRPC_HOST=0.0.0.0
ARG GRPC_PORT=50051
ARG HTTP_PORT=8000
ARG ZMQ_PUSH_PORT=5555
ARG ZMQ_PUB_PORT=5558
ARG LOG_LEVEL=info
ARG WORKERS=2

ENV GRPC_HOST=${GRPC_HOST} \
    GRPC_PORT=${GRPC_PORT} \
    HTTP_PORT=${HTTP_PORT} \
    FASTAPI_PORT=${HTTP_PORT} \
    ZMQ_TRANSLATOR_PUSH_PORT=${ZMQ_PUSH_PORT} \
    ZMQ_TRANSLATOR_PUB_PORT=${ZMQ_PUB_PORT} \
    LOG_LEVEL=${LOG_LEVEL} \
    WORKERS=${WORKERS} \
    TORCH_BACKEND=${TORCH_BACKEND} \
    TTS_MODEL=chatterbox

# System dependencies (runtime only)
RUN apt-get update && apt-get install -y --no-install-recommends \
        tini \
        ca-certificates \
        openssl \
        libopenblas0 \
        liblapack3 \
        netcat-openbsd \
        ffmpeg \
        libsndfile1 \
        curl \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g prisma@latest \
    && groupadd -r translator \
    && useradd -r -g translator -m translator \
    && mkdir -p /workspace/{logs,cache,models,shared,generated,uploads,embeddings/voices,analytics_data} \
    && chown -R translator:translator /workspace \
    && update-ca-certificates \
    && apt-get purge -y curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy Python packages and shared libraries from builder
# This ensures compatibility since builder uses python:3.11-slim (/usr/local/)
# while GPU runtimes use Ubuntu's Python (/usr/)
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /usr/local/lib/libpython3.11.so* /usr/local/lib/

# Update library cache to find libpython
RUN ldconfig

# Copy uv for potential runtime use
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /workspace

# Copy translator source code
COPY --chown=translator:translator services/translator/ ./

# Copy shared Prisma schema and sync script
COPY --chown=translator:translator packages/shared/prisma ./shared/prisma/
COPY --chown=translator:translator scripts/sync-prisma-schema-for-python.sh ./scripts/

# Generate Python Prisma schema from shared schema and generate client
RUN chmod +x ./scripts/sync-prisma-schema-for-python.sh && \
    ./scripts/sync-prisma-schema-for-python.sh /workspace/schema.prisma && \
    echo "Generating Prisma Python client..." && \
    prisma generate --schema=/workspace/schema.prisma

# Verify critical components installation
RUN echo "=== Verifying critical components ===" && \
    python -c "from pyannote.audio import Pipeline; print('✅ pyannote.audio available for speaker diarization')" && \
    python -c "from sklearn.cluster import KMeans; print('✅ scikit-learn available')" && \
    python -c "import zmq; print('✅ ZeroMQ available')" && \
    echo "✅ All critical components verified successfully"

# Set permissions
RUN chown -R translator:translator /workspace \
    && chmod +x /workspace/docker-entrypoint-mongodb.sh 2>/dev/null || true \
    && mkdir -p /workspace/models/huggingface \
               /workspace/models/whisper \
               /workspace/models/openvoice \
               /workspace/models/voice_cache \
               /workspace/generated/audios \
    && chmod -R 755 /workspace/models /workspace/cache /workspace/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${HTTP_PORT}/health')" || exit 1

EXPOSE ${HTTP_PORT} ${GRPC_PORT} ${ZMQ_TRANSLATOR_PUSH_PORT} ${ZMQ_TRANSLATOR_PUB_PORT}

USER translator:translator

ENTRYPOINT ["/usr/bin/tini", "-s", "--"]

CMD ["/workspace/docker-entrypoint-mongodb.sh"]
