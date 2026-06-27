/**
 * Tests for hooks/use-prefetch.ts
 */

import { renderHook, act } from '@testing-library/react';
import { usePrefetch, usePrefetchRoute, usePrefetchImage } from '@/hooks/use-prefetch';

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── usePrefetch ─────────────────────────────────────────────────────────────

describe('usePrefetch', () => {
  it('returns onMouseEnter, onMouseLeave, onFocus handlers', () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader));
    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
    expect(typeof result.current.onFocus).toBe('function');
  });

  it('does not call loader before delay expires', () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 200 }));
    act(() => { result.current.onMouseEnter(); });
    jest.advanceTimersByTime(100);
    expect(loader).not.toHaveBeenCalled();
  });

  it('calls loader after delay when mouse enters', async () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('cancels loader call when mouse leaves before delay', async () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 200 }));
    act(() => { result.current.onMouseEnter(); });
    act(() => { result.current.onMouseLeave(); });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(loader).not.toHaveBeenCalled();
  });

  it('does not call loader twice after multiple hover events', async () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); });
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('calls loader immediately on focus', async () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader));
    await act(async () => { result.current.onFocus(); });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('resets loadedRef on loader failure so next attempt can retry', async () => {
    const loader = jest.fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
    expect(loader).toHaveBeenCalledTimes(1);
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('fetches dataUrl when prefetchData=true and mouse enters', async () => {
    const loader = jest.fn().mockResolvedValue({});
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    const { result } = renderHook(() =>
      usePrefetch(loader, { delay: 100, prefetchData: true, dataUrl: '/api/data' })
    );
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledWith('/api/data', expect.objectContaining({ method: 'GET' }));
  });

  it('does not fetch data when prefetchData=false', async () => {
    const loader = jest.fn().mockResolvedValue({});
    const mockFetch = jest.fn();
    global.fetch = mockFetch;
    const { result } = renderHook(() =>
      usePrefetch(loader, { delay: 100, prefetchData: false, dataUrl: '/api/data' })
    );
    act(() => { result.current.onMouseEnter(); });
    await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── usePrefetchRoute ─────────────────────────────────────────────────────────

describe('usePrefetchRoute', () => {
  it('returns onMouseEnter and onMouseLeave', () => {
    const { result } = renderHook(() => usePrefetchRoute('/dashboard'));
    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
  });

  it('does not throw on hover events', async () => {
    const { result } = renderHook(() => usePrefetchRoute('/dashboard', { delay: 100 }));
    expect(() => {
      act(() => { result.current.onMouseEnter(); });
      act(() => { result.current.onMouseLeave(); });
    }).not.toThrow();
  });

  it('cancels prefetch when leaving before delay', async () => {
    const dispatchSpy = jest.spyOn(document, 'querySelector').mockReturnValue(null);
    const { result } = renderHook(() => usePrefetchRoute('/dashboard', { delay: 200 }));
    act(() => { result.current.onMouseEnter(); });
    act(() => { result.current.onMouseLeave(); });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });
});

// ─── usePrefetchImage ─────────────────────────────────────────────────────────

describe('usePrefetchImage', () => {
  it('returns onMouseEnter and onMouseLeave', () => {
    const { result } = renderHook(() => usePrefetchImage(['/img1.jpg']));
    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
  });

  it('does not throw on hover events', () => {
    const { result } = renderHook(() => usePrefetchImage(['/img1.jpg', '/img2.jpg']));
    expect(() => {
      act(() => { result.current.onMouseEnter(); });
      act(() => { result.current.onMouseLeave(); });
    }).not.toThrow();
  });

  it('cancels prefetch on mouse leave before delay', async () => {
    let imgSrcSet = '';
    const MockImage = jest.fn().mockImplementation(() => ({
      set src(val: string) { imgSrcSet = val; },
    }));
    (global as any).Image = MockImage;
    const { result } = renderHook(() => usePrefetchImage(['/img1.jpg'], 200));
    act(() => { result.current.onMouseEnter(); });
    act(() => { result.current.onMouseLeave(); });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(MockImage).not.toHaveBeenCalled();
  });
});
