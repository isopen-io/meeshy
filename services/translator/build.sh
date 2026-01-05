#!/bin/bash

# =============================================================================
# Meeshy Translator - Unified Docker Build Script
# =============================================================================
# Usage: ./build.sh [OPTIONS]
#
# Options:
#   --db=sqlite|mongodb    Database type (default: mongodb)
#   --push                 Push to Docker Hub (isopen/meeshy-translator)
#   --multi                Build for multiple platforms (linux/amd64,linux/arm64)
#   --test                 Run container tests after build
#   --ovh                  OVHcloud AI Deploy configuration
#   --tag=TAG              Custom tag (default: latest or mongodb)
#   --version=VERSION      Add version suffix to tags
#   -h, --help             Show this help message
#
# Examples:
#   ./build.sh                           # Local MongoDB build
#   ./build.sh --db=sqlite               # Local SQLite build
#   ./build.sh --push --multi            # Multi-platform build + push
#   ./build.sh --push --multi --ovh      # OVHcloud deployment build
#   ./build.sh --test                    # Build with tests
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
DB_TYPE="mongodb"
PUSH=false
MULTI_PLATFORM=false
RUN_TESTS=false
OVH_MODE=false
CUSTOM_TAG=""
VERSION=""
IMAGE_NAME="meeshy-translator"
REGISTRY="isopen"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --db=*)
            DB_TYPE="${1#*=}"
            ;;
        --push)
            PUSH=true
            ;;
        --multi)
            MULTI_PLATFORM=true
            ;;
        --test)
            RUN_TESTS=true
            ;;
        --ovh)
            OVH_MODE=true
            ;;
        --tag=*)
            CUSTOM_TAG="${1#*=}"
            ;;
        --version=*)
            VERSION="${1#*=}"
            ;;
        -h|--help)
            head -25 "$0" | tail -22
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

# Determine Dockerfile and tag based on DB type
if [ "$DB_TYPE" = "sqlite" ]; then
    DOCKERFILE="Dockerfile"
    DEFAULT_TAG="latest"
else
    DOCKERFILE="Dockerfile.mongodb"
    DEFAULT_TAG="mongodb"
fi

TAG="${CUSTOM_TAG:-$DEFAULT_TAG}"

# Set image name based on push target
if [ "$PUSH" = true ]; then
    FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}"
else
    FULL_IMAGE="${IMAGE_NAME}"
fi

# Header
echo -e "${BLUE}🐳 Meeshy Translator - Docker Build${NC}"
echo "========================================"
echo -e "${GREEN}📋 Configuration:${NC}"
echo "   Database:      $DB_TYPE"
echo "   Dockerfile:    $DOCKERFILE"
echo "   Image:         ${FULL_IMAGE}:${TAG}"
[ -n "$VERSION" ] && echo "   Version:       $VERSION"
echo "   Multi-platform: $MULTI_PLATFORM"
echo "   Push:          $PUSH"
echo "   Tests:         $RUN_TESTS"
echo "   OVH mode:      $OVH_MODE"
echo ""

# Verify Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi

# Verify Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
    echo -e "${RED}❌ $DOCKERFILE not found${NC}"
    exit 1
fi

# Create .env.docker configuration
echo -e "${YELLOW}📋 Creating Docker configuration...${NC}"
cat > .env.docker << EOF
# Docker configuration for Meeshy Translator
DEBUG=false
WORKERS=4

# Ports
FASTAPI_PORT=8000
GRPC_PORT=50051
ZMQ_PORT=5555

# Database
EOF

if [ "$DB_TYPE" = "sqlite" ]; then
    cat >> .env.docker << EOF
DATABASE_URL=file:./dev.db
EOF
else
    cat >> .env.docker << EOF
DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0
PRISMA_POOL_SIZE=15
EOF
fi

cat >> .env.docker << EOF

# Cache
REDIS_URL=memory://
TRANSLATION_CACHE_TTL=3600
CACHE_MAX_ENTRIES=10000

# ML Configuration
ML_BATCH_SIZE=32
GPU_MEMORY_FRACTION=0.8
MODELS_PATH=/app/models

# Languages
DEFAULT_LANGUAGE=fr
SUPPORTED_LANGUAGES=fr,en,es,de,pt,zh,ja,ar
AUTO_DETECT_LANGUAGE=true

# Translation models (NLLB only)
BASIC_MODEL=facebook/nllb-200-distilled-600M
MEDIUM_MODEL=facebook/nllb-200-distilled-600M
PREMIUM_MODEL=facebook/nllb-200-distilled-1.3B

# Performance
TRANSLATION_TIMEOUT=30
MAX_TEXT_LENGTH=1000
CONCURRENT_TRANSLATIONS=10
TRANSLATION_WORKERS=50
QUANTIZATION_LEVEL=float16
EOF

echo -e "${GREEN}✅ Configuration created${NC}"

# Build command construction
BUILD_ARGS=""
TAGS="-t ${FULL_IMAGE}:${TAG}"

