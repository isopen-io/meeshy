/**
 * Tests for hooks/use-virtual-keyboard.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useVirtualKeyboard } from '@/hooks/use-virtual-keyboard';

let mockViewportHeight = 800;
const resizeHandlers: (() => void)[] = [];
const scrollHandlers: (() => void)[] = [];

const mockVisualViewport = {
  get height() { return mockViewportHeight; },
  addEventListener: jest.fn((type: string, handler: () => void) => {
    if (type === 'resize') resizeHandlers.push(handler);
    if (type === 'scroll') scrollHandlers.push(handler);
  }),
  removeEventListener: jest.fn(),
};

const triggerResize = () => {
  act(() => { resizeHandlers.forEach(h => h()); });
};

beforeEach(() => {
  mockViewportHeight = 800;
  resizeHandlers.length = 0;
  scrollHandlers.length = 0;
  mockVisualViewport.addEventListener.mockClear();
  mockVisualViewport.removeEventListener.mockClear();

  Object.defineProperty(window, 'visualViewport', {
    value: mockVisualViewport,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: 800,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', {
    value: null,
    configurable: true,
    writable: true,
  });
});

// ─── no visualViewport support ────────────────────────────────────────────────

describe('when visualViewport is not supported', () => {
  it('returns default closed state without registering listeners', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: null,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });
});

// ─── keyboard closed ──────────────────────────────────────────────────────────

describe('when keyboard is closed (height difference ≤ 150px)', () => {
  it('reports isOpen: false', () => {
    mockViewportHeight = 760; // 800 - 760 = 40 ≤ 150
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(false);
  });

  it('reports keyboardHeight: 0', () => {
    mockViewportHeight = 760;
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.keyboardHeight).toBe(0);
  });

  it('reports the viewport height', () => {
    mockViewportHeight = 760;
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.viewportHeight).toBe(760);
  });
});

// ─── keyboard open ────────────────────────────────────────────────────────────

describe('when keyboard is open (height difference > 150px)', () => {
  it('reports isOpen: true', () => {
    mockViewportHeight = 400; // 800 - 400 = 400 > 150
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(true);
  });

  it('reports the correct keyboardHeight', () => {
    mockViewportHeight = 400;
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.keyboardHeight).toBe(400);
  });

  it('reports the viewport height', () => {
    mockViewportHeight = 400;
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.viewportHeight).toBe(400);
  });
});

// ─── event-driven updates ─────────────────────────────────────────────────────

describe('event-driven updates', () => {
  it('transitions to open when a resize event fires and viewport shrinks', () => {
    mockViewportHeight = 760; // initially closed
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(false);

    mockViewportHeight = 400; // keyboard appears
    triggerResize();

    expect(result.current.isOpen).toBe(true);
    expect(result.current.keyboardHeight).toBe(400);
  });

  it('transitions to closed and zeroes keyboardHeight when keyboard dismisses', () => {
    mockViewportHeight = 400; // initially open
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(true);

    mockViewportHeight = 760; // keyboard dismissed
    triggerResize();

    expect(result.current.isOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('removes resize and scroll listeners on unmount', () => {
    const { unmount } = renderHook(() => useVirtualKeyboard());
    unmount();
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function)
    );
  });
});
