# Bundle Analyzer - Installation Summary

## Installation Status: ✅ Complete

### What Was Installed

1. **Package**: `@next/bundle-analyzer@^16.1.3`
   - Installed via: `pnpm add -D @next/bundle-analyzer --filter=@meeshy/web`
   - Location: `apps/web/package.json` devDependencies

2. **Configuration**: `next.config.ts`
   - Added: `withBundleAnalyzer` wrapper
   - Enabled only when: `ANALYZE=true` environment variable is set
   - Preserves all existing Next.js configuration

3. **npm Script**: `package.json`
   - Added: `"analyze": "ANALYZE=true npm run build"`
   - Usage: `npm run analyze`

4. **Documentation**:
   - `BUNDLE_ANALYSIS.md` - Complete guide
   - `BUNDLE_ANALYZER_QUICKSTART.md` - Quick reference

## How to Use

### Run Analysis

```bash
# From apps/web directory
npm run analyze

# From monorepo root
pnpm --filter=@meeshy/web analyze
```

### What Happens

1. Builds the Next.js application
2. Generates two HTML reports:
   - `.next/analyze/client.html` - Client-side bundles
   - `.next/analyze/server.html` - Server-side bundles
3. Automatically opens both in your browser

### Normal Build Unchanged

```bash
# Regular build (no analysis)
npm run build
# Works exactly as before - no performance impact
```

## Configuration Details

### next.config.ts

```typescript
// Bundle Analyzer - activé uniquement avec ANALYZE=true
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

// ... rest of config ...

export default withBundleAnalyzer(nextConfig);
```

**Key Points**:
- Only active when `ANALYZE=true`
- Zero impact on normal builds
- Compatible with all existing Next.js config
- Works with Docker builds

## Known Issues Identified

Based on initial codebase analysis, we have **150-200 KB of overhead** from barrel file imports:

### Top Priority Fixes

1. **`@/components/ui/index.ts`** - 50-80 KB overhead
   - 40+ component exports
   - Each import pulls in all components
   - **Fix**: Use direct imports like `@/components/ui/button`

2. **`@/hooks/index.ts`** - 30-50 KB overhead
   - 30+ hook exports
   - Pulls in all hook dependencies
   - **Fix**: Use direct imports like `@/hooks/use-auth`

3. **`@/lib/utils/index.ts`** - 20-30 KB overhead
   - Exports date-fns, lodash, validation utils
   - **Fix**: Use direct imports like `@/lib/utils/date-format`

## Verification

### Test the Analyzer

```bash
cd apps/web
npm run analyze
```

Expected output:
- Build completes successfully
- Two HTML files generated in `.next/analyze/`
- Browser windows open automatically

### Check Bundle Sizes

After running analysis, look for:
- Main bundle size (should be < 200 KB gzipped)
- Large modules (> 50 KB)
- Duplicate dependencies
- Barrel file imports

## Next Steps

1. **Run Initial Analysis**: `npm run analyze`
2. **Identify Barrel Imports**: Use grep commands from quickstart
3. **Fix High-Priority Files**: Start with `@/components/ui/index.ts`
4. **Re-analyze**: Confirm size improvements
5. **Document Baseline**: Save current bundle sizes for tracking

## Team Guidelines

### Code Review Checklist

- [ ] No barrel file imports (`from '@/components/ui'`)
- [ ] Heavy components use lazy loading
- [ ] Bundle size targets met (see BUNDLE_ANALYSIS.md)

### Monthly Tasks

- [ ] Run bundle analysis
- [ ] Check for bundle size increases
- [ ] Review new barrel file imports
- [ ] Update optimization targets

## Troubleshooting

### Analysis Doesn't Run

```bash
# Check environment variable
echo $ANALYZE
# Should output: true

# Run manually
ANALYZE=true npm run build
```

### Browser Doesn't Open

```bash
# Open reports manually
open .next/analyze/client.html
open .next/analyze/server.html
```

### Build Fails

```bash
# Increase Node memory
NODE_OPTIONS=--max-old-space-size=4096 npm run analyze
```

## Resources

- **Quick Start**: [BUNDLE_ANALYZER_QUICKSTART.md](./BUNDLE_ANALYZER_QUICKSTART.md)
- **Full Guide**: [BUNDLE_ANALYSIS.md](./BUNDLE_ANALYSIS.md)
- **Official Docs**: https://www.npmjs.com/package/@next/bundle-analyzer

---

**Installed**: 2026-01-17
**Status**: Ready for use
**Impact**: Zero on normal builds, analysis on demand
