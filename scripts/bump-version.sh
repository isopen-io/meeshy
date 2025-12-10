#!/bin/bash
# =============================================================================
# MEESHY - Version Bump Script
# =============================================================================
# Usage: ./scripts/bump-version.sh [major|minor|patch] [service|all]
#
# Examples:
#   ./scripts/bump-version.sh patch gateway     # Bump gateway patch version
#   ./scripts/bump-version.sh minor all         # Bump all services minor version
#   ./scripts/bump-version.sh major frontend    # Bump frontend major version
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

BUMP_TYPE="${1:-patch}"
SERVICE="${2:-all}"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

bump_version() {
    local current=$1
    local type=$2

    # Remove any prerelease suffix
    local base_version=$(echo "$current" | sed 's/-.*$//')
    local prerelease=$(echo "$current" | grep -oE '\-.*$' || echo "")

    IFS='.' read -r major minor patch <<< "$base_version"

    case $type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            prerelease=""
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            log_error "Unknown bump type: $type"
            exit 1
            ;;
    esac

    echo "${major}.${minor}.${patch}${prerelease}"
}

bump_service() {
    local service=$1
    local version_file="${ROOT_DIR}/${service}/VERSION"

    if [[ ! -f "$version_file" ]]; then
        log_error "VERSION file not found for ${service}"
        return 1
    fi

    local current=$(cat "$version_file" | tr -d '\n')
    local new=$(bump_version "$current" "$BUMP_TYPE")

    echo "$new" > "$version_file"
    log_success "${service}: ${current} -> ${new}"
}

log_info "Bump type: ${BUMP_TYPE}"
log_info "Service(s): ${SERVICE}"
echo ""

case "$SERVICE" in
    frontend|gateway|translator)
        bump_service "$SERVICE"
        ;;
    all)
        bump_service "frontend"
        bump_service "gateway"
        bump_service "translator"
        ;;
    *)
        log_error "Unknown service: ${SERVICE}"
        echo "Available: frontend, gateway, translator, all"
        exit 1
        ;;
esac

echo ""
log_info "Don't forget to commit the VERSION files!"
echo "  git add */VERSION"
echo "  git commit -m 'chore(release): bump version'"
echo "  git tag -a v\$(cat frontend/VERSION) -m 'Release'"
echo "  git push origin --tags"
