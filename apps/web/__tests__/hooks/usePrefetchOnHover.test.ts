/**
 * Tests for hooks/use-prefetch-on-hover.ts
 */

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    messages: {
      list: (id: string) => ['messages', id],
    },
  },
}));

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: jest.fn(() => Promise.resolve({ messages: [], total: 0 })),
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { usePrefetchOnHover } from '@/hooks/use-prefetch-on-hover';
import { useQueryClient } from '@tanstack/react-query';
import { conversationsService } from '@/services/conversations.service';

const mockGetMessages = conversationsService.getMessages as jest.MockedFunction<
  typeof conversationsService.getMessages
>;

describe('usePrefetchOnHover', () => {
  const makeMockClient = (cachedData?: unknown) => ({
    getQueryData: jest.fn(() => cachedData),
    prefetchQuery: jest.fn(),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns onMouseEnter and onMouseLeave handlers', () => {
    const mockClient = makeMockClient();
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onMouseLeave).toBe('function');
  });

  it('does not prefetch immediately on hover', () => {
    const mockClient = makeMockClient();
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    act(() => {
      result.current.onMouseEnter();
    });

    expect(mockClient.prefetchQuery).not.toHaveBeenCalled();
  });

  it('prefetches messages after 200ms debounce when data not cached', () => {
    const mockClient = makeMockClient(undefined); // no cache
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });

    expect(mockClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['messages', 'conv-1'] })
    );
  });

  it('passes conversation messages query function to prefetchQuery', () => {
    const mockClient = makeMockClient(undefined);
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-42'));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });

    const { queryFn } = mockClient.prefetchQuery.mock.calls[0][0];
    queryFn();
    expect(mockGetMessages).toHaveBeenCalledWith('conv-42', 1, 20);
  });

  it('does not prefetch when data is already cached', () => {
    const mockClient = makeMockClient({ pages: [[]] }); // cached
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(200);
    });

    expect(mockClient.prefetchQuery).not.toHaveBeenCalled();
  });

  it('cancels pending prefetch on mouse leave', () => {
    const mockClient = makeMockClient(undefined);
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100); // halfway through debounce
      result.current.onMouseLeave();
      jest.advanceTimersByTime(200); // debounce fires but timer was cancelled
    });

    expect(mockClient.prefetchQuery).not.toHaveBeenCalled();
  });

  it('resets debounce timer on rapid consecutive mouse enters', () => {
    const mockClient = makeMockClient(undefined);
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    act(() => {
      result.current.onMouseEnter();
      jest.advanceTimersByTime(100);
      result.current.onMouseEnter(); // resets timer
      jest.advanceTimersByTime(100);
    });

    // Still within second debounce window, no prefetch yet
    expect(mockClient.prefetchQuery).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100); // complete the second debounce
    });

    expect(mockClient.prefetchQuery).toHaveBeenCalledTimes(1);
  });

  it('does nothing on mouse leave when no pending timer', () => {
    const mockClient = makeMockClient(undefined);
    (useQueryClient as jest.Mock).mockReturnValue(mockClient);

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'));

    // Should not throw
    expect(() => {
      act(() => {
        result.current.onMouseLeave();
      });
    }).not.toThrow();
  });
});
