#!/bin/bash

# Configuration
SCHEME="Meeshy"
BUNDLE_ID="me.meeshy.ios.app"
BUILD_LOG="/tmp/meeshy_build.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Function to get all available devices (simulators and physical)
get_devices() {
    xcrun xctrace list devices 2>&1 | grep -E "^(iPhone|iPad|Services CEO)" | grep -v "Offline"
}

# Function to find the most recent matching device
find_default_device() {
    local devices=$(get_devices)
    
    # Priority: Physical device > Latest iOS simulator > Any simulator
    
    # 1. Check for physical devices first
    local physical=$(echo "$devices" | grep -v "Simulator" | head -1)
    if [ ! -z "$physical" ]; then
        echo "$physical"
        return
    fi
    
    # 2. Find the latest iOS version simulator
    local latest_sim=$(echo "$devices" | grep "Simulator" | grep "iPhone" | sort -t'(' -k2 -rV | head -1)
    if [ ! -z "$latest_sim" ]; then
        echo "$latest_sim"
        return
    fi
    
    # 3. Fallback to any available device
    echo "$devices" | head -1
}

# Function to extract device ID from device string
extract_device_id() {
    echo "$1" | grep -oE '\([A-F0-9-]{36}\)|\([a-fA-F0-9]{8}-[a-fA-F0-9]{16}\)' | tr -d '()'
}

# Function to detect if device is physical or simulator
is_physical_device() {
    local device_id="$1"
    # Physical devices have 24-character hex IDs (old) or 25-character IDs with dash (new)
    # Simulators have 36-character UUIDs
    if [[ "$device_id" =~ ^[A-F0-9-]{25}$ ]] || [[ "$device_id" =~ ^[A-F0-9]{24}$ ]] || [[ "$device_id" =~ ^[a-f0-9]{40}$ ]]; then
        return 0  # true
    else
        return 1  # false
    fi
}

# Function to build for specific destination
build_app() {
    local device_id="$1"
    local sdk="$2"
    
    print_info "Building $SCHEME for $sdk..."
    
    xcodebuild -scheme "$SCHEME" \
               -sdk "$sdk" \
               -destination "id=$device_id" \
               build 2>&1 | tee "$BUILD_LOG"
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "Build succeeded!"
        return 0
    else
        print_error "Build failed. Check $BUILD_LOG for details."
        tail -20 "$BUILD_LOG"
        return 1
    fi
}

# Function to install and launch on simulator
run_on_simulator() {
    local device_id="$1"
    local app_path="/Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-gpvdznzmvavzzbaacwrgxphoenrk/Build/Products/Debug-iphonesimulator/Meeshy.app"
    
    print_info "Booting simulator if needed..."
    xcrun simctl boot "$device_id" 2>/dev/null || true
    
    print_info "Installing app on simulator..."
    xcrun simctl install "$device_id" "$app_path"
    
    print_info "Launching app..."
    xcrun simctl launch "$device_id" "$BUNDLE_ID"
    
    print_success "App launched on simulator!"
    print_info "Streaming logs (Ctrl+C to stop)..."
    xcrun simctl spawn "$device_id" log stream --predicate 'process == "Meeshy"' --style compact
}

# Function to install and launch on physical device
run_on_device() {
    local device_id="$1"
    local app_path="/Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-gpvdznzmvavzzbaacwrgxphoenrk/Build/Products/Debug-iphoneos/Meeshy.app"
    
    print_info "Installing app on device..."
    xcrun devicectl device install app --device "$device_id" "$app_path"
    
    if [ $? -eq 0 ]; then
        print_success "App installed successfully!"
        print_warning "Please launch the app manually from your device's home screen."
        print_info "If the app doesn't launch, go to Settings → General → VPN & Device Management"
        print_info "and trust the developer profile."
    else
        print_error "Installation failed."
        return 1
    fi
}

# Interactive mode
interactive_mode() {
    print_info "Available devices:"
    echo ""
    
    local devices=$(get_devices)
    local device_array=()
    local index=1
    
    while IFS= read -r device; do
        device_array+=("$device")
        local device_id=$(extract_device_id "$device")
        local device_type="Simulator"
        if is_physical_device "$device_id"; then
            device_type="${GREEN}Physical Device${NC}"
        fi
        echo -e "  ${BLUE}$index${NC}) $device (${device_type})"
        ((index++))
    done <<< "$devices"
    
    echo ""
    read -p "Select device number (or press Enter for default): " selection
    
    if [ -z "$selection" ]; then
        local default_device=$(find_default_device)
        print_info "Using default device: $default_device"
        selected_device="$default_device"
    else
        selected_device="${device_array[$((selection-1))]}"
    fi
    
    if [ -z "$selected_device" ]; then
        print_error "Invalid selection"
        exit 1
    fi
    
    run_on_selected_device "$selected_device"
}

# Function to run on selected device
run_on_selected_device() {
    local device="$1"
    local device_id=$(extract_device_id "$device")
    
    print_info "Selected: $device"
    print_info "Device ID: $device_id"
    
    if is_physical_device "$device_id"; then
        print_info "Detected physical device"
        build_app "$device_id" "iphoneos" || exit 1
        run_on_device "$device_id"
    else
        print_info "Detected simulator"
        build_app "$device_id" "iphonesimulator" || exit 1
        run_on_simulator "$device_id"
    fi
}

# Main script
main() {
    echo ""
    print_info "🚀 Meeshy iOS Runner"
    echo ""
    
    if [ $# -eq 0 ]; then
        # No arguments - use default device
        local default_device=$(find_default_device)
        if [ -z "$default_device" ]; then
            print_error "No devices found"
            exit 1
        fi
        
        print_info "No device specified, using default: $default_device"
        run_on_selected_device "$default_device"
        
    elif [ "$1" == "-i" ] || [ "$1" == "--interactive" ]; then
        # Interactive mode
        interactive_mode
        
    else
        # Device ID provided as argument
        local device_id="$1"
        
        # Find the full device name from ID
        local device=$(get_devices | grep "$device_id")
        
        if [ -z "$device" ]; then
            print_error "Device with ID '$device_id' not found"
            print_info "Available devices:"
            get_devices
            exit 1
        fi
        
        run_on_selected_device "$device"
    fi
}

# Run main function
main "$@"
