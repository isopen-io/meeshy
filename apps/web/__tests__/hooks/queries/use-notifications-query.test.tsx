/**
 * Tests for useNotificationsQuery and related hooks
 *
 * Tests cover:
 * - useNotificationsQuery: Basic query, loading, error, success states
 * - useInfiniteNotificationsQuery: Infinite scrolling pagination
 * - useUnreadNotificationCountQuery: Unread count with polling
 * - useNotificationCountsQuery: Multiple notification counts
 * - useMarkNotificationAsReadMutation: Mark single notification as read
 * - useMarkAllNotificationsAsReadMutation: Mark all as read
 * - useDeleteNotificationMutation: Delete single notification
 * - useDeleteAllReadNotificationsMutation: Delete all read notifications
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useNotificationsQuery,
  useInfiniteNotificationsQuery,
  useUnreadNotificationCountQuery,
  useNotificationCountsQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
  useDeleteAllReadNotificationsMutation,
} from '@/hooks/queries/use-notifications-query';

// Mock the notification service
const mockFetchNotifications = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockGetCounts = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockDeleteNotification = jest.fn();
const mockDeleteAllRead = jest.fn();

jest.mock('@/services/notification.service', () => ({
  NotificationService: {
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
    getUnreadCount: () => mockGetUnreadCount(),
    getCounts: () => mockGetCounts(),
    markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
    markAllAsRead: () => mockMarkAllAsRead(),
    deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args),
    deleteAllRead: () => mockDeleteAllRead(),
  },
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    notifications: {
      all: ['notifications'],
      lists: () => ['notifications', 'list'],
      list: (filters?: { unreadOnly?: boolean }) => ['notifications', 'list', filters],
      unreadCount: () => ['notifications', 'unreadCount'],
    },
  },
}));

// Test data
const mockNotification = {
  id: 'notif-1',
  type: 'message',
  title: 'New Message',
  content: 'You have a new message',
  isRead: false,
  createdAt: new Date('2024-01-01'),
  userId: 'user-1',
};

const mockNotifications = [
  mockNotification,
  { ...mockNotification, id: 'notif-2', title: 'Another Notification', isRead: true },
  { ...mockNotification, id: 'notif-3', title: 'Third Notification' },
];

const mockPaginatedResponse = {
  data: mockNotifications,
  pagination: {
    limit: 50,
    offset: 0,
    total: 3,
    hasMore: false,
  },
};

// Helper to create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// Helper to get access to QueryClient in tests
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  return { wrapper, queryClient };
}

describe('useNotificationsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should return isLoading true initially', () => {
      mockFetchNotifications.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useNotificationsQuery(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('Success State', () => {
    it('should return notifications on success', async () => {
      mockFetchNotifications.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(() => useNotificationsQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockNotifications);
    });
  });

  describe('Error State', () => {
    it('should return error on failure', async () => {
      const testError = new Error('Failed to fetch notifications');
      mockFetchNotifications.mockRejectedValue(testError);

      const { result } = renderHook(() => useNotificationsQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('Filters', () => {
    it('should pass filters to service', async () => {
      mockFetchNotifications.mockResolvedValue(mockPaginatedResponse);

      renderHook(() => useNotificationsQuery({ isRead: false }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalled();
      });

      expect(mockFetchNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          isRead: false,
          limit: 50,
        })
      );
    });

    it('should use custom limit', async () => {
      mockFetchNotifications.mockResolvedValue(mockPaginatedResponse);

      renderHook(() => useNotificationsQuery({ limit: 25 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalled();
      });

      expect(mockFetchNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 25,
        })
      );
    });
  });
});

describe('useInfiniteNotificationsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch first page', async () => {
    mockFetchNotifications.mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useInfiniteNotificationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
  });

  it('should determine hasNextPage from pagination', async () => {
    // The hook returns response.data which should have notifications and pagination
    mockFetchNotifications.mockResolvedValue({
      data: {
        notifications: mockNotifications,
        pagination: { limit: 50, offset: 0, total: 100, hasMore: true },
      },
    });

    const { result } = renderHook(() => useInfiniteNotificationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);
  });

  it('should fetch next page with correct offset', async () => {
    // First page - response.data should have pagination
    mockFetchNotifications.mockResolvedValueOnce({
      data: {
        notifications: mockNotifications,
        pagination: { limit: 50, offset: 0, total: 100, hasMore: true },
      },
    });

    // Second page
    mockFetchNotifications.mockResolvedValueOnce({
      data: {
        notifications: [{ ...mockNotification, id: 'notif-4' }],
        pagination: { limit: 50, offset: 50, total: 100, hasMore: false },
      },
    });

    const { result } = renderHook(() => useInfiniteNotificationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    // Fetch next page
    await act(async () => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(mockFetchNotifications).toHaveBeenCalledTimes(2);
    });

    // Second call should have offset 50
    expect(mockFetchNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({
        offset: 50,
      })
    );
  });
});

describe('useUnreadNotificationCountQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return unread count', async () => {
    mockGetUnreadCount.mockResolvedValue({ data: { count: 5 } });

    const { result } = renderHook(() => useUnreadNotificationCountQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(5);
  });

  it('should return 0 when count is undefined', async () => {
    mockGetUnreadCount.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useUnreadNotificationCountQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(0);
  });

  it('should handle error state', async () => {
    mockGetUnreadCount.mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() => useUnreadNotificationCountQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useNotificationCountsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return notification counts', async () => {
    const mockCounts = { messages: 3, mentions: 2, system: 1 };
    mockGetCounts.mockResolvedValue({ data: { counts: mockCounts } });

    const { result } = renderHook(() => useNotificationCountsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockCounts);
  });
});

describe('useMarkNotificationAsReadMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark notification as read', async () => {
    mockMarkAsRead.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkNotificationAsReadMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('notif-1');
    });

    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications'],
    });
  });

  it('should handle error', async () => {
    mockMarkAsRead.mockRejectedValue(new Error('Failed to mark as read'));

    const { result } = renderHook(() => useMarkNotificationAsReadMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync('notif-1');
      })
    ).rejects.toThrow('Failed to mark as read');
  });
});

describe('useMarkAllNotificationsAsReadMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark all notifications as read', async () => {
    mockMarkAllAsRead.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkAllNotificationsAsReadMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockMarkAllAsRead).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications'],
    });
  });
});

describe('useDeleteNotificationMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete notification', async () => {
    mockDeleteNotification.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteNotificationMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('notif-1');
    });

    expect(mockDeleteNotification).toHaveBeenCalledWith('notif-1');
    // Should invalidate both lists and unread count
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications', 'list'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications', 'unreadCount'],
    });
  });

  it('should handle deletion error', async () => {
    mockDeleteNotification.mockRejectedValue(new Error('Deletion failed'));

    const { result } = renderHook(() => useDeleteNotificationMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync('notif-1');
      })
    ).rejects.toThrow('Deletion failed');
  });
});

describe('useDeleteAllReadNotificationsMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete all read notifications', async () => {
    mockDeleteAllRead.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteAllReadNotificationsMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockDeleteAllRead).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['notifications'],
    });
  });

  it('should return isPending during mutation', async () => {
    let resolvePromise: (value: unknown) => void;
    mockDeleteAllRead.mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    const { result } = renderHook(() => useDeleteAllReadNotificationsMutation(), {
      wrapper: createWrapper(),
    });

    // Start mutation without awaiting
    act(() => {
      result.current.mutate();
    });

    // Wait for pending state
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ success: true });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});
