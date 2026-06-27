/**
 * Tests for hooks/v2/use-conversations-v2.ts
 */

const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
const mockPrefetchQuery = jest.fn();
const mockSetQueryData = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({
    prefetchQuery: mockPrefetchQuery,
    setQueryData: mockSetQueryData,
  })),
}));

jest.mock('@/hooks/queries/use-conversations-query', () => ({
  useInfiniteConversationsQuery: jest.fn(),
  useConversationQuery: jest.fn(),
}));

jest.mock('@/hooks/use-websocket', () => ({
  useWebSocket: jest.fn(() => ({ isConnected: false })),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: jest.fn(() => ({ t: (key: string) => key, locale: 'fr' })),
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    conversations: {
      infinite: jest.fn(() => ['conversations', 'infinite']),
      detail: jest.fn((id: string) => ['conversations', 'detail', id]),
    },
  },
}));

jest.mock('@/utils/v2/transform-conversation', () => ({
  transformToConversationItem: jest.fn((conv: any) => ({ ...conv, transformed: true })),
  groupConversationsByCategory: jest.fn(() => ({
    pinned: [],
    categorized: new Map(),
    uncategorized: [],
  })),
}));

jest.mock('@meeshy/shared/utils/sender-identity', () => ({
  getSenderUserId: jest.fn(() => null),
}));

import { renderHook, act } from '@testing-library/react';
import { useConversationsV2 } from '@/hooks/v2/use-conversations-v2';
import {
  useInfiniteConversationsQuery,
  useConversationQuery,
} from '@/hooks/queries/use-conversations-query';
import { useWebSocket } from '@/hooks/use-websocket';
import { useI18n } from '@/hooks/useI18n';
import { groupConversationsByCategory } from '@/utils/v2/transform-conversation';
import { useQueryClient } from '@tanstack/react-query';

const mockUseInfiniteQuery = useInfiniteConversationsQuery as jest.MockedFunction<typeof useInfiniteConversationsQuery>;
const mockUseConversationQuery = useConversationQuery as jest.MockedFunction<typeof useConversationQuery>;
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;
const mockUseI18n = useI18n as jest.MockedFunction<typeof useI18n>;
const mockGroupConversations = groupConversationsByCategory as jest.MockedFunction<typeof groupConversationsByCategory>;
const mockUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;

const makeConv = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1',
  title: 'Test',
  type: 'group',
  participants: [],
  unreadCount: 0,
  ...overrides,
} as any);

const makeEmptyQueryResult = () => ({
  data: undefined,
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: mockFetchNextPage,
  error: null,
  refetch: mockRefetch,
} as any);

beforeEach(() => {
  jest.resetAllMocks();
  mockUseQueryClient.mockReturnValue({
    prefetchQuery: mockPrefetchQuery,
    setQueryData: mockSetQueryData,
  } as any);
  mockUseI18n.mockReturnValue({ t: (key: string) => key, locale: 'fr' } as any);
  mockUseInfiniteQuery.mockReturnValue(makeEmptyQueryResult());
  mockUseConversationQuery.mockReturnValue({ data: null, isLoading: false } as any);
  mockUseWebSocket.mockReturnValue({ isConnected: false } as any);
  mockFetchNextPage.mockResolvedValue({});
  mockRefetch.mockResolvedValue({});
  mockGroupConversations.mockReturnValue({
    pinned: [],
    categorized: new Map(),
    uncategorized: [],
  } as any);
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('returns empty conversations array when no data', () => {
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.conversations).toEqual([]);
  });

  it('returns empty conversationItems when no data', () => {
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.conversationItems).toEqual([]);
  });

  it('returns isLoading from query', () => {
    mockUseInfiniteQuery.mockReturnValue({ ...makeEmptyQueryResult(), isLoading: true });
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns hasMore=false when no nextPage', () => {
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.hasMore).toBe(false);
  });

  it('returns empty typingUsers Map', () => {
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.typingUsers.size).toBe(0);
  });

  it('returns empty onlineUsers Set', () => {
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.onlineUsers.size).toBe(0);
  });

  it('returns isConnected from useWebSocket', () => {
    mockUseWebSocket.mockReturnValue({ isConnected: true } as any);
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.isConnected).toBe(true);
  });

  it('currentConversation is null when no selectedId', () => {
    const { result } = renderHook(() => useConversationsV2(null));
    expect(result.current.currentConversation).toBeNull();
  });
});

// ─── conversations from query data ────────────────────────────────────────────

describe('conversations from query data', () => {
  it('flattens conversations from pages', () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      data: {
        pages: [
          { conversations: [makeConv({ id: 'c1' }), makeConv({ id: 'c2' })] },
        ],
      },
    });

    const { result } = renderHook(() => useConversationsV2(null));

    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations[0].id).toBe('c1');
  });

  it('flattens conversations from multiple pages', () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      data: {
        pages: [
          { conversations: [makeConv({ id: 'c1' })] },
          { conversations: [makeConv({ id: 'c2' })] },
        ],
      },
    });

    const { result } = renderHook(() => useConversationsV2(null));

    expect(result.current.conversations).toHaveLength(2);
  });

  it('currentConversation comes from useConversationQuery', () => {
    const conv = makeConv({ id: 'selected-1' });
    mockUseConversationQuery.mockReturnValue({ data: conv, isLoading: false } as any);

    const { result } = renderHook(() => useConversationsV2('selected-1'));

    expect(result.current.currentConversation).toEqual(conv);
  });
});

