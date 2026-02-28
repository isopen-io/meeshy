#!/bin/bash
set -eo pipefail
cd "$(dirname "$0")"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Meeshy iOS — Unified Build & Development Tool
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─── Config ──────────────────────────────────────────────────────────────────
APP_NAME="Meeshy"
BUNDLE_ID="me.meeshy.app"
SCHEME="Meeshy"
PROJECT="Meeshy.xcodeproj"
DERIVED_DATA="build"
LOG_DIR="logs"
TEST_OUTPUT_DIR="test-results"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} $1"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)]${NC} $1"; }

# ─── Globals ─────────────────────────────────────────────────────────────────
DEVICE_ID=""
DEVICE_NAME=""
CONFIGURATION="Debug"
CLEAN=false
EXPORT_METHOD="app-store"
UI_TESTS=false
COVERAGE=false
LOG_STREAM_PID=""
CRASH_MONITOR_PID=""
LOGFILE=""
ENTITLEMENTS_FILE="Meeshy/Meeshy.entitlements"
PHYSICAL_DEVICE_ID=""
PHYSICAL_DEVICE_NAME=""

# ─── Physical Device Detection ──────────────────────────────────────────────
detect_physical_device() {
    # devicectl output columns: FriendlyName  NetworkName  UUID  Status  Model
    local devices
    devices=$(xcrun devicectl list devices 2>/dev/null | grep -E "iPhone" | grep -v "Simulator" || true)
    if [ -z "$devices" ]; then
        err "No physical iPhone found. Connect via USB or WiFi."
        exit 1
    fi

    # Prefer "Services CEO" device if available
    local chosen
    chosen=$(echo "$devices" | grep -i "Services CEO" | head -n 1)
    [ -z "$chosen" ] && chosen=$(echo "$devices" | head -n 1)

    # First column is the friendly name (before the .coredevice.local hostname)
    PHYSICAL_DEVICE_NAME=$(echo "$chosen" | awk -F'  +' '{print $1}' | xargs)
    PHYSICAL_DEVICE_ID=$(echo "$chosen" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1)

    if [ -z "$PHYSICAL_DEVICE_ID" ] || [ -z "$PHYSICAL_DEVICE_NAME" ]; then
        err "Could not parse physical device from: $chosen"
        exit 1
    fi

    ok "Physical device: ${BOLD}$PHYSICAL_DEVICE_NAME${NC} ($PHYSICAL_DEVICE_ID)"
}

# ─── Device Deploy (with provisioning fallback) ────────────────────────────
strip_entitlements() {
    log "Stripping Associated Domains & Push Notifications from entitlements..."
    cp "$ENTITLEMENTS_FILE" "${ENTITLEMENTS_FILE}.bak"
    /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.associated-domains" "$ENTITLEMENTS_FILE" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$ENTITLEMENTS_FILE" 2>/dev/null || true
    # Remove final .app, the .xcent derived from entitlements (so Xcode regenerates it from
    # the stripped source), and build.db — keeps all .o intermediates for a fast re-link (~30s vs ~3min)
    rm -rf "$DERIVED_DATA/Build/Products/$CONFIGURATION-iphoneos/$APP_NAME.app" 2>/dev/null || true
    rm -f "$DERIVED_DATA/Build/Intermediates.noindex/Meeshy.build/$CONFIGURATION-iphoneos/Meeshy.build/Meeshy.app.xcent" 2>/dev/null || true
    rm -f "$DERIVED_DATA/Build/Intermediates.noindex/XCBuildData/build.db" 2>/dev/null || true
    grep -rl "me.meeshy.app" ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision 2>/dev/null | xargs rm -f 2>/dev/null || true
    ok "Entitlements stripped (backup at ${ENTITLEMENTS_FILE}.bak)"
}

restore_entitlements() {
    if [ -f "${ENTITLEMENTS_FILE}.bak" ]; then
        mv "${ENTITLEMENTS_FILE}.bak" "$ENTITLEMENTS_FILE"
        ok "Entitlements restored"
    fi
}

