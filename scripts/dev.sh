#!/bin/bash
# =============================================================================
# Meeshy Development Script - Native First
# =============================================================================
# Supports: bun, pnpm, npm
# Modes: native, docker, memory, secure
#
# Usage:
#   ./scripts/dev.sh                      # Native, HTTP, uses existing DB/Redis
#   ./scripts/dev.sh --with-containers    # Launch MongoDB/Redis via Docker
#   ./scripts/dev.sh --memory             # Memory mode (no external DB)
#   ./scripts/dev.sh --secure             # HTTPS with mkcert
#   ./scripts/dev.sh --ip 192.168.1.39    # Custom local IP
#   ./scripts/dev.sh --domain app.local   # Custom domain
#
# Individual services:
#   ./scripts/dev.sh web                  # Frontend only
#   ./scripts/dev.sh gateway              # API only
#   ./scripts/dev.sh translator           # ML only
#   ./scripts/dev.sh infra                # MongoDB + Redis only
#
# Commands:
#   ./scripts/dev.sh stop                 # Stop all
#   ./scripts/dev.sh status               # Service status
#   ./scripts/dev.sh logs [service]       # View logs
#   ./scripts/dev.sh certs                # Generate mkcert certificates
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/infrastructure/docker/compose"
CERTS_DIR="$COMPOSE_DIR/certs"

# Source utility libraries
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/utils.sh"

# Default options
WITH_CONTAINERS=false
MEMORY_MODE=false
SECURE_MODE=false
LOCAL_IP=""
LOCAL_DOMAIN="localhost"
PACKAGE_MANAGER="${MEESHY_PM:-$(detect_package_manager)}"
SERVICE=""
LOG_SERVICE=""

# PID file directory
PID_DIR="$ROOT_DIR/.pids"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

# =============================================================================
# Functions
# =============================================================================

print_banner() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                    MEESHY DEVELOPMENT                      ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Detect local IP if not specified
detect_local_ip() {
    if [ -n "$LOCAL_IP" ]; then
        echo "$LOCAL_IP"
        return
    fi

    # Try to detect local IP
    if command -v ip &> /dev/null; then
        ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "127.0.0.1"
    elif command -v ifconfig &> /dev/null; then
        ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1 || echo "127.0.0.1"
    else
        echo "127.0.0.1"
    fi
}

# Generate mkcert certificates
generate_certs() {
    print_info "Generating SSL certificates with mkcert..."

    # Check if mkcert is installed
    if ! command -v mkcert &> /dev/null; then
        print_error "mkcert is not installed!"
        echo ""
        echo "Install mkcert:"
        echo "  macOS:   brew install mkcert"
        echo "  Ubuntu:  sudo apt install mkcert"
        echo "  Arch:    sudo pacman -S mkcert"
        echo ""
        echo "Then run: mkcert -install"
        exit 1
    fi

    # Create certs directory
    mkdir -p "$CERTS_DIR"

    # Get domains to certify
    local ip=$(detect_local_ip)
    local domains="localhost 127.0.0.1 ::1"

    if [ -n "$LOCAL_IP" ]; then
        domains="$domains $LOCAL_IP"
    fi

    if [ "$LOCAL_DOMAIN" != "localhost" ]; then
        domains="$domains $LOCAL_DOMAIN"
    fi

    # Add common local domains
    domains="$domains meeshy.local *.meeshy.local"

    print_info "Generating certificates for: $domains"

    # Generate certificates
    cd "$CERTS_DIR"
    mkcert -key-file key.pem -cert-file cert.pem $domains

    print_success "Certificates generated in $CERTS_DIR"
    echo ""
    echo "Files created:"
    ls -la "$CERTS_DIR"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --with-containers)
                WITH_CONTAINERS=true
                shift
                ;;
            --memory)
                MEMORY_MODE=true
                shift
                ;;
            --secure|--https)
                SECURE_MODE=true
                shift
                ;;
            --ip)
                LOCAL_IP="$2"
                shift 2
                ;;
            --domain)
                LOCAL_DOMAIN="$2"
                shift 2
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            web|gateway|translator|infra|stop|status|certs)
                SERVICE="$1"
                shift
                ;;
            logs)
                SERVICE="logs"
                LOG_SERVICE="${2:-}"
                shift
                [ -n "$LOG_SERVICE" ] && shift
                ;;
            *)
                print_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

