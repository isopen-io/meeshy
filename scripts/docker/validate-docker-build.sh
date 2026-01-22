#!/bin/bash
# =============================================================================
# MEESHY - Docker Build Validation Script
# =============================================================================
# This script validates that Docker images are built correctly with all
# required metadata, labels, and configuration.
#
# Usage: ./scripts/docker/validate-docker-build.sh [image-name]
#        ./scripts/docker/validate-docker-build.sh --all
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REGISTRY="${DOCKER_REGISTRY:-isopen}"
REQUIRED_LABELS=(
    "org.opencontainers.image.created"
    "org.opencontainers.image.revision"
    "org.opencontainers.image.version"
    "org.opencontainers.image.source"
    "org.opencontainers.image.vendor"
)

# Counter for tests
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
}

log_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

# =============================================================================
# Validation Functions
# =============================================================================

check_image_exists() {
    local image="$1"
    if docker image inspect "$image" &>/dev/null; then
        log_success "Image exists: $image"
        return 0
    else
        log_error "Image not found: $image"
        return 1
    fi
}

check_required_labels() {
    local image="$1"
    log_info "Checking required OCI labels..."

    for label in "${REQUIRED_LABELS[@]}"; do
        value=$(docker inspect "$image" --format "{{index .Config.Labels \"$label\"}}" 2>/dev/null || echo "")
        if [ -n "$value" ] && [ "$value" != "<no value>" ]; then
            log_success "Label '$label': $value"
        else
            log_error "Missing label: $label"
        fi
    done
}

check_build_metadata() {
    local image="$1"
    log_info "Checking build metadata..."

    # Check BUILD_DATE
    build_date=$(docker inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.created"}}' 2>/dev/null || echo "")
    if [ -n "$build_date" ] && [ "$build_date" != "<no value>" ]; then
        log_success "BUILD_DATE is set: $build_date"
    else
        log_error "BUILD_DATE is not set"
    fi

    # Check VCS_REF
    vcs_ref=$(docker inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo "")
    if [ -n "$vcs_ref" ] && [ "$vcs_ref" != "<no value>" ]; then
        log_success "VCS_REF is set: $vcs_ref"
    else
        log_error "VCS_REF is not set"
    fi

    # Check VERSION
    version=$(docker inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || echo "")
    if [ -n "$version" ] && [ "$version" != "<no value>" ]; then
        log_success "VERSION is set: $version"
    else
        log_error "VERSION is not set"
    fi
}

check_user_security() {
    local image="$1"
    log_info "Checking security configuration..."

    # Check if running as non-root
    user=$(docker inspect "$image" --format '{{.Config.User}}' 2>/dev/null || echo "")
    if [ -n "$user" ] && [ "$user" != "root" ] && [ "$user" != "0" ]; then
        log_success "Running as non-root user: $user"
    else
        log_warning "Running as root or no user specified"
    fi
}

check_healthcheck() {
    local image="$1"
    log_info "Checking healthcheck configuration..."

    healthcheck=$(docker inspect "$image" --format '{{json .Config.Healthcheck}}' 2>/dev/null || echo "null")
    if [ "$healthcheck" != "null" ] && [ -n "$healthcheck" ]; then
        log_success "Healthcheck is configured"
        echo "    $healthcheck" | jq -r '.Test | join(" ")' 2>/dev/null || true
    else
        log_warning "No healthcheck configured"
    fi
}

check_entrypoint() {
    local image="$1"
    log_info "Checking entrypoint and cmd..."

    entrypoint=$(docker inspect "$image" --format '{{json .Config.Entrypoint}}' 2>/dev/null || echo "[]")
    cmd=$(docker inspect "$image" --format '{{json .Config.Cmd}}' 2>/dev/null || echo "[]")

    echo "    Entrypoint: $entrypoint"
    echo "    Cmd: $cmd"

    # Check for tini
    if echo "$entrypoint" | grep -q "tini"; then
        log_success "Using tini for signal handling"
    else
        log_warning "Not using tini for signal handling"
    fi
}

check_exposed_ports() {
    local image="$1"
    log_info "Checking exposed ports..."

    ports=$(docker inspect "$image" --format '{{json .Config.ExposedPorts}}' 2>/dev/null || echo "{}")
    if [ "$ports" != "{}" ] && [ "$ports" != "null" ]; then
        log_success "Exposed ports: $ports"
    else
        log_warning "No ports exposed"
    fi
}

check_environment() {
    local image="$1"
    log_info "Checking environment variables..."

    # Check NODE_ENV for Node.js images
    node_env=$(docker inspect "$image" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep "^NODE_ENV=" || echo "")
    if [ -n "$node_env" ]; then
        log_success "NODE_ENV is set: $node_env"
    fi

    # Check for production mode
    if echo "$node_env" | grep -q "production"; then
        log_success "Running in production mode"
    fi
}

check_image_size() {
    local image="$1"
    log_info "Checking image size..."

    size=$(docker inspect "$image" --format '{{.Size}}' 2>/dev/null || echo "0")
    size_mb=$((size / 1024 / 1024))

    if [ "$size_mb" -lt 500 ]; then
        log_success "Image size: ${size_mb}MB (Good)"
    elif [ "$size_mb" -lt 1000 ]; then
        log_warning "Image size: ${size_mb}MB (Consider optimization)"
    else
        log_warning "Image size: ${size_mb}MB (Large - review layers)"
    fi
}

# Web-specific checks
check_web_placeholders() {
    local image="$1"
    log_info "Checking web placeholder configuration..."

    # Create temporary container to check files
    container_id=$(docker create "$image" 2>/dev/null)
    if [ -n "$container_id" ]; then
        # Check if .next directory has our placeholders
        placeholder_count=$(docker run --rm --entrypoint="" "$image" sh -c 'grep -r "__MEESHY_" .next 2>/dev/null | wc -l' 2>/dev/null || echo "0")

        if [ "$placeholder_count" -gt 0 ]; then
            log_success "Found $placeholder_count placeholders in .next (ready for runtime injection)"
        else
            log_warning "No __MEESHY_ placeholders found - URLs may be hardcoded"
        fi

        docker rm "$container_id" &>/dev/null || true
    fi
}

# Translator-specific checks
check_translator_backend() {
    local image="$1"
    log_info "Checking translator torch backend..."

    backend=$(docker inspect "$image" --format '{{index .Config.Labels "torch.backend"}}' 2>/dev/null || echo "")
    if [ -n "$backend" ] && [ "$backend" != "<no value>" ]; then
        log_success "Torch backend: $backend"
    else
        log_warning "Torch backend label not set"
    fi
}

# =============================================================================
# Main Validation Function
# =============================================================================

validate_image() {
    local image="$1"
    local image_type="$2"

    log_header "Validating: $image"

    if ! check_image_exists "$image"; then
        return 1
    fi

    check_required_labels "$image"
    check_build_metadata "$image"
    check_user_security "$image"
    check_healthcheck "$image"
    check_entrypoint "$image"
    check_exposed_ports "$image"
    check_environment "$image"
    check_image_size "$image"

    # Type-specific checks
    case "$image_type" in
        web)
            check_web_placeholders "$image"
            ;;
        translator)
            check_translator_backend "$image"
            ;;
    esac
}