// ─── typing events ────────────────────────────────────────────────────────────

describe('typing events', () => {
  it('adds user to typingUsers when isTyping=true', () => {
    let capturedOnTyping: ((e: any) => void) | null = null;
    mockUseWebSocket.mockImplementation(({ onTyping }: any) => {
      capturedOnTyping = onTyping;
      return { isConnected: false };
    });

    const { result } = renderHook(() => useConversationsV2('conv-1'));

    act(() => {
      capturedOnTyping?.({ conversationId: 'conv-1', userId: 'user-x', isTyping: true });
    });

    expect(result.current.typingUsers.get('conv-1')?.has('user-x')).toBe(true);
  });

  it('removes user from typingUsers when isTyping=false', () => {
    let capturedOnTyping: ((e: any) => void) | null = null;
    mockUseWebSocket.mockImplementation(({ onTyping }: any) => {
      capturedOnTyping = onTyping;
      return { isConnected: false };
    });

    const { result } = renderHook(() => useConversationsV2('conv-1'));

    act(() => {
      capturedOnTyping?.({ conversationId: 'conv-1', userId: 'user-x', isTyping: true });
    });
    act(() => {
      capturedOnTyping?.({ conversationId: 'conv-1', userId: 'user-x', isTyping: false });
    });

    expect(result.current.typingUsers.has('conv-1')).toBe(false);
  });
});

// ─── user status events ───────────────────────────────────────────────────────

describe('user status events', () => {
  it('adds user to onlineUsers when isOnline=true', () => {
    let capturedOnUserStatus: ((e: any) => void) | null = null;
    mockUseWebSocket.mockImplementation(({ onUserStatus }: any) => {
      capturedOnUserStatus = onUserStatus;
      return { isConnected: false };
    });

    const { result } = renderHook(() => useConversationsV2(null));

    act(() => {
      capturedOnUserStatus?.({ userId: 'user-y', isOnline: true });
    });

    expect(result.current.onlineUsers.has('user-y')).toBe(true);
  });

  it('removes user from onlineUsers when isOnline=false', () => {
    let capturedOnUserStatus: ((e: any) => void) | null = null;
    mockUseWebSocket.mockImplementation(({ onUserStatus }: any) => {
      capturedOnUserStatus = onUserStatus;
      return { isConnected: false };
    });

    const { result } = renderHook(() => useConversationsV2(null));

    act(() => { capturedOnUserStatus?.({ userId: 'user-y', isOnline: true }); });
    act(() => { capturedOnUserStatus?.({ userId: 'user-y', isOnline: false }); });

    expect(result.current.onlineUsers.has('user-y')).toBe(false);
  });
});

// ─── loadMore ─────────────────────────────────────────────────────────────────

describe('loadMore', () => {
  it('calls fetchNextPage when hasNextPage=true and not fetching', async () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      hasNextPage: true,
      isFetchingNextPage: false,
    });

    const { result } = renderHook(() => useConversationsV2(null));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('does not call fetchNextPage when hasNextPage=false', async () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      hasNextPage: false,
    });

    const { result } = renderHook(() => useConversationsV2(null));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockFetchNextPage).not.toHaveBeenCalled();
  });

  it('does not call fetchNextPage when already fetching', async () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      hasNextPage: true,
      isFetchingNextPage: true,
    });

    const { result } = renderHook(() => useConversationsV2(null));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockFetchNextPage).not.toHaveBeenCalled();
  });
});

// ─── refreshConversations ─────────────────────────────────────────────────────

describe('refreshConversations', () => {
  it('calls refetch', async () => {
    const { result } = renderHook(() => useConversationsV2(null));

    await act(async () => {
      await result.current.refreshConversations();
    });

    expect(mockRefetch).toHaveBeenCalled();
  });
});

// ─── selectConversation ───────────────────────────────────────────────────────

describe('selectConversation', () => {
  it('prefetches the selected conversation detail', () => {
    const { result } = renderHook(() => useConversationsV2(null));

    act(() => {
      result.current.selectConversation('conv-42');
    });

    expect(mockPrefetchQuery).toHaveBeenCalled();
  });

  it('marks conversation as read when unreadCount > 0', () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      data: {
        pages: [{ conversations: [makeConv({ id: 'conv-1', unreadCount: 3 })] }],
      },
    });

    const { result } = renderHook(() => useConversationsV2(null));

    act(() => {
      result.current.selectConversation('conv-1');
    });

    expect(mockSetQueryData).toHaveBeenCalled();
  });

  it('does not call setQueryData when unreadCount is 0', () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...makeEmptyQueryResult(),
      data: {
        pages: [{ conversations: [makeConv({ id: 'conv-1', unreadCount: 0 })] }],
      },
    });

    const { result } = renderHook(() => useConversationsV2(null));

    act(() => {
      result.current.selectConversation('conv-1');
    });

    expect(mockSetQueryData).not.toHaveBeenCalled();
  });
});
