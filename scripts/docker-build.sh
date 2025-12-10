#!/bin/bash
# =============================================================================
# MEESHY - Local Docker Build Script
# =============================================================================
# Usage: ./scripts/docker-build.sh [service] [--push] [--version VERSION]
#
# Examples:
#   ./scripts/docker-build.sh gateway                    # Build gateway locally
#   ./scripts/docker-build.sh frontend --push            # Build and push frontend
#   ./scripts/docker-build.sh all --push                 # Build and push all services
#   ./scripts/docker-build.sh gateway --version 0.2.0    # Build with specific version
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_NAMESPACE="${DOCKER_NAMESPACE:-isopen}"
PLATFORMS="${PLATFORMS:-linux/arm64,linux/amd64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
SERVICE="${1:-all}"
PUSH=false
VERSION=""

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

get_version() {
    local service=$1
    if [[ -n "$VERSION" ]]; then
        echo "$VERSION"
    elif [[ -f "${ROOT_DIR}/${service}/VERSION" ]]; then
        cat "${ROOT_DIR}/${service}/VERSION" | tr -d '\n'
    else
        echo "0.0.1"
    fi
}

build_service() {
    local service=$1
    local context=$2
    local dockerfile=$3
    local image="${DOCKER_NAMESPACE}/meeshy-${service}"
    local version=$(get_version "$service")

    log_info "Building ${service} v${version}..."
    log_info "  Image: ${image}"
    log_info "  Platforms: ${PLATFORMS}"
    log_info "  Push: ${PUSH}"

    local push_flag=""
    if [[ "$PUSH" == "true" ]]; then
        push_flag="--push"
    else
        push_flag="--load"
        # For multi-platform without push, we need to use a different strategy
        if [[ "$PLATFORMS" == *","* ]]; then
            log_warning "Multi-platform builds without --push require loading images separately"
            log_info "Building for current platform only..."
            PLATFORMS="linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')"
        fi
    fi

    docker buildx build \
        --platform "${PLATFORMS}" \
        --progress=plain \
        -t "${image}:v${version}" \
        -t "${image}:latest" \
        -f "${dockerfile}" \
        ${push_flag} \
        "${context}"

    log_success "Successfully built ${service} v${version}"
}

# Ensure buildx is available
if ! docker buildx version &>/dev/null; then
    log_error "Docker buildx is not available. Please install it first."
    exit 1
fi

# Create/use builder
BUILDER_NAME="meeshy-builder"
if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
    log_info "Creating buildx builder: ${BUILDER_NAME}"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi
docker buildx use "$BUILDER_NAME"

cd "$ROOT_DIR"

case "$SERVICE" in
    frontend)
        build_service "frontend" "./frontend" "./frontend/Dockerfile"
        ;;
    gateway)
        build_service "gateway" "." "./gateway/Dockerfile"
        ;;
    translator)
        build_service "translator" "./translator" "./translator/Dockerfile"
        ;;
    all)
        log_info "Building all services..."
        build_service "frontend" "./frontend" "./frontend/Dockerfile"
        build_service "gateway" "." "./gateway/Dockerfile"
        build_service "translator" "./translator" "./translator/Dockerfile"
        ;;
    *)
        log_error "Unknown service: ${SERVICE}"
        echo "Available services: frontend, gateway, translator, all"
        exit 1
        ;;
esac

echo ""
log_success "Build complete!"

if [[ "$PUSH" == "true" ]]; then
    echo ""
    echo "Pushed images:"
    echo "  - ${DOCKER_NAMESPACE}/meeshy-${SERVICE}:v$(get_version $SERVICE)"
    echo "  - ${DOCKER_NAMESPACE}/meeshy-${SERVICE}:latest"
fi
