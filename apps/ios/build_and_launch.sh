#!/bin/bash
set -e
cd "$(dirname "$0")"

# 1. Generate Project
echo "🛠️  Generating Xcode Project..."
xcodegen generate

# 2. Build for Simulator
echo "📱 Building for iPhone 16 Pro (iOS 26.0)..."
# We define derived data path to easily find the .app later
xcodebuild -scheme Meeshy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=26.0' \
  -derivedDataPath build \
  -quiet \
  build

APP_PATH="build/Build/Products/Debug-iphonesimulator/Meeshy.app"
BUNDLE_ID="com.meeshy.app"

# 3. Find Device ID
# Try to find an iPhone 16 Pro on iOS 26.0
DEVICE_ID=$(xcrun simctl list devices "iOS 26.0" | grep "iPhone 16 Pro (" | head -n 1 | grep -oE '[0-9A-F-]{36}')

if [ -z "$DEVICE_ID" ]; then
    echo "⚠️  iPhone 16 Pro on iOS 26.0 not found, searching specifically..."
    # Fallback search
    DEVICE_ID="A4BD175B-8E4E-4A93-805D-DCEAE2D57793"
fi

echo "🎯 Targeting Simulator ID: $DEVICE_ID"

# 4. Boot Simulator
echo "🚀 Booting Simulator..."
xcrun simctl boot "$DEVICE_ID" || true # Ignore if already booted

# 5. Install App
echo "📦 Installing App..."
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

# 6. Launch App
echo "✨ Launching Meeshy V2..."
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID"

echo "✅ Done! App is running in the simulator."
