#!/bin/bash

# Meeshy iOS Archive Script
# Create production archive and IPA for distribution

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT="Meeshy.xcodeproj"
SCHEME="Meeshy"
BUILD_DIR="./build"

# Parse arguments
CONFIGURATION="Release"
EXPORT_METHOD="app-store"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -c, --configuration <config>  Build configuration (Debug, Release)"
    echo "  -m, --method <method>         Export method (app-store, ad-hoc, development)"
    echo "  -h, --help                    Display this help message"
    echo ""
    echo "Examples:"
    echo "  $0                            # Release for App Store"
    echo "  $0 -c Debug -m development    # Debug for development"
    echo "  $0 -c Release -m ad-hoc       # Release for ad-hoc distribution"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--configuration)
            CONFIGURATION="$2"
            shift 2
            ;;
        -m|--method)
            EXPORT_METHOD="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Meeshy iOS Archive Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Configuration:${NC} $CONFIGURATION"
echo -e "${GREEN}Export Method:${NC} $EXPORT_METHOD"
echo ""

# Set app name based on configuration
if [[ "$CONFIGURATION" == "Release" ]]; then
    APP_NAME="Meeshy"
else
    APP_NAME="Meeshy-Dev"
fi
echo -e "${GREEN}App Name:${NC} $APP_NAME"
echo ""

# Navigate to project directory
cd "$(dirname "$0")/.."

# Create build directory
mkdir -p "$BUILD_DIR/$CONFIGURATION"

# Clean
echo -e "${YELLOW}Cleaning previous builds...${NC}"
rm -rf "$BUILD_DIR/$CONFIGURATION"/*
echo -e "${GREEN}Clean complete${NC}"
echo ""

# Resolve dependencies
echo -e "${YELLOW}Resolving package dependencies...${NC}"
xcodebuild -resolvePackageDependencies -project "$PROJECT"
echo -e "${GREEN}Dependencies resolved${NC}"
echo ""

# Archive
ARCHIVE_PATH="$BUILD_DIR/$CONFIGURATION/$APP_NAME.xcarchive"

echo -e "${YELLOW}Creating archive...${NC}"
xcodebuild archive \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -archivePath "$ARCHIVE_PATH" \
    -destination "generic/platform=iOS" \
    ONLY_ACTIVE_ARCH=NO \
    | xcpretty

if [ ! -d "$ARCHIVE_PATH" ]; then
    echo -e "${RED}Archive creation failed${NC}"
    exit 1
fi

echo -e "${GREEN}Archive created successfully${NC}"
echo ""

# Export IPA
echo -e "${YELLOW}Exporting IPA...${NC}"

# Create export options plist
EXPORT_OPTIONS_PATH="$BUILD_DIR/$CONFIGURATION/ExportOptions.plist"

cat > "$EXPORT_OPTIONS_PATH" << EOF
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
EOF

EXPORT_PATH="$BUILD_DIR/$CONFIGURATION/IPA"

xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PATH" \
    | xcpretty

# Find the exported IPA (name may vary)
IPA_FILE=$(find "$EXPORT_PATH" -name "*.ipa" -type f | head -1)

if [ -z "$IPA_FILE" ] || [ ! -f "$IPA_FILE" ]; then
    echo -e "${RED}IPA export failed - no IPA file found${NC}"
    exit 1
fi

echo -e "${GREEN}IPA exported successfully${NC}"
echo ""

# Display results
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Archive and IPA created successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Archive:${NC} $ARCHIVE_PATH"
echo -e "${GREEN}IPA:${NC} $IPA_FILE"
echo ""

# Display IPA size
IPA_SIZE=$(du -h "$IPA_FILE" | cut -f1)
echo -e "${GREEN}IPA Size:${NC} $IPA_SIZE"
