/**
 * Tests for hooks/use-prefetch-on-hover.ts
 */

const mockGetQueryData = jest.fn();
const mockPrefetchQuery = jest.fn();
const mockQueryClient = {
  getQueryData: mockGetQueryData,
  prefetchQuery: mockPrefetchQuery,
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => mockQueryClient),
}));

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: jest.fn(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { usePrefetchOnHover } from '@/hooks/use-prefetch-on-hover';

beforeEach(() => {
  jest.useFakeTimers();
  mockGetQueryData.mockReset();
  mockPrefetchQuery.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── usePrefetchOnHover ───────────────────────────────────────────────────────

describe('usePrefetchOnHover', () => {
  it('returns onMouseEnter and onMouseLeave handlers', () => {
    const { result } = renderHook(() => usePrefetchOnHover('conv1'));
    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
  });

  it('does not prefetch before the 200ms debounce elapses', () => {
    mockGetQueryData.mockReturnValue(undefined);
    const { result } = renderHook(() => usePrefetchOnHover('conv1'));
    act(() => { result.current.onMouseEnter(); });
    act(() => { jest.advanceTimersByTime(150); });
    expect(mockPrefetchQuery).not.toHaveBeenCalled();
  });

  it('prefetches after 200ms when data is not in cache', () => {
    mockGetQueryData.mockReturnValue(undefined);
    const { result } = renderHook(() => usePrefetchOnHover('conv1'));
    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });
    expect(mockPrefetchQuery).toHaveBeenCalledTimes(1);
  });

  it('passes the correct queryKey and queryFn to prefetchQuery', () => {
    mockGetQueryData.mockReturnValue(undefined);
    const { result } = renderHook(() => usePrefetchOnHover('conv42'));
    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });
    const [opts] = mockPrefetchQuery.mock.calls[0];
    expect(opts.queryKey).toContain('conv42');
    expect(typeof opts.queryFn).toBe('function');
  });

  it('does not prefetch when data is already cached', () => {
    mockGetQueryData.mockReturnValue([{ id: 'msg1' }]);
    const { result } = renderHook(() => usePrefetchOnHover('conv1'));
    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });
    expect(mockPrefetchQuery).not.toHaveBeenCalled();
  });

  it('cancels prefetch when mouse leaves before debounce completes', () => {
    mockGetQueryData.mockReturnValue(undefined);
    const { result } = renderHook(() => usePrefetchOnHover('conv1'));
    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
      result.current.onMouseLeave();
      jest.advanceTimersByTime(200);
    });
    expect(mockPrefetchQuery).not.toHaveBeenCalled();
  });

  it('resets the debounce timer on rapid re-entry', () => {
    mockGetQueryData.mockReturnValue(undefined);
    const { result } = renderHook(() => usePrefetchOnHover('conv1'));
    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
      result.current.onMouseEnter(); // reset timer
      jest.advanceTimersByTime(200);
    });
    expect(mockPrefetchQuery).toHaveBeenCalledTimes(1);
  });
});
