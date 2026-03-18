import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '@/hooks/use-network-status';

describe('useNetworkStatus', () => {
  it('returns true when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);
  });

  it('returns false after offline event', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('returns true after online event following offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });
});
