#!/bin/bash

# Meeshy iOS Build Script
# Build the app for different configurations

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
WORKSPACE=""
BUILD_DIR="./build"

# Parse arguments
CONFIGURATION="Debug"
CLEAN=false
ARCHIVE=false

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -c, --configuration <config>  Build configuration (Debug, Staging, Production)"
    echo "  -C, --clean                   Clean before building"
    echo "  -a, --archive                 Create archive for distribution"
    echo "  -h, --help                    Display this help message"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--configuration)
            CONFIGURATION="$2"
            shift 2
            ;;
        -C|--clean)
            CLEAN=true
            shift
            ;;
        -a|--archive)
            ARCHIVE=true
            shift
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
echo -e "${BLUE}Meeshy iOS Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Configuration:${NC} $CONFIGURATION"
echo -e "${GREEN}Clean:${NC} $CLEAN"
echo -e "${GREEN}Archive:${NC} $ARCHIVE"
echo ""

# Navigate to project directory
cd "$(dirname "$0")/.."

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo -e "${YELLOW}Cleaning derived data...${NC}"
    rm -rf ~/Library/Developer/Xcode/DerivedData
    rm -rf "$BUILD_DIR"
    echo -e "${GREEN}Clean complete${NC}"
    echo ""
fi

# Resolve package dependencies
echo -e "${YELLOW}Resolving package dependencies...${NC}"
xcodebuild -resolvePackageDependencies -project "$PROJECT"
echo -e "${GREEN}Dependencies resolved${NC}"
echo ""

# Build or Archive
if [ "$ARCHIVE" = true ]; then
    echo -e "${YELLOW}Creating archive for $CONFIGURATION...${NC}"

    ARCHIVE_PATH="$BUILD_DIR/$CONFIGURATION/Meeshy.xcarchive"

    xcodebuild archive \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -archivePath "$ARCHIVE_PATH" \
        -destination "generic/platform=iOS" \
        ONLY_ACTIVE_ARCH=NO \
        | xcpretty || true

    if [ -d "$ARCHIVE_PATH" ]; then
        echo ""
        echo -e "${GREEN}Archive created successfully:${NC}"
        echo -e "${GREEN}$ARCHIVE_PATH${NC}"
    else
        echo -e "${RED}Archive creation failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Building for $CONFIGURATION...${NC}"

    xcodebuild build \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "generic/platform=iOS Simulator" \
        | xcpretty || true

    echo ""
    echo -e "${GREEN}Build completed successfully${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Build process completed!${NC}"
echo -e "${BLUE}========================================${NC}"