do_device_deploy() {
    detect_physical_device

    local device_app_path="$DERIVED_DATA/Build/Products/$CONFIGURATION-iphoneos/$APP_NAME.app"
    local build_log="/tmp/meeshy_device_build_$$.log"

    local ncpu
    ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

    # Strip restricted capabilities upfront — physical device provisioning profiles
    # never include Associated Domains or Push Notifications on a personal/free account.
    # Stripping first avoids a guaranteed-to-fail first attempt.
    strip_entitlements
    trap restore_entitlements EXIT

    log "Building for ${BOLD}$PHYSICAL_DEVICE_NAME${NC}..."

    set +e
    xcodebuild \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "platform=iOS,name=$PHYSICAL_DEVICE_NAME" \
        -derivedDataPath "$DERIVED_DATA" \
        -allowProvisioningUpdates \
        -skipPackagePluginValidation \
        -skipMacroValidation \
        -jobs "$ncpu" \
        ONLY_ACTIVE_ARCH=YES \
        CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION=YES \
        build >"$build_log" 2>&1
    local build_rc=$?
    set -e

    # Restore entitlements IMMEDIATELY after build, before anything else
    restore_entitlements
    trap - EXIT

    if [ "$build_rc" -ne 0 ]; then
        err "Build FAILED"
        grep -E "error:" "$build_log" | grep -v "IDEFoundation\|Xcode3Core\|DVTFoundation\|dylib\|Entitlements file.*modified" | head -30 || tail -20 "$build_log"
        cp "$build_log" /tmp/meeshy_device_last_failure.log
        rm -f "$build_log"
        exit 1
    fi
    ok "Build succeeded"
    rm -f "$build_log"

    # ── Install on device ──
    if [ ! -d "$device_app_path" ]; then
        err "App bundle not found at: $device_app_path"
        exit 1
    fi

    log "Installing on ${BOLD}$PHYSICAL_DEVICE_NAME${NC}..."
    set +e
    xcrun devicectl device install app --device "$PHYSICAL_DEVICE_ID" "$device_app_path" 2>&1
    local install_rc=$?
    set -e

    if [ "$install_rc" -ne 0 ]; then
        err "Install failed"
        exit 1
    fi
    ok "Installed on device"

    # ── Launch on device ──
    log "Launching ${BOLD}$APP_NAME${NC}..."
    set +e
    xcrun devicectl device process launch --device "$PHYSICAL_DEVICE_ID" "$BUNDLE_ID" 2>&1
    set -e
    ok "Done! App deployed to ${BOLD}$PHYSICAL_DEVICE_NAME${NC}"

    # ── Clean device build artifacts ──
    # The .app and .xcent were built with stripped entitlements. Remove them so
    # the next device deploy rebuilds cleanly from the restored entitlements
    # (all .o intermediates are kept → re-link/re-sign only, ~30s).
    log "Cleaning device build artifacts (keeping .o intermediates)..."
    rm -rf "$device_app_path" 2>/dev/null || true
    rm -f "$DERIVED_DATA/Build/Intermediates.noindex/Meeshy.build/$CONFIGURATION-iphoneos/Meeshy.build/Meeshy.app.xcent" 2>/dev/null || true
    rm -f "$DERIVED_DATA/Build/Intermediates.noindex/XCBuildData/build.db" 2>/dev/null || true
    ok "Ready for next deploy"
}

