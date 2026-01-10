#!/bin/bash

# =============================================================================
# Meeshy Gateway - Unified Docker Build Script
# =============================================================================
# Usage: ./build.sh [OPTIONS]
#
# Options:
#   --push                 Push to Docker Hub (isopen/meeshy-gateway)
#   --multi                Build for multiple platforms (linux/amd64,linux/arm64)
#   --tag=TAG              Custom tag (default: mongodb)
#   --version=VERSION      Add version suffix to tags
#   --ovh                  Add OVH-specific tags
#   -h, --help             Show this help message
#
# Examples:
#   ./build.sh                           # Local build
#   ./build.sh --push --multi            # Multi-platform build + push
#   ./build.sh --push --multi --ovh      # With OVH tags
#   ./build.sh --version=20240115        # With version suffix
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
PUSH=false
MULTI_PLATFORM=false
OVH_MODE=false
CUSTOM_TAG=""
VERSION=""
IMAGE_NAME="meeshy-gateway"
REGISTRY="isopen"
DOCKERFILE="Dockerfile"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            ;;
        --multi)
            MULTI_PLATFORM=true
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
            head -22 "$0" | tail -19
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

TAG="${CUSTOM_TAG:-mongodb}"

# Set image name based on push target
if [ "$PUSH" = true ]; then
    FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}"
else
    FULL_IMAGE="${IMAGE_NAME}"
fi

# Header
echo -e "${BLUE}🐳 Meeshy Gateway - Docker Build${NC}"
echo "========================================"
echo -e "${GREEN}📋 Configuration:${NC}"
echo "   Dockerfile:    $DOCKERFILE"
echo "   Image:         ${FULL_IMAGE}:${TAG}"
[ -n "$VERSION" ] && echo "   Version:       $VERSION"
echo "   Multi-platform: $MULTI_PLATFORM"
echo "   Push:          $PUSH"
echo "   OVH tags:      $OVH_MODE"
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

# Build tags
TAGS="-t ${FULL_IMAGE}:${TAG}"
[ -n "$VERSION" ] && TAGS="$TAGS -t ${FULL_IMAGE}:${TAG}-${VERSION}"

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
        echo -e "${YELLOW}💡 Install with: docker buildx install${NC}"
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
        if [ "$OVH_MODE" = true ]; then
            docker push ${FULL_IMAGE}:${TAG}-ovh
            [ -n "$VERSION" ] && docker push ${FULL_IMAGE}:${TAG}-ovh-${VERSION}
        fi
    fi
fi

# Summary
echo ""
echo -e "${GREEN}🎉 Build complete!${NC}"
echo "========================================"
echo -e "${BLUE}📦 Images:${NC}"
echo "   ${FULL_IMAGE}:${TAG}"
[ -n "$VERSION" ] && echo "   ${FULL_IMAGE}:${TAG}-${VERSION}"
if [ "$OVH_MODE" = true ]; then
    echo "   ${FULL_IMAGE}:${TAG}-ovh"
    [ -n "$VERSION" ] && echo "   ${FULL_IMAGE}:${TAG}-ovh-${VERSION}"
fi
echo ""
echo -e "${BLUE}🖥️  Platforms:${NC} $([ "$MULTI_PLATFORM" = true ] && echo "linux/amd64, linux/arm64" || echo "local")"
echo ""
echo -e "${BLUE}💡 Usage:${NC}"
echo "   docker run -p 3000:3000 ${FULL_IMAGE}:${TAG}"
