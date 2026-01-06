#!/bin/bash

# Meeshy iOS Clean Script
# Clean derived data, build artifacts, and caches

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Meeshy iOS Clean Script${NC}"
echo -e "${BLUE}========================================${NC}"

# Navigate to project directory
cd "$(dirname "$0")/.."

# Clean DerivedData
echo -e "${YELLOW}Cleaning Xcode DerivedData...${NC}"
rm -rf ~/Library/Developer/Xcode/DerivedData
echo -e "${GREEN}DerivedData cleaned${NC}"

# Clean local build directory
echo -e "${YELLOW}Cleaning local build directory...${NC}"
rm -rf ./build
rm -rf ./DerivedData
echo -e "${GREEN}Local build directory cleaned${NC}"

# Clean test results
echo -e "${YELLOW}Cleaning test results...${NC}"
rm -rf ./test-results
rm -rf ./fastlane/test_output
rm -rf ./fastlane/ui_test_output
echo -e "${GREEN}Test results cleaned${NC}"

# Clean Fastlane build artifacts
echo -e "${YELLOW}Cleaning Fastlane artifacts...${NC}"
rm -rf ./fastlane/report.xml
rm -rf ./fastlane/screenshots
echo -e "${GREEN}Fastlane artifacts cleaned${NC}"

# Clean SPM cache
echo -e "${YELLOW}Cleaning Swift Package Manager cache...${NC}"
rm -rf ./.swiftpm
rm -rf ./.build
echo -e "${GREEN}SPM cache cleaned${NC}"

# Clean Xcode caches
echo -e "${YELLOW}Cleaning Xcode caches...${NC}"
rm -rf ~/Library/Caches/org.swift.swiftpm
rm -rf ~/Library/Caches/com.apple.dt.Xcode
echo -e "${GREEN}Xcode caches cleaned${NC}"

# Reset package caches
echo -e "${YELLOW}Resetting package caches...${NC}"
xcodebuild -resolvePackageDependencies -project Meeshy.xcodeproj
echo -e "${GREEN}Package caches reset${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Clean completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
