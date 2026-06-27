/**
 * Tests for hooks/use-accessibility.ts
 */

import { renderHook, act } from '@testing-library/react';
import {
  useReducedMotion,
  SoundFeedback,
  useFocusTrap,
  useArrowNavigation,
  useAnnounce,
} from '@/hooks/use-accessibility';
import { createRef } from 'react';

// ─── useReducedMotion ────────────────────────────────────────────────────────

describe('useReducedMotion', () => {
  let mockMediaQuery: { matches: boolean; addEventListener: jest.Mock; removeEventListener: jest.Mock };

  beforeEach(() => {
    mockMediaQuery = {
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    window.matchMedia = jest.fn().mockReturnValue(mockMediaQuery);
  });

  it('returns false when prefers-reduced-motion is not set', () => {
    mockMediaQuery.matches = false;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when prefers-reduced-motion is set', () => {
    mockMediaQuery.matches = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('adds a change event listener on mount', () => {
    renderHook(() => useReducedMotion());
    expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes the change listener on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('updates when media query fires change event', () => {
    mockMediaQuery.matches = false;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      const handler = mockMediaQuery.addEventListener.mock.calls[0][1];
      handler({ matches: true });
    });
    expect(result.current).toBe(true);
  });
});

// ─── SoundFeedback ────────────────────────────────────────────────────────────

describe('SoundFeedback', () => {
  beforeEach(() => {
    SoundFeedback.enabled = true;
    SoundFeedback.audioContext = null;
  });

  it('setEnabled toggles the enabled flag', () => {
    SoundFeedback.setEnabled(false);
    expect(SoundFeedback.enabled).toBe(false);
    SoundFeedback.setEnabled(true);
    expect(SoundFeedback.enabled).toBe(true);
  });

  it('getContext returns null when window is undefined', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    expect(SoundFeedback.getContext()).toBeNull();
    global.window = originalWindow;
  });

  it('getContext creates AudioContext lazily', () => {
    const mockOscillator = { type: '', frequency: { setValueAtTime: jest.fn() }, connect: jest.fn(), start: jest.fn(), stop: jest.fn() };
    const mockGain = { gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: jest.fn() };
    const mockAudioContext = {
      createOscillator: jest.fn(() => mockOscillator),
      createGain: jest.fn(() => mockGain),
      currentTime: 0,
      destination: {},
    };
    (window as any).AudioContext = jest.fn(() => mockAudioContext);

    const ctx = SoundFeedback.getContext();
    expect(ctx).not.toBeNull();
    expect(SoundFeedback.audioContext).toBe(ctx);
  });

  it('playTone does nothing when enabled=false', () => {
    SoundFeedback.setEnabled(false);
    const getContextSpy = jest.spyOn(SoundFeedback, 'getContext');
    SoundFeedback.playTone(440);
    expect(getContextSpy).not.toHaveBeenCalled();
    getContextSpy.mockRestore();
  });

  it('playTone does nothing when context returns null', () => {
    jest.spyOn(SoundFeedback, 'getContext').mockReturnValue(null);
    expect(() => SoundFeedback.playTone(440)).not.toThrow();
    jest.restoreAllMocks();
  });

  it('playSuccess does not throw', () => {
    jest.spyOn(SoundFeedback, 'playTone').mockImplementation(() => {});
    expect(() => SoundFeedback.playSuccess()).not.toThrow();
    jest.restoreAllMocks();
  });

  it('playError does not throw', () => {
    jest.spyOn(SoundFeedback, 'playTone').mockImplementation(() => {});
    expect(() => SoundFeedback.playError()).not.toThrow();
    jest.restoreAllMocks();
  });

  it('playClick does not throw', () => {
    jest.spyOn(SoundFeedback, 'playTone').mockImplementation(() => {});
    expect(() => SoundFeedback.playClick()).not.toThrow();
    jest.restoreAllMocks();
  });

  it('playToggleOn does not throw', () => {
    jest.spyOn(SoundFeedback, 'playTone').mockImplementation(() => {});
    expect(() => SoundFeedback.playToggleOn()).not.toThrow();
    jest.restoreAllMocks();
  });

  it('playWarning does not throw', () => {
    jest.spyOn(SoundFeedback, 'playTone').mockImplementation(() => {});
    expect(() => SoundFeedback.playWarning()).not.toThrow();
    jest.restoreAllMocks();
  });

  it('playDelete does not throw', () => {
    jest.spyOn(SoundFeedback, 'playTone').mockImplementation(() => {});
    expect(() => SoundFeedback.playDelete()).not.toThrow();
    jest.restoreAllMocks();
  });
});

// ─── useFocusTrap ─────────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  it('mounts without throwing when isActive=false', () => {
    const ref = createRef<HTMLElement>();
    expect(() => renderHook(() => useFocusTrap(ref, false))).not.toThrow();
  });

  it('mounts without throwing when container has no focusable elements', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const ref = { current: container };
    expect(() => renderHook(() => useFocusTrap(ref as any, true))).not.toThrow();
    document.body.removeChild(container);
  });

  it('moves focus to first focusable element when activated', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    btn1.focus = jest.fn();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref as any, true));
    expect(btn1.focus).toHaveBeenCalled();
    document.body.removeChild(container);
  });

  it('removes keydown listener on unmount', () => {
    const container = document.createElement('div');
    const btn = document.createElement('button');
    container.appendChild(btn);
    document.body.appendChild(container);

    const removeEventSpy = jest.spyOn(container, 'removeEventListener');
    const ref = { current: container };
    const { unmount } = renderHook(() => useFocusTrap(ref as any, true));
    unmount();
    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    document.body.removeChild(container);
  });
});

