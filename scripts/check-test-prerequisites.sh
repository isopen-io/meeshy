#!/usr/bin/env bash
# =============================================================================
# Check Test Prerequisites
# =============================================================================
# Vérifie les prérequis pour chaque type de test et retourne le statut
#
# Usage:
#   ./check-test-prerequisites.sh [test-type]
#
# Test types:
#   - unit          : Tests unitaires (pas de prérequis externes)
#   - integration   : Tests d'intégration (nécessite services Docker up)
#   - e2e          : Tests end-to-end (nécessite services + DB)
#   - all          : Vérifie tous les prérequis
#
# Exit codes:
#   0 : Prérequis satisfaits
#   1 : Prérequis non satisfaits
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TEST_TYPE="${1:-all}"
VERBOSE="${VERBOSE:-false}"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${BLUE}ℹ ${NC}$1"
    fi
}

log_success() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${GREEN}✓${NC} $1"
    fi
}

log_warning() {
    echo -e "${YELLOW}⚠${NC}  $1" >&2
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

# =============================================================================
# Prerequisite Checks
# =============================================================================

check_docker() {
    if command -v docker >/dev/null 2>&1; then
        # Timeout pour éviter les blocages
        if timeout 3 docker info >/dev/null 2>&1; then
            log_success "Docker is running"
            return 0
        else
            log_error "Docker is installed but not running"
            return 1
        fi
    else
        log_error "Docker is not installed"
        return 1
    fi
}

check_docker_compose() {
    if timeout 2 docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose is available"
        return 0
    else
        log_error "Docker Compose is not available"
        return 1
    fi
}

check_service_up() {
    local service_name="$1"
    local port="$2"

    # Utiliser timeout pour éviter les blocages
    if timeout 1 bash -c "echo > /dev/tcp/localhost/$port" 2>/dev/null; then
        log_success "Service $service_name is up on port $port"
        return 0
    else
        log_warning "Service $service_name is not available on port $port"
        return 1
    fi
}

check_mongodb() {
    # Check if MongoDB is accessible
    if check_service_up "MongoDB" 27017; then
        return 0
    fi

    # Check if running in Docker
    if docker ps --filter "name=mongo" --filter "status=running" | grep -q mongo; then
        log_success "MongoDB container is running"
        return 0
    fi

    log_warning "MongoDB is not available"
    return 1
}

check_redis() {
    if check_service_up "Redis" 6379; then
        return 0
    fi

    if docker ps --filter "name=redis" --filter "status=running" | grep -q redis; then
        log_success "Redis container is running"
        return 0
    fi

    log_warning "Redis is not available"
    return 1
}

check_translator_service() {
    # Check gRPC port
    if check_service_up "Translator (gRPC)" 50051; then
        return 0
    fi

    # Check HTTP port
    if check_service_up "Translator (HTTP)" 8000; then
        return 0
    fi

    log_warning "Translator service is not running"
    return 1
}

check_gateway_service() {
    if check_service_up "Gateway" 3000; then
        return 0
    fi

    log_warning "Gateway service is not running"
    return 1
}

# =============================================================================
# Test Type Checks
# =============================================================================

check_unit_tests() {
    log_info "Checking unit test prerequisites..."
    # Unit tests don't need external services
    log_success "Unit tests: No external prerequisites required"
    return 0
}

check_integration_tests() {
    log_info "Checking integration test prerequisites..."
    local missing=0

    if ! check_docker; then
        ((missing++))
    fi

    if ! check_docker_compose; then
        ((missing++))
    fi

    # Check required services for integration tests
    if ! check_mongodb; then
        log_warning "Integration tests may fail without MongoDB"
        ((missing++))
    fi

    if ! check_redis; then
        log_warning "Integration tests may fail without Redis"
        ((missing++))
    fi

    if [ $missing -gt 0 ]; then
        log_error "Integration tests: $missing prerequisite(s) missing"
        return 1
    fi

    log_success "Integration tests: All prerequisites satisfied"
    return 0
}

check_e2e_tests() {
    log_info "Checking e2e test prerequisites..."
    local missing=0

    # E2E tests need all services running
    if ! check_integration_tests; then
        ((missing++))
    fi

    if ! check_translator_service; then
        log_warning "E2E tests need Translator service running"
        ((missing++))
    fi

    if ! check_gateway_service; then
        log_warning "E2E tests need Gateway service running"
        ((missing++))
    fi

    if [ $missing -gt 0 ]; then
        log_error "E2E tests: $missing prerequisite(s) missing"
        return 1
    fi

    log_success "E2E tests: All prerequisites satisfied"
    return 0
}

# =============================================================================
# Main
# =============================================================================

main() {
    case "$TEST_TYPE" in
        unit)
            check_unit_tests
            ;;
        integration)
            check_integration_tests
            ;;
        e2e)
            check_e2e_tests
            ;;
        all)
            local failed=0

            check_unit_tests || ((failed++))
            echo ""
            check_integration_tests || ((failed++))
            echo ""
            check_e2e_tests || ((failed++))

            if [ $failed -eq 0 ]; then
                echo ""
                log_success "All test prerequisites are satisfied"
                return 0
            else
                echo ""
                log_warning "$failed test type(s) have missing prerequisites"
                return 1
            fi
            ;;
        *)
            log_error "Unknown test type: $TEST_TYPE"
            echo "Usage: $0 [unit|integration|e2e|all]"
            return 1
            ;;
    esac
}

main
