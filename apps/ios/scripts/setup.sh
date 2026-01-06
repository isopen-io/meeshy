#!/bin/bash

# Meeshy iOS Setup Script
# Initial setup for development environment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Meeshy iOS Development Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check Xcode installation
echo -e "${YELLOW}Checking Xcode installation...${NC}"
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Xcode is not installed. Please install Xcode from the App Store.${NC}"
    exit 1
fi
XCODE_VERSION=$(xcodebuild -version | head -n 1)
echo -e "${GREEN}$XCODE_VERSION installed${NC}"
echo ""

# Check Ruby installation
echo -e "${YELLOW}Checking Ruby installation...${NC}"
if ! command -v ruby &> /dev/null; then
    echo -e "${RED}Ruby is not installed. Please install Ruby.${NC}"
    exit 1
fi
RUBY_VERSION=$(ruby -v)
echo -e "${GREEN}$RUBY_VERSION${NC}"
echo ""

# Navigate to project directory
cd "$(dirname "$0")/.."

# Install Bundler
echo -e "${YELLOW}Installing Bundler...${NC}"
gem install bundler --conservative
echo -e "${GREEN}Bundler installed${NC}"
echo ""

# Install Fastlane and dependencies
echo -e "${YELLOW}Installing Fastlane and Ruby dependencies...${NC}"
bundle install
echo -e "${GREEN}Fastlane installed${NC}"
echo ""

# Install xcpretty (optional but recommended)
echo -e "${YELLOW}Installing xcpretty...${NC}"
gem install xcpretty --conservative
echo -e "${GREEN}xcpretty installed${NC}"
echo ""

# Check for SwiftLint
echo -e "${YELLOW}Checking SwiftLint installation...${NC}"
if ! command -v swiftlint &> /dev/null; then
    echo -e "${YELLOW}SwiftLint not found. Installing via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
        brew install swiftlint
        echo -e "${GREEN}SwiftLint installed${NC}"
    else
        echo -e "${YELLOW}Homebrew not found. SwiftLint installation skipped.${NC}"
        echo -e "${YELLOW}Install Homebrew from https://brew.sh or install SwiftLint manually.${NC}"
    fi
else
    echo -e "${GREEN}SwiftLint already installed${NC}"
fi
echo ""

# Resolve Swift Package Dependencies
echo -e "${YELLOW}Resolving Swift Package dependencies...${NC}"
xcodebuild -resolvePackageDependencies -project Meeshy.xcodeproj
echo -e "${GREEN}Dependencies resolved${NC}"
echo ""

# Copy environment template
if [ ! -f "fastlane/.env.local" ]; then
    echo -e "${YELLOW}Creating local environment file...${NC}"
    cp fastlane/.env.default fastlane/.env.local
    echo -e "${GREEN}Created fastlane/.env.local${NC}"
    echo -e "${YELLOW}Please update fastlane/.env.local with your credentials${NC}"
else
    echo -e "${GREEN}fastlane/.env.local already exists${NC}"
fi
echo ""

# Make scripts executable
echo -e "${YELLOW}Making scripts executable...${NC}"
chmod +x scripts/*.sh
echo -e "${GREEN}Scripts are now executable${NC}"
echo ""

# Git hooks setup (optional)
if [ -d ".git" ]; then
    echo -e "${YELLOW}Setting up Git hooks...${NC}"
    mkdir -p .git/hooks

    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for Meeshy iOS

# Run SwiftLint
if command -v swiftlint &> /dev/null; then
    echo "Running SwiftLint..."
    cd ios
    swiftlint lint --strict
    if [ $? -ne 0 ]; then
        echo "SwiftLint failed. Please fix the issues before committing."
        exit 1
    fi
fi

exit 0
EOF

    chmod +x .git/hooks/pre-commit
    echo -e "${GREEN}Git hooks configured${NC}"
fi
echo ""

# Display next steps
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Setup completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Update ${BLUE}fastlane/.env.local${NC} with your Apple Developer credentials"
echo -e "2. Configure code signing in Xcode or via ${BLUE}fastlane match${NC}"
echo -e "3. Run ${BLUE}./scripts/build.sh${NC} to build the project"
echo -e "4. Run ${BLUE}./scripts/test.sh${NC} to run tests"
echo ""
echo -e "For more information, see ${BLUE}docs/BUILD_GUIDE.md${NC}"