// ─── useArrowNavigation ───────────────────────────────────────────────────────

describe('useArrowNavigation', () => {
  const makeElement = (text: string): HTMLElement => {
    const el = document.createElement('button');
    el.textContent = text;
    el.focus = jest.fn();
    return el;
  };

  it('returns a handleKeyDown function', () => {
    const { result } = renderHook(() => useArrowNavigation(null));
    expect(typeof result.current).toBe('function');
  });

  it('does nothing when items is null', () => {
    const { result } = renderHook(() => useArrowNavigation(null));
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    expect(() => result.current(e, 0)).not.toThrow();
  });

  it('does nothing when items is empty', () => {
    const { result } = renderHook(() => useArrowNavigation([]));
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    expect(() => result.current(e, 0)).not.toThrow();
  });

  it('moves to next item on ArrowDown', () => {
    const items = [makeElement('a'), makeElement('b'), makeElement('c')];
    const { result } = renderHook(() => useArrowNavigation(items));
    const e = { key: 'ArrowDown', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 0);
    expect(items[1].focus).toHaveBeenCalled();
  });

  it('moves to previous item on ArrowUp', () => {
    const items = [makeElement('a'), makeElement('b'), makeElement('c')];
    const { result } = renderHook(() => useArrowNavigation(items));
    const e = { key: 'ArrowUp', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 2);
    expect(items[1].focus).toHaveBeenCalled();
  });

  it('wraps to last item on ArrowUp at index 0 (loop=true)', () => {
    const items = [makeElement('a'), makeElement('b')];
    const { result } = renderHook(() => useArrowNavigation(items, { loop: true }));
    const e = { key: 'ArrowUp', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 0);
    expect(items[1].focus).toHaveBeenCalled();
  });

  it('stays at index 0 on ArrowUp at index 0 when loop=false', () => {
    const items = [makeElement('a'), makeElement('b')];
    const { result } = renderHook(() => useArrowNavigation(items, { loop: false }));
    const e = { key: 'ArrowUp', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 0);
    expect(items[0].focus).not.toHaveBeenCalled();
  });

  it('calls onSelect on Enter key', () => {
    const items = [makeElement('a'), makeElement('b')];
    const onSelect = jest.fn();
    const { result } = renderHook(() => useArrowNavigation(items, { onSelect }));
    const e = { key: 'Enter', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('calls onSelect on Space key', () => {
    const items = [makeElement('a')];
    const onSelect = jest.fn();
    const { result } = renderHook(() => useArrowNavigation(items, { onSelect }));
    const e = { key: ' ', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 0);
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('handles ArrowLeft for horizontal orientation', () => {
    const items = [makeElement('a'), makeElement('b'), makeElement('c')];
    const { result } = renderHook(() => useArrowNavigation(items, { orientation: 'horizontal' }));
    const e = { key: 'ArrowLeft', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 2);
    expect(items[1].focus).toHaveBeenCalled();
  });

  it('handles ArrowRight for horizontal orientation', () => {
    const items = [makeElement('a'), makeElement('b'), makeElement('c')];
    const { result } = renderHook(() => useArrowNavigation(items, { orientation: 'horizontal' }));
    const e = { key: 'ArrowRight', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    result.current(e, 0);
    expect(items[1].focus).toHaveBeenCalled();
  });
});

// ─── useAnnounce ──────────────────────────────────────────────────────────────

describe('useAnnounce', () => {
  beforeEach(() => {
    const existing = document.getElementById('sr-live-region');
    if (existing) existing.remove();
  });

  it('returns an announce function', () => {
    const { result } = renderHook(() => useAnnounce());
    expect(typeof result.current).toBe('function');
  });

  it('creates a sr-live-region element in the DOM', () => {
    const { result } = renderHook(() => useAnnounce());
    act(() => { result.current('Hello'); });
    expect(document.getElementById('sr-live-region')).not.toBeNull();
  });

  it('sets aria-live=polite by default', () => {
    const { result } = renderHook(() => useAnnounce());
    act(() => { result.current('Hello'); });
    const region = document.getElementById('sr-live-region');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('sets aria-live=assertive when specified', () => {
    const { result } = renderHook(() => useAnnounce());
    act(() => { result.current('Alert!', 'assertive'); });
    const region = document.getElementById('sr-live-region');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
  });

  it('reuses existing sr-live-region on subsequent calls', () => {
    const { result } = renderHook(() => useAnnounce());
    act(() => { result.current('First'); });
    act(() => { result.current('Second'); });
    const regions = document.querySelectorAll('#sr-live-region');
    expect(regions.length).toBe(1);
  });
});