print_usage() {
    echo "Usage: $0 [OPTIONS] [SERVICE|COMMAND]"
    echo ""
    echo "Options:"
    echo "  --with-containers    Launch MongoDB/Redis via Docker"
    echo "  --memory             Memory mode (Redis fallback to memory)"
    echo "  --secure, --https    HTTPS with mkcert + Traefik"
    echo "  --ip <IP>            Custom local IP (e.g., 192.168.1.39)"
    echo "  --domain <DOMAIN>    Custom domain (e.g., meeshy.local)"
    echo "  -h, --help           Show this help"
    echo ""
    echo "Services:"
    echo "  web                  Frontend only (port 3100)"
    echo "  gateway              API only (port 3000)"
    echo "  translator           ML service only (port 8000)"
    echo "  infra                MongoDB + Redis only"
    echo ""
    echo "Commands:"
    echo "  stop                 Stop all services"
    echo "  status               Show service status"
    echo "  logs [service]       View logs (web/gateway/translator)"
    echo "  certs                Generate mkcert certificates"
    echo ""
    echo "Examples:"
    echo "  $0                           # Start all, HTTP"
    echo "  $0 --with-containers         # Start all with Docker DB"
    echo "  $0 --secure --ip 192.168.1.10  # HTTPS on custom IP"
    echo "  $0 web                        # Start only frontend"
    echo "  $0 stop                       # Stop everything"
}

# Start infrastructure (MongoDB + Redis)
start_infra() {
    if [ "$MEMORY_MODE" = true ]; then
        print_warning "Memory mode: Skipping infrastructure (Redis will use in-memory fallback)"
        return
    fi

    if [ "$WITH_CONTAINERS" = true ] || [ "$SERVICE" = "infra" ]; then
        print_info "Starting infrastructure containers..."
        cd "$ROOT_DIR"

        if [ "$SECURE_MODE" = true ]; then
            # Check if certs exist
            if [ ! -f "$CERTS_DIR/cert.pem" ]; then
                print_warning "SSL certificates not found. Generating..."
                generate_certs
            fi

            # Use HTTPS compose with Traefik
            LOCAL_DOMAIN="$LOCAL_DOMAIN" docker compose \
                -f "$COMPOSE_DIR/docker-compose.local-https.yml" \
                up -d database mongo-init redis traefik
        else
            docker compose -f "$COMPOSE_DIR/docker-compose.local.yml" up -d database redis
        fi

        # Wait for MongoDB replica set
        print_info "Waiting for MongoDB replica set initialization..."
        sleep 5

        print_success "Infrastructure started"

        if [ "$SERVICE" = "infra" ]; then
            echo ""
            echo -e "${CYAN}Infrastructure URLs:${NC}"
            echo "  MongoDB:         mongodb://localhost:27017"
            echo "  Redis:           redis://localhost:6379"
            if [ "$SECURE_MODE" = true ]; then
                echo "  Traefik Dashboard: http://localhost:8080"
            fi
            exit 0
        fi
    else
        print_warning "Using existing MongoDB and Redis (no containers)"
        print_warning "Make sure services are running on localhost"
    fi
}

# Start web service
start_web() {
    print_info "Starting web frontend..."
    cd "$ROOT_DIR/apps/web"

    local api_url="http://localhost:3000"
    local ws_url="ws://localhost:3000"
    local frontend_url="http://localhost:3100"

    if [ "$SECURE_MODE" = true ]; then
        api_url="https://$LOCAL_DOMAIN/api"
        ws_url="wss://$LOCAL_DOMAIN"
        frontend_url="https://$LOCAL_DOMAIN"
    fi

    export NEXT_PUBLIC_API_URL="$api_url"
    export NEXT_PUBLIC_WS_URL="$ws_url"
    export NEXT_PUBLIC_BACKEND_URL="$api_url"
    export NEXT_PUBLIC_FRONTEND_URL="$frontend_url"

    if [ "$SECURE_MODE" = true ] && [ -f "$CERTS_DIR/cert.pem" ]; then
        # Run with HTTPS
        export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
    fi

    $PACKAGE_MANAGER run dev > "$LOG_DIR/web.log" 2>&1 &
    echo $! > "$PID_DIR/web.pid"
    print_success "Web started (PID: $(cat $PID_DIR/web.pid))"
}

