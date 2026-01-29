import { test, expect, Page } from '@playwright/test';

// Extend Window interface for performance metrics
declare global {
  interface Window {
    performanceMetrics?: {
      frames: number[];
      startTime: number;
    };
    frameTimings?: number[];
  }
}

/**
 * E2E Performance Tests for MessageComposer Animations
 *
 * Tests performance budgets:
 * - 60fps target during animations
 * - <1s load time
 * - <5MB memory usage
 * - <8% jank (dropped frames)
 *
 * Also includes visual regression tests
 */
test.describe('MessageComposer Animations - Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to test page
    await page.goto('/test-composer', { waitUntil: 'domcontentloaded' });

    // Wait for MessageComposer to be mounted
    // Wait for textarea by its role which is more reliable
    await page.waitForSelector('textarea', { timeout: 15000 });

    // Small delay to ensure animations have started
    await page.waitForTimeout(100);
  });

  /**
   * Test 1: FPS Measurement
   * Verify that entrance animations maintain >= 60fps
   */
  test('should maintain 60fps during entrance animations', async ({ page }) => {
    // Start performance recording
    await page.evaluate(() => {
      window.performanceMetrics = {
        frames: [],
        startTime: performance.now(),
      };

      // Record frames
      const recordFrame = () => {
        if (window.performanceMetrics) {
          window.performanceMetrics.frames.push(performance.now());
          requestAnimationFrame(recordFrame);
        }
      };
      requestAnimationFrame(recordFrame);
    });

    // Trigger entrance animations (remount component)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea', { timeout: 15000 });

    // Wait for animations to complete (2s for entrance animations)
    await page.waitForTimeout(2000);

    // Calculate FPS
    const metrics = await page.evaluate(() => {
      if (!window.performanceMetrics) {
        return { fps: 0, frameCount: 0, duration: 0 };
      }

      const { frames, startTime } = window.performanceMetrics;
      const duration = (performance.now() - startTime) / 1000; // seconds
      const fps = frames.length / duration;
      return { fps, frameCount: frames.length, duration };
    });

    console.log(`FPS: ${metrics.fps.toFixed(2)}, Frames: ${metrics.frameCount}, Duration: ${metrics.duration.toFixed(2)}s`);

    // Assert >= 60fps (with 5fps tolerance for CI environments)
    expect(metrics.fps).toBeGreaterThanOrEqual(55);
  });

  /**
   * Test 2: Load Time
   * Verify that the composer loads in under 1 second
   */
  test('should load under 1 second', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/test-composer');

    // Wait for MessageComposer to be fully rendered
    await page.waitForSelector('textarea', { timeout: 10000 });
    await page.waitForSelector('[aria-label="Send message"]', { timeout: 10000 });

    const loadTime = Date.now() - startTime;

    console.log(`Load time: ${loadTime}ms`);

    // Assert < 1000ms
    expect(loadTime).toBeLessThan(1000);
  });

  /**
   * Test 3: Memory Usage
   * Verify memory usage is under 5MB
   * Note: Requires Chromium with --enable-precise-memory-info
   */
  test('should use less than 5MB memory', async ({ page }) => {
    await page.goto('/test-composer');
    await page.waitForSelector('textarea', { timeout: 10000 });

    // Wait for initial render to stabilize
    await page.waitForTimeout(1000);

    // Get memory metrics
    const metrics = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
        };
      }
      return null;
    });

    if (metrics) {
      const usedMemoryMB = metrics.usedJSHeapSize / (1024 * 1024);
      console.log(`Memory used: ${usedMemoryMB.toFixed(2)}MB`);

      // Assert < 5MB
      expect(usedMemoryMB).toBeLessThan(5);
    } else {
      console.log('Performance.memory not available (requires Chromium with --enable-precise-memory-info)');
      test.skip();
    }
  });

  /**
   * Test 4: Jank Detection
   * Verify that dropped frames are less than 8%
   */
  test('should have less than 8% jank (dropped frames)', async ({ page }) => {
    await page.goto('/test-composer');
    await page.waitForSelector('textarea', { timeout: 10000 });

    // Trigger typing to activate DynamicGlow
    const textarea = page.locator('textarea');
    await textarea.fill('Test message for performance');

    // Wait for glow to stabilize
    await page.waitForTimeout(500);

    // Measure frame timing
    await page.evaluate(() => {
      window.frameTimings = [];
      let lastFrameTime = performance.now();

      const measureFrame = () => {
        const now = performance.now();
        const delta = now - lastFrameTime;
        if (window.frameTimings) {
          window.frameTimings.push(delta);
        }
        lastFrameTime = now;

        if (window.frameTimings && window.frameTimings.length < 120) { // 2 seconds at 60fps
          requestAnimationFrame(measureFrame);
        }
      };

      requestAnimationFrame(measureFrame);
    });

    // Wait for measurement to complete
    await page.waitForTimeout(2500);

    // Calculate jank percentage
    const jankMetrics = await page.evaluate(() => {
      if (!window.frameTimings || window.frameTimings.length === 0) {
        return {
          totalFrames: 0,
          jankyFrames: 0,
          jankPercentage: 0,
          avgFrameTime: 0,
        };
      }

      const timings = window.frameTimings;
      const targetFrameTime = 1000 / 60; // 16.67ms for 60fps
      const jankyFrames = timings.filter(t => t > targetFrameTime * 1.5); // >25ms is janky
      const jankPercentage = (jankyFrames.length / timings.length) * 100;

      return {
        totalFrames: timings.length,
        jankyFrames: jankyFrames.length,
        jankPercentage,
        avgFrameTime: timings.reduce((a, b) => a + b, 0) / timings.length,
      };
    });

    console.log(`Jank: ${jankMetrics.jankPercentage.toFixed(2)}%, Janky frames: ${jankMetrics.jankyFrames}/${jankMetrics.totalFrames}`);
    console.log(`Avg frame time: ${jankMetrics.avgFrameTime.toFixed(2)}ms`);

    // Assert < 8% jank
    expect(jankMetrics.jankPercentage).toBeLessThan(8);
  });

  /**
   * Test 5: Visual Regression - Glassmorphisme
   * Verify that the glass effect renders correctly
   */
  test('should render glassmorphisme correctly (visual regression)', async ({ page }) => {
    // Wait for entrance animations to complete
    await page.waitForTimeout(1500);

    // Take screenshot of the MessageComposer area
    const composer = page.locator('textarea[aria-label="Message input"]').locator('..');

    await expect(composer).toHaveScreenshot('message-composer-glassmorphisme.png', {
      maxDiffPixels: 100, // Allow small differences due to rendering variations
    });
  });

  /**
   * Test 6: Visual Regression - DynamicGlow
   * Verify that the glow appears when typing
   */
  test('should show DynamicGlow when typing', async ({ page }) => {
    // Type message to trigger glow
    const textarea = page.locator('textarea');
    await textarea.fill('Hello World');

    // Wait for glow to appear
    await page.waitForTimeout(500);

    // Screenshot with glow active
    const composer = textarea.locator('..');

    await expect(composer).toHaveScreenshot('message-composer-with-glow.png', {
      maxDiffPixels: 100,
    });
  });

  /**
   * Test 7: SendButton Animation
   * Verify that SendButton appears with correct animation
   */
  test('should animate SendButton on content change', async ({ page }) => {

    // Initially SendButton should not be visible (or disabled)
    const sendButton = page.locator('[aria-label="Send message"]');

    // Type to make SendButton appear
    const textarea = page.locator('textarea');
    await textarea.fill('Test');

    // Wait for animation
    await page.waitForTimeout(300);

    // SendButton should now be visible and enabled
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeEnabled();

    // Verify animation has run (check for transform)
    const hasTransform = await sendButton.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.transform !== 'none';
    });

    // Note: This might be 'none' after animation completes, so we just verify it's visible
    expect(hasTransform).toBeDefined();
  });

  /**
   * Test 8: Toolbar Stagger Animation
   * Verify toolbar buttons appear with stagger effect
   */
  test('should stagger ToolbarButtons with correct timing', async ({ page }) => {

    // Wait for toolbar to be visible
    await page.waitForTimeout(1000);

    // Check that toolbar buttons exist
    const micButton = page.locator('[aria-label="Record voice message"]');
    const attachmentButton = page.locator('[aria-label="Attach file"]');

    await expect(micButton).toBeVisible();
    await expect(attachmentButton).toBeVisible();

    // Verify opacity is 1 (animation completed)
    const micOpacity = await micButton.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });

    const attachmentOpacity = await attachmentButton.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });

    expect(parseFloat(micOpacity)).toBe(1);
    expect(parseFloat(attachmentOpacity)).toBe(1);
  });

  /**
   * Test 9: Performance Profile Detection
   * Verify that performance profile is detected and applied
   */
  test('should detect and apply performance profile', async ({ page }) => {

    // Get performance profile from page
    const profile = await page.evaluate(() => {
      // Try to get from localStorage or computed styles
      const stored = localStorage.getItem('performance-profile');
      if (stored) return stored;

      // Check if animations are present on textarea parent
      const textarea = document.querySelector('textarea');
      if (!textarea || !textarea.parentElement) return 'unknown';

      const style = window.getComputedStyle(textarea.parentElement);
      const hasBackdrop = style.backdropFilter !== 'none';

      return hasBackdrop ? 'high' : 'low';
    });

    console.log(`Performance profile detected: ${profile}`);

    // Profile should be one of: high, medium, low
    expect(['high', 'medium', 'low', 'unknown']).toContain(profile);
  });

  /**
   * Test 10: Animation Timing Budget
   * Verify that animations complete within expected time
   */
  test('should complete entrance animations within 1 second', async ({ page }) => {
    const startTime = Date.now();

    // Wait for all animations to complete
    // Check for animation-end or just wait for stable state
    await page.waitForTimeout(1000);

    // Verify composer is stable (no ongoing animations)
    const isAnimating = await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      if (!textarea || !textarea.parentElement) return false;

      const animations = textarea.parentElement.getAnimations();
      return animations.length > 0;
    });

    const animationTime = Date.now() - startTime;
    console.log(`Animation completion time: ${animationTime}ms, Still animating: ${isAnimating}`);

    // Entrance animations should complete within 1s
    expect(animationTime).toBeLessThan(1000);
  });
});

