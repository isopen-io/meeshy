#!/bin/bash

###############################################################################
# Script de Lancement des Tests - Système de Statut Utilisateur
#
# Usage:
#   ./run-status-tests.sh [type] [options]
#
# Types:
#   all              - Lance tous les tests
#   unit             - Tests unitaires backend
#   integration      - Tests d'intégration backend
#   performance      - Tests de performance
#   resilience       - Tests de résilience
#   e2e              - Tests E2E Playwright
#   manual           - Affiche la checklist de tests manuels
#
# Options:
#   --coverage       - Génère le rapport de couverture
#   --watch          - Mode watch (relance auto)
#   --debug          - Mode debug
#   --headed         - E2E en mode headed (visible)
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_DIR="$SCRIPT_DIR/../gateway"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

# Functions
log_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✅ ${NC}$1"
}

log_error() {
    echo -e "${RED}❌ ${NC}$1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  ${NC}$1"
}

# Check if directory exists
check_directory() {
    if [ ! -d "$1" ]; then
        log_error "Directory not found: $1"
        exit 1
    fi
}

# Parse arguments
TEST_TYPE="${1:-all}"
COVERAGE=false
WATCH=false
DEBUG=false
HEADED=false

for arg in "$@"; do
    case $arg in
        --coverage)
            COVERAGE=true
            ;;
        --watch)
            WATCH=true
            ;;
        --debug)
            DEBUG=true
            ;;
        --headed)
            HEADED=true
            ;;
    esac
done

# Header
echo ""
log_info "=================================================="
log_info "  Meeshy - Status System Test Runner"
log_info "=================================================="
echo ""

# Run tests based on type
case $TEST_TYPE in
    all)
        log_info "Running ALL tests..."
        echo ""

        # Backend tests
        log_info "[1/5] Running unit tests..."
        cd "$GATEWAY_DIR"
        pnpm test -- --testPathPattern="__tests__/unit" ${COVERAGE:+--coverage}
        log_success "Unit tests completed"
        echo ""

        log_info "[2/5] Running integration tests..."
        pnpm test -- --testPathPattern="__tests__/integration" --runInBand
        log_success "Integration tests completed"
        echo ""

        log_info "[3/5] Running performance tests..."
        pnpm test -- --testPathPattern="__tests__/performance" --runInBand --maxWorkers=1
        log_success "Performance tests completed"
        echo ""

        log_info "[4/5] Running resilience tests..."
        pnpm test -- --testPathPattern="__tests__/resilience" --runInBand
        log_success "Resilience tests completed"
        echo ""

        # E2E tests
        log_info "[5/5] Running E2E tests..."
        cd "$SCRIPT_DIR"
        pnpm exec playwright test --project=chromium-desktop
        log_success "E2E tests completed"
        echo ""

        log_success "All tests completed successfully!"
        ;;

    unit)
        log_info "Running unit tests..."
        cd "$GATEWAY_DIR"

        CMD="pnpm test -- --testPathPattern=\"__tests__/unit\""
        [ "$COVERAGE" = true ] && CMD="$CMD --coverage"
        [ "$WATCH" = true ] && CMD="$CMD --watch"
        [ "$DEBUG" = true ] && CMD="node --inspect-brk node_modules/.bin/jest --testPathPattern=\"__tests__/unit\""

        eval $CMD
        log_success "Unit tests completed"
        ;;

    integration)
        log_info "Running integration tests..."
        cd "$GATEWAY_DIR"

        CMD="pnpm test -- --testPathPattern=\"__tests__/integration\" --runInBand"
        [ "$COVERAGE" = true ] && CMD="$CMD --coverage"
        [ "$DEBUG" = true ] && CMD="node --inspect-brk node_modules/.bin/jest --testPathPattern=\"__tests__/integration\" --runInBand"

        eval $CMD
        log_success "Integration tests completed"
        ;;

    performance)
        log_info "Running performance tests..."
        log_warning "This may take several minutes..."
        cd "$GATEWAY_DIR"

        pnpm test -- --testPathPattern="__tests__/performance" --runInBand --maxWorkers=1
        log_success "Performance tests completed"
        ;;

    resilience)
        log_info "Running resilience tests..."
        cd "$GATEWAY_DIR"

        pnpm test -- --testPathPattern="__tests__/resilience" --runInBand
        log_success "Resilience tests completed"
        ;;

    e2e)
        log_info "Running E2E tests with Playwright..."
        cd "$SCRIPT_DIR"

        CMD="pnpm exec playwright test"
        [ "$DEBUG" = true ] && CMD="$CMD --debug"
        [ "$HEADED" = true ] && CMD="$CMD --headed"

        eval $CMD
        log_success "E2E tests completed"

        # Show report
        log_info "Generating HTML report..."
        pnpm exec playwright show-report
        ;;

    manual)
        log_info "Opening manual test checklist..."

        if command -v code &> /dev/null; then
            code "$SCRIPT_DIR/manual/MANUAL_TEST_STATUS.md"
        elif command -v open &> /dev/null; then
            open "$SCRIPT_DIR/manual/MANUAL_TEST_STATUS.md"
        else
            cat "$SCRIPT_DIR/manual/MANUAL_TEST_STATUS.md"
        fi
        ;;

    *)
        log_error "Unknown test type: $TEST_TYPE"
        echo ""
        echo "Usage: ./run-status-tests.sh [type] [options]"
        echo ""
        echo "Types:"
        echo "  all              - Lance tous les tests"
        echo "  unit             - Tests unitaires backend"
        echo "  integration      - Tests d'intégration backend"
        echo "  performance      - Tests de performance"
        echo "  resilience       - Tests de résilience"
        echo "  e2e              - Tests E2E Playwright"
        echo "  manual           - Affiche la checklist de tests manuels"
        echo ""
        echo "Options:"
        echo "  --coverage       - Génère le rapport de couverture"
        echo "  --watch          - Mode watch (relance auto)"
        echo "  --debug          - Mode debug"
        echo "  --headed         - E2E en mode headed (visible)"
        echo ""
        exit 1
        ;;
esac

echo ""
log_info "=================================================="
log_success "Tests terminés avec succès!"
log_info "=================================================="
echo ""

# Show coverage report if generated
if [ "$COVERAGE" = true ] && [ -f "$GATEWAY_DIR/coverage/index.html" ]; then
    log_info "Rapport de couverture disponible:"
    echo "  file://$GATEWAY_DIR/coverage/index.html"
    echo ""

    # Auto-open on macOS
    if command -v open &> /dev/null; then
        log_info "Ouverture du rapport de couverture..."
        open "$GATEWAY_DIR/coverage/index.html"
    fi
fi

exit 0
