/**
 * Tests for hooks/use-accessibility.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useReducedMotion, SoundFeedback, useArrowNavigation, useAnnounce } from '@/hooks/use-accessibility';

// ─── matchMedia mock ──────────────────────────────────────────────────────────

type MatchMediaListener = (event: { matches: boolean }) => void;

let matchMediaMatches = false;
let capturedListener: MatchMediaListener | null = null;

const mockMatchMedia = (matches: boolean) => ({
  matches,
  addEventListener: (_: string, handler: MatchMediaListener) => {
    capturedListener = handler;
  },
  removeEventListener: (_: string, _handler: MatchMediaListener) => {
    capturedListener = null;
  },
});

beforeEach(() => {
  matchMediaMatches = false;
  capturedListener = null;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn((query: string) => {
      void query;
      return mockMatchMedia(matchMediaMatches);
    }),
  });
});

// ─── useReducedMotion ─────────────────────────────────────────────────────────

describe('useReducedMotion', () => {
  it('returns false initially when preference is off', () => {
    matchMediaMatches = false;

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('returns true initially when preference is on', () => {
    matchMediaMatches = true;

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('updates when media query changes to true', () => {
    matchMediaMatches = false;

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);

    act(() => {
      capturedListener?.({ matches: true });
    });

    expect(result.current).toBe(true);
  });

  it('updates when media query changes back to false', () => {
    matchMediaMatches = true;

    const { result } = renderHook(() => useReducedMotion());

    act(() => {
      capturedListener?.({ matches: false });
    });

    expect(result.current).toBe(false);
  });

  it('removes event listener on unmount', () => {
    matchMediaMatches = false;
    const { unmount } = renderHook(() => useReducedMotion());

    unmount();

    expect(capturedListener).toBeNull();
  });
});

// ─── SoundFeedback ────────────────────────────────────────────────────────────

describe('SoundFeedback', () => {
  let mockOscillator: {
    type: string;
    frequency: { setValueAtTime: jest.Mock };
    connect: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
  };
  let mockGainNode: {
    gain: { setValueAtTime: jest.Mock; exponentialRampToValueAtTime: jest.Mock };
    connect: jest.Mock;
  };
  let mockCtx: {
    currentTime: number;
    createOscillator: jest.Mock;
    createGain: jest.Mock;
    destination: {};
  };

  beforeEach(() => {
    mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
    mockGainNode = {
      gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
      connect: jest.fn(),
    };
    mockCtx = {
      currentTime: 0,
      createOscillator: jest.fn(() => mockOscillator),
      createGain: jest.fn(() => mockGainNode),
      destination: {},
    };

    (window as any).AudioContext = jest.fn(() => mockCtx);
    SoundFeedback.audioContext = null;
    SoundFeedback.enabled = true;
  });

  afterEach(() => {
    delete (window as any).AudioContext;
    SoundFeedback.audioContext = null;
    SoundFeedback.enabled = true;
  });

  it('getContext creates AudioContext on first call', () => {
    const ctx = SoundFeedback.getContext();
    expect(ctx).toBe(mockCtx);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
  });

  it('getContext reuses existing AudioContext on subsequent calls', () => {
    SoundFeedback.getContext();
    SoundFeedback.getContext();
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
  });

  it('getContext returns null when AudioContext constructor throws', () => {
    (window as any).AudioContext = jest.fn(() => { throw new Error('not supported'); });
    SoundFeedback.audioContext = null;
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const ctx = SoundFeedback.getContext();
    expect(ctx).toBeNull();
    consoleSpy.mockRestore();
  });

  it('setEnabled toggles the enabled flag', () => {
    SoundFeedback.setEnabled(false);
    expect(SoundFeedback.enabled).toBe(false);

    SoundFeedback.setEnabled(true);
    expect(SoundFeedback.enabled).toBe(true);
  });

  it('playTone does nothing when disabled', () => {
    SoundFeedback.setEnabled(false);
    SoundFeedback.playTone(440);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });

  it('playTone creates and connects oscillator', () => {
    SoundFeedback.playTone(440, 0.1, 'sine', 0.15);

    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();
    expect(mockOscillator.connect).toHaveBeenCalledWith(mockGainNode);
    expect(mockGainNode.connect).toHaveBeenCalledWith(mockCtx.destination);
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalled();
  });

  it('playTone sets oscillator type and frequency', () => {
    SoundFeedback.playTone(880, 0.1, 'triangle', 0.2);
    expect(mockOscillator.type).toBe('triangle');
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
  });

  it('playSuccess calls playTone twice (with timeout)', () => {
    jest.useFakeTimers();
    const playTone = jest.spyOn(SoundFeedback, 'playTone');

    SoundFeedback.playSuccess();
    expect(playTone).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    expect(playTone).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
    playTone.mockRestore();
  });

  it('playError calls playTone once', () => {
    const playTone = jest.spyOn(SoundFeedback, 'playTone');
    SoundFeedback.playError();
    expect(playTone).toHaveBeenCalledTimes(1);
    playTone.mockRestore();
  });

  it('playClick calls playTone once', () => {
    const playTone = jest.spyOn(SoundFeedback, 'playTone');
    SoundFeedback.playClick();
    expect(playTone).toHaveBeenCalledTimes(1);
    playTone.mockRestore();
  });

  it('playToggleOn calls playTone twice (with timeout)', () => {
    jest.useFakeTimers();
    const playTone = jest.spyOn(SoundFeedback, 'playTone');

    SoundFeedback.playToggleOn();
    expect(playTone).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(playTone).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
    playTone.mockRestore();
  });

  it('playToggleOff calls playTone twice (with timeout)', () => {
    jest.useFakeTimers();
    const playTone = jest.spyOn(SoundFeedback, 'playTone');

    SoundFeedback.playToggleOff();
    expect(playTone).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(playTone).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
    playTone.mockRestore();
  });

  it('playNavigate calls playTone once', () => {
    const playTone = jest.spyOn(SoundFeedback, 'playTone');
    SoundFeedback.playNavigate();
    expect(playTone).toHaveBeenCalledTimes(1);
    playTone.mockRestore();
  });

  it('playWarning calls playTone once', () => {
    const playTone = jest.spyOn(SoundFeedback, 'playTone');
    SoundFeedback.playWarning();
    expect(playTone).toHaveBeenCalledTimes(1);
    playTone.mockRestore();
  });

  it('playRecordingStart calls playTone three times (with timeouts)', () => {
    jest.useFakeTimers();
    const playTone = jest.spyOn(SoundFeedback, 'playTone');

    SoundFeedback.playRecordingStart();
    expect(playTone).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    expect(playTone).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
    playTone.mockRestore();
  });

  it('playRecordingStop calls playTone three times (with timeouts)', () => {
    jest.useFakeTimers();
    const playTone = jest.spyOn(SoundFeedback, 'playTone');

    SoundFeedback.playRecordingStop();
    expect(playTone).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    expect(playTone).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
    playTone.mockRestore();
  });

  it('playDelete calls playTone once', () => {
    const playTone = jest.spyOn(SoundFeedback, 'playTone');
    SoundFeedback.playDelete();
    expect(playTone).toHaveBeenCalledTimes(1);
    playTone.mockRestore();
  });

  it('playTone silently catches AudioContext errors', () => {
    mockCtx.createOscillator.mockImplementation(() => { throw new Error('audio error'); });
    expect(() => SoundFeedback.playTone(440)).not.toThrow();
  });
});

// ─── useArrowNavigation ───────────────────────────────────────────────────────

describe('useArrowNavigation', () => {
  const makeElement = () => {
    const el = document.createElement('button');
    el.focus = jest.fn();
    return el;
  };

  it('returns a handleKeyDown function', () => {
    const { result } = renderHook(() => useArrowNavigation(null));
    expect(typeof result.current).toBe('function');
  });

  it('does nothing when items is null', () => {
    const { result } = renderHook(() => useArrowNavigation(null));
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown' }) as any;
    e.preventDefault = jest.fn();
    expect(() => result.current(e, 0)).not.toThrow();
  });

  it('does nothing when items array is empty', () => {
    const { result } = renderHook(() => useArrowNavigation([]));
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown' }) as any;
    e.preventDefault = jest.fn();
    result.current(e, 0);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('ArrowDown moves focus to next item', () => {
    const items = [makeElement(), makeElement(), makeElement()];
    const { result } = renderHook(() => useArrowNavigation(items, { orientation: 'vertical' }));
    const e = { key: 'ArrowDown', preventDefault: jest.fn() } as any;

    result.current(e, 0);

    expect(items[1].focus).toHaveBeenCalled();
  });

  it('ArrowUp moves focus to previous item', () => {
    const items = [makeElement(), makeElement(), makeElement()];
    const { result } = renderHook(() => useArrowNavigation(items, { orientation: 'vertical' }));
    const e = { key: 'ArrowUp', preventDefault: jest.fn() } as any;

    result.current(e, 2);

    expect(items[1].focus).toHaveBeenCalled();
  });

  it('ArrowDown loops to first item when at last with loop:true', () => {
    const items = [makeElement(), makeElement()];
    const { result } = renderHook(() => useArrowNavigation(items, { loop: true }));
    const e = { key: 'ArrowDown', preventDefault: jest.fn() } as any;

    result.current(e, 1);

    expect(items[0].focus).toHaveBeenCalled();
  });

  it('ArrowDown stays at last item with loop:false', () => {
    const items = [makeElement(), makeElement()];
    const { result } = renderHook(() => useArrowNavigation(items, { loop: false }));
    const e = { key: 'ArrowDown', preventDefault: jest.fn() } as any;

    result.current(e, 1);

    expect(items[0].focus).not.toHaveBeenCalled();
    expect(items[1].focus).not.toHaveBeenCalled();
  });

  it('ArrowUp loops to last item when at first with loop:true', () => {
    const items = [makeElement(), makeElement()];
    const { result } = renderHook(() => useArrowNavigation(items, { loop: true }));
    const e = { key: 'ArrowUp', preventDefault: jest.fn() } as any;

    result.current(e, 0);

    expect(items[1].focus).toHaveBeenCalled();
  });

  it('ArrowRight moves focus in horizontal orientation', () => {
    const items = [makeElement(), makeElement(), makeElement()];
    const { result } = renderHook(() =>
      useArrowNavigation(items, { orientation: 'horizontal' })
    );
    const e = { key: 'ArrowRight', preventDefault: jest.fn() } as any;

    result.current(e, 0);

    expect(items[1].focus).toHaveBeenCalled();
  });

  it('ArrowLeft moves focus in horizontal orientation', () => {
    const items = [makeElement(), makeElement(), makeElement()];
    const { result } = renderHook(() =>
      useArrowNavigation(items, { orientation: 'horizontal' })
    );
    const e = { key: 'ArrowLeft', preventDefault: jest.fn() } as any;

    result.current(e, 2);

    expect(items[1].focus).toHaveBeenCalled();
  });

  it('both orientation supports vertical and horizontal arrows', () => {
    const items = [makeElement(), makeElement(), makeElement()];
    const { result } = renderHook(() =>
      useArrowNavigation(items, { orientation: 'both' })
    );
    const eDown = { key: 'ArrowDown', preventDefault: jest.fn() } as any;
    const eRight = { key: 'ArrowRight', preventDefault: jest.fn() } as any;

    result.current(eDown, 0);
    expect(items[1].focus).toHaveBeenCalled();

    result.current(eRight, 0);
    expect(items[1].focus).toHaveBeenCalledTimes(2);
  });

  it('Enter calls onSelect with current index', () => {
    const onSelect = jest.fn();
    const items = [makeElement(), makeElement()];
    const { result } = renderHook(() =>
      useArrowNavigation(items, { onSelect })
    );
    const e = { key: 'Enter', preventDefault: jest.fn() } as any;

    result.current(e, 1);

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('Space calls onSelect with current index', () => {
    const onSelect = jest.fn();
    const items = [makeElement()];
    const { result } = renderHook(() =>
      useArrowNavigation(items, { onSelect })
    );
    const e = { key: ' ', preventDefault: jest.fn() } as any;

    result.current(e, 0);

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('unrelated key does nothing', () => {
    const items = [makeElement(), makeElement()];
    const { result } = renderHook(() => useArrowNavigation(items));
    const e = { key: 'Escape', preventDefault: jest.fn() } as any;

    result.current(e, 0);

    expect(items[0].focus).not.toHaveBeenCalled();
    expect(items[1].focus).not.toHaveBeenCalled();
  });

  it('horizontal arrows do not move in vertical-only mode', () => {
    const items = [makeElement(), makeElement()];
    const { result } = renderHook(() =>
      useArrowNavigation(items, { orientation: 'vertical' })
    );
    const e = { key: 'ArrowRight', preventDefault: jest.fn() } as any;

    result.current(e, 0);

    expect(items[0].focus).not.toHaveBeenCalled();
    expect(items[1].focus).not.toHaveBeenCalled();
  });
});

// ─── useAnnounce ─────────────────────────────────────────────────────────────

describe('useAnnounce', () => {
  beforeEach(() => {
    const el = document.getElementById('sr-live-region');
    el?.parentNode?.removeChild(el);
  });

  it('returns a function', () => {
    const { result } = renderHook(() => useAnnounce());
    expect(typeof result.current).toBe('function');
  });

  it('creates a live region element on first call', () => {
    const { result } = renderHook(() => useAnnounce());

    act(() => {
      result.current('Hello');
    });

    const region = document.getElementById('sr-live-region');
    expect(region).not.toBeNull();
  });

  it('sets aria-live attribute to polite by default', () => {
    const { result } = renderHook(() => useAnnounce());

    act(() => {
      result.current('Hello');
    });

    const region = document.getElementById('sr-live-region');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('sets aria-live to assertive when specified', () => {
    const { result } = renderHook(() => useAnnounce());

    act(() => {
      result.current('Alert!', 'assertive');
    });

    const region = document.getElementById('sr-live-region');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
  });

  it('reuses existing live region element', () => {
    const { result } = renderHook(() => useAnnounce());

    act(() => {
      result.current('First');
    });
    act(() => {
      result.current('Second');
    });

    const regions = document.querySelectorAll('#sr-live-region');
    expect(regions).toHaveLength(1);
  });

  it('sets aria-atomic to true on the region', () => {
    const { result } = renderHook(() => useAnnounce());

    act(() => {
      result.current('Test');
    });

    const region = document.getElementById('sr-live-region');
    expect(region?.getAttribute('aria-atomic')).toBe('true');
  });
});