if [ -n "$VERSION" ]; then
    TAGS="$TAGS -t ${FULL_IMAGE}:${TAG}-${VERSION}"
fi

if [ "$OVH_MODE" = true ]; then
    TAGS="$TAGS -t ${FULL_IMAGE}:${TAG}-ovh"
    [ -n "$VERSION" ] && TAGS="$TAGS -t ${FULL_IMAGE}:${TAG}-ovh-${VERSION}"
fi

# Build
echo -e "${YELLOW}🔨 Building Docker image...${NC}"

if [ "$MULTI_PLATFORM" = true ]; then
    # Multi-platform build with buildx
    if ! docker buildx version >/dev/null 2>&1; then
        echo -e "${RED}❌ docker buildx not available${NC}"
        exit 1
    fi

    # Create/use builder
    docker buildx create --name meeshy-builder --use --driver docker-container 2>/dev/null || true

    PLATFORM_ARG="--platform linux/amd64,linux/arm64"

    if [ "$PUSH" = true ]; then
        docker buildx build \
            $PLATFORM_ARG \
            --progress=plain \
            -f "$DOCKERFILE" \
            $TAGS \
            --push \
            .
    else
        docker buildx build \
            $PLATFORM_ARG \
            --progress=plain \
            -f "$DOCKERFILE" \
            $TAGS \
            --load \
            .
    fi
else
    # Single platform build
    docker build \
        --progress=plain \
        -f "$DOCKERFILE" \
        $TAGS \
        .

    if [ "$PUSH" = true ]; then
        echo -e "${YELLOW}📤 Pushing image...${NC}"
        docker push ${FULL_IMAGE}:${TAG}
        [ -n "$VERSION" ] && docker push ${FULL_IMAGE}:${TAG}-${VERSION}
        [ "$OVH_MODE" = true ] && docker push ${FULL_IMAGE}:${TAG}-ovh
    fi
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Run tests if requested
if [ "$RUN_TESTS" = true ]; then
    echo ""
    echo -e "${YELLOW}🧪 Running tests...${NC}"

    if [ "$DB_TYPE" = "mongodb" ]; then
        # Start MongoDB for testing
        docker stop mongodb-test-build 2>/dev/null || true
        docker rm mongodb-test-build 2>/dev/null || true
        docker run -d --name mongodb-test-build -p 27017:27017 mongo:8.0
        sleep 15
    fi

    # Start translator
    docker stop translator-test-build 2>/dev/null || true
    docker rm translator-test-build 2>/dev/null || true

    if [ "$DB_TYPE" = "mongodb" ]; then
        docker run -d --name translator-test-build \
            --link mongodb-test-build:mongodb \
            -p 8000:8000 \
            -e DATABASE_URL=mongodb://mongodb:27017/meeshy \
            ${FULL_IMAGE}:${TAG}
    else
        docker run -d --name translator-test-build \
            -p 8000:8000 \
            ${FULL_IMAGE}:${TAG}
    fi

    sleep 30

    # Test health endpoint
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${YELLOW}⚠️ Health check failed, checking logs...${NC}"
        docker logs --tail 20 translator-test-build
    fi

    # OVH specific tests
    if [ "$OVH_MODE" = true ]; then
        echo -e "${YELLOW}🔍 Running OVHcloud user test (42420)...${NC}"
        docker run --rm --user=42420:42420 ${FULL_IMAGE}:${TAG} /bin/bash -c "
            echo 'User: '; id
            echo 'Python: '; python3 --version
            echo '✅ OVH user tests passed'
        " 2>/dev/null && echo -e "${GREEN}✅ OVH tests passed${NC}"
    fi

    # Cleanup
    echo -e "${YELLOW}🧹 Cleaning up test containers...${NC}"
    docker stop translator-test-build 2>/dev/null || true
    docker rm translator-test-build 2>/dev/null || true
    [ "$DB_TYPE" = "mongodb" ] && docker stop mongodb-test-build 2>/dev/null || true
    [ "$DB_TYPE" = "mongodb" ] && docker rm mongodb-test-build 2>/dev/null || true

    echo -e "${GREEN}✅ Tests completed${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}🎉 Build complete!${NC}"
echo "========================================"
echo -e "${BLUE}📦 Images:${NC}"
echo "   ${FULL_IMAGE}:${TAG}"
[ -n "$VERSION" ] && echo "   ${FULL_IMAGE}:${TAG}-${VERSION}"
[ "$OVH_MODE" = true ] && echo "   ${FULL_IMAGE}:${TAG}-ovh"
echo ""
echo -e "${BLUE}💡 Usage:${NC}"
if [ "$DB_TYPE" = "mongodb" ]; then
    echo "   docker run -p 8000:8000 -e DATABASE_URL=mongodb://host:27017/meeshy ${FULL_IMAGE}:${TAG}"
else
    echo "   docker run -p 8000:8000 ${FULL_IMAGE}:${TAG}"
fi