# Start gateway service
start_gateway() {
    print_info "Starting gateway API..."
    cd "$ROOT_DIR/services/gateway"

    local db_url="mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true"
    local redis_url="redis://localhost:6379"

    if [ "$WITH_CONTAINERS" = true ]; then
        db_url="mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true"
    fi

    export DATABASE_URL="${DATABASE_URL:-$db_url}"
    export REDIS_URL="${REDIS_URL:-$redis_url}"
    export TRANSLATOR_URL="${TRANSLATOR_URL:-http://localhost:8000}"
    export ZMQ_TRANSLATOR_HOST="${ZMQ_TRANSLATOR_HOST:-localhost}"
    export ZMQ_TRANSLATOR_PORT="${ZMQ_TRANSLATOR_PORT:-5555}"
    export NODE_ENV="${NODE_ENV:-development}"
    export JWT_SECRET="${JWT_SECRET:-meeshy-dev-jwt-secret-change-in-prod}"
    export GATEWAY_PORT="${GATEWAY_PORT:-3000}"

    if [ "$MEMORY_MODE" = true ]; then
        export USE_MEMORY_STORE=true
        export REDIS_DISABLED=true
        print_warning "Running in MEMORY mode - Redis will use in-memory fallback"
    fi

    $PACKAGE_MANAGER run dev > "$LOG_DIR/gateway.log" 2>&1 &
    echo $! > "$PID_DIR/gateway.pid"
    print_success "Gateway started (PID: $(cat $PID_DIR/gateway.pid))"
}

# Start translator service
start_translator() {
    print_info "Starting translator service..."
    cd "$ROOT_DIR/services/translator"

    # Create venv if not exists
    if [ ! -d ".venv" ]; then
        print_info "Creating Python virtual environment..."
        python3 -m venv .venv
    fi

    # Activate and install deps
    source .venv/bin/activate

    # Check if deps need install
    if [ ! -f ".venv/.deps_installed" ] || [ requirements.txt -nt ".venv/.deps_installed" ]; then
        print_info "Installing Python dependencies..."
        pip install -q -r requirements.txt
        touch ".venv/.deps_installed"
    fi

    local db_url="mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true"

    export DATABASE_URL="${DATABASE_URL:-$db_url}"
    export PYTHONPATH="$ROOT_DIR/services/translator"
    export PYTHONUNBUFFERED=1
    export HTTP_PORT="${HTTP_PORT:-8000}"

    uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload > "$LOG_DIR/translator.log" 2>&1 &
    echo $! > "$PID_DIR/translator.pid"
    print_success "Translator started (PID: $(cat $PID_DIR/translator.pid))"
}