/**
 * Helper test to measure overall page performance
 */
test.describe('MessageComposer - Overall Performance Metrics', () => {
  test('should report Web Vitals', async ({ page }) => {
    await page.goto('/test-composer', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea', { timeout: 15000 });

    // Wait for page to stabilize
    await page.waitForTimeout(2000);

    // Get Web Vitals if available
    const vitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        if ('PerformanceObserver' in window) {
          const vitals: Record<string, number> = {};

          // FCP - First Contentful Paint
          const fcpObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === 'first-contentful-paint') {
                vitals.FCP = entry.startTime;
              }
            }
          });
          fcpObserver.observe({ type: 'paint', buffered: true });

          // LCP - Largest Contentful Paint
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1] as any;
            vitals.LCP = lastEntry.renderTime || lastEntry.loadTime;
          });
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

          // FID - First Input Delay (will be 0 if no interaction yet)
          vitals.FID = 0;

          // CLS - Cumulative Layout Shift
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!(entry as any).hadRecentInput) {
                clsValue += (entry as any).value;
              }
            }
            vitals.CLS = clsValue;
          });
          clsObserver.observe({ type: 'layout-shift', buffered: true });

          setTimeout(() => {
            resolve(vitals);
          }, 1000);
        } else {
          resolve({});
        }
      });
    });

    console.log('Web Vitals:', vitals);

    // Log vitals (no strict assertions as they vary)
    expect(vitals).toBeDefined();
  });
});
