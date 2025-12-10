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
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

# PID file directory
PID_DIR="$ROOT_DIR/.pids"
mkdir -p "$PID_DIR"

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
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
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
            --secure)
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
            web|gateway|translator|infra|stop|status|logs)
                SERVICE="$1"
                shift
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
    echo "Usage: $0 [OPTIONS] [SERVICE]"
    echo ""
    echo "Options:"
    echo "  --with-containers    Launch MongoDB/Redis via Docker"
    echo "  --memory             Memory mode (no external DB)"
    echo "  --secure             HTTPS with mkcert"
    echo "  --ip <IP>            Custom local IP"
    echo "  --domain <DOMAIN>    Custom domain"
    echo ""
    echo "Services:"
    echo "  web                  Frontend only"
    echo "  gateway              API only"
    echo "  translator           ML only"
    echo "  infra                MongoDB + Redis only"
    echo ""
    echo "Commands:"
    echo "  stop                 Stop all services"
    echo "  status               Show service status"
    echo "  logs [service]       View service logs"
}

# Start infrastructure (MongoDB + Redis)
start_infra() {
    if [ "$WITH_CONTAINERS" = true ] || [ "$SERVICE" = "infra" ]; then
        print_info "Starting infrastructure containers..."
        cd "$ROOT_DIR"
        docker compose -f infrastructure/docker/compose/docker-compose.local.yml up -d database redis
        print_success "Infrastructure started"

        if [ "$SERVICE" = "infra" ]; then
            print_success "Infrastructure-only mode - MongoDB and Redis are running"
            exit 0
        fi
    elif [ "$MEMORY_MODE" = false ]; then
        print_warning "Using existing MongoDB and Redis (no containers)"
        print_warning "Make sure MongoDB is running on localhost:27017"
        print_warning "Make sure Redis is running on localhost:6379"
    fi
}

# Start web service
start_web() {
    print_info "Starting web frontend..."
    cd "$ROOT_DIR/apps/web"

    export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3000}"
    export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-ws://localhost:3000}"

    if [ "$SECURE_MODE" = true ]; then
        print_warning "HTTPS mode not yet fully implemented for web"
    fi

    $PACKAGE_MANAGER run dev > "$PID_DIR/web.log" 2>&1 &
    echo $! > "$PID_DIR/web.pid"
    print_success "Web started (PID: $(cat $PID_DIR/web.pid))"
}

# Start gateway service
start_gateway() {
    print_info "Starting gateway API..."
    cd "$ROOT_DIR/services/gateway"

    export DATABASE_URL="${DATABASE_URL:-mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true}"
    export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
    export TRANSLATOR_URL="${TRANSLATOR_URL:-http://localhost:8000}"
    export NODE_ENV="${NODE_ENV:-development}"
    export JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-change-in-production}"

    if [ "$MEMORY_MODE" = true ]; then
        export USE_MEMORY_STORE=true
        print_warning "Running in MEMORY mode - no MongoDB/Redis connection"
    fi

    $PACKAGE_MANAGER run dev > "$PID_DIR/gateway.log" 2>&1 &
    echo $! > "$PID_DIR/gateway.pid"
    print_success "Gateway started (PID: $(cat $PID_DIR/gateway.pid))"
}

# Start translator service
start_translator() {
    print_info "Starting translator service..."
    cd "$ROOT_DIR/services/translator"

    if [ ! -d ".venv" ]; then
        print_info "Creating Python virtual environment..."
        python3 -m venv .venv
    fi

    source .venv/bin/activate
    pip install -q -r requirements.txt

    export DATABASE_URL="${DATABASE_URL:-mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true}"
    export PYTHONPATH="/workspace"
    export PYTHONUNBUFFERED=1

    uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload > "$PID_DIR/translator.log" 2>&1 &
    echo $! > "$PID_DIR/translator.pid"
    print_success "Translator started (PID: $(cat $PID_DIR/translator.pid))"
}

# Stop all services
stop_all() {
    print_info "Stopping all services..."

    for pidfile in "$PID_DIR"/*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            service=$(basename "$pidfile" .pid)
            if kill -0 "$pid" 2>/dev/null; then
                print_info "Stopping $service (PID: $pid)"
                kill "$pid" 2>/dev/null || true
                rm "$pidfile"
            else
                print_warning "$service not running"
                rm "$pidfile"
            fi
        fi
    done

    if [ "$WITH_CONTAINERS" = true ]; then
        print_info "Stopping infrastructure containers..."
        cd "$ROOT_DIR"
        docker compose -f infrastructure/docker/compose/docker-compose.local.yml down
    fi

    print_success "All services stopped"
}

# Show service status
show_status() {
    print_banner
    echo -e "${CYAN}Service Status:${NC}"
    echo ""

    for pidfile in "$PID_DIR"/*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            service=$(basename "$pidfile" .pid)
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "  ${GREEN}●${NC} $service (PID: $pid) - ${GREEN}RUNNING${NC}"
            else
                echo -e "  ${RED}●${NC} $service - ${RED}STOPPED${NC}"
                rm "$pidfile"
            fi
        fi
    done

    echo ""

    if [ "$WITH_CONTAINERS" = true ]; then
        print_info "Container status:"
        docker compose -f "$ROOT_DIR/infrastructure/docker/compose/docker-compose.local.yml" ps
    fi
}

# Show service logs
show_logs() {
    local service="$1"

    if [ -z "$service" ]; then
        print_error "Please specify a service: web, gateway, translator"
        exit 1
    fi

    local logfile="$PID_DIR/$service.log"

    if [ -f "$logfile" ]; then
        tail -f "$logfile"
    else
        print_error "Log file not found for $service"
        exit 1
    fi
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
            show_logs "$2"
            exit 0
            ;;
    esac

    print_banner

    # Check package manager
    if [ -z "$PACKAGE_MANAGER" ]; then
        print_error "No package manager found (bun, pnpm, or npm required)"
        exit 1
    fi
    print_info "Using package manager: $PACKAGE_MANAGER"

    # Print configuration
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Memory mode: $MEMORY_MODE"
    echo "  With containers: $WITH_CONTAINERS"
    echo "  Secure mode: $SECURE_MODE"
    echo "  Domain: $LOCAL_DOMAIN"
    [ -n "$LOCAL_IP" ] && echo "  IP: $LOCAL_IP"
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
            sleep 2
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

    echo ""
    print_success "Development environment ready!"
    echo ""
    echo -e "${CYAN}URLs:${NC}"
    echo "  Frontend:   http://localhost:3100"
    echo "  Gateway:    http://localhost:3000"
    echo "  Translator: http://localhost:8000"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  ./scripts/dev.sh stop    - Stop all services"
    echo "  ./scripts/dev.sh status  - Show service status"
    echo "  ./scripts/dev.sh logs    - View logs"
    echo ""
}

main "$@"
