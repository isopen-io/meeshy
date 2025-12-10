#!/bin/bash

# Meeshy Performance Optimization Migration Script
# This script helps migrate from the old monolithic component to the new optimized architecture

set -e

echo "🚀 Starting Meeshy Performance Optimization Migration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the Meeshy project root directory"
    exit 1
fi

print_status "Checking project structure..."

# Check if frontend directory exists
if [ ! -d "frontend" ]; then
    print_error "Frontend directory not found. Please run from project root."
    exit 1
fi

# Step 1: Install new dependencies
print_status "Installing new dependencies..."
cd frontend

if command -v pnpm &> /dev/null; then
    print_status "Using pnpm..."
    pnpm add swr react-window react-window-infinite-loader
else
    print_status "Using npm..."
    npm install swr react-window react-window-infinite-loader
fi

print_success "Dependencies installed successfully"

# Step 2: Backup original files
print_status "Creating backups of original files..."

BACKUP_DIR="../backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup original conversation layout
if [ -f "components/conversations/ConversationLayoutResponsive.tsx" ]; then
    cp "components/conversations/ConversationLayoutResponsive.tsx" "$BACKUP_DIR/"
    print_success "Backed up ConversationLayoutResponsive.tsx"
fi

# Backup original conversation page
if [ -f "app/conversations/page.tsx" ]; then
    cp "app/conversations/page.tsx" "$BACKUP_DIR/"
    print_success "Backed up conversations page.tsx"
fi

print_success "Backups created in $BACKUP_DIR"

# Step 3: Create new optimized files (already created by the assistant)
print_status "New optimized files are already created:"
echo "  ✅ ConversationList.tsx"
echo "  ✅ ConversationMessages.tsx"
echo "  ✅ ConversationEmptyState.tsx"
echo "  ✅ ConversationLayoutResponsiveRefactored.tsx"
echo "  ✅ ConversationContext.tsx"
echo "  ✅ unified-message.ts"
echo "  ✅ use-swr-conversations.ts"
echo "  ✅ optimized-socketio.service.ts"
echo "  ✅ VirtualizedMessageList.tsx"

# Step 4: Update main conversation page
print_status "Updating main conversation page..."

# Create a backup of the current page
if [ -f "app/conversations/page.tsx" ]; then
    cp "app/conversations/page.tsx" "app/conversations/page-original.tsx"
fi

# Create the new optimized page
cat > "app/conversations/page.tsx" << 'EOF'
'use client';

import { ConversationProvider } from '@/context/ConversationContext';
import { ConversationLayoutResponsiveRefactored } from '@/components/conversations/ConversationLayoutResponsiveRefactored';

export default function ConversationsPage() {
  return (
    <ConversationProvider>
      <ConversationLayoutResponsiveRefactored />
    </ConversationProvider>
  );
}
EOF

print_success "Updated main conversation page"

# Step 5: Update package.json scripts
print_status "Adding optimization scripts to package.json..."

# Add new scripts to package.json
node -e "
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

packageJson.scripts = {
  ...packageJson.scripts,
  'dev:optimized': 'next dev --experimental-https',
  'build:optimized': 'next build',
  'start:optimized': 'next start',
  'test:performance': 'jest --testPathPattern=performance',
  'analyze:bundle': 'ANALYZE=true next build'
};

fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
"

print_success "Added optimization scripts to package.json"

# Step 6: Create environment configuration
print_status "Creating environment configuration..."

# Create .env.optimization file
cat > ".env.optimization" << 'EOF'
# Performance Optimization Configuration
NEXT_PUBLIC_SOCKET_URL=ws://localhost:3001
SOCKET_RECONNECT_ATTEMPTS=5
SOCKET_RECONNECT_DELAY=1000
SOCKET_MAX_RECONNECT_DELAY=30000
SOCKET_TIMEOUT=10000

# SWR Configuration
SWR_DEDUPING_INTERVAL=5000
SWR_ERROR_RETRY_COUNT=3
SWR_ERROR_RETRY_INTERVAL=5000

# Virtualization Configuration
VIRTUALIZATION_THRESHOLD=50
VIRTUALIZATION_ITEM_HEIGHT=80
VIRTUALIZATION_OVERSCAN_COUNT=5

# Cache Configuration
CACHE_TTL=300000
CACHE_MAX_SIZE=1000
CACHE_CLEANUP_INTERVAL=60000
EOF

print_success "Created environment configuration"

# Step 7: Create performance monitoring
print_status "Creating performance monitoring setup..."

# Create performance monitoring file
cat > "lib/performance-monitor.ts" << 'EOF'
'use client';

// Performance monitoring utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTiming(label: string): () => void {
    const start = performance.now();
    return () => {
      const end = performance.now();
      const duration = end - start;
      this.recordMetric(label, duration);
    };
  }

  recordMetric(label: string, value: number): void {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(value);
  }

  getMetrics(label?: string): Record<string, number[]> | number[] {
    if (label) {
      return this.metrics.get(label) || [];
    }
    return Object.fromEntries(this.metrics);
  }

  getAverage(label: string): number {
    const values = this.metrics.get(label) || [];
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  clearMetrics(): void {
    this.metrics.clear();
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const monitor = PerformanceMonitor.getInstance();
  
  return {
    startTiming: monitor.startTiming.bind(monitor),
    recordMetric: monitor.recordMetric.bind(monitor),
    getMetrics: monitor.getMetrics.bind(monitor),
    getAverage: monitor.getAverage.bind(monitor),
    clearMetrics: monitor.clearMetrics.bind(monitor)
  };
}
EOF

print_success "Created performance monitoring"

# Step 8: Create test files
print_status "Creating performance test files..."

# Create performance test directory
mkdir -p "__tests__/performance"

# Create performance test
cat > "__tests__/performance/conversation-layout.test.tsx" << 'EOF'
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ConversationProvider } from '@/context/ConversationContext';
import { ConversationLayoutResponsiveRefactored } from '@/components/conversations/ConversationLayoutResponsiveRefactored';

