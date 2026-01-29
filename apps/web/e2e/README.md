# E2E Performance Tests - MessageComposer Animations

## Overview

This directory contains Playwright E2E tests for MessageComposer animations performance validation.

## Test Coverage

### Performance Tests

1. **FPS Measurement** - Validates >= 60fps during entrance animations
2. **Load Time** - Validates < 1000ms initial load
3. **Memory Usage** - Validates < 5MB JS heap size
4. **Jank Detection** - Validates < 8% dropped frames
5. **Visual Regression** - Screenshots comparison for glassmorphisme effect
6. **DynamicGlow** - Visual validation of typing glow effect
7. **SendButton Animation** - Validates button appearance animation
8. **Toolbar Stagger** - Validates staggered button animations
9. **Performance Profile** - Validates profile detection
10. **Animation Timing** - Validates entrance animations complete within 1s
11. **Web Vitals** - Reports FCP, LCP, CLS metrics

## Performance Budgets

Tests validate against these budgets:

- ✅ **60fps** target during animations
- ✅ **<1s** load time (component mount)
- ✅ **<5MB** memory (JS heap size)
- ✅ **<8%** jank (frame drops)

## Prerequisites

### 1. Install Playwright

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

### 2. Start Development Server

The tests require the Next.js dev server running on HTTPS:

```bash
pnpm dev
```

Server runs on `https://localhost:3100`

### 3. Authentication

**IMPORTANT**: The `/test-composer` page may require authentication. You have two options:

#### Option A: Disable Auth for Test Page

Create a middleware exception for `/test-composer`:

```typescript
// apps/web/middleware.ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|test-composer|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

#### Option B: Use Test Credentials

Set test credentials in your environment:

```bash
export TEST_USERNAME="test@example.com"
export TEST_PASSWORD="test123"
```

Then update `playwright.config.ts` to login before tests.

## Running Tests

### All Tests

```bash
pnpm test:e2e
```

### Specific Test

```bash
pnpm exec playwright test --grep "should maintain 60fps"
```

### Debug Mode

```bash
pnpm test:e2e:debug
```

### UI Mode

```bash
pnpm test:e2e:ui
```

### View Report

```bash
pnpm test:e2e:report
```

## Configuration

See `playwright.config.ts` for:

- Base URL: `https://localhost:3100`
- Browsers: Chromium (with precise memory info)
- Timeouts: 60s per test
- Screenshots: On failure
- Videos: Retained on failure

## Test Structure

```typescript
test.describe('MessageComposer Animations - Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and wait for component
    await page.goto('/test-composer');
    await page.waitForSelector('textarea');
  });

  test('should maintain 60fps', async ({ page }) => {
    // Performance measurement logic
  });
});
```

## Troubleshooting

### Tests Timeout

- Increase timeout: `playwright test --timeout=90000`
- Check dev server is running on port 3100
- Verify HTTPS certificate is trusted

### Authentication Redirect

- Ensure `/test-composer` is accessible without auth
- Or provide valid test credentials

### Visual Regression Failures

- First run generates baseline screenshots
- Update baselines: `playwright test --update-snapshots`
- Check for rendering differences in CI vs local

### Memory Metrics Not Available

- Requires Chromium with `--enable-precise-memory-info`
- Already enabled in `playwright.config.ts`
- May not work in all environments

## CI Integration

Add to your CI pipeline:

```yaml
- name: Install Playwright
  run: pnpm exec playwright install --with-deps chromium

- name: Run E2E Tests
  run: pnpm test:e2e

- name: Upload Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Performance Insights

### FPS Measurement

Uses `requestAnimationFrame` to track frame timing during animations.

### Memory Profiling

Uses `performance.memory` API (Chromium only) to measure JS heap.

### Jank Detection

Measures frame deltas and calculates percentage > 16.67ms (60fps target).

### Web Vitals

Uses `PerformanceObserver` to collect:
- **FCP** (First Contentful Paint)
- **LCP** (Largest Contentful Paint)
- **CLS** (Cumulative Layout Shift)

## Contributing

When adding new animation tests:

1. Follow the existing test patterns
2. Use descriptive test names
3. Validate against performance budgets
4. Add visual regression for new UI elements
5. Update this README with new tests