# ─── Simulator Detection ────────────────────────────────────────────────────
detect_simulator() {
    # Priority 1: Already booted iPhone
    local booted
    booted=$(xcrun simctl list devices | grep -E "iPhone.*\(Booted\)" | head -n 1)
    if [ -n "$booted" ]; then
        DEVICE_ID=$(echo "$booted" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
        DEVICE_NAME=$(echo "$booted" | sed 's/ (.*//' | xargs)
        ok "Booted: ${BOLD}$DEVICE_NAME${NC}"
        return 0
    fi

    # Priority 2: Any available iPhone (prefer Pro models)
    local available
    available=$(xcrun simctl list devices available | grep -E "iPhone" | grep -v "unavailable")
    if [ -z "$available" ]; then
        err "No iPhone simulators found. Install via Xcode > Settings > Platforms."
        exit 1
    fi

    local chosen
    chosen=$(echo "$available" | grep -E "Pro" | head -n 1)
    [ -z "$chosen" ] && chosen=$(echo "$available" | head -n 1)

    DEVICE_ID=$(echo "$chosen" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
    DEVICE_NAME=$(echo "$chosen" | sed 's/ (.*//' | xargs)

    if [ -z "$DEVICE_ID" ]; then
        err "Could not parse simulator device ID."
        exit 1
    fi

    ok "Selected: ${BOLD}$DEVICE_NAME${NC} ($DEVICE_ID)"
}

# ─── Simulator Helpers ───────────────────────────────────────────────────────
ensure_booted() {
    local boot_state
    boot_state=$(xcrun simctl list devices | grep "$DEVICE_ID" | grep -c "Booted" || true)
    if [ "$boot_state" -eq 0 ]; then
        log "Booting simulator..."
        xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
        sleep 2
        ok "Simulator booted"
    fi
    open -a Simulator 2>/dev/null || true
}

is_app_running() {
    xcrun simctl spawn "$DEVICE_ID" launchctl list 2>/dev/null | grep -q "$BUNDLE_ID" 2>/dev/null
}

app_path() {
    echo "$DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator/$APP_NAME.app"
}

# ─── Build ───────────────────────────────────────────────────────────────────
do_clean() {
    log "Cleaning..."

    # Local build dirs
    rm -rf "$DERIVED_DATA" ./DerivedData

    # Test results
    rm -rf "$TEST_OUTPUT_DIR" ./fastlane/test_output ./fastlane/ui_test_output

    # Fastlane artifacts
    rm -rf ./fastlane/report.xml ./fastlane/screenshots

    # SPM cache
    rm -rf ./.swiftpm ./.build

    if [ "${1:-}" = "--deep" ]; then
        # Global DerivedData + Xcode caches (slow)
        rm -rf ~/Library/Developer/Xcode/DerivedData
        rm -rf ~/Library/Caches/org.swift.swiftpm
        rm -rf ~/Library/Caches/com.apple.dt.Xcode
        ok "Deep clean done (global caches cleared)"
    else
        ok "Clean done"
    fi
}

do_build() {
    if [ "$CLEAN" = true ]; then
        do_clean
    fi

    log "Building ${BOLD}$SCHEME${NC} ($CONFIGURATION) for ${BOLD}$DEVICE_NAME${NC}..."
    local build_start
    build_start=$(date +%s)

    xcodebuild \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "id=$DEVICE_ID" \
        -derivedDataPath "$DERIVED_DATA" \
        -quiet \
        build 2>&1 | while IFS= read -r line; do
            if echo "$line" | grep -qE "(error:|warning:|BUILD FAILED)"; then
                err "$line"
            fi
        done

    local status=${PIPESTATUS[0]}
    local build_end
    build_end=$(date +%s)
    local duration=$((build_end - build_start))

    if [ "$status" -ne 0 ]; then
        err "Build FAILED after ${duration}s"
        exit 1
    fi

    ok "Build succeeded in ${BOLD}${duration}s${NC}"

    # Verify .app
    if [ ! -d "$(app_path)" ]; then
        err "App bundle not found at: $(app_path)"
        exit 1
    fi
}

do_install() {
    log "Installing..."
    xcrun simctl install "$DEVICE_ID" "$(app_path)"
    ok "Installed"
}

do_launch() {
    # Kill existing instance
    xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
    sleep 0.5

    log "Launching ${BOLD}$APP_NAME${NC}..."
    local attempts=3
    for i in $(seq 1 $attempts); do
        if xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null; then
            ok "App launched"
            return 0
        fi
        if [ "$i" -lt "$attempts" ]; then
            warn "Launch attempt $i failed, retrying..."
            sleep 2
        fi
    done
    warn "Auto-launch failed. App installed - launch manually from simulator."
}

# ─── Logging ─────────────────────────────────────────────────────────────────
start_log_stream() {
    mkdir -p "$LOG_DIR"
    LOGFILE="$LOG_DIR/meeshy_$(date +%Y%m%d_%H%M%S).log"

    log "Streaming logs to ${BOLD}$LOGFILE${NC}"
    log "Press ${BOLD}Ctrl+C${NC} to stop"
    echo ""

    xcrun simctl spawn "$DEVICE_ID" log stream \
        --level debug \
        --predicate "process == \"$APP_NAME\"" \
        2>&1 | tee -a "$LOGFILE" &
    LOG_STREAM_PID=$!
}

start_crash_monitor() {
    (
        while true; do
            sleep 5
            local running
            running=$(xcrun simctl spawn "$DEVICE_ID" launchctl list 2>/dev/null | grep "$BUNDLE_ID" || true)
            if [ -z "$running" ]; then
                echo ""
                err "App appears to have crashed or been terminated."
                err "Check logs at: $LOGFILE"
                break
            fi
        done
    ) &
    CRASH_MONITOR_PID=$!
}

cleanup() {
    echo ""
    log "Stopping..."
    [ -n "$LOG_STREAM_PID" ] && kill "$LOG_STREAM_PID" 2>/dev/null || true
    [ -n "$CRASH_MONITOR_PID" ] && kill "$CRASH_MONITOR_PID" 2>/dev/null || true
    if [ -n "$LOGFILE" ] && [ -f "$LOGFILE" ]; then
        local lc
        lc=$(wc -l < "$LOGFILE" | xargs)
        ok "Logs saved: ${BOLD}$LOGFILE${NC} ($lc lines)"
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM

# ─── Archive + IPA ───────────────────────────────────────────────────────────
do_archive() {
    local archive_config="${CONFIGURATION:-Release}"
    [ "$archive_config" = "Debug" ] && archive_config="Release"

    log "Resolving package dependencies..."
    xcodebuild -resolvePackageDependencies -project "$PROJECT" 2>/dev/null
    ok "Dependencies resolved"

    local app_label="$APP_NAME"
    [ "$archive_config" != "Release" ] && app_label="$APP_NAME-Dev"

    mkdir -p "$DERIVED_DATA/$archive_config"
    rm -rf "$DERIVED_DATA/$archive_config"/*

    local archive_path="$DERIVED_DATA/$archive_config/$app_label.xcarchive"

    log "Creating archive ($archive_config)..."
    xcodebuild archive \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$archive_config" \
        -archivePath "$archive_path" \
        -destination "generic/platform=iOS" \
        ONLY_ACTIVE_ARCH=NO \
        2>&1 | if command -v xcpretty &>/dev/null; then xcpretty; else cat; fi

    if [ ! -d "$archive_path" ]; then
        err "Archive creation failed"
        exit 1
    fi
    ok "Archive created: $archive_path"

    # Export IPA
    log "Exporting IPA (method: $EXPORT_METHOD)..."
    local export_opts="$DERIVED_DATA/$archive_config/ExportOptions.plist"
    cat > "$export_opts" << EOXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>$EXPORT_METHOD</string>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
</dict>
</plist>
EOXML

    local export_path="$DERIVED_DATA/$archive_config/IPA"
    xcodebuild -exportArchive \
        -archivePath "$archive_path" \
        -exportPath "$export_path" \
        -exportOptionsPlist "$export_opts" \
        2>&1 | if command -v xcpretty &>/dev/null; then xcpretty; else cat; fi

    local ipa_file
    ipa_file=$(find "$export_path" -name "*.ipa" -type f 2>/dev/null | head -1)
    if [ -z "$ipa_file" ] || [ ! -f "$ipa_file" ]; then
        err "IPA export failed"
        exit 1
    fi

    local ipa_size
    ipa_size=$(du -h "$ipa_file" | cut -f1)
    ok "IPA exported: ${BOLD}$ipa_file${NC} ($ipa_size)"
}

# ─── Tests ───────────────────────────────────────────────────────────────────
do_test() {
    local destination="platform=iOS Simulator,id=$DEVICE_ID"

    mkdir -p "$TEST_OUTPUT_DIR"

    log "Running unit tests..."
    xcodebuild test \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -destination "$destination" \
        -configuration Debug \
        -enableCodeCoverage "$([ "$COVERAGE" = true ] && echo YES || echo NO)" \
        -resultBundlePath "$TEST_OUTPUT_DIR/unit-tests.xcresult" \
        -only-testing:MeeshyTests \
        2>&1 | if command -v xcpretty &>/dev/null; then xcpretty --test --color; else cat; fi

    ok "Unit tests completed"

    if [ "$UI_TESTS" = true ]; then
        log "Running UI tests..."
        xcodebuild test \
            -project "$PROJECT" \
            -scheme "$SCHEME" \
            -destination "$destination" \
            -configuration Debug \
            -resultBundlePath "$TEST_OUTPUT_DIR/ui-tests.xcresult" \
            -only-testing:MeeshyUITests \
            2>&1 | if command -v xcpretty &>/dev/null; then xcpretty --test --color; else cat; fi || true
        ok "UI tests completed"
    fi

    if [ "$COVERAGE" = true ]; then
        log "Generating coverage report..."
        xcrun xccov view --report "$TEST_OUTPUT_DIR/unit-tests.xcresult" > "$TEST_OUTPUT_DIR/coverage.txt"
        ok "Coverage report: $TEST_OUTPUT_DIR/coverage.txt"
        head -20 "$TEST_OUTPUT_DIR/coverage.txt"
    fi
}

# ─── Setup ───────────────────────────────────────────────────────────────────
do_setup() {
    log "Checking development environment..."

    # Xcode
    if ! command -v xcodebuild &>/dev/null; then
        err "Xcode not installed."
        exit 1
    fi
    ok "$(xcodebuild -version | head -n 1)"

    # SwiftLint
    if command -v swiftlint &>/dev/null; then
        ok "SwiftLint installed"
    else
        warn "SwiftLint not found. Install: brew install swiftlint"
    fi

    # xcpretty
    if command -v xcpretty &>/dev/null; then
        ok "xcpretty installed"
    else
        warn "xcpretty not found. Install: gem install xcpretty"
    fi

    # Resolve SPM deps
    log "Resolving Swift Package dependencies..."
    xcodebuild -resolvePackageDependencies -project "$PROJECT"
    ok "Dependencies resolved"

    # Make scripts executable
    chmod +x meeshy.sh 2>/dev/null || true
    ok "Setup complete"
}

# ─── Status ──────────────────────────────────────────────────────────────────
do_status() {
    detect_simulator

    echo ""
    # Simulator
    local boot_state
    boot_state=$(xcrun simctl list devices | grep "$DEVICE_ID" | grep -c "Booted" || true)
    if [ "$boot_state" -gt 0 ]; then
        ok "Simulator: ${BOLD}Running${NC} ($DEVICE_NAME)"
    else
        warn "Simulator: Not running ($DEVICE_NAME)"
    fi

    # App
    if [ "$boot_state" -gt 0 ] && is_app_running; then
        ok "App: ${BOLD}Running${NC}"
    else
        warn "App: Not running"
    fi

    # Last build
    local ap
    ap="$(app_path)"
    if [ -d "$ap" ]; then
        local mod_time
        mod_time=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$ap")
        ok "Last build: $mod_time ($CONFIGURATION)"
    else
        warn "No build found"
    fi

    # Logs
    local latest_log
    latest_log=$(ls -t "$LOG_DIR"/meeshy_*.log 2>/dev/null | head -1)
    if [ -n "$latest_log" ]; then
        ok "Latest log: $latest_log"
    fi
    echo ""
}

# ─── Screenshot ──────────────────────────────────────────────────────────────
do_screenshot() {
    detect_simulator
    local output="${1:-screenshots/meeshy_$(date +%Y%m%d_%H%M%S).png}"
    mkdir -p "$(dirname "$output")"
    xcrun simctl io "$DEVICE_ID" screenshot "$output"
    ok "Screenshot: ${BOLD}$output${NC}"
}

# ─── Usage ───────────────────────────────────────────────────────────────────
usage() {
    echo ""
    echo -e "${BOLD}${CYAN}  Meeshy iOS${NC} ${DIM}— unified build tool${NC}"
    echo ""
    echo -e "  ${BOLD}Usage:${NC} ./meeshy.sh <command> [flags]"
    echo ""
    echo -e "  ${BOLD}Commands:${NC}"
    echo -e "    ${GREEN}run${NC}          Build, install, launch + stream logs ${DIM}(default)${NC}"
    echo -e "    ${GREEN}build${NC}        Build only"
    echo -e "    ${GREEN}stop${NC}         Stop running app"
    echo -e "    ${GREEN}restart${NC}      Stop + rebuild + launch"
    echo -e "    ${GREEN}logs${NC}         Stream logs from running app"
    echo -e "    ${GREEN}status${NC}       Show simulator/app status"
    echo -e "    ${GREEN}clean${NC}        Clean build artifacts ${DIM}(add --deep for global caches)${NC}"
    echo -e "    ${GREEN}archive${NC}      Create archive + IPA for distribution"
    echo -e "    ${GREEN}test${NC}         Run unit tests ${DIM}(add --ui for UI tests)${NC}"
    echo -e "    ${GREEN}setup${NC}        Check/install dev dependencies"
    echo -e "    ${GREEN}device${NC}       Build + deploy to physical iPhone ${DIM}(auto-strips capabilities if needed)${NC}"
    echo -e "    ${GREEN}screenshot${NC}   Take simulator screenshot"
    echo ""
    echo -e "  ${BOLD}Flags:${NC}"
    echo -e "    ${YELLOW}--clean, -C${NC}              Clean before building"
    echo -e "    ${YELLOW}--release, -r${NC}            Release configuration"
    echo -e "    ${YELLOW}--configuration, -c${NC} <v>  Explicit config (Debug/Release/Staging)"
    echo -e "    ${YELLOW}--method, -m${NC} <v>         Export method (app-store/ad-hoc/development)"
    echo -e "    ${YELLOW}--ui${NC}                     Include UI tests"
    echo -e "    ${YELLOW}--coverage${NC}               Generate coverage report"
    echo -e "    ${YELLOW}--deep${NC}                   Deep clean (global Xcode caches)"
    echo ""
    echo -e "  ${BOLD}Examples:${NC}"
    echo -e "    ${DIM}./meeshy.sh${NC}                          ${DIM}# Build + run + logs${NC}"
    echo -e "    ${DIM}./meeshy.sh run --clean${NC}              ${DIM}# Clean build + run${NC}"
    echo -e "    ${DIM}./meeshy.sh build --release${NC}          ${DIM}# Release build only${NC}"
    echo -e "    ${DIM}./meeshy.sh archive -m ad-hoc${NC}        ${DIM}# Ad-hoc IPA${NC}"
    echo -e "    ${DIM}./meeshy.sh test --ui --coverage${NC}     ${DIM}# All tests + coverage${NC}"
    echo -e "    ${DIM}./meeshy.sh clean --deep${NC}             ${DIM}# Nuke all caches${NC}"
    echo ""
    exit 0
}

# ─── Parse Args ──────────────────────────────────────────────────────────────
COMMAND="${1:-run}"
DEEP_CLEAN=false

# Check if first arg is a known command
case "$COMMAND" in
    run|build|stop|restart|logs|status|clean|archive|test|setup|screenshot|device|help|-h|--help)
        shift || true
        ;;
    -*)
        # No command given, flags start immediately — default to "run"
        COMMAND="run"
        ;;
    *)
        err "Unknown command: $COMMAND (use --help)"
        exit 1
        ;;
esac

# Parse remaining flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --clean|-C)       CLEAN=true; shift ;;
        --release|-r)     CONFIGURATION="Release"; shift ;;
        -c|--configuration) CONFIGURATION="$2"; shift 2 ;;
        -m|--method)      EXPORT_METHOD="$2"; shift 2 ;;
        --ui)             UI_TESTS=true; shift ;;
        --coverage)       COVERAGE=true; shift ;;
        --deep)           DEEP_CLEAN=true; shift ;;
        -h|--help|help)   usage ;;
        *)
            err "Unknown flag: $1 (use --help)"
            exit 1
            ;;
    esac
done

# ─── Execute ─────────────────────────────────────────────────────────────────
case "$COMMAND" in
    help|-h|--help)
        usage
        ;;

    run)
        echo ""
        echo -e "${BOLD}${CYAN}  Meeshy iOS Build & Run${NC}"
        echo ""
        detect_simulator
        ensure_booted
        do_build
        do_install
        do_launch
        echo ""
        if [ -t 1 ]; then
            # Interactive terminal — stream logs until Ctrl+C
            start_log_stream
            start_crash_monitor
            wait "$LOG_STREAM_PID" 2>/dev/null || true
            cleanup
        else
            # Non-interactive (scripts, CI, agents) — exit immediately
            ok "App running. Use ${BOLD}./meeshy.sh logs${NC} to stream logs."
        fi
        ;;

    build)
        detect_simulator
        do_build
        ;;

    stop)
        detect_simulator
        log "Stopping $APP_NAME..."
        xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
        ok "App stopped"
        ;;

    restart)
        detect_simulator
        ensure_booted
        log "Stopping $APP_NAME..."
        xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
        sleep 1
        do_build
        do_install
        do_launch
        echo ""
        if [ -t 1 ]; then
            start_log_stream
            start_crash_monitor
            wait "$LOG_STREAM_PID" 2>/dev/null || true
            cleanup
        else
            ok "App running. Use ${BOLD}./meeshy.sh logs${NC} to stream logs."
        fi
        ;;

    logs)
        detect_simulator
        start_log_stream
        start_crash_monitor
        wait "$LOG_STREAM_PID" 2>/dev/null || true
        cleanup
        ;;

    status)
        do_status
        ;;

    clean)
        if [ "$DEEP_CLEAN" = true ]; then
            do_clean --deep
        else
            do_clean
        fi
        ;;

    archive)
        do_archive
        ;;

    test)
        detect_simulator
        ensure_booted
        do_test
        ;;

    setup)
        do_setup
        ;;

    screenshot)
        do_screenshot "$1"
        ;;

    device)
        echo ""
        echo -e "${BOLD}${CYAN}  Meeshy iOS Device Deploy${NC}"
        echo ""
        do_device_deploy
        ;;
esac
