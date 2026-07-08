import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '@/lib/react-query/query-keys';
import { usePrefetchOnHover } from '@/hooks/use-prefetch-on-hover';
import { fetchMessagesFromService } from '@/hooks/queries/use-conversation-messages-rq';

jest.mock('@/hooks/queries/use-conversation-messages-rq', () => ({
  fetchMessagesFromService: jest.fn(),
}));

const mockFetchMessagesFromService = fetchMessagesFromService as jest.Mock;

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('usePrefetchOnHover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('warms the exact cache slot read by the infinite messages query', async () => {
    mockFetchMessagesFromService.mockResolvedValue({
      messages: [{ id: 'm1' }],
      hasMore: false,
      total: 1,
    });
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'), { wrapper });

    act(() => {
      result.current.onMouseEnter();
    });
    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as {
      pages: { messages: { id: string }[] }[];
    };

    expect(cached.pages[0].messages).toEqual([{ id: 'm1' }]);
  });

  it('does not refetch when the infinite query cache already has data', async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [{ id: 'existing' }], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    const { result } = renderHook(() => usePrefetchOnHover('conv-1'), { wrapper });

    act(() => {
      result.current.onMouseEnter();
    });
    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(mockFetchMessagesFromService).not.toHaveBeenCalled();
  });

  it('cancels the prefetch when the pointer leaves before the debounce fires', async () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePrefetchOnHover('conv-1'), { wrapper });

    act(() => {
      result.current.onMouseEnter();
      result.current.onMouseLeave();
    });
    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(mockFetchMessagesFromService).not.toHaveBeenCalled();
  });
});
