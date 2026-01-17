# Bundle Analysis Guide

## Overview

This project uses `@next/bundle-analyzer` to analyze JavaScript bundle sizes and identify optimization opportunities. The analyzer helps detect issues like barrel file imports, duplicated dependencies, and oversized modules.

## Quick Start

### Running Bundle Analysis

```bash
# From the web app directory
cd apps/web
npm run analyze

# Or from monorepo root using pnpm
pnpm --filter=@meeshy/web analyze
```

This will:
1. Build the application with analysis enabled
2. Generate interactive HTML reports
3. Automatically open two browser windows:
   - **Client Bundle Analysis** - Shows what users download
   - **Server Bundle Analysis** - Shows server-side code

### Understanding the Reports

The bundle analyzer creates a treemap visualization where:
- **Box size** represents the actual size of each module
- **Colors** distinguish different packages/modules
- **Nested boxes** show module dependencies
- **Hover** to see exact sizes (stat, parsed, gzipped)

## Key Metrics

### Size Categories

| Category | Stat Size | Parsed Size | Gzipped Size |
|----------|-----------|-------------|--------------|
| **Excellent** | < 200 KB | < 100 KB | < 30 KB |
| **Good** | 200-400 KB | 100-200 KB | 30-50 KB |
| **Warning** | 400-800 KB | 200-400 KB | 50-100 KB |
| **Critical** | > 800 KB | > 400 KB | > 100 KB |

### What to Look For

1. **Large Individual Modules** (> 50 KB)
   - Check if the module is actually needed
   - Look for tree-shaking opportunities
   - Consider code splitting or lazy loading

2. **Duplicated Dependencies**
   - Multiple versions of the same package
   - Same code bundled in multiple chunks
   - Opportunity for deduplication

3. **Barrel File Imports** (🚨 HIGH PRIORITY)
   - Imports from index files that pull in unused code
   - See "Known Barrel File Issues" section below

## Known Barrel File Issues

Based on our codebase analysis, the following barrel file imports add **150-200 KB of unused code**:

### Critical Barrel Files to Avoid

```typescript
// ❌ BAD - Imports entire barrel file
import { Button } from '@/components/ui'
import { useConversation } from '@/hooks'
import { formatDate } from '@/lib/utils'

// ✅ GOOD - Direct imports
import { Button } from '@/components/ui/button'
import { useConversation } from '@/hooks/use-conversation'
import { formatDate } from '@/lib/utils/date-format'
```

### High-Impact Barrel Files

| Barrel File | Estimated Overhead | Fix Priority |
|-------------|-------------------|--------------|
| `@/components/ui/index.ts` | 50-80 KB | 🔴 Critical |
| `@/hooks/index.ts` | 30-50 KB | 🔴 Critical |
| `@/lib/utils/index.ts` | 20-30 KB | 🟡 High |
| `@/components/index.ts` | 15-25 KB | 🟡 High |
| `@/types/index.ts` | 10-15 KB | 🟢 Medium |

### Component-Specific Issues

**UI Components (`@/components/ui/index.ts`)**
```typescript
// This file exports 40+ components
// Importing one component pulls in all 40

// ❌ Imports ~80 KB of unused Radix UI components
import { Dialog } from '@/components/ui'

// ✅ Imports only ~5 KB
import { Dialog } from '@/components/ui/dialog'
```

**Hooks (`@/hooks/index.ts`)**
```typescript
// ❌ Pulls in 30+ hooks with their dependencies
import { useAuth } from '@/hooks'

// ✅ Only imports what you need
import { useAuth } from '@/hooks/use-auth'
```

**Utility Functions (`@/lib/utils/index.ts`)**
```typescript
// ❌ Imports date-fns, lodash, and other heavy dependencies
import { formatDate } from '@/lib/utils'

// ✅ Only imports date-fns
import { formatDate } from '@/lib/utils/date-format'
```

## Optimization Workflow

### 1. Identify Issues

Run the analyzer and look for:
- Large modules in the main bundle
- Code that should be lazy-loaded
- Third-party packages that seem oversized

### 2. Investigate Root Cause

For large modules:
```bash
# Check all imports of a specific module
cd apps/web
grep -r "from '@/components/ui'" --include="*.ts" --include="*.tsx"

# Check barrel file contents
cat components/ui/index.ts
```

### 3. Apply Fixes

**Fix 1: Replace Barrel Imports**
```typescript
// Before
import { Button, Dialog, Input } from '@/components/ui'

// After
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
```

**Fix 2: Code Splitting**
```typescript
// Lazy load heavy components
const PDFViewer = dynamic(() => import('@/components/pdf/PDFViewer'), {
  ssr: false,
  loading: () => <Skeleton />
})
```

