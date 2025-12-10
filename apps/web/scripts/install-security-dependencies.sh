#!/bin/bash

###############################################################################
# Security Dependencies Installation Script
# Installs all required dependencies for security improvements
#
# Usage: ./scripts/install-security-dependencies.sh
#
# @version 1.0.0
# @author Meeshy Security Team
###############################################################################

set -e

echo "🔒 Installing Security & Quality Dependencies..."
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm not found. Installing pnpm...${NC}"
    npm install -g pnpm
fi

echo -e "${BLUE}📦 Installing production dependencies...${NC}"
echo ""

# Production dependencies
pnpm add isomorphic-dompurify@^2.9.0 \
         zod@^3.22.4 \
         react-window@^1.8.10 \
         react-virtualized-auto-sizer@^1.0.24 \
         use-debounce@^10.0.0 \
         sonner@^1.3.1

echo ""
echo -e "${BLUE}📦 Installing development dependencies...${NC}"
echo ""

# Development dependencies
pnpm add -D @types/dompurify@^3.0.5 \
            @types/react-window@^1.8.8 \
            vitest@^1.0.4 \
            @vitest/ui@^1.0.4 \
            @testing-library/react@^14.1.2 \
            @testing-library/jest-dom@^6.1.5 \
            @testing-library/user-event@^14.5.1 \
            jest-axe@^8.0.0 \
            @axe-core/react@^4.8.2 \
            @storybook/react@^7.6.3 \
            @storybook/addon-essentials@^7.6.3 \
            @storybook/addon-a11y@^7.6.3

echo ""
echo -e "${GREEN}✅ Dependencies installed successfully!${NC}"
echo ""

# Print summary
echo "📋 Summary of installed packages:"
echo "================================="
echo ""
echo "🔐 Security:"
echo "  - isomorphic-dompurify@^2.9.0 (XSS protection)"
echo "  - zod@^3.22.4 (Runtime validation)"
echo ""
echo "⚡ Performance:"
echo "  - react-window@^1.8.10 (Virtualization)"
echo "  - react-virtualized-auto-sizer@^1.0.24 (Auto sizing)"
echo "  - use-debounce@^10.0.0 (Debouncing)"
echo ""
echo "🧪 Testing:"
echo "  - vitest@^1.0.4 (Test runner)"
echo "  - @testing-library/react@^14.1.2 (React testing)"
echo "  - jest-axe@^8.0.0 (Accessibility testing)"
echo "  - @axe-core/react@^4.8.2 (a11y auditing)"
echo ""
echo "📚 Documentation:"
echo "  - @storybook/react@^7.6.3 (Component documentation)"
echo "  - @storybook/addon-a11y@^7.6.3 (Accessibility addon)"
echo ""

# Check if vitest config exists
if [ ! -f "vitest.config.ts" ]; then
    echo -e "${YELLOW}⚠️  vitest.config.ts not found. Creating default configuration...${NC}"
    cat > vitest.config.ts <<EOF
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.{js,ts}',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
EOF
    echo -e "${GREEN}✅ Created vitest.config.ts${NC}"
fi

# Check if test setup exists
if [ ! -f "tests/setup.ts" ]; then
    echo -e "${YELLOW}⚠️  tests/setup.ts not found. Creating...${NC}"
    mkdir -p tests
    cat > tests/setup.ts <<EOF
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() { return []; }
  unobserve() {}
} as any;
EOF
    echo -e "${GREEN}✅ Created tests/setup.ts${NC}"
fi

# Update package.json scripts
echo ""
echo -e "${BLUE}📝 Updating package.json scripts...${NC}"

# Check if jq is installed (for JSON manipulation)
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not found. Please manually add these scripts to package.json:${NC}"
    echo ""
    echo '  "scripts": {'
    echo '    "test": "vitest",'
    echo '    "test:ui": "vitest --ui",'
    echo '    "test:coverage": "vitest --coverage",'
    echo '    "test:a11y": "vitest --run tests/**/*.a11y.test.{ts,tsx}",'
    echo '    "storybook": "storybook dev -p 6006",'
    echo '    "build-storybook": "storybook build"'
    echo '  }'
else
    # Add scripts to package.json
    jq '.scripts += {
      "test": "vitest",
      "test:ui": "vitest --ui",
      "test:coverage": "vitest --coverage",
      "test:a11y": "vitest --run tests/**/*.a11y.test.{ts,tsx}",
      "storybook": "storybook dev -p 6006",
      "build-storybook": "storybook build"
    }' package.json > package.json.tmp && mv package.json.tmp package.json

    echo -e "${GREEN}✅ Updated package.json scripts${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Installation complete!${NC}"
echo ""
echo "Next steps:"
echo "==========="
echo "1. Review the changes in package.json"
echo "2. Run 'pnpm test' to verify test setup"
echo "3. Integrate security utilities into your code"
echo "4. Follow README_FRONTEND_IMPROVEMENTS.md for integration guide"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "  - README_FRONTEND_IMPROVEMENTS.md"
echo "  - utils/secure-storage.ts"
echo "  - utils/xss-protection.ts"
echo "  - utils/socket-validator.ts"
echo ""
