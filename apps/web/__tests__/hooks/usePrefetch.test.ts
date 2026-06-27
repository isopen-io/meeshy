/**
 * Tests for hooks/use-prefetch.ts
 */

import { renderHook, act } from '@testing-library/react';
import { usePrefetch, usePrefetchRoute, usePrefetchImage } from '@/hooks/use-prefetch';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── usePrefetch ──────────────────────────────────────────────────────────────

describe('usePrefetch', () => {
  it('returns onMouseEnter, onMouseLeave, and onFocus handlers', () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader));

    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
    expect(typeof result.current.onFocus).toBe('function');
  });

  it('does not call loader before the delay on hover', () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
    });

    expect(loader).not.toHaveBeenCalled();
  });

  it('calls loader after the delay elapses', () => {
    const loader = jest.fn().mockResolvedValue({});
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(loader).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not call loader again if already loaded', () => {
    const loader = jest.fn().mockResolvedValue({});
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });

    expect(loader).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('cancels prefetch when mouse leaves before delay', () => {
    const loader = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
      result.current.onMouseLeave();
      jest.advanceTimersByTime(200);
    });

    expect(loader).not.toHaveBeenCalled();
  });

  it('onFocus calls loader immediately without delay', () => {
    const loader = jest.fn().mockResolvedValue({});
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => usePrefetch(loader));

    act(() => {
      result.current.onFocus();
    });

    expect(loader).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles loader errors gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loader = jest.fn().mockRejectedValue(new Error('chunk load failed'));
    const { result } = renderHook(() => usePrefetch(loader, { delay: 50 }));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    // No throw — async error is caught
    expect(loader).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('prefetches data URL when prefetchData is true', () => {
    const loader = jest.fn().mockResolvedValue({});
    mockFetch.mockResolvedValue({ ok: true });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePrefetch(loader, { delay: 50, prefetchData: true, dataUrl: '/api/data' })
    );

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/data',
      expect.objectContaining({ method: 'GET' })
    );
    consoleSpy.mockRestore();
  });

  it('does not fetch data when prefetchData is false', () => {
    const loader = jest.fn().mockResolvedValue({});
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePrefetch(loader, { delay: 50, prefetchData: false, dataUrl: '/api/data' })
    );

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles fetch data errors gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loader = jest.fn().mockResolvedValue({});
    mockFetch.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() =>
      usePrefetch(loader, { delay: 50, prefetchData: true, dataUrl: '/api/data' })
    );

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(mockFetch).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('replaces previous timeout when onMouseEnter called twice quickly', () => {
    const loader = jest.fn().mockResolvedValue({});
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = renderHook(() => usePrefetch(loader, { delay: 100 }));

    act(() => {
      result.current.onMouseEnter(); // First hover at t=0
      jest.advanceTimersByTime(50);
      result.current.onMouseLeave();
      result.current.onMouseEnter(); // Re-hover at t=50
      jest.advanceTimersByTime(100);
    });

    expect(loader).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

// ─── usePrefetchRoute ─────────────────────────────────────────────────────────

describe('usePrefetchRoute', () => {
  it('returns onMouseEnter and onMouseLeave', () => {
    const { result } = renderHook(() => usePrefetchRoute('/dashboard'));

    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
  });

  it('does not dispatch event before delay', () => {
    const dispatchSpy = jest.spyOn(Element.prototype, 'dispatchEvent');
    const { result } = renderHook(() => usePrefetchRoute('/dashboard', { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('cancels on mouse leave', () => {
    const dispatchSpy = jest.spyOn(Element.prototype, 'dispatchEvent');
    const { result } = renderHook(() => usePrefetchRoute('/dashboard', { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
      result.current.onMouseLeave();
      jest.advanceTimersByTime(200);
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('dispatches mouseenter on matching anchor after delay', () => {
    const anchor = document.createElement('a');
    anchor.setAttribute('href', '/dashboard');
    document.body.appendChild(anchor);
    const dispatchSpy = jest.spyOn(anchor, 'dispatchEvent');

    const { result } = renderHook(() => usePrefetchRoute('/dashboard', { delay: 100 }));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(dispatchSpy).toHaveBeenCalled();

    document.body.removeChild(anchor);
    dispatchSpy.mockRestore();
  });
});

// ─── usePrefetchImage ─────────────────────────────────────────────────────────

describe('usePrefetchImage', () => {
  let MockImageConstructor: jest.Mock;
  let lastImage: { src: string; onload: (() => void) | null };

  beforeEach(() => {
    lastImage = { src: '', onload: null };
    MockImageConstructor = jest.fn(() => lastImage);
    (global as any).Image = MockImageConstructor;
  });

  afterEach(() => {
    delete (global as any).Image;
  });

  it('returns onMouseEnter and onMouseLeave', () => {
    const { result } = renderHook(() => usePrefetchImage(['/img/a.jpg']));

    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
  });

  it('does not load images before delay', () => {
    const { result } = renderHook(() => usePrefetchImage(['/img/a.jpg'], 100));

    act(() => {
      result.current.onMouseEnter();
    });

    expect(MockImageConstructor).not.toHaveBeenCalled();
  });

  it('creates Image elements for each URL after delay', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePrefetchImage(['/img/a.jpg', '/img/b.jpg'], 100)
    );

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(MockImageConstructor).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('sets src on created Image elements', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const images: Array<{ src: string; onload: (() => void) | null }> = [];
    MockImageConstructor.mockImplementation(() => {
      const img = { src: '', onload: null };
      images.push(img);
      return img;
    });

    const { result } = renderHook(() =>
      usePrefetchImage(['/img/a.jpg'], 100)
    );

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(images[0].src).toBe('/img/a.jpg');
    consoleSpy.mockRestore();
  });

  it('cancels image loading on mouse leave', () => {
    const { result } = renderHook(() => usePrefetchImage(['/img/a.jpg'], 100));

    act(() => {
      result.current.onMouseEnter();
      result.current.onMouseLeave();
      jest.advanceTimersByTime(200);
    });

    expect(MockImageConstructor).not.toHaveBeenCalled();
  });

  it('does not reload already-loaded images', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePrefetchImage(['/img/a.jpg'], 100)
    );

    // First hover — loads image
    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    // Trigger onload to mark as loaded
    act(() => {
      lastImage.onload?.();
    });

    // Second hover — should not create new Image
    act(() => {
      result.current.onMouseLeave();
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
    });

    expect(MockImageConstructor).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
