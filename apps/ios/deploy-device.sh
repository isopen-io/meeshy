#!/bin/bash

#############################################
# Meeshy iOS - Build, Deploy & Log Script
# Target: Services CEO X16pm (iPhone 16 Pro Max)
#############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_NAME="Meeshy.xcodeproj"
SCHEME="Meeshy"
DERIVED_DATA="$PROJECT_DIR/DerivedData"
DEVICE_NAME="Services CEO i16pm"
BUNDLE_ID="me.meeshy.app.debug"
APP_NAME="Meeshy-Dev.app"

# Log file for this session
LOG_FILE="$PROJECT_DIR/deploy-$(date +%Y%m%d_%H%M%S).log"

#############################################
# Helper Functions
#############################################

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

log_step() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}▶ $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

cleanup() {
    if [ -n "$LOG_PID" ] && kill -0 "$LOG_PID" 2>/dev/null; then
        kill "$LOG_PID" 2>/dev/null || true
    fi
    if [ -n "$TAIL_PID" ] && kill -0 "$TAIL_PID" 2>/dev/null; then
        kill "$TAIL_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

#############################################
# Check Prerequisites
#############################################

install_dependencies() {
    log_step "Checking and installing dependencies"

    # Check for Homebrew
    if ! command -v brew &> /dev/null; then
        log_warning "Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ $? -ne 0 ]; then
            log_error "Failed to install Homebrew"
            exit 1
        fi
        log_success "Homebrew installed"
    else
        log_info "Homebrew: $(brew --version | head -1)"
    fi

    # Check for libimobiledevice (required for idevicesyslog)
    if ! command -v idevicesyslog &> /dev/null; then
        log_warning "libimobiledevice not found. Installing..."
        brew install libimobiledevice
        if [ $? -ne 0 ]; then
            log_error "Failed to install libimobiledevice"
            log_info "Try manually: brew install libimobiledevice"
            exit 1
        fi
        log_success "libimobiledevice installed"
    else
        log_info "libimobiledevice: installed"
    fi

    # Check for ideviceinstaller (optional, for alternative installation method)
    if ! command -v ideviceinstaller &> /dev/null; then
        log_info "Installing ideviceinstaller (optional)..."
        brew install ideviceinstaller 2>/dev/null || true
    fi

    log_success "All dependencies installed"
}

check_prerequisites() {
    log_step "Checking prerequisites"

    # Check Xcode
    if ! command -v xcodebuild &> /dev/null; then
        log_error "xcodebuild not found. Please install Xcode."
        exit 1
    fi
    log_info "Xcode: $(xcodebuild -version | head -1)"

    # Check project exists
    if [ ! -d "$PROJECT_DIR/$PROJECT_NAME" ]; then
        log_error "Project not found: $PROJECT_DIR/$PROJECT_NAME"
        exit 1
    fi
    log_info "Project: $PROJECT_NAME"

    # Check device connection
    log_info "Checking device connection..."
    DEVICE_INFO=$(xcrun devicectl list devices 2>&1 | grep "$DEVICE_NAME" || true)

    if [ -z "$DEVICE_INFO" ]; then
        log_error "Device '$DEVICE_NAME' not found!"
        echo ""
        log_info "Available devices:"
        xcrun devicectl list devices 2>&1 | grep -E "iPhone|iPad" | head -10
        exit 1
    fi

    # Extract device state
    if echo "$DEVICE_INFO" | grep -q "connected"; then
        log_success "Device connected: $DEVICE_NAME"
    elif echo "$DEVICE_INFO" | grep -q "available"; then
        log_warning "Device available but may need to be unlocked: $DEVICE_NAME"
    else
        log_warning "Device state: $DEVICE_INFO"
    fi
}

#############################################
# Resolve Dependencies
#############################################

resolve_dependencies() {
    log_step "Resolving package dependencies"

    cd "$PROJECT_DIR"

    xcodebuild -resolvePackageDependencies \
        -project "$PROJECT_NAME" \
        -scheme "$SCHEME" \
        2>&1 | tee -a "$LOG_FILE" | grep -E "(Fetching|Resolved|error:)" || true

    log_success "Dependencies resolved"
}

#############################################
# Build
#############################################

build_app() {
    log_step "Building $SCHEME for device"

    cd "$PROJECT_DIR"

    # Clean derived data for fresh build (optional - comment out for faster builds)
    # rm -rf "$DERIVED_DATA"

    log_info "Building... (this may take a few minutes)"

    BUILD_OUTPUT=$(xcodebuild \
        -project "$PROJECT_NAME" \
        -scheme "$SCHEME" \
        -destination "generic/platform=iOS" \
        -derivedDataPath "$DERIVED_DATA" \
        -allowProvisioningUpdates \
        build 2>&1)

    BUILD_EXIT_CODE=$?

    echo "$BUILD_OUTPUT" >> "$LOG_FILE"

    # Check for errors
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        log_error "Build failed!"
        echo "$BUILD_OUTPUT" | grep -E "error:" | head -20
        exit 1
    fi

    # Check for BUILD SUCCEEDED
    if echo "$BUILD_OUTPUT" | grep -q "BUILD SUCCEEDED"; then
        log_success "Build succeeded!"
    else
        log_warning "Build completed but status unclear"
    fi

    # Find the built app
    APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphoneos/$APP_NAME"

    if [ ! -d "$APP_PATH" ]; then
        log_error "Built app not found at: $APP_PATH"
        log_info "Searching for app..."
        find "$DERIVED_DATA" -name "*.app" -type d 2>/dev/null | head -5
        exit 1
    fi

    log_success "App built: $APP_PATH"
}

#############################################
# Install
#############################################

install_app() {
    log_step "Installing app on $DEVICE_NAME"

    APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphoneos/$APP_NAME"

    log_info "Installing $APP_NAME..."

    INSTALL_OUTPUT=$(xcrun devicectl device install app \
        --device "$DEVICE_NAME" \
        "$APP_PATH" 2>&1)

    INSTALL_EXIT_CODE=$?

    echo "$INSTALL_OUTPUT" >> "$LOG_FILE"

    if [ $INSTALL_EXIT_CODE -ne 0 ]; then
        log_error "Installation failed!"
        echo "$INSTALL_OUTPUT"
        exit 1
    fi

    if echo "$INSTALL_OUTPUT" | grep -q "App installed"; then
        log_success "App installed successfully!"
        echo "$INSTALL_OUTPUT" | grep -E "bundleID|installationURL" | head -3
    else
        log_warning "Installation completed but status unclear"
        echo "$INSTALL_OUTPUT"
    fi
}

#############################################
# Launch
#############################################

launch_app() {
    log_step "Launching app on $DEVICE_NAME"

    log_info "Launching $BUNDLE_ID..."

    LAUNCH_OUTPUT=$(xcrun devicectl device process launch \
        --device "$DEVICE_NAME" \
        "$BUNDLE_ID" 2>&1)

    LAUNCH_EXIT_CODE=$?

    echo "$LAUNCH_OUTPUT" >> "$LOG_FILE"

    if [ $LAUNCH_EXIT_CODE -ne 0 ]; then
        log_error "Launch failed!"
        echo "$LAUNCH_OUTPUT"
        exit 1
    fi

    if echo "$LAUNCH_OUTPUT" | grep -q "Launched"; then
        log_success "App launched!"
    else
        log_warning "Launch completed but status unclear"
        echo "$LAUNCH_OUTPUT"
    fi

    # Give the app time to start
    sleep 2
}

#############################################
# Stream Logs
#############################################

stream_logs() {
    log_step "Streaming device logs (Ctrl+C to stop)"

    echo ""
    log_info "Filtering logs for: Meeshy-Dev, meeshy, conversation, category, cache, API"
    log_info "Log file: $LOG_FILE"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━ LIVE LOGS ━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Method 1: Try using log stream with device (macOS 13+)
    # Note: This requires the device to be in developer mode and paired

    # Get device UDID
    DEVICE_UDID=$(system_profiler SPUSBDataType 2>/dev/null | grep -A 20 "iPhone" | grep "Serial Number:" | head -1 | awk '{print $NF}')

    if [ -z "$DEVICE_UDID" ]; then
        # Try alternative method
        DEVICE_UDID=$(xcrun devicectl list devices 2>&1 | grep "$DEVICE_NAME" | awk '{for(i=1;i<=NF;i++) if($i ~ /^[A-F0-9-]{36}$/) print $i}')
    fi

    log_info "Device UDID: $DEVICE_UDID"

    # Try idevicesyslog first (from libimobiledevice)
    if command -v idevicesyslog &> /dev/null; then
        log_info "Using idevicesyslog..."
        idevicesyslog -u "$DEVICE_UDID" 2>&1 | \
            grep --line-buffered -iE "meeshy|conversation|category|cache|API|error|warning" | \
            while IFS= read -r line; do
                # Color code the output
                if echo "$line" | grep -qi "error"; then
                    echo -e "${RED}$line${NC}"
                elif echo "$line" | grep -qi "warning"; then
                    echo -e "${YELLOW}$line${NC}"
                elif echo "$line" | grep -qi "API"; then
                    echo -e "${CYAN}$line${NC}"
                elif echo "$line" | grep -qi "category\|cache"; then
                    echo -e "${GREEN}$line${NC}"
                else
                    echo "$line"
                fi
            done
    else
        # Fallback: Use Console.app via AppleScript
        log_warning "idevicesyslog not found. Installing libimobiledevice is recommended."
        log_info "Attempting to open Console.app for device logs..."

        # Open Console.app
        osascript -e 'tell application "Console" to activate' 2>/dev/null || true

        echo ""
        log_info "Please follow these steps in Console.app:"
        echo "  1. Select your device '$DEVICE_NAME' in the left sidebar"
        echo "  2. Click 'Start streaming' if not already streaming"
        echo "  3. In the search bar, type: process:Meeshy-Dev"
        echo ""
        log_info "Alternatively, install libimobiledevice for terminal logs:"
        echo "  brew install libimobiledevice"
        echo ""

        # Keep the script running and show a simple heartbeat
        log_info "App is running. Press Ctrl+C to exit."

        while true; do
            # Check if app is still running
            APP_RUNNING=$(xcrun devicectl device process list --device "$DEVICE_NAME" 2>&1 | grep -i "meeshy" || true)

            if [ -n "$APP_RUNNING" ]; then
                echo -ne "\r${GREEN}[●]${NC} App running... ($(date +%H:%M:%S))  "
            else
                echo -ne "\r${YELLOW}[○]${NC} App not detected... ($(date +%H:%M:%S))  "
            fi

            sleep 2
        done
    fi
}

#############################################
# Main
#############################################

main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       MEESHY iOS - Build, Deploy & Log Script              ║${NC}"
    echo -e "${CYAN}║       Target: $DEVICE_NAME                      ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Parse arguments
    SKIP_BUILD=false
    SKIP_INSTALL=false
    LOGS_ONLY=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-install)
                SKIP_INSTALL=true
                shift
                ;;
            --logs-only)
                LOGS_ONLY=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --skip-build    Skip the build step (use existing build)"
                echo "  --skip-install  Skip the install step (app already installed)"
                echo "  --logs-only     Only stream logs (skip build, install, launch)"
                echo "  --help, -h      Show this help message"
                echo ""
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    install_dependencies
    check_prerequisites

    if [ "$LOGS_ONLY" = true ]; then
        stream_logs
        exit 0
    fi

    if [ "$SKIP_BUILD" = false ]; then
        resolve_dependencies
        build_app
    else
        log_info "Skipping build (--skip-build)"
    fi

    if [ "$SKIP_INSTALL" = false ]; then
        install_app
    else
        log_info "Skipping install (--skip-install)"
    fi

    launch_app
    stream_logs
}

# Run main
main "$@"