# =============================================================================
# Main Script
# =============================================================================

main() {
    local target="${1:-all}"

    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           MEESHY - Docker Build Validation                    ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Get versions from VERSION files
    GATEWAY_VERSION=$(cat services/gateway/VERSION 2>/dev/null || echo "latest")
    WEB_VERSION=$(cat apps/web/VERSION 2>/dev/null || echo "latest")
    TRANSLATOR_VERSION=$(cat services/translator/VERSION 2>/dev/null || echo "latest")

    case "$target" in
        --all|all)
            validate_image "${DOCKER_REGISTRY}/meeshy-gateway:v${GATEWAY_VERSION}" "gateway"
            validate_image "${DOCKER_REGISTRY}/meeshy-web:v${WEB_VERSION}" "web"
            validate_image "${DOCKER_REGISTRY}/meeshy-translator:v${TRANSLATOR_VERSION}" "translator"
            ;;
        gateway)
            validate_image "${DOCKER_REGISTRY}/meeshy-gateway:v${GATEWAY_VERSION}" "gateway"
            ;;
        web|frontend)
            validate_image "${DOCKER_REGISTRY}/meeshy-web:v${WEB_VERSION}" "web"
            ;;
        translator)
            validate_image "${DOCKER_REGISTRY}/meeshy-translator:v${TRANSLATOR_VERSION}" "translator"
            ;;
        *)
            # Assume it's a full image name
            validate_image "$target" "unknown"
            ;;
    esac

    # Summary
    log_header "Validation Summary"
    echo ""
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo ""

    if [ "$TESTS_FAILED" -gt 0 ]; then
        log_error "Validation completed with failures"
        exit 1
    else
        log_success "All validations passed!"
        exit 0
    fi
}

# Run main with all arguments
main "$@"
