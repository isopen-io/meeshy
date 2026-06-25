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
DERIVED_DATA="Build"

# Apple Developer Team — required for device code-signing under automatic
# provisioning (CODE_SIGN_STYLE=Automatic in project.yml). Without it,
# xcodebuild fails: "Signing for 'Meeshy' requires a development team".
# Mirrors fastlane's source of truth (Appfile/Matchfile default + Fastfile
# xcargs DEVELOPMENT_TEAM=D72UK7R5RE) and honours the same FASTLANE_TEAM_ID
# override. Simulator builds don't sign, so this is only consumed by `device`.
DEVELOPMENT_TEAM="${FASTLANE_TEAM_ID:-D72UK7R5RE}"

# Xcode GUI SPM package cache — avoids re-cloning on slow networks
# Auto-detected: finds the latest Meeshy DerivedData with SourcePackages
XCODE_PKG_CACHE=""
if [ -d "./SourcePackages/checkouts/GRDB.swift" ]; then
    XCODE_PKG_CACHE="./SourcePackages"
else
    for _dd in ~/Library/Developer/Xcode/DerivedData/Meeshy-*/SourcePackages; do
        if [ -d "$_dd/checkouts/GRDB.swift" ]; then
            XCODE_PKG_CACHE="$_dd"
        fi
    done
fi
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

# Shared SPM cache flag for every xcodebuild invocation (build, archive,
# resolve). Computed once so all entry points see the same checkouts and
# Package.resolved view. Empty array if no cache detected (xcodebuild falls
# back to $DERIVED_DATA/SourcePackages).
XCODE_PKG_FLAGS=()
if [ -n "$XCODE_PKG_CACHE" ] && [ -d "$XCODE_PKG_CACHE" ]; then
    XCODE_PKG_FLAGS=(-clonedSourcePackagesDirPath "$XCODE_PKG_CACHE")
fi

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
NOTIF_ENTITLEMENTS_FILE="MeeshyNotificationExtension/MeeshyNotificationExtension.entitlements"
PHYSICAL_DEVICE_ID=""
PHYSICAL_DEVICE_NAME=""
PLATFORM="iphone"  # iphone | ipad | mac

