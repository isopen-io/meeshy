#!/bin/bash
# =============================================================================
# Meeshy Docker Services Health Check (Shell Script)
# =============================================================================
# Cross-platform shell script for macOS and Linux.
#
# Usage:
#     ./test-services.sh [dev|local|prod]
#
# Modes:
#     dev   - Test localhost HTTP services (docker-compose.dev.yml)
#     local - Test *.meeshy.local HTTPS services (docker-compose.local.yml)
#     prod  - Test *.meeshy.me HTTPS services (docker-compose.prod.yml)
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Default mode
MODE="${1:-local}"

# Counters
PASSED=0
FAILED=0

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BOLD} Meeshy Docker Services Health Check${NC}"
    echo -e "${BLUE} Mode: ${MODE}${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo ""
}

print_summary() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    TOTAL=$((PASSED + FAILED))
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN} All ${TOTAL} services are healthy! ✓${NC}"
    else
        echo -e " Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
    fi
    echo -e "${BLUE}============================================================${NC}"
    echo ""
}

# Check HTTP/HTTPS endpoint
# Usage: check_http "Service Name" "URL" [verify_ssl]
check_http() {
    local name="$1"
    local url="$2"
    local verify_ssl="${3:-true}"

    local curl_opts="-s -o /dev/null -w %{http_code} --connect-timeout 10 --max-time 15"

    # Disable SSL verification if needed (for local mkcert)
    if [ "$verify_ssl" = "false" ]; then
        curl_opts="$curl_opts -k"
    fi

    # Execute curl
    local status_code
    status_code=$(curl $curl_opts "$url" 2>/dev/null || echo "000")

    # Check result
    if [[ "$status_code" =~ ^(200|301|302|401|403)$ ]]; then
        echo -e "  ${GREEN}✓ PASS${NC}  $(printf '%-20s' "$name") HTTP $status_code"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "  ${RED}✗ FAIL${NC}  $(printf '%-20s' "$name") HTTP $status_code"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check TCP port
# Usage: check_port "Service Name" "host" "port"
check_port() {
    local name="$1"
    local host="$2"
    local port="$3"

    # Use nc (netcat) for port check - works on macOS and Linux
    if nc -z -w 5 "$host" "$port" 2>/dev/null; then
        echo -e "  ${GREEN}✓ PASS${NC}  $(printf '%-20s' "$name") Port $port open"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "  ${RED}✗ FAIL${NC}  $(printf '%-20s' "$name") Port $port closed"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check Python HTTP (more reliable for HTTPS with mkcert)
# Usage: check_python "Service Name" "URL"
check_python() {
    local name="$1"
    local url="$2"

    local result
    result=$(python3 -c "
import urllib.request
import ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
try:
    with urllib.request.urlopen('$url', timeout=10, context=ctx) as r:
        print(r.getcode())
except urllib.error.HTTPError as e:
    print(e.code)
except Exception as e:
    print('000')
" 2>/dev/null || echo "000")

    if [[ "$result" =~ ^(200|301|302|401|403)$ ]]; then
        echo -e "  ${GREEN}✓ PASS${NC}  $(printf '%-20s' "$name") HTTP $result"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "  ${RED}✗ FAIL${NC}  $(printf '%-20s' "$name") HTTP $result"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# =============================================================================
# Test Functions per Mode
# =============================================================================

test_dev() {
    echo -e "${YELLOW}Testing localhost HTTP services...${NC}"
    echo ""

    check_port "MongoDB" "localhost" "27017" || true
    check_port "Redis" "localhost" "6379" || true
    check_http "NoSQLClient" "http://localhost:3001" || true
    check_http "Redis UI" "http://localhost:7843" || true
    check_http "Gateway" "http://localhost:3000/health" || true
    check_http "Translator" "http://localhost:8000/health" || true
    check_http "Frontend" "http://localhost:3100" || true
}

test_local() {
    echo -e "${YELLOW}Testing *.meeshy.local HTTPS services...${NC}"
    echo -e "${YELLOW}Using Python for HTTPS (more reliable with mkcert)${NC}"
    echo ""

    # Use Python for HTTPS with self-signed certs
    check_python "Traefik Dashboard" "https://traefik.meeshy.local:8080/dashboard/" || true
    check_python "MongoDB UI" "https://mongo.meeshy.local" || true
    check_python "Redis UI" "https://redis.meeshy.local" || true
    check_python "Gateway" "https://gate.meeshy.local/health" || true
    check_python "Translator" "https://ml.meeshy.local/health" || true
    check_python "Frontend" "https://meeshy.local" || true
    check_python "Static Files" "https://static.meeshy.local/health" || true
}

test_prod() {
    echo -e "${YELLOW}Testing *.meeshy.me HTTPS services...${NC}"
    echo ""

    check_http "Traefik Dashboard" "https://traefik.meeshy.me/dashboard/" "true" || true
    check_http "MongoDB UI" "https://mongo.meeshy.me" "true" || true
    check_http "Redis UI" "https://redis.meeshy.me" "true" || true
    check_http "Gateway" "https://gate.meeshy.me/health" "true" || true
    check_http "Translator" "https://ml.meeshy.me/health" "true" || true
    check_http "Frontend" "https://meeshy.me" "true" || true
    check_http "Static Files" "https://static.meeshy.me/health" "true" || true
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_header

    case "$MODE" in
        dev)
            test_dev
            ;;
        local)
            test_local
            ;;
        prod)
            test_prod
            ;;
        *)
            echo -e "${RED}Unknown mode: $MODE${NC}"
            echo "Usage: $0 [dev|local|prod]"
            exit 1
            ;;
    esac

    print_summary

    # Exit with appropriate code
    if [ $FAILED -gt 0 ]; then
        exit 1
    fi
    exit 0
}

main
