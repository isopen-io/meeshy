/**
 * Tests for hooks/useHapticFeedback.ts
 */

import { renderHook } from '@testing-library/react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

const mockVibrate = jest.fn();

beforeEach(() => {
  mockVibrate.mockClear();
  Object.defineProperty(navigator, 'vibrate', {
    value: mockVibrate,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'vibrate', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

// ─── vibrate ──────────────────────────────────────────────────────────────────

describe('vibrate', () => {
  it('calls navigator.vibrate(10) for light pattern', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('light');
    expect(mockVibrate).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate(20) for medium pattern', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('medium');
    expect(mockVibrate).toHaveBeenCalledWith(20);
  });

  it('calls navigator.vibrate(40) for heavy pattern', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('heavy');
    expect(mockVibrate).toHaveBeenCalledWith(40);
  });

  it('calls navigator.vibrate with array for success pattern', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('success');
    expect(mockVibrate).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('calls navigator.vibrate with array for error pattern', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('error');
    expect(mockVibrate).toHaveBeenCalledWith([20, 100, 20, 100, 20]);
  });

  it('does not throw when navigator.vibrate is not available', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
    const { result } = renderHook(() => useHapticFeedback());
    expect(() => result.current.vibrate('light')).not.toThrow();
  });
});

// ─── vibrateCustom ────────────────────────────────────────────────────────────

describe('vibrateCustom', () => {
  it('calls navigator.vibrate with a custom duration', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrateCustom(150);
    expect(mockVibrate).toHaveBeenCalledWith(150);
  });

  it('calls navigator.vibrate with a custom array pattern', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrateCustom([100, 50, 100]);
    expect(mockVibrate).toHaveBeenCalledWith([100, 50, 100]);
  });

  it('does nothing when vibrate not available', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
    const { result } = renderHook(() => useHapticFeedback());
    expect(() => result.current.vibrateCustom(100)).not.toThrow();
  });
});

// ─── cancel ───────────────────────────────────────────────────────────────────

describe('cancel', () => {
  it('calls navigator.vibrate(0) to stop vibration', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.cancel();
    expect(mockVibrate).toHaveBeenCalledWith(0);
  });

  it('does nothing when vibrate not available', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
    const { result } = renderHook(() => useHapticFeedback());
    expect(() => result.current.cancel()).not.toThrow();
  });
});