# Stop all services
stop_all() {
    print_info "Stopping all services..."

    # Stop native processes
    for pidfile in "$PID_DIR"/*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            service=$(basename "$pidfile" .pid)
            if kill -0 "$pid" 2>/dev/null; then
                print_info "Stopping $service (PID: $pid)"
                kill "$pid" 2>/dev/null || true
            fi
            rm -f "$pidfile"
        fi
    done

    # Stop Docker containers
    if [ -f "$COMPOSE_DIR/docker-compose.local.yml" ]; then
        cd "$ROOT_DIR"
        docker compose -f "$COMPOSE_DIR/docker-compose.local.yml" down 2>/dev/null || true
        docker compose -f "$COMPOSE_DIR/docker-compose.local-https.yml" down 2>/dev/null || true
    fi

    # Kill any remaining processes on dev ports
    for port in 3000 3100 8000; do
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            print_info "Killing process on port $port"
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    done

    print_success "All services stopped"
}

# Show service status
show_status() {
    print_banner
    echo -e "${CYAN}Service Status:${NC}"
    echo ""

    local running=0
    local stopped=0

    for service in web gateway translator; do
        local pidfile="$PID_DIR/$service.pid"
        if [ -f "$pidfile" ]; then
            local pid=$(cat "$pidfile")
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "  ${GREEN}●${NC} $service (PID: $pid) - ${GREEN}RUNNING${NC}"
                ((running++))
            else
                echo -e "  ${RED}●${NC} $service - ${RED}STOPPED${NC}"
                rm -f "$pidfile"
                ((stopped++))
            fi
        else
            echo -e "  ${YELLOW}○${NC} $service - ${YELLOW}NOT STARTED${NC}"
        fi
    done

    echo ""

    # Check ports
    echo -e "${CYAN}Port Status:${NC}"
    for port in 3000 3100 8000 27017 6379; do
        if lsof -ti:$port >/dev/null 2>&1; then
            echo -e "  ${GREEN}●${NC} Port $port - ${GREEN}IN USE${NC}"
        else
            echo -e "  ${YELLOW}○${NC} Port $port - ${YELLOW}FREE${NC}"
        fi
    done

    echo ""

    # Docker containers
    if command -v docker &> /dev/null; then
        local containers=$(docker ps --filter "name=meeshy" --format "{{.Names}}" 2>/dev/null | wc -l)
        if [ "$containers" -gt 0 ]; then
            echo -e "${CYAN}Docker Containers:${NC}"
            docker ps --filter "name=meeshy" --format "  {{.Names}}: {{.Status}}"
        fi
    fi
}

# Show service logs
show_logs() {
    local service="$1"

    if [ -z "$service" ]; then
        print_info "Available logs: web, gateway, translator"
        echo ""
        for logfile in "$LOG_DIR"/*.log; do
            if [ -f "$logfile" ]; then
                local name=$(basename "$logfile" .log)
                local lines=$(wc -l < "$logfile")
                echo "  $name: $lines lines"
            fi
        done
        exit 0
    fi

    local logfile="$LOG_DIR/$service.log"

    if [ -f "$logfile" ]; then
        print_info "Showing logs for $service (Ctrl+C to exit)"
        tail -f "$logfile"
    else
        print_error "Log file not found for $service"
        exit 1
    fi
}

# Print URLs based on mode
print_urls() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                         ACCESS URLs                           ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ "$SECURE_MODE" = true ]; then
        echo -e "  Frontend:        ${GREEN}https://$LOCAL_DOMAIN${NC}"
        echo -e "  Gateway API:     ${GREEN}https://$LOCAL_DOMAIN/api${NC}"
        echo -e "  WebSocket:       ${GREEN}wss://$LOCAL_DOMAIN${NC}"
        echo -e "  Traefik:         ${GREEN}http://localhost:8080${NC}"
    else
        echo -e "  Frontend:        ${GREEN}http://localhost:3100${NC}"
        echo -e "  Gateway API:     ${GREEN}http://localhost:3000${NC}"
        echo -e "  Translator:      ${GREEN}http://localhost:8000${NC}"
    fi

    if [ "$WITH_CONTAINERS" = true ]; then
        echo ""
        echo -e "  MongoDB:         mongodb://localhost:27017"
        echo -e "  Redis:           redis://localhost:6379"
    fi

    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  ./scripts/dev.sh stop      Stop all services"
    echo "  ./scripts/dev.sh status    Show service status"
    echo "  ./scripts/dev.sh logs web  View frontend logs"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
    parse_args "$@"

    # Handle special commands
    case "$SERVICE" in
        stop)
            stop_all
            exit 0
            ;;
        status)
            show_status
            exit 0
            ;;
        logs)
            show_logs "$LOG_SERVICE"
            exit 0
            ;;
        certs)
            generate_certs
            exit 0
            ;;
    esac

    print_banner

    # Check package manager
    if [ -z "$PACKAGE_MANAGER" ]; then
        print_error "No package manager found (bun, pnpm, or npm required)"
        exit 1
    fi
    print_info "Package manager: $PACKAGE_MANAGER"

    # Auto-detect IP if secure mode and no IP specified
    if [ "$SECURE_MODE" = true ] && [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(detect_local_ip)
    fi

    # Print configuration
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Mode:        $([ "$MEMORY_MODE" = true ] && echo "Memory" || echo "Normal")"
    echo "  Containers:  $([ "$WITH_CONTAINERS" = true ] && echo "Yes" || echo "No")"
    echo "  HTTPS:       $([ "$SECURE_MODE" = true ] && echo "Yes (mkcert)" || echo "No")"
    echo "  Domain:      $LOCAL_DOMAIN"
    [ -n "$LOCAL_IP" ] && echo "  IP:          $LOCAL_IP"
    echo ""

    # Start services based on selection
    case "$SERVICE" in
        web)
            start_web
            ;;
        gateway)
            start_infra
            start_gateway
            ;;
        translator)
            start_infra
            start_translator
            ;;
        infra)
            start_infra
            ;;
        "")
            # Start all services
            start_infra
            print_info "Waiting for infrastructure..."
            sleep 3
            start_translator
            sleep 2
            start_gateway
            sleep 2
            start_web
            ;;
        *)
            print_error "Unknown service: $SERVICE"
            print_usage
            exit 1
            ;;
    esac

    print_urls
    print_success "Development environment ready!"
}

main "$@"