**Fix 3: Tree-Shaking Configuration**
```typescript
// next.config.ts
experimental: {
  optimizePackageImports: [
    'lucide-react',
    '@radix-ui/react-icons',
    'date-fns', // Add packages that support tree-shaking
  ],
}
```

### 4. Verify Impact

```bash
# Run analysis before changes
npm run analyze
# Note the bundle sizes

# Make your changes

# Run analysis again
npm run analyze
# Compare the sizes
```

## Bundle Size Thresholds

### Per-Route Targets

| Route Type | Initial JS | Total JS | FCP Target |
|------------|-----------|----------|------------|
| Marketing pages | < 150 KB | < 300 KB | < 1.8s |
| Dashboard | < 200 KB | < 400 KB | < 2.5s |
| Conversation view | < 250 KB | < 500 KB | < 3.0s |
| Admin pages | < 300 KB | < 600 KB | < 3.5s |

### Shared Chunks

| Chunk | Max Size | Notes |
|-------|----------|-------|
| `framework-*.js` | 200 KB | React, React DOM |
| `main-*.js` | 150 KB | App shell code |
| `commons-*.js` | 100 KB | Shared dependencies |

## Advanced Analysis

### Compare Builds Over Time

```bash
# Save analysis results
npm run analyze
mv .next/analyze .next/analyze-$(date +%Y%m%d)

# After making changes
npm run analyze

# Compare manually or use a diff tool
```

### Analyzing Specific Pages

```bash
# Build and analyze a specific page
ANALYZE=true npm run build
# Then check the page-specific chunk in the analyzer
```

### Finding Import Sources

```bash
# Find all files importing from a barrel file
rg "from '@/components/ui'" -t tsx -t ts

# Count imports from barrel files
rg "from '@/components/ui'" -t tsx -t ts | wc -l
```

## Common Pitfalls

### 1. Barrel File Cascade
```typescript
// lib/utils/index.ts exports everything
export * from './date-format'
export * from './string-utils'
export * from './validation'

// Even a single import pulls in all dependencies
import { formatDate } from '@/lib/utils' // ❌ 30 KB
import { formatDate } from '@/lib/utils/date-format' // ✅ 3 KB
```

### 2. Re-exports in Components
```typescript
// components/ui/index.ts
export { Button } from './button'
export { Dialog } from './dialog'
// ... 40+ more exports

// Any single import loads ALL component code
```

### 3. Lodash Imports
```typescript
// ❌ Imports entire lodash (70+ KB)
import _ from 'lodash'
import { debounce } from 'lodash'

// ✅ Imports only debounce (2 KB)
import debounce from 'lodash/debounce'
```

### 4. Icon Libraries
```typescript
// ❌ Imports all icons (500+ KB)
import * as Icons from 'lucide-react'

// ✅ Imports specific icons (5 KB)
import { ChevronDown, User, Settings } from 'lucide-react'
```

## Continuous Monitoring

### Set Up Bundle Size Budgets

```json
// .size-limit.json (future improvement)
[
  {
    "path": ".next/static/chunks/pages/index-*.js",
    "limit": "150 KB"
  },
  {
    "path": ".next/static/chunks/pages/dashboard-*.js",
    "limit": "200 KB"
  }
]
```

### Pre-commit Hook (Recommended)

```bash
# .husky/pre-push
#!/bin/sh
npm run analyze
# Add manual review step to check bundle sizes
```

## Troubleshooting

### Analysis Doesn't Open Automatically

The reports are saved in `.next/analyze/`. Open them manually:
- Client: `.next/analyze/client.html`
- Server: `.next/analyze/server.html`

### Build Fails During Analysis

```bash
# Try with more memory
NODE_OPTIONS=--max-old-space-size=4096 npm run analyze
```

### Can't Find Source of Large Module

1. Click on the module in the analyzer
2. Check the path shown at the top
3. Search your codebase for imports from that path
4. Use `grep -r "module-name"` to find all references

## Resources

- [Next.js Bundle Analyzer Docs](https://www.npmjs.com/package/@next/bundle-analyzer)
- [Webpack Bundle Analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer)
- [Web.dev Bundle Size Guide](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting)
- [Next.js Optimization Docs](https://nextjs.org/docs/app/building-your-application/optimizing)

## Team Workflow

1. **Before Major Changes**: Run `npm run analyze` to establish baseline
2. **After Implementation**: Run analysis again and compare
3. **In Code Reviews**: Check for barrel file imports
4. **Monthly**: Review bundle sizes for gradual growth
5. **Quarterly**: Deep dive on optimization opportunities

---

**Last Updated**: 2026-01-17
**Maintained By**: Frontend Architecture Team
