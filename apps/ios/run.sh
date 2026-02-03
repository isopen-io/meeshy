#!/bin/bash
set -e

# Change to the directory of the script
cd "$(dirname "$0")"

echo "🚀 Generating Project..."
if ! command -v xcodegen &> /dev/null; then
    echo "❌ xcodegen could not be found. Please install it (brew install xcodegen)"
    exit 1
fi

xcodegen generate

echo "📱 Building Meeshy V2..."
# Use -quiet to reduce noise, unless it fails
xcodebuild -scheme Meeshy -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build -quiet

echo "✅ Build Complete!"
echo "📂 Opening Xcode..."
open Meeshy.xcodeproj
