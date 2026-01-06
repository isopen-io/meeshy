#!/bin/bash

# Meeshy iOS Test Script
# Run unit tests and UI tests

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
DESTINATION="platform=iOS Simulator,name=iPhone 15 Pro,OS=latest"
TEST_OUTPUT_DIR="./test-results"

# Parse arguments
UI_TESTS=false
COVERAGE=false
DEVICE=""

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -u, --ui-tests               Run UI tests"
    echo "  -c, --coverage               Generate code coverage report"
    echo "  -d, --device <name>          Specify simulator device"
    echo "  -h, --help                   Display this help message"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--ui-tests)
            UI_TESTS=true
            shift
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -d|--device)
            DEVICE="$2"
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

# Update destination if device specified
if [ -n "$DEVICE" ]; then
    DESTINATION="platform=iOS Simulator,name=$DEVICE,OS=latest"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Meeshy iOS Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Destination:${NC} $DESTINATION"
echo -e "${GREEN}UI Tests:${NC} $UI_TESTS"
echo -e "${GREEN}Coverage:${NC} $COVERAGE"
echo ""

# Navigate to project directory
cd "$(dirname "$0")/.."

# Create output directory
mkdir -p "$TEST_OUTPUT_DIR"

# Run unit tests
echo -e "${YELLOW}Running unit tests...${NC}"

xcodebuild test \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -destination "$DESTINATION" \
    -configuration Debug \
    -enableCodeCoverage $([ "$COVERAGE" = true ] && echo "YES" || echo "NO") \
    -resultBundlePath "$TEST_OUTPUT_DIR/unit-tests.xcresult" \
    -only-testing:MeeshyTests \
    | xcpretty --test --color

echo -e "${GREEN}Unit tests completed${NC}"
echo ""

# Run UI tests if requested
if [ "$UI_TESTS" = true ]; then
    echo -e "${YELLOW}Running UI tests...${NC}"

    xcodebuild test \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -destination "$DESTINATION" \
        -configuration Debug \
        -resultBundlePath "$TEST_OUTPUT_DIR/ui-tests.xcresult" \
        -only-testing:MeeshyUITests \
        | xcpretty --test --color || true

    echo -e "${GREEN}UI tests completed${NC}"
    echo ""
fi

# Generate coverage report if requested
if [ "$COVERAGE" = true ]; then
    echo -e "${YELLOW}Generating code coverage report...${NC}"

    xcrun xccov view --report "$TEST_OUTPUT_DIR/unit-tests.xcresult" > "$TEST_OUTPUT_DIR/coverage.txt"

    echo -e "${GREEN}Coverage report saved to: $TEST_OUTPUT_DIR/coverage.txt${NC}"
    echo ""

    # Display coverage summary
    echo -e "${BLUE}Coverage Summary:${NC}"
    cat "$TEST_OUTPUT_DIR/coverage.txt" | head -20
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All tests completed!${NC}"
echo -e "${BLUE}========================================${NC}"
