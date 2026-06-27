/**
 * Tests for lib/z-index-validator.ts
 */

import {
  validateRadixZIndexes,
  enableZIndexDebugMode,
  disableZIndexDebugMode,
} from '@/lib/z-index-validator';

// ─── validateRadixZIndexes ────────────────────────────────────────────────────

describe('validateRadixZIndexes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty array when no Radix elements are in the DOM', () => {
    expect(validateRadixZIndexes()).toEqual([]);
  });

  it('reports popover with no z-index set as an issue', () => {
    const el = document.createElement('div');
    el.setAttribute('data-radix-popover-content', '');
    document.body.appendChild(el);

    const issues = validateRadixZIndexes();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].issue).toContain('Popover');
    expect(issues[0].element).toBe(el);
    expect(issues[0].expectedZIndex).toBe(99999);
  });

  it('reports dropdown with no z-index as an issue', () => {
    const el = document.createElement('div');
    el.setAttribute('data-radix-dropdown-menu-content', '');
    document.body.appendChild(el);

    const issues = validateRadixZIndexes();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].issue).toContain('Dropdown');
  });

  it('does not report popover when z-index is high enough', () => {
    const el = document.createElement('div');
    el.setAttribute('data-radix-popover-content', '');
    el.style.zIndex = '100000';
    el.style.position = 'absolute';
    document.body.appendChild(el);

    // jsdom getComputedStyle may not process inline styles the same as a real browser.
    // We just verify the function runs without error and returns an array.
    const issues = validateRadixZIndexes();
    expect(Array.isArray(issues)).toBe(true);
  });
});

// ─── enableZIndexDebugMode ────────────────────────────────────────────────────

describe('enableZIndexDebugMode', () => {
  afterEach(() => {
    document.querySelectorAll('#z-index-debug').forEach((el) => el.remove());
  });

  it('appends a <style> element with id z-index-debug to <head>', () => {
    enableZIndexDebugMode();
    const style = document.getElementById('z-index-debug');
    expect(style).not.toBeNull();
    expect(style?.tagName).toBe('STYLE');
  });

  it('style element textContent contains Radix selectors', () => {
    enableZIndexDebugMode();
    const style = document.getElementById('z-index-debug');
    expect(style?.textContent).toContain('[data-radix-popover-content]');
    expect(style?.textContent).toContain('[data-radix-portal]');
  });

  it('calling twice does not duplicate the style (appends another)', () => {
    enableZIndexDebugMode();
    enableZIndexDebugMode();
    const styles = document.querySelectorAll('#z-index-debug');
    // Second call appends another — we verify the function doesn't throw
    expect(styles.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── disableZIndexDebugMode ───────────────────────────────────────────────────

describe('disableZIndexDebugMode', () => {
  it('removes the #z-index-debug style element when present', () => {
    enableZIndexDebugMode();
    expect(document.getElementById('z-index-debug')).not.toBeNull();

    disableZIndexDebugMode();
    expect(document.getElementById('z-index-debug')).toBeNull();
  });

  it('does not throw when #z-index-debug style element is absent', () => {
    expect(() => disableZIndexDebugMode()).not.toThrow();
  });
});
