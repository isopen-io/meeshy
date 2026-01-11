#!/bin/bash
#
# run_app.sh - Build and run Meeshy on iPhone 16 Pro (iOS 18.2)
#
# Usage:
#   ./scripts/run_app.sh          # Build and launch
#   ./scripts/run_app.sh start    # Build and launch
#   ./scripts/run_app.sh stop     # Stop the app
#   ./scripts/run_app.sh restart  # Stop, build and launch
#   ./scripts/run_app.sh status   # Check if app is running
#   ./scripts/run_app.sh boot     # Just boot the simulator
#   ./scripts/run_app.sh install  # Build and install (no launch)
#

set -e

# Configuration
SIMULATOR_NAME="iPhone 16 Pro"
SIMULATOR_OS="18.2"
SIMULATOR_UDID="30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
BUNDLE_ID="me.meeshy.app.debug"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_FILE="$PROJECT_DIR/Meeshy.xcodeproj"
SCHEME="Meeshy"
DERIVED_DATA="$HOME/Library/Developer/Xcode/DerivedData"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

get_app_path() {
    local app_path=$(ls -dt "$DERIVED_DATA"/Meeshy-*/Build/Products/Debug-iphonesimulator/Meeshy-Dev.app 2>/dev/null | head -1)
    echo "$app_path"
}

is_simulator_booted() {
    local state=$(xcrun simctl list devices | grep "$SIMULATOR_UDID" | grep -o "(Booted)" || true)
    [ -n "$state" ]
}

is_app_running() {
    xcrun simctl spawn "$SIMULATOR_UDID" launchctl list 2>/dev/null | grep -q "$BUNDLE_ID" 2>/dev/null
}

boot_simulator() {
    if is_simulator_booted; then
        print_info "Simulator already booted"
    else
        print_info "Booting $SIMULATOR_NAME (iOS $SIMULATOR_OS)..."
        xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true
        sleep 2
        print_success "Simulator booted"
    fi

    # Open Simulator app
    open -a Simulator
}

build_app() {
    print_info "Building Meeshy..."
    cd "$PROJECT_DIR"

    if xcodebuild -project "$PROJECT_FILE" \
                  -scheme "$SCHEME" \
                  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
                  -quiet \
                  build 2>&1; then
        print_success "Build succeeded"
        return 0
    else
        print_error "Build failed"
        return 1
    fi
}

install_app() {
    local app_path=$(get_app_path)

    if [ -z "$app_path" ] || [ ! -d "$app_path" ]; then
        print_error "App not found. Run build first."
        return 1
    fi

    print_info "Installing app..."
    xcrun simctl install "$SIMULATOR_UDID" "$app_path"
    print_success "App installed"
}

launch_app() {
    print_info "Launching Meeshy..."
    local pid=$(xcrun simctl launch "$SIMULATOR_UDID" "$BUNDLE_ID" 2>&1 | grep -oE '[0-9]+$' || true)

    if [ -n "$pid" ]; then
        print_success "App launched (PID: $pid)"
        return 0
    else
        print_error "Failed to launch app"
        return 1
    fi
}

stop_app() {
    print_info "Stopping Meeshy..."
    xcrun simctl terminate "$SIMULATOR_UDID" "$BUNDLE_ID" 2>/dev/null || true
    print_success "App stopped"
}

show_status() {
    echo ""
    echo "=== Meeshy App Status ==="
    echo ""

    # Simulator status
    if is_simulator_booted; then
        print_success "Simulator: Running ($SIMULATOR_NAME - iOS $SIMULATOR_OS)"
    else
        print_warning "Simulator: Not running"
    fi

    # App status
    if is_simulator_booted; then
        if is_app_running; then
            print_success "App: Running"
        else
            print_warning "App: Not running"
        fi
    fi

    # Build status
    local app_path=$(get_app_path)
    if [ -n "$app_path" ] && [ -d "$app_path" ]; then
        local mod_time=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$app_path")
        print_success "Last build: $mod_time"
    else
        print_warning "No build found"
    fi

    echo ""
}

take_screenshot() {
    local output="${1:-/tmp/meeshy_screenshot.png}"
    print_info "Taking screenshot..."
    xcrun simctl io "$SIMULATOR_UDID" screenshot "$output"
    print_success "Screenshot saved to: $output"
}

# Main
case "${1:-start}" in
    start|launch|run)
        boot_simulator
        build_app
        install_app
        launch_app
        ;;
    stop|kill|terminate)
        stop_app
        ;;
    restart)
        stop_app
        sleep 1
        build_app
        install_app
        launch_app
        ;;
    build)
        build_app
        ;;
    install)
        boot_simulator
        build_app
        install_app
        ;;
    boot)
        boot_simulator
        ;;
    status)
        show_status
        ;;
    screenshot)
        take_screenshot "${2:-/tmp/meeshy_screenshot.png}"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|build|install|boot|status|screenshot}"
        echo ""
        echo "Commands:"
        echo "  start      Build and launch the app (default)"
        echo "  stop       Stop the running app"
        echo "  restart    Stop, rebuild and launch"
        echo "  build      Build only (no install/launch)"
        echo "  install    Build and install (no launch)"
        echo "  boot       Boot the simulator only"
        echo "  status     Show app and simulator status"
        echo "  screenshot Take a screenshot"
        exit 1
        ;;
esac
