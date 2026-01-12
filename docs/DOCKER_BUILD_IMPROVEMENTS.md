# Docker Build System Improvements

## Overview

This document describes the improvements made to the Docker build system to ensure consistency between local builds (Makefile) and CI/CD builds (GitHub Actions).

## Changes Summary

### 1. Makefile Improvements

**File:** `Makefile`

#### Version Management
```makefile
# New version variables read from VERSION files
GATEWAY_VERSION := $(shell cat services/gateway/VERSION 2>/dev/null || echo "1.0.0")
FRONTEND_VERSION := $(shell cat apps/web/VERSION 2>/dev/null || echo "1.0.0")
TRANSLATOR_VERSION := $(shell cat services/translator/VERSION 2>/dev/null || echo "1.0.0")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF := $(shell git rev-parse --short HEAD 2>/dev/null || echo "local")
```

#### Build Arguments
All Docker builds now include:
- `BUILD_DATE` - ISO 8601 timestamp
- `VCS_REF` - Git commit hash
- `VERSION` - From VERSION files
- `PACKAGE_MANAGER=bun` - For Node.js services

#### Unified Tag Format
All images now use `v` prefix:
- `isopen/meeshy-gateway:v1.0.1`
- `isopen/meeshy-frontend:v1.0.1`
- `isopen/meeshy-translator:v1.0.2`

#### New Targets
| Target | Description |
|--------|-------------|
| `security-scan` | Scan images for vulnerabilities with Trivy |
| `validate-images` | Quick validation of image labels |
| `validate-docker-full` | Full validation (labels, security, health) |
| `validate-docker-gateway` | Validate Gateway image only |
| `validate-docker-frontend` | Validate Frontend image only |
| `validate-docker-translator` | Validate Translator image only |

### 2. CI/CD Improvements

**File:** `.github/workflows/docker.yml`

#### GPU Support for Translator
- Added `torch_backend` input parameter (cpu, gpu, all)
- Matrix now generates both CPU and GPU variants
- Tags include `-gpu` suffix for GPU builds

#### Build Arguments
```yaml
build-args: |
  BUILD_DATE=${{ github.event.repository.updated_at }}
  VCS_REF=${{ github.sha }}
  VERSION=${{ matrix.version }}
  PACKAGE_MANAGER=${{ env.PACKAGE_MANAGER }}
  TORCH_BACKEND=${{ matrix.torch_backend || 'cpu' }}
```

#### Image Validation
Added post-build validation step that checks image metadata.

### 3. Dockerfile Improvements

#### Frontend (`infrastructure/docker/images/web/Dockerfile`)

**Placeholder URLs:**
Instead of hardcoded production URLs, now uses identifiable placeholders:
```dockerfile
ARG NEXT_PUBLIC_API_URL=__MEESHY_API_URL__
ARG NEXT_PUBLIC_WS_URL=__MEESHY_WS_URL__
ARG NEXT_PUBLIC_BACKEND_URL=__MEESHY_BACKEND_URL__
ARG NEXT_PUBLIC_FRONTEND_URL=__MEESHY_FRONTEND_URL__
ARG NEXT_PUBLIC_TRANSLATION_URL=__MEESHY_TRANSLATION_URL__
ARG NEXT_PUBLIC_STATIC_URL=__MEESHY_STATIC_URL__
```

**OCI Labels:**
```dockerfile
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=1.0.0

LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}"
```

#### Gateway (`infrastructure/docker/images/gateway/Dockerfile`)

- Added OCI labels for traceability
- Now uses `docker-entrypoint.sh` in CMD

#### Translator (`infrastructure/docker/images/translator/Dockerfile`)

- Added OCI labels in the runtime stage
- Labels include `torch.backend` for variant identification

### 4. Entrypoint Improvements

**File:** `infrastructure/docker/images/web/entrypoint.sh`

- Uses unique placeholder patterns (`__MEESHY_*__`)
- Counts and reports replacements
- Verifies all placeholders are replaced
- Detailed logging for debugging

## Usage

### Building Images Locally

```bash
# Build all images with proper metadata
make build-all-docker

# Build specific service
make build-gateway
make build-frontend
make build-translator-cpu
make build-translator-gpu
```

### Validating Images

```bash
# Quick validation (labels only)
make validate-images

# Full validation (labels, security, health)
make validate-docker-full

# Security scan
make security-scan
```

### Deploying with Custom URLs

```bash
# Set environment variables before running
export NEXT_PUBLIC_API_URL=https://api.example.com
export NEXT_PUBLIC_WS_URL=wss://api.example.com
export NEXT_PUBLIC_FRONTEND_URL=https://app.example.com

# Start with docker-compose
docker-compose -f infrastructure/docker/compose/docker-compose.prod.yml up
```

## Compatibility Matrix

| Build Source | Tags Format | GPU Support | Multi-arch |
|--------------|-------------|-------------|------------|
| Makefile | `v{VERSION}` | Yes (manual) | Host only |
| CI (push) | `v{VERSION}`, `latest`, `sha-*` | Yes (matrix) | amd64, arm64 |
| CI (dispatch) | Configurable | Configurable | Configurable |

## VERSION Files

Each service has its own VERSION file:
- `apps/web/VERSION` - Frontend version
- `services/gateway/VERSION` - Gateway version
- `services/translator/VERSION` - Translator version

Update these files before releasing a new version.

## Troubleshooting

### Image has no metadata labels
Run `make validate-docker-full` to check. Rebuild with `make build-all-docker`.

### Frontend shows wrong URLs
Check that environment variables are set correctly. The entrypoint.sh will log what URLs it's using.

### GPU build fails in CI
GPU builds require more disk space. The workflow automatically frees disk space for translator builds.
