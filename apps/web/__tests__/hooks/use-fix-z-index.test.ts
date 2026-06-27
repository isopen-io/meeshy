/**
 * Tests for hooks/use-fix-z-index.ts
 */

jest.mock('@/lib/z-index', () => ({
  Z_INDEX: { MAX: 99999 },
}));

import { renderHook, act } from '@testing-library/react';
import { useFixRadixZIndex, useFixTranslationPopoverZIndex } from '@/hooks/use-fix-z-index';

// MutationObserver is already mocked in jsdom — but we override for isolation
let observerInstances: { observe: jest.Mock; disconnect: jest.Mock; callback: MutationCallback }[] = [];

beforeEach(() => {
  observerInstances = [];
  (global as any).MutationObserver = jest.fn().mockImplementation((cb: MutationCallback) => {
    const instance = { observe: jest.fn(), disconnect: jest.fn(), callback: cb };
    observerInstances.push(instance);
    return instance;
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── useFixRadixZIndex ────────────────────────────────────────────────────────

describe('useFixRadixZIndex', () => {
  it('mounts without throwing', () => {
    expect(() => renderHook(() => useFixRadixZIndex())).not.toThrow();
  });

  it('sets up a MutationObserver on document.body', () => {
    renderHook(() => useFixRadixZIndex());
    expect(observerInstances.length).toBeGreaterThanOrEqual(1);
    expect(observerInstances[0].observe).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ childList: true, subtree: true })
    );
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderHook(() => useFixRadixZIndex());
    unmount();
    expect(observerInstances[0].disconnect).toHaveBeenCalled();
  });

  it('clears the periodic interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useFixRadixZIndex());
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('applies z-index to [data-radix-popper-content-wrapper] elements', () => {
    const el = document.createElement('div');
    el.setAttribute('data-radix-popper-content-wrapper', '');
    document.body.appendChild(el);

    renderHook(() => useFixRadixZIndex());

    expect(el.style.getPropertyValue('z-index')).toBe('99999');
    document.body.removeChild(el);
  });

  it('applies z-index to [data-radix-dropdown-menu-content] elements', () => {
    const el = document.createElement('div');
    el.setAttribute('data-radix-dropdown-menu-content', '');
    document.body.appendChild(el);

    renderHook(() => useFixRadixZIndex());

    expect(el.style.getPropertyValue('z-index')).toBe('99998');
    document.body.removeChild(el);
  });

  it('applies z-index to [data-radix-tooltip-content] elements', () => {
    const el = document.createElement('div');
    el.setAttribute('data-radix-tooltip-content', '');
    document.body.appendChild(el);

    renderHook(() => useFixRadixZIndex());

    expect(el.style.getPropertyValue('z-index')).toBe('99997');
    document.body.removeChild(el);
  });
});

// ─── useFixTranslationPopoverZIndex ───────────────────────────────────────────

describe('useFixTranslationPopoverZIndex', () => {
  it('mounts without throwing', () => {
    expect(() => renderHook(() => useFixTranslationPopoverZIndex())).not.toThrow();
  });

  it('sets up a MutationObserver on document.body', () => {
    renderHook(() => useFixTranslationPopoverZIndex());
    const lastObserver = observerInstances[observerInstances.length - 1];
    expect(lastObserver.observe).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ childList: true, subtree: true })
    );
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderHook(() => useFixTranslationPopoverZIndex());
    unmount();
    const lastObserver = observerInstances[observerInstances.length - 1];
    expect(lastObserver.disconnect).toHaveBeenCalled();
  });

  it('applies z-index to .bubble-message [data-radix-popover-content] elements', () => {
    const container = document.createElement('div');
    container.className = 'bubble-message';
    const popover = document.createElement('div');
    popover.setAttribute('data-radix-popover-content', '');
    container.appendChild(popover);
    document.body.appendChild(container);

    renderHook(() => useFixTranslationPopoverZIndex());

    expect(popover.style.zIndex).toBe('99999');
    document.body.removeChild(container);
  });
});