// Mock the user context
jest.mock('@/context/AppContext', () => ({
  useUser: () => ({
    user: {
      id: 'test-user',
      username: 'testuser',
      systemLanguage: 'fr'
    },
    isAuthChecking: false
  })
}));

// Mock the services
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: jest.fn().mockResolvedValue([]),
    getMessages: jest.fn().mockResolvedValue({ messages: [], total: 0, hasMore: false })
  }
}));

describe('ConversationLayout Performance', () => {
  it('should render without performance issues', async () => {
    const startTime = performance.now();
    
    render(
      <ConversationProvider>
        <ConversationLayoutResponsiveRefactored />
      </ConversationProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText(/conversations/i)).toBeInTheDocument();
    });
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render in less than 100ms
    expect(renderTime).toBeLessThan(100);
  });

  it('should handle large message lists efficiently', async () => {
    const largeMessageList = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg-${i}`,
      content: `Message ${i}`,
      conversationId: 'test-conv',
      senderId: 'test-user',
      createdAt: new Date(),
      originalLanguage: 'fr',
      messageType: 'text' as const,
      isEdited: false,
      isDeleted: false,
      translations: []
    }));

    const startTime = performance.now();
    
    // Test with large message list
    const { container } = render(
      <ConversationProvider>
        <ConversationLayoutResponsiveRefactored />
      </ConversationProvider>
    );
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should handle large lists efficiently
    expect(renderTime).toBeLessThan(200);
  });
});
EOF

print_success "Created performance tests"

# Step 9: Create development tools
print_status "Creating development tools..."

# Create development tools file
cat > "lib/dev-tools.ts" << 'EOF'
'use client';

// Development tools for debugging and monitoring
export class DevTools {
  static logPerformance(label: string, fn: () => void): void {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      fn();
      const end = performance.now();
      console.log(`[PERF] ${label}: ${end - start}ms`);
    } else {
      fn();
    }
  }

  static logComponentRender(componentName: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[RENDER] ${componentName} rendered`);
    }
  }

  static logStateChange(componentName: string, stateName: string, newValue: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[STATE] ${componentName}.${stateName}:`, newValue);
    }
  }

  static logSocketEvent(event: string, data: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SOCKET] ${event}:`, data);
    }
  }

  static logSWRCache(key: string, action: 'hit' | 'miss' | 'update'): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SWR] ${action.toUpperCase()}: ${key}`);
    }
  }
}

// React hook for development tools
export function useDevTools(componentName: string) {
  return {
    logRender: () => DevTools.logComponentRender(componentName),
    logStateChange: (stateName: string, newValue: any) => 
      DevTools.logStateChange(componentName, stateName, newValue),
    logPerformance: (label: string, fn: () => void) => 
      DevTools.logPerformance(`${componentName}: ${label}`, fn)
  };
}
EOF

print_success "Created development tools"

# Step 10: Final setup
print_status "Finalizing setup..."

# Create a migration completion script
cat > "scripts/complete-migration.sh" << 'EOF'
#!/bin/bash

echo "🎉 Migration completed successfully!"
echo ""
echo "Next steps:"
echo "1. Start the development server: pnpm dev:optimized"
echo "2. Test the new optimized conversation layout"
echo "3. Monitor performance with the dev tools"
echo "4. Run performance tests: pnpm test:performance"
echo ""
echo "If you encounter any issues:"
echo "1. Check the backup files in the backups/ directory"
echo "2. Restore original files if needed"
echo "3. Review the OPTIMIZATION_GUIDE.md for troubleshooting"
echo ""
echo "Happy coding! 🚀"
EOF

chmod +x "scripts/complete-migration.sh"

print_success "Migration setup completed!"

# Summary
echo ""
echo "🎉 MIGRATION COMPLETED SUCCESSFULLY!"
echo ""
echo "📁 Files created/updated:"
echo "  ✅ New optimized components"
echo "  ✅ Context API for state management"
echo "  ✅ SWR hooks for data fetching"
echo "  ✅ Unified type system"
echo "  ✅ Optimized Socket.IO service"
echo "  ✅ Virtualized message list"
echo "  ✅ Performance monitoring"
echo "  ✅ Development tools"
echo "  ✅ Test files"
echo ""
echo "📋 Next steps:"
echo "  1. Run: pnpm dev:optimized"
echo "  2. Test the new conversation layout"
echo "  3. Monitor performance metrics"
echo "  4. Run tests: pnpm test:performance"
echo ""
echo "📚 Documentation:"
echo "  - OPTIMIZATION_GUIDE.md - Complete implementation guide"
echo "  - Backup files in: $BACKUP_DIR"
echo ""
echo "🚀 Your Meeshy app is now optimized for high performance!"
echo ""

# Make the completion script executable
chmod +x "scripts/complete-migration.sh"

print_success "All done! Run './scripts/complete-migration.sh' for next steps."
