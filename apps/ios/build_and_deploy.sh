#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCHEME="Meeshy"
BUNDLE_ID="com.meeshy.app"
SIMULATOR_NAME="iPhone 16 Pro"
SIMULATOR_OS="18.0"

# Change to script directory
cd "$(dirname "$0")"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Meeshy iOS Build & Deploy${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Step 1: Generate project with XcodeGen
echo -e "\n${YELLOW}📦 Step 1: Generating Xcode project...${NC}"
if ! command -v xcodegen &> /dev/null; then
    echo -e "${RED}❌ xcodegen not found. Install with: brew install xcodegen${NC}"
    exit 1
fi
xcodegen generate --quiet
echo -e "${GREEN}✅ Project generated${NC}"

# Step 2: Find simulator
echo -e "\n${YELLOW}📱 Step 2: Finding simulator...${NC}"

# First try to find a booted simulator
SIMULATOR_ID=$(xcrun simctl list devices available | grep "$SIMULATOR_NAME" | grep "Booted" | head -1 | sed -n 's/.*(\([A-F0-9-]*\)) .*/\1/p')

# If no booted simulator, find any available one
if [ -z "$SIMULATOR_ID" ]; then
    SIMULATOR_ID=$(xcrun simctl list devices available | grep "$SIMULATOR_NAME" | head -1 | sed -n 's/.*(\([A-F0-9-]*\)) .*/\1/p')
fi

if [ -z "$SIMULATOR_ID" ]; then
    echo -e "${RED}❌ No simulator found matching '$SIMULATOR_NAME'${NC}"
    echo -e "${YELLOW}Available simulators:${NC}"
    xcrun simctl list devices available | grep -i "iphone" | head -10
    exit 1
fi

echo -e "${GREEN}✅ Found simulator: $SIMULATOR_NAME ($SIMULATOR_ID)${NC}"

# Step 3: Build
echo -e "\n${YELLOW}🔨 Step 3: Building app...${NC}"
BUILD_START=$(date +%s)

xcodebuild \
    -project Meeshy.xcodeproj \
    -scheme "$SCHEME" \
    -destination "id=$SIMULATOR_ID" \
    -configuration Debug \
    build \
    -quiet \
    2>&1 | grep -E "(error:|warning:)" || true

# Check if build succeeded
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))
echo -e "${GREEN}✅ Build succeeded in ${BUILD_TIME}s${NC}"

# Step 4: Boot simulator
echo -e "\n${YELLOW}📲 Step 4: Booting simulator...${NC}"
BOOT_STATUS=$(xcrun simctl list devices | grep "$SIMULATOR_ID" | grep -o "(Booted)" || true)
if [ -z "$BOOT_STATUS" ]; then
    xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || true
    echo -e "${GREEN}✅ Simulator booted${NC}"
else
    echo -e "${GREEN}✅ Simulator already running${NC}"
fi

# Open Simulator app
open -a Simulator

# Wait for simulator to be ready
sleep 2

# Step 5: Install app
echo -e "\n${YELLOW}📥 Step 5: Installing app...${NC}"
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "Meeshy.app" -path "*/Debug-iphonesimulator/*" -type d 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
    echo -e "${RED}❌ App bundle not found in DerivedData${NC}"
    exit 1
fi

xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"
echo -e "${GREEN}✅ App installed${NC}"

# Step 6: Launch app
echo -e "\n${YELLOW}🎯 Step 6: Launching app...${NC}"

# Kill any existing instance first
xcrun simctl terminate "$SIMULATOR_ID" "$BUNDLE_ID" 2>/dev/null || true
sleep 1

# Try to launch with retry
LAUNCH_ATTEMPTS=3
for i in $(seq 1 $LAUNCH_ATTEMPTS); do
    if xcrun simctl launch "$SIMULATOR_ID" "$BUNDLE_ID" 2>/dev/null; then
        echo -e "${GREEN}✅ App launched${NC}"
        break
    else
        if [ $i -lt $LAUNCH_ATTEMPTS ]; then
            echo -e "${YELLOW}⚠️  Launch attempt $i failed, retrying...${NC}"
            sleep 2
        else
            echo -e "${YELLOW}⚠️  Auto-launch failed. App installed - launch manually from simulator.${NC}"
        fi
    fi
done

# Done
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
