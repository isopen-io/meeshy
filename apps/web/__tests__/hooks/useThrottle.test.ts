/**
 * Tests for hooks/useThrottle.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useThrottle, useThrottledCallback } from '@/hooks/useThrottle';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── useThrottle ──────────────────────────────────────────────────────────────

describe('useThrottle', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useThrottle('initial', 200));
    expect(result.current).toBe('initial');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 200),
      { initialProps: { value: 'a' } }
    );
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
  });

  it('updates after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 200),
      { initialProps: { value: 'a' } }
    );
    rerender({ value: 'b' });
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('b');
  });

  it('uses default delay of 16ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value),
      { initialProps: { value: 0 } }
    );
    rerender({ value: 1 });
    act(() => { jest.advanceTimersByTime(20); });
    expect(result.current).toBe(1);
  });
});

// ─── useThrottledCallback ─────────────────────────────────────────────────────
// The hook initialises lastRan to Date.now() at mount, so the first call
// within the delay window is always deferred (timeSinceLastRun ≈ 0 < delay).

describe('useThrottledCallback', () => {
  it('defers the first call until the delay elapses', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 200));
    act(() => { result.current('arg1'); });
    expect(fn).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(210); });
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  it('cancels the previous deferred call when a newer call arrives', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 200));
    act(() => {
      result.current('first');
      result.current('second');
    });
    act(() => { jest.advanceTimersByTime(250); });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('runs immediately when called after the delay window', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 200));
    act(() => { jest.advanceTimersByTime(250); });
    act(() => { result.current('immediate'); });
    expect(fn).toHaveBeenCalledWith('immediate');
  });

  it('passes arguments through to the callback', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 200));
    act(() => { result.current('a', 'b', 42); });
    act(() => { jest.advanceTimersByTime(210); });
    expect(fn).toHaveBeenCalledWith('a', 'b', 42);
  });
});
