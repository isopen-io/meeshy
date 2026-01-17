# Bundle Analyzer - Quick Start

## TL;DR

```bash
# Run bundle analysis
cd apps/web
npm run analyze

# Two HTML reports will open automatically:
# - client.html = What users download
# - server.html = Server-side code
```

## What You'll See

Interactive treemap showing:
- **Box size** = File size
- **Hover** = Exact sizes (stat/parsed/gzipped)
- **Click** = Zoom into module

## Critical Issues to Fix

### 🔴 Barrel File Imports (150-200 KB overhead)

```typescript
// ❌ BAD - Pulls in entire barrel file
import { Button } from '@/components/ui'

// ✅ GOOD - Direct import only
import { Button } from '@/components/ui/button'
```

### Top Offenders

| File | Overhead | Action |
|------|----------|--------|
| `@/components/ui/index.ts` | 50-80 KB | Use direct imports |
| `@/hooks/index.ts` | 30-50 KB | Use direct imports |
| `@/lib/utils/index.ts` | 20-30 KB | Use direct imports |

## Size Targets

| Bundle | Target | Current |
|--------|--------|---------|
| Main bundle | < 200 KB | Run analyze to check |
| Dashboard | < 400 KB | Run analyze to check |
| Conversation | < 500 KB | Run analyze to check |

## Quick Checks

```bash
# Find barrel file imports in your code
grep -r "from '@/components/ui'" --include="*.tsx"
grep -r "from '@/hooks'" --include="*.tsx"
grep -r "from '@/lib/utils'" --include="*.tsx"
```

## Need More Details?

See [BUNDLE_ANALYSIS.md](./BUNDLE_ANALYSIS.md) for complete guide.

---

**Remember**: Direct imports = Smaller bundles = Faster app