# ─── Physical Device Detection ──────────────────────────────────────────────
detect_physical_device() {
    # devicectl output columns: FriendlyName  NetworkName  UUID  Status  Model
    # Exclure les devices "unavailable" (déjà appairés mais non connectés) : on ne
    # peut pas y déployer, et les lister fausse la sélection.
    local devices
    devices=$(xcrun devicectl list devices 2>/dev/null | grep -E "iPhone" | grep -v "Simulator" | grep -v "unavailable" || true)
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

# ─── Device Picker (physical first, simulators as fallback) ─────────────────
# Populates PICKED_DEVICE_TYPE ("simulator"|"physical"), PICKED_DEVICE_ID, PICKED_DEVICE_NAME
pick_device() {
    local -a dev_types=()
    local -a dev_ids=()
    local -a dev_names=()
    local -a dev_labels=()

    # 1. Physical devices FIRST — priority
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local did dname
        dname=$(echo "$line" | awk -F'  +' '{print $1}' | xargs)
        did=$(echo "$line" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1)
        [ -z "$did" ] && continue
        dev_types+=("physical")
        dev_ids+=("$did")
        dev_names+=("$dname")
        dev_labels+=("📲 $dname ${DIM}(Physical)${NC}")
    done < <(xcrun devicectl list devices 2>/dev/null | grep -E "iPhone" | grep -v "Simulator" | grep -v "unavailable" || true)

    local physical_count=${#dev_ids[@]}

    # If physical devices found, only show those (skip simulators)
    if [ "$physical_count" -eq 0 ]; then
        # No physical devices — fallback to simulators
        warn "No physical iPhone found. Falling back to simulators..."
        echo ""

        # Booted simulators
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            local did dname
            did=$(echo "$line" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
            dname=$(echo "$line" | sed 's/ (.*//' | xargs)
            [ -z "$did" ] && continue
            dev_types+=("simulator")
            dev_ids+=("$did")
            dev_names+=("$dname")
            dev_labels+=("📱 $dname ${DIM}(Simulator — Booted)${NC}")
        done < <(xcrun simctl list devices | grep -E "iPhone.*\(Booted\)" 2>/dev/null || true)

        # Available (not booted) simulators
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            local did dname
            did=$(echo "$line" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
            dname=$(echo "$line" | sed 's/ (.*//' | xargs)
            [ -z "$did" ] && continue
            local already=false
            for existing_id in "${dev_ids[@]}"; do
                [ "$existing_id" = "$did" ] && already=true && break
            done
            [ "$already" = true ] && continue
            dev_types+=("simulator")
            dev_ids+=("$did")
            dev_names+=("$dname")
            dev_labels+=("📱 $dname ${DIM}(Simulator)${NC}")
        done < <(xcrun simctl list devices available | grep -E "iPhone" | grep -v "unavailable" 2>/dev/null || true)
    fi

    local count=${#dev_ids[@]}

    if [ "$count" -eq 0 ]; then
        err "No devices found (no physical iPhones, no simulators)."
        exit 1
    fi

    if [ "$count" -eq 1 ]; then
        PICKED_DEVICE_TYPE="${dev_types[0]}"
        PICKED_DEVICE_ID="${dev_ids[0]}"
        PICKED_DEVICE_NAME="${dev_names[0]}"
        ok "Auto-selected: ${BOLD}$PICKED_DEVICE_NAME${NC}"
        return 0
    fi

    # Interactive selection
    echo ""
    echo -e "  ${BOLD}Available devices:${NC}"
    echo ""
    for i in $(seq 0 $((count - 1))); do
        echo -e "    ${BOLD}$((i + 1))${NC})  ${dev_labels[$i]}"
    done
    echo ""

    local choice
    while true; do
        echo -ne "  ${CYAN}Select device [1-$count]:${NC} "
        read -r choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$count" ]; then
            break
        fi
        warn "Invalid choice. Enter a number between 1 and $count."
    done

    local idx=$((choice - 1))
    PICKED_DEVICE_TYPE="${dev_types[$idx]}"
    PICKED_DEVICE_ID="${dev_ids[$idx]}"
    PICKED_DEVICE_NAME="${dev_names[$idx]}"
    echo ""
    ok "Selected: ${BOLD}$PICKED_DEVICE_NAME${NC}"
}

# ─── Device Deploy (with provisioning fallback) ────────────────────────────
strip_entitlements() {
    log "Stripping Associated Domains & Push Notifications from entitlements..."
    cp "$ENTITLEMENTS_FILE" "${ENTITLEMENTS_FILE}.bak"
    /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.associated-domains" "$ENTITLEMENTS_FILE" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$ENTITLEMENTS_FILE" 2>/dev/null || true
    if [ -f "$NOTIF_ENTITLEMENTS_FILE" ]; then
        cp "$NOTIF_ENTITLEMENTS_FILE" "${NOTIF_ENTITLEMENTS_FILE}.bak"
        /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$NOTIF_ENTITLEMENTS_FILE" 2>/dev/null || true
    fi
    # Remove final .app, the .xcent derived from entitlements (so Xcode regenerates it from
    # the stripped source), and build.db — keeps all .o intermediates for a fast re-link (~30s vs ~3min)
    local strip_product="$APP_NAME"
    [ "$CONFIGURATION" = "Debug" ] && strip_product="$APP_NAME Dev"
    rm -rf "$DERIVED_DATA/Products/$CONFIGURATION-iphoneos/$strip_product.app" 2>/dev/null || true
    rm -f "$DERIVED_DATA/Intermediates.noindex/Meeshy.build/$CONFIGURATION-iphoneos/Meeshy.build/Meeshy.app.xcent" 2>/dev/null || true
    rm -f "$DERIVED_DATA/Intermediates.noindex/XCBuildData/build.db" 2>/dev/null || true
    # NOTE: Do NOT delete provisioning profiles — they contain the registered device UDID.
    # Deleting them forces Xcode to re-download, which can fail silently and leave the
    # app unsigned. The .xcent removal above is sufficient to force re-signing.
    ok "Entitlements stripped (backup at ${ENTITLEMENTS_FILE}.bak)"
}

restore_entitlements() {
    if [ -f "${ENTITLEMENTS_FILE}.bak" ]; then
        mv "${ENTITLEMENTS_FILE}.bak" "$ENTITLEMENTS_FILE"
    fi
    if [ -f "${NOTIF_ENTITLEMENTS_FILE}.bak" ]; then
        mv "${NOTIF_ENTITLEMENTS_FILE}.bak" "$NOTIF_ENTITLEMENTS_FILE"
    fi
    ok "Entitlements restored"
}

do_device_deploy() {
    detect_physical_device
    do_device_deploy_only
}

do_device_deploy_only() {
    # Aligned with do_build (sim): wait for concurrent builds, share SPM cache
    # with Xcode GUI, fail loud on stale slice. Otherwise a parallel
    # meeshy.sh run can corrupt $DERIVED_DATA's shared module cache while we're
    # building for device, and the device install ships an inconsistent .app.
    wait_for_existing_build

    # XcodeGen sets PRODUCT_NAME = $(TARGET_NAME) for every configuration
    # (project.yml deliberately leaves PRODUCT_NAME unset), so the product is
    # "Meeshy.app" for both Debug and Release. The legacy "Meeshy Dev" name came
    # from Configuration/Debug.xcconfig, which is NOT wired into the generated
    # project (no configFiles: key) and therefore has no effect.
    local device_app_path="$DERIVED_DATA/Products/$CONFIGURATION-iphoneos/$APP_NAME.app"
    local build_log="/tmp/meeshy_device_build_$$.log"

    local ncpu
    ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

    [ "${#XCODE_PKG_FLAGS[@]}" -gt 0 ] && log "Using Xcode package cache: ${XCODE_PKG_CACHE##*/}"

    # NOTE: Entitlement stripping removed — paid Apple Developer account now active.
    # Associated Domains, Push Notifications, etc. are fully supported.

    log "Building for ${BOLD}$PHYSICAL_DEVICE_NAME${NC}..."
    local build_start
    build_start=$(date +%s)

    set +e
    xcodebuild \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "platform=iOS,name=$PHYSICAL_DEVICE_NAME" \
        -derivedDataPath "$DERIVED_DATA" \
        "${XCODE_PKG_FLAGS[@]}" \
        -allowProvisioningUpdates \
        -allowProvisioningDeviceRegistration \
        -skipPackagePluginValidation \
        -skipMacroValidation \
        -jobs "$ncpu" \
        ONLY_ACTIVE_ARCH=YES \
        DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
        CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION=YES \
        build >"$build_log" 2>&1
    local build_rc=$?
    set -e

    if [ "$build_rc" -ne 0 ]; then
        err "Build FAILED"
        grep -E "error:|BUILD FAILED" "$build_log" | grep -v "IDEFoundation\|Xcode3Core\|DVTFoundation\|dylib\|Entitlements file.*modified" | head -30 || tail -20 "$build_log"
        cp "$build_log" /tmp/meeshy_device_last_failure.log
        err "Full log: /tmp/meeshy_device_last_failure.log"
        rm -f "$build_log"
        exit 1
    fi

    # Surface warnings even on success so we know what the compiler is unhappy about.
    grep -E "warning:" "$build_log" | grep -v "IDEFoundation\|Xcode3Core\|DVTFoundation" | head -10 | while IFS= read -r line; do
        warn "$line"
    done || true

    rm -f "$build_log"
    ok "Build succeeded"

    # ── Install on device ──
    if [ ! -d "$device_app_path" ]; then
        err "App bundle not found at: $device_app_path"
        exit 1
    fi

    # Anti-stale guard: bundle must be newer than build start, otherwise
    # xcodebuild was a no-op and we'd ship an old .app to the device.
    local app_mtime
    app_mtime=$(stat -f "%m" "$device_app_path" 2>/dev/null || echo 0)
    if [ "$app_mtime" -lt "$build_start" ]; then
        err "App bundle is older than build start ($(date -r "$app_mtime" +%H:%M:%S) < $(date -r "$build_start" +%H:%M:%S)) — xcodebuild produced no new artifact. Stale slice would be installed."
        err "Try: ./meeshy.sh clean && ./meeshy.sh device"
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

}

# ─── Simulator Detection ────────────────────────────────────────────────────
detect_simulator() {
    # For macOS "Designed for iPad" — no simulator needed
    if [ "$PLATFORM" = "mac" ]; then
        DEVICE_ID="mac"
        DEVICE_NAME="My Mac (Designed for iPad)"
        ok "Target: ${BOLD}$DEVICE_NAME${NC}"
        return 0
    fi

    local device_family="iPhone"
    [ "$PLATFORM" = "ipad" ] && device_family="iPad"

    # Priority 1: Already booted device of the right family
    local booted
    booted=$(xcrun simctl list devices | grep -E "$device_family.*\(Booted\)" | head -n 1 || true)
    if [ -n "$booted" ]; then
        DEVICE_ID=$(echo "$booted" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
        DEVICE_NAME=$(echo "$booted" | sed 's/ (.*//' | xargs)
        ok "Booted: ${BOLD}$DEVICE_NAME${NC}"
        return 0
    fi

    # Priority 2: Any available device of the right family (prefer Pro models)
    local available
    available=$(xcrun simctl list devices available | grep -E "$device_family" | grep -v "unavailable" || true)
    if [ -z "$available" ]; then
        err "No $device_family simulators found. Install via Xcode > Settings > Platforms."
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
    # macOS — no simulator to boot
    if [ "$PLATFORM" = "mac" ]; then
        return 0
    fi

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
    if [ "$PLATFORM" = "mac" ]; then
        pgrep -f "/Wrapper/$APP_NAME.app/$APP_NAME" >/dev/null 2>&1
    else
        xcrun simctl spawn "$DEVICE_ID" launchctl list 2>/dev/null | grep -q "$BUNDLE_ID" 2>/dev/null
    fi
}

app_path() {
    # XcodeGen sets PRODUCT_NAME = $(TARGET_NAME) for every configuration, so
    # both Debug and Release produce "Meeshy.app". The old "Meeshy Dev.app"
    # name lived in Configuration/Debug.xcconfig, which the generated project
    # never references — see do_device_deploy_only for the same rationale.
    if [ "$PLATFORM" = "mac" ]; then
        # "Designed for iPad" (the only valid macOS slice — SUPPORTS_MACCATALYST=0
        # by design) builds an iOS bundle under Debug-iphoneos, NOT a Mac Catalyst
        # app under Debug-maccatalyst. See build_destination() for the rationale.
        echo "$DERIVED_DATA/Products/$CONFIGURATION-iphoneos/$APP_NAME.app"
    else
        echo "$DERIVED_DATA/Products/$CONFIGURATION-iphonesimulator/$APP_NAME.app"
    fi
}

# ─── Build Guard (wait or kill existing builds) ─────────────────────────────
is_build_running() {
    # Match only meeshy.sh builds (uses -derivedDataPath), not Xcode GUI builds
    pgrep -f "xcodebuild.*-derivedDataPath.*$DERIVED_DATA" >/dev/null 2>&1
}

kill_all_builds() {
    log "Killing all xcodebuild processes..."
    pkill -f "xcodebuild" 2>/dev/null || true
    sleep 2
    # Verify killed
    if pgrep -f "xcodebuild" >/dev/null 2>&1; then
        warn "Processes still alive, sending SIGKILL..."
        pkill -9 -f "xcodebuild" 2>/dev/null || true
        sleep 1
    fi
    if pgrep -f "xcodebuild" >/dev/null 2>&1; then
        err "Failed to kill all xcodebuild processes"
        exit 1
    fi
    ok "All xcodebuild processes killed"
}

wait_for_existing_build() {
    if ! is_build_running; then
        return 0
    fi

    warn "A build is already in progress. Waiting..."

    # Phase 1: every 10s, 5 checks
    local check=0
    while [ "$check" -lt 5 ]; do
        sleep 10
        check=$((check + 1))
        if ! is_build_running; then
            ok "Previous build finished (after ${check}x10s)"
            return 0
        fi
        log "Still building... (10s check $check/5)"
    done

    # Phase 2: every 30s, 10 checks
    warn "Switching to 30s polling..."
    check=0
    while [ "$check" -lt 10 ]; do
        sleep 30
        check=$((check + 1))
        if ! is_build_running; then
            ok "Previous build finished (after 30s check $check/10)"
            return 0
        fi
        log "Still building... (30s check $check/10)"
    done

    # Phase 3: every 60s, 5 checks — if all fail, kill
    warn "Switching to 60s polling (will force-kill after 5 failures)..."
    check=0
    while [ "$check" -lt 5 ]; do
        sleep 60
        check=$((check + 1))
        if ! is_build_running; then
            ok "Previous build finished (after 60s check $check/5)"
            return 0
        fi
        warn "Still building after 60s check $check/5"
    done

    # All 3 x 60s checks failed — force kill
    err "Build stuck for too long. Force-killing..."
    kill_all_builds
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
        # SPM cache: clear manifests/artifacts but KEEP repositories (clones like GRDB are expensive)
        local spm_cache=~/Library/Caches/org.swift.swiftpm
        if [ -d "$spm_cache" ]; then
            find "$spm_cache" -maxdepth 1 -mindepth 1 ! -name "repositories" -exec rm -rf {} +
            ok "SPM cache cleared (repositories preserved)"
        fi
        rm -rf ~/Library/Caches/com.apple.dt.Xcode
        ok "Deep clean done (global caches cleared)"
    else
        ok "Clean done"
    fi
}

build_destination() {
    case "$PLATFORM" in
        mac)
            # "Designed for iPad" is the only valid macOS destination (project has
            # SUPPORTS_MACCATALYST=0). NB: this builds an iOS bundle that the Mac
            # runs via the iOS-on-Mac runtime — it is NOT a Mac `.app` and cannot
            # be launched by `open` from the CLI. Use Xcode (⌘R on "My Mac") to
            # launch, or enable Mac Catalyst project-wide for a CLI-launchable app.
            echo "platform=macOS,arch=arm64,variant=Designed for iPad"
            ;;
        *)
            echo "id=$DEVICE_ID"
            ;;
    esac
}

do_build() {
    wait_for_existing_build

    if [ "$CLEAN" = true ]; then
        do_clean
    fi

    log "Building ${BOLD}$SCHEME${NC} ($CONFIGURATION) for ${BOLD}$DEVICE_NAME${NC}..."
    local build_start
    build_start=$(date +%s)

    [ "${#XCODE_PKG_FLAGS[@]}" -gt 0 ] && log "Using Xcode package cache: ${XCODE_PKG_CACHE##*/}"

    local mac_flags=()
    if [ "$PLATFORM" = "mac" ]; then
        # NB: no SUPPORTS_MACCATALYST=YES here — the project is SUPPORTS_MACCATALYST=0
        # by design (native calls are gated on isiOSAppOnMac), so the macOS build is
        # an iOS "Designed for iPad" bundle. Forcing Catalyst would break that path
        # and is a no-op against the Designed-for-iPad destination anyway.
        mac_flags=(
            CODE_SIGN_IDENTITY=-
            CODE_SIGNING_REQUIRED=NO
            CODE_SIGNING_ALLOWED=NO
        )
    fi

    # Full log file (same pattern as do_device_deploy_only) so silent failures
    # are visible. -quiet was hiding compile errors that didn't match the
    # error:/warning:/BUILD FAILED regex, causing do_install to ship an old .app.
    local build_log="/tmp/meeshy_sim_build_$$.log"

    set +e
    xcodebuild \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "$(build_destination)" \
        -derivedDataPath "$DERIVED_DATA" \
        "${XCODE_PKG_FLAGS[@]}" \
        "${mac_flags[@]}" \
        CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION=YES \
        build >"$build_log" 2>&1
    local status=$?
    set -e

    local build_end
    build_end=$(date +%s)
    local duration=$((build_end - build_start))

    if [ "$status" -ne 0 ]; then
        err "Build FAILED after ${duration}s"
        grep -E "error:|BUILD FAILED" "$build_log" | grep -v "IDEFoundation\|Xcode3Core\|DVTFoundation\|dylib\|Entitlements file.*modified" | head -30 || tail -20 "$build_log"
        cp "$build_log" /tmp/meeshy_sim_last_failure.log
        err "Full log: /tmp/meeshy_sim_last_failure.log"
        rm -f "$build_log"
        exit 1
    fi

    # Surface warnings even on success so we know what the compiler is unhappy about.
    grep -E "warning:" "$build_log" | grep -v "IDEFoundation\|Xcode3Core\|DVTFoundation" | head -10 | while IFS= read -r line; do
        warn "$line"
    done || true

    rm -f "$build_log"
    ok "Build succeeded in ${BOLD}${duration}s${NC}"

    # Verify .app — must be fresher than the build started, otherwise xcodebuild
    # was a no-op against a stale slice and do_install would ship the old bundle.
    if [ ! -d "$(app_path)" ]; then
        err "App bundle not found at: $(app_path)"
        exit 1
    fi
    local app_mtime
    app_mtime=$(stat -f "%m" "$(app_path)" 2>/dev/null || echo 0)
    if [ "$app_mtime" -lt "$build_start" ]; then
        err "App bundle is older than build start ($(date -r "$app_mtime" +%H:%M:%S) < $(date -r "$build_start" +%H:%M:%S)) — xcodebuild produced no new artifact. Stale slice would be installed."
        err "Try: ./meeshy.sh clean && ./meeshy.sh run"
        exit 1
    fi

    # Sign every dylib + the app bundle ad-hoc. iOS 26 simulators refuse to
    # launch unsigned binaries with a misleading SBMainWorkspace denial.
    # Plain `xcodebuild build` for the simulator destination ships unsigned
    # debug dylibs (Meeshy Dev.debug.dylib, MeeshyWidgets.debug.dylib, …)
    # and dyld blows up on first launch with "Trying to load an unsigned
    # library". Doing it here means every `meeshy.sh build/run/restart`
    # produces a launchable bundle.
    if [ "$PLATFORM" != "mac" ]; then
        find "$(app_path)" -name "*.dylib" -exec codesign --sign - --force {} \; 2>/dev/null
        codesign --sign - --force --deep "$(app_path)" 2>/dev/null
    fi
}

do_install() {
    if [ "$PLATFORM" = "mac" ]; then
        ok "macOS app — no install step needed"
        return 0
    fi
    log "Installing..."
    xcrun simctl install "$DEVICE_ID" "$(app_path)"
    ok "Installed"
}

do_launch() {
    if [ "$PLATFORM" = "mac" ]; then
        # A "Designed for iPad" build is an iOS bundle (LSRequiresIPhoneOS=true)
        # that macOS refuses to launch from the CLI ("incorrect executable
        # format"). Mac Catalyst would be CLI-launchable but is off the table —
        # the native call subsystem is gated on isiOSAppOnMac. So we build here
        # and hand off to Xcode for the actual launch.
        warn "macOS \"Designed for iPad\" bundles cannot be launched from the CLI."
        log "Launch from Xcode: select ${BOLD}My Mac (Designed for iPad)${NC}, then press ${BOLD}⌘R${NC}."
        log "Bundle: ${BOLD}$(app_path)${NC}"
        log "Stream the running app's logs with: ${BOLD}./meeshy.sh logs --mac${NC}"
        return 0
    fi

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

    if [ "$PLATFORM" = "mac" ]; then
        # Stream logs from the local Mac process
        log stream \
            --level debug \
            --predicate "process == \"$APP_NAME\" OR process == \"$APP_NAME Dev\"" \
            2>&1 | tee -a "$LOGFILE" &
    else
        xcrun simctl spawn "$DEVICE_ID" log stream \
            --level debug \
            --predicate "process == \"$APP_NAME\"" \
            2>&1 | tee -a "$LOGFILE" &
    fi
    LOG_STREAM_PID=$!
}

start_crash_monitor() {
    (
        while true; do
            sleep 5
            if [ "$PLATFORM" = "mac" ]; then
                if ! pgrep -f "/Wrapper/$APP_NAME.app/$APP_NAME" >/dev/null 2>&1; then
                    echo ""
                    err "App appears to have crashed or been terminated."
                    err "Check logs at: $LOGFILE"
                    break
                fi
            else
                local running
                running=$(xcrun simctl spawn "$DEVICE_ID" launchctl list 2>/dev/null | grep "$BUNDLE_ID" || true)
                if [ -z "$running" ]; then
                    echo ""
                    err "App appears to have crashed or been terminated."
                    err "Check logs at: $LOGFILE"
                    break
                fi
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

# ─── Release Check (mirror Xcode Cloud) ─────────────────────────────────────
# Catches Release/-O/-whole-module-optimization compiler regressions BEFORE
# Xcode Cloud archives. Uses the project's own Release config — never override
# SWIFT_VERSION / SWIFT_OPTIMIZATION_LEVEL via CLI (it would force settings on
# SwiftPM packages like GRDB/Starscream that are not Swift 6 ready and break
# them; Xcode Cloud doesn't do this either).
do_release_check() {
    log "Release check — mirror Xcode Cloud archive optimizer (no signing)"

    local check_derived="$DERIVED_DATA/ReleaseCheck"
    mkdir -p "$check_derived"

    log "Project Release settings :"
    xcodebuild -showBuildSettings -project "$PROJECT" -scheme "$SCHEME" -configuration Release 2>/dev/null \
        | grep -E "^\s+(SWIFT_OPTIMIZATION_LEVEL|SWIFT_COMPILATION_MODE|SWIFT_VERSION) =" \
        | sed 's/^/    /' || true

    log "Building Release for generic iOS (this exercises -O -wmo)…"
    [ "${#XCODE_PKG_FLAGS[@]}" -gt 0 ] && log "Using Xcode package cache: ${XCODE_PKG_CACHE##*/}"
    set +e
    xcodebuild \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration Release \
        -destination 'generic/platform=iOS' \
        -derivedDataPath "$check_derived" \
        "${XCODE_PKG_FLAGS[@]}" \
        -skipPackagePluginValidation \
        -skipMacroValidation \
        CODE_SIGNING_ALLOWED=NO \
        CODE_SIGNING_REQUIRED=NO \
        build 2>&1 \
        | tee "$check_derived/build.log" \
        | grep -E "error:|warning:.*deprecated|PLEASE submit|Stack dump|Command SwiftCompile failed|\*\* BUILD" \
        | head -40
    local rc=${PIPESTATUS[0]}
    set -e

    echo ""
    if [ "$rc" -eq 0 ]; then
        ok "Release check PASSED — Xcode Cloud archive should compile cleanly"
        return 0
    else
        err "Release check FAILED (exit $rc) — full log: $check_derived/build.log"
        echo ""
        echo -e "  ${DIM}If the failure is a swift-frontend crash on a generic class deinit,${NC}"
        echo -e "  ${DIM}see memory/feedback_swift_632_generic_class_deinit_crash.md${NC}"
        return "$rc"
    fi
}

# ─── Release (fastlane → TestFlight / App Store) ─────────────────────────────
# Uploads a Release build to App Store Connect via fastlane, bypassing Xcode
# Cloud entirely. Useful when Xcode Cloud's "Prepare Build for App Store
# Connect" step fails to authenticate (e.g. missing API key in workflow,
# unsigned agreements, app record not yet created).
#
# Uses the ASC API Key checked into the repo at fastlane/AuthKey_5542B6LVNL.p8
# (matching the credentials in fastlane/Fastfile). The .p8 is gitignored in
# production environments — adjust ASC_KEY_FILEPATH below if you rotate keys.
#
# Default: TestFlight (fastlane beta).
# Flag    --appstore : full App Store submission (fastlane release).
# Flag    --skip-tests : skip the unit-test pre-flight run.
do_release() {
    local lane="beta"
    local lane_label="TestFlight"
    [ "${RELEASE_TARGET:-testflight}" = "appstore" ] && { lane="release"; lane_label="App Store"; }

    local key_file="$(pwd)/fastlane/AuthKey_5542B6LVNL.p8"
    if [ ! -f "$key_file" ]; then
        err "ASC API Key missing: $key_file"
        err "Drop the .p8 file there or rotate the key via App Store Connect → Users → Integrations → App Store Connect API"
        return 1
    fi

    # Prefer `bundle exec` for reproducibility (CI parity). Fall back to a
    # globally installed fastlane when bundler can't resolve the locked gems on
    # this machine — e.g. macOS system Ruby against a Gemfile.lock pinned for
    # another platform (the global fastlane/cocoapods already match the lock).
    # NB: `bundle check` is a false positive here (a binary gem present for the
    # wrong arch satisfies it), so we probe the real `bundle exec` resolution.
    local -a fastlane_runner
    if command -v bundle >/dev/null 2>&1 && [ ! -f "Gemfile.lock" ]; then
        log "Bundle install (first-time setup)…"
        bundle install || return 1
        fastlane_runner=(bundle exec fastlane)
    elif command -v bundle >/dev/null 2>&1 && bundle exec ruby -e 'exit 0' >/dev/null 2>&1; then
        fastlane_runner=(bundle exec fastlane)
    elif command -v fastlane >/dev/null 2>&1; then
        warn "Bundler can't resolve the locked gems here → using the global fastlane."
        fastlane_runner=(fastlane)
    else
        err "No usable fastlane. Fix bundler (cd apps/ios && bundle install) or run: gem install fastlane"
        return 1
    fi

    # Match needs MATCH_PASSWORD to decrypt the certificates Git repo. The password
    # was chosen the first time `fastlane match init` ran. We accept it via :
    #   1. MATCH_PASSWORD env var (already supported by fastlane itself)
    #   2. apps/ios/.env file with MATCH_PASSWORD=… (sourced here if present)
    #   3. macOS keychain entry "fastlane-match" (auto-discovered by fastlane match)
    if [ -z "${MATCH_PASSWORD:-}" ] && [ -f ".env" ]; then
        # shellcheck disable=SC1091
        set -a; source .env; set +a
    fi
    if [ -z "${MATCH_PASSWORD:-}" ] && ! security find-generic-password -l "fastlane-match" >/dev/null 2>&1; then
        err "MATCH_PASSWORD is unset and the keychain has no 'fastlane-match' entry."
        echo ""
        echo -e "  ${DIM}fastlane match needs the password chosen at 'fastlane match init' time.${NC}"
        echo -e "  ${DIM}Options :${NC}"
        echo -e "  ${DIM}  1. Pass inline      :${NC} MATCH_PASSWORD=xxx ./meeshy.sh release"
        echo -e "  ${DIM}  2. Store in .env    :${NC} echo 'MATCH_PASSWORD=xxx' >> apps/ios/.env"
        echo -e "  ${DIM}  3. Save to keychain :${NC} cd apps/ios && bundle exec fastlane match appstore --readonly  ${DIM}(prompts once)${NC}"
        echo -e "  ${DIM}  4. Lost the password:${NC} cd apps/ios && bundle exec fastlane match nuke distribution ${DIM}+ recreate (irreversible)${NC}"
        return 1
    fi

    log "Release → $lane_label via fastlane (lane: $lane)"
    log "ASC API Key : $(basename "$key_file") (key_id from Fastfile: 5542B6LVNL)"
    [ -n "${MATCH_PASSWORD:-}" ] && log "MATCH_PASSWORD : sourced (env or .env)"

    local fastlane_args=()
    [ "${SKIP_TESTS:-}" = "true" ] && fastlane_args+=("skip_tests:true")
    [ -n "${RELEASE_CHANGELOG:-}" ] && fastlane_args+=("changelog:${RELEASE_CHANGELOG}")
    [ -n "${RELEASE_VERSION:-}" ] && fastlane_args+=("version:${RELEASE_VERSION}")

    echo ""
    warn "This will : sync certificates · build Release IPA (~15 min) · upload to $lane_label"
    echo ""

    ASC_KEY_FILEPATH="${ASC_KEY_FILEPATH:-$key_file}" \
    ASC_KEY_ID="${ASC_KEY_ID:-5542B6LVNL}" \
    ASC_ISSUER_ID="${ASC_ISSUER_ID:-69a6de89-ae7a-47e3-e053-5b8c7c11a4d1}" \
        "${fastlane_runner[@]}" "$lane" "${fastlane_args[@]}"
    local rc=$?

    echo ""
    if [ "$rc" -eq 0 ]; then
        ok "Release to $lane_label SUCCEEDED"
    else
        err "Release to $lane_label FAILED (exit $rc)"
        echo ""
        echo -e "  ${DIM}Common failures :${NC}"
        echo -e "  ${DIM} - 'Failed to authenticate' → key revoked or expired ; create new one in ASC${NC}"
        echo -e "  ${DIM} - 'App not found' → register me.meeshy.app in App Store Connect → My Apps first${NC}"
        echo -e "  ${DIM} - 'Agreements pending' → sign in ASC → Agreements, Tax, and Banking${NC}"
        echo -e "  ${DIM} - Match certificate errors → ./meeshy.sh release with fresh keychain${NC}"
    fi
    return "$rc"
}

# ─── Archive + IPA ───────────────────────────────────────────────────────────
do_archive() {
    local archive_config="${CONFIGURATION:-Release}"
    [ "$archive_config" = "Debug" ] && archive_config="Release"

    log "Resolving package dependencies..."
    [ "${#XCODE_PKG_FLAGS[@]}" -gt 0 ] && log "Using Xcode package cache: ${XCODE_PKG_CACHE##*/}"
    xcodebuild -resolvePackageDependencies -project "$PROJECT" "${XCODE_PKG_FLAGS[@]}" 2>/dev/null
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
        "${XCODE_PKG_FLAGS[@]}" \
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

# ─── Distribute (App Store / TestFlight) ─────────────────────────────────────
# Automatically handles:
#   B1: CODE_SIGN_IDENTITY → "Apple Distribution"
#   B2: aps-environment   → "production"
do_distribute() {
    local dist_config="Release"
    local dist_method="${EXPORT_METHOD:-app-store}"

    echo ""
    echo -e "${BOLD}${CYAN}  Meeshy iOS — App Store Distribution Build${NC}"
    echo ""

    # ── Pre-flight checks ──
    log "Running pre-flight checks..."

    # Verify GoogleService-Info.plist exists (required for Firebase)
    if [ ! -f "Meeshy/GoogleService-Info.plist" ]; then
        err "GoogleService-Info.plist is MISSING."
        err "Create it: Firebase Console → meeshy-me → Add iOS app (me.meeshy.app) → Download plist"
        err "Place it in: apps/ios/Meeshy/GoogleService-Info.plist"
        exit 1
    fi
    ok "GoogleService-Info.plist found"

    # Verify Info.plist has ITSAppUsesNonExemptEncryption
    if ! /usr/libexec/PlistBuddy -c "Print :ITSAppUsesNonExemptEncryption" "Meeshy/Info.plist" &>/dev/null; then
        err "ITSAppUsesNonExemptEncryption missing from Info.plist"
        exit 1
    fi
    ok "Export compliance key present"

    # Verify no empty privacy descriptions
    local privacy_keys=(
        "NSCameraUsageDescription"
        "NSMicrophoneUsageDescription"
        "NSContactsUsageDescription"
        "NSPhotoLibraryUsageDescription"
        "NSPhotoLibraryAddUsageDescription"
        "NSLocationWhenInUseUsageDescription"
        "NSFaceIDUsageDescription"
        "NSSpeechRecognitionUsageDescription"
        "NSVoIPUsageDescription"
    )
    local has_empty=false
    for key in "${privacy_keys[@]}"; do
        local val
        val=$(/usr/libexec/PlistBuddy -c "Print :$key" "Meeshy/Info.plist" 2>/dev/null || echo "__MISSING__")
        if [ "$val" = "" ]; then
            err "Empty privacy description: $key"
            has_empty=true
        fi
    done
    if [ "$has_empty" = true ]; then
        err "Fix empty privacy descriptions before distributing."
        exit 1
    fi
    ok "All privacy descriptions valid"

    # ── B2: Switch aps-environment to production ──
    log "Setting aps-environment to production..."
    cp "$ENTITLEMENTS_FILE" "${ENTITLEMENTS_FILE}.dist-bak"
    /usr/libexec/PlistBuddy -c "Set :aps-environment production" "$ENTITLEMENTS_FILE"
    if [ -f "$NOTIF_ENTITLEMENTS_FILE" ]; then
        cp "$NOTIF_ENTITLEMENTS_FILE" "${NOTIF_ENTITLEMENTS_FILE}.dist-bak"
        /usr/libexec/PlistBuddy -c "Set :aps-environment production" "$NOTIF_ENTITLEMENTS_FILE" 2>/dev/null || true
    fi
    ok "aps-environment → production"

    # Restore entitlements on exit (even on failure)
    restore_dist_entitlements() {
        if [ -f "${ENTITLEMENTS_FILE}.dist-bak" ]; then
            mv "${ENTITLEMENTS_FILE}.dist-bak" "$ENTITLEMENTS_FILE"
        fi
        if [ -f "${NOTIF_ENTITLEMENTS_FILE}.dist-bak" ]; then
            mv "${NOTIF_ENTITLEMENTS_FILE}.dist-bak" "$NOTIF_ENTITLEMENTS_FILE"
        fi
        ok "Entitlements restored to development"
    }
    trap restore_dist_entitlements EXIT

    # ── Clean previous distribution artifacts ──
    log "Cleaning previous distribution artifacts..."
    mkdir -p "$DERIVED_DATA/Distribution"
    rm -rf "$DERIVED_DATA/Distribution"/*

    # ── Resolve dependencies ──
    log "Resolving package dependencies..."
    [ "${#XCODE_PKG_FLAGS[@]}" -gt 0 ] && log "Using Xcode package cache: ${XCODE_PKG_CACHE##*/}"
    xcodebuild -resolvePackageDependencies -project "$PROJECT" "${XCODE_PKG_FLAGS[@]}" 2>/dev/null
    ok "Dependencies resolved"

    # ── Archive with distribution signing (B1) ──
    local archive_path="$DERIVED_DATA/Distribution/$APP_NAME.xcarchive"

    log "Archiving for distribution ($dist_config)..."
    local archive_log="/tmp/meeshy_distribute_archive_$$.log"

    set +e
    xcodebuild archive \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$dist_config" \
        -archivePath "$archive_path" \
        -destination "generic/platform=iOS" \
        "${XCODE_PKG_FLAGS[@]}" \
        -allowProvisioningUpdates \
        ONLY_ACTIVE_ARCH=NO \
        CODE_SIGN_STYLE=Automatic \
        CODE_SIGN_IDENTITY="Apple Distribution" \
        2>&1 | tee "$archive_log" | if command -v xcpretty &>/dev/null; then xcpretty; else cat; fi
    local archive_rc=${PIPESTATUS[0]}
    set -e

    if [ "$archive_rc" -ne 0 ] || [ ! -d "$archive_path" ]; then
        err "Archive FAILED"
        grep -E "error:" "$archive_log" | head -20 || tail -20 "$archive_log"
        rm -f "$archive_log"
        exit 1
    fi
    rm -f "$archive_log"
    ok "Archive created: $archive_path"

    # ── Export IPA ──
    log "Exporting IPA (method: $dist_method)..."
    local export_opts="$DERIVED_DATA/Distribution/ExportOptions.plist"
    cat > "$export_opts" << EOXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>$dist_method</string>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
EOXML

    local export_path="$DERIVED_DATA/Distribution/IPA"
    set +e
    xcodebuild -exportArchive \
        -archivePath "$archive_path" \
        -exportPath "$export_path" \
        -exportOptionsPlist "$export_opts" \
        -allowProvisioningUpdates \
        2>&1 | if command -v xcpretty &>/dev/null; then xcpretty; else cat; fi
    local export_rc=${PIPESTATUS[0]}
    set -e

    if [ "$export_rc" -ne 0 ]; then
        err "IPA export failed"
        exit 1
    fi

    local ipa_file
    ipa_file=$(find "$export_path" -name "*.ipa" -type f 2>/dev/null | head -1)
    if [ -z "$ipa_file" ] || [ ! -f "$ipa_file" ]; then
        err "IPA file not found after export"
        exit 1
    fi

    local ipa_size
    ipa_size=$(du -h "$ipa_file" | cut -f1)

    # ── Restore entitlements ──
    restore_dist_entitlements
    trap - EXIT

    echo ""
    echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${GREEN}${BOLD}  Distribution build complete!${NC}"
    echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BOLD}IPA:${NC}     $ipa_file"
    echo -e "  ${BOLD}Size:${NC}    $ipa_size"
    echo -e "  ${BOLD}Method:${NC}  $dist_method"
    echo ""
    echo -e "  ${CYAN}Upload to App Store Connect:${NC}"
    echo -e "    ${DIM}xcrun altool --upload-app -f \"$ipa_file\" -t ios --apiKey <KEY> --apiIssuer <ISSUER>${NC}"
    echo -e "    ${DIM}-- or use Transporter.app / Xcode Organizer${NC}"
    echo ""
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
        -derivedDataPath "$DERIVED_DATA" \
        "${XCODE_PKG_FLAGS[@]}" \
        -enableCodeCoverage "$([ "$COVERAGE" = true ] && echo YES || echo NO)" \
        -resultBundlePath "$TEST_OUTPUT_DIR/unit-tests.xcresult" \
        -only-testing:MeeshyTests \
        -skip-testing:MeeshyTests/MessageListPerformanceTests \
        -skip-testing:MeeshyTests/BubbleSimpleMessagePerfTests \
        -skip-testing:MeeshyTests/SearchPerformanceTests \
        2>&1 | if command -v xcpretty &>/dev/null; then xcpretty --test --color; else cat; fi

    ok "Unit tests completed"

    if [ "$UI_TESTS" = true ]; then
        log "Running UI tests..."
        xcodebuild test \
            -project "$PROJECT" \
            -scheme "$SCHEME" \
            -destination "$destination" \
            -configuration Debug \
            -derivedDataPath "$DERIVED_DATA" \
            "${XCODE_PKG_FLAGS[@]}" \
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

    # Resolve SPM deps — share Xcode GUI cache when present so we don't re-clone.
    log "Resolving Swift Package dependencies..."
    xcodebuild -resolvePackageDependencies -project "$PROJECT" "${XCODE_PKG_FLAGS[@]}"
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
    echo -e "    ${GREEN}release-check${NC} Mirror Xcode Cloud Release build locally ${DIM}(catch -O/-wmo crashes before push)${NC}"
    echo -e "    ${GREEN}release${NC}      Upload to TestFlight via fastlane ${DIM}(--appstore for App Store submission)${NC}"
    echo -e "    ${GREEN}distribute${NC}   App Store build ${DIM}(auto: signing, aps-environment, preflight)${NC}"
    echo -e "    ${GREEN}test${NC}         Run unit tests ${DIM}(add --ui for UI tests)${NC}"
    echo -e "    ${GREEN}setup${NC}        Check/install dev dependencies"
    echo -e "    ${GREEN}device${NC}       Pick a device (simulator or physical) and deploy ${DIM}(interactive)${NC}"
    echo -e "    ${GREEN}screenshot${NC}   Take simulator screenshot"
    echo ""
    echo -e "  ${BOLD}Platform:${NC}"
    echo -e "    ${YELLOW}--iphone${NC}                 iPhone simulator ${DIM}(default)${NC}"
    echo -e "    ${YELLOW}--ipad${NC}                   iPad simulator"
    echo -e "    ${YELLOW}--mac, --macos${NC}            macOS (Designed for iPad — build only, launch via Xcode)"
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
    echo -e "    ${DIM}./meeshy.sh${NC}                          ${DIM}# Build + run iPhone sim + logs${NC}"
    echo -e "    ${DIM}./meeshy.sh run --ipad${NC}               ${DIM}# Build + run iPad sim + logs${NC}"
    echo -e "    ${DIM}./meeshy.sh run --mac${NC}                ${DIM}# Build macOS app (then launch via Xcode ⌘R)${NC}"
    echo -e "    ${DIM}./meeshy.sh run --clean${NC}              ${DIM}# Clean build + run${NC}"
    echo -e "    ${DIM}./meeshy.sh build --release${NC}          ${DIM}# Release build only${NC}"
    echo -e "    ${DIM}./meeshy.sh build --ipad${NC}             ${DIM}# Build for iPad sim${NC}"
    echo -e "    ${DIM}./meeshy.sh archive -m ad-hoc${NC}        ${DIM}# Ad-hoc IPA${NC}"
    echo -e "    ${DIM}./meeshy.sh release-check${NC}            ${DIM}# Mirror Xcode Cloud Release build (no signing)${NC}"
    echo -e "    ${DIM}./meeshy.sh release${NC}                  ${DIM}# Upload Release to TestFlight via fastlane${NC}"
    echo -e "    ${DIM}./meeshy.sh release --appstore${NC}       ${DIM}# Submit to App Store via fastlane${NC}"
    echo -e "    ${DIM}./meeshy.sh release --skip-tests${NC}     ${DIM}# TestFlight upload without pre-flight tests${NC}"
    echo -e "    ${DIM}./meeshy.sh distribute${NC}               ${DIM}# App Store / TestFlight build${NC}"
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
    run|build|stop|restart|logs|status|clean|archive|release-check|release|distribute|test|setup|screenshot|device|help|-h|--help)
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
        --testflight)     RELEASE_TARGET="testflight"; shift ;;
        --appstore)       RELEASE_TARGET="appstore"; shift ;;
        --skip-tests)     SKIP_TESTS=true; shift ;;
        --changelog)      RELEASE_CHANGELOG="$2"; shift 2 ;;
        --version)        RELEASE_VERSION="$2"; shift 2 ;;
        -c|--configuration) CONFIGURATION="$2"; shift 2 ;;
        -m|--method)      EXPORT_METHOD="$2"; shift 2 ;;
        --ui)             UI_TESTS=true; shift ;;
        --coverage)       COVERAGE=true; shift ;;
        --deep)           DEEP_CLEAN=true; shift ;;
        --iphone)         PLATFORM="iphone"; shift ;;
        --ipad)           PLATFORM="ipad"; shift ;;
        --mac|--macos)    PLATFORM="mac"; shift ;;
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
        platform_label="iOS"
        [ "$PLATFORM" = "ipad" ] && platform_label="iPadOS"
        [ "$PLATFORM" = "mac" ] && platform_label="macOS"
        echo -e "${BOLD}${CYAN}  Meeshy $platform_label Build & Run${NC}"
        echo ""
        detect_simulator
        ensure_booted
        do_build
        do_install
        do_launch
        echo ""
        if [ "$PLATFORM" = "mac" ]; then
            # Nothing was CLI-launched (see do_launch) — don't monitor a process
            # that isn't running. Logs become available once the app is launched
            # from Xcode: ./meeshy.sh logs --mac
            ok "Build ready. Launch via Xcode (⌘R on \"My Mac (Designed for iPad)\")."
        elif [ -t 1 ]; then
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
        if [ "$PLATFORM" = "mac" ]; then
            pkill -f "/Wrapper/$APP_NAME.app/$APP_NAME" 2>/dev/null || true
        else
            xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
        fi
        ok "App stopped"
        ;;

    restart)
        detect_simulator
        ensure_booted
        log "Stopping $APP_NAME..."
        if [ "$PLATFORM" = "mac" ]; then
            pkill -f "/Wrapper/$APP_NAME.app/$APP_NAME" 2>/dev/null || true
        else
            xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null || true
        fi
        sleep 1
        do_build
        do_install
        do_launch
        echo ""
        if [ "$PLATFORM" = "mac" ]; then
            ok "Build ready. Launch via Xcode (⌘R on \"My Mac (Designed for iPad)\")."
        elif [ -t 1 ]; then
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

    release-check)
        do_release_check
        ;;

    release)
        do_release
        ;;

    distribute)
        do_distribute
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
        pick_device

        if [ "$PICKED_DEVICE_TYPE" = "physical" ]; then
            # Route to physical device deploy
            PHYSICAL_DEVICE_ID="$PICKED_DEVICE_ID"
            PHYSICAL_DEVICE_NAME="$PICKED_DEVICE_NAME"
            do_device_deploy_only
        else
            # Route to simulator deploy
            DEVICE_ID="$PICKED_DEVICE_ID"
            DEVICE_NAME="$PICKED_DEVICE_NAME"
            ensure_booted
            do_build
            do_install
            do_launch
            echo ""
            ok "App deployed to simulator ${BOLD}$DEVICE_NAME${NC}"
        fi
        ;;
esac
