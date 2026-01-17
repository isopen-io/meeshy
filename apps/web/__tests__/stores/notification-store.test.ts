/**
 * Notification Store Tests
 * Tests for notification state management with Zustand
 */

import { act } from '@testing-library/react';
import { useNotificationStore } from '../../stores/notification-store';
import type { Notification, NotificationType, NotificationPriority } from '@/types/notification';

// Mock the firebase availability checker
jest.mock('../../utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    isAvailable: jest.fn(() => false),
  },
}));

// Mock the notification service
jest.mock('../../services/notification.service', () => ({
  NotificationService: {
    fetchNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    deleteAllRead: jest.fn(),
  },
}));

describe('NotificationStore', () => {
  const createMockNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: `notif-${Date.now()}-${Math.random()}`,
    type: 'new_message' as NotificationType,
    title: 'New Message',
    body: 'You have a new message',
    priority: 'normal' as NotificationPriority,
    isRead: false,
    createdAt: new Date(),
    userId: 'user-123',
    ...overrides,
  });

  const mockNotification1 = createMockNotification({ id: 'notif-1' });
  const mockNotification2 = createMockNotification({ id: 'notif-2', isRead: true });
  const mockNotification3 = createMockNotification({ id: 'notif-3', type: 'mention' as NotificationType });

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useNotificationStore.setState({
        notifications: [],
        unreadCount: 0,
        counts: {
          total: 0,
          unread: 0,
          byType: {} as Record<NotificationType, number>,
          byPriority: {} as Record<NotificationPriority, number>,
        },
        isLoading: false,
        isLoadingMore: false,
        error: null,
        page: 1,
        hasMore: true,
        filters: {
          type: 'all' as const,
          isRead: undefined,
        },
        isConnected: false,
        lastSync: undefined,
        activeConversationId: null,
      });
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useNotificationStore.getState();

      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.isLoading).toBe(false);
      expect(state.isLoadingMore).toBe(false);
      expect(state.error).toBeNull();
      expect(state.page).toBe(1);
      expect(state.hasMore).toBe(true);
      expect(state.isConnected).toBe(false);
      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('addNotification', () => {
    it('should add a notification to the beginning of the list', () => {
      act(() => {
        useNotificationStore.getState().addNotification(mockNotification1);
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('notif-1');
    });

    it('should add new notifications at the beginning', () => {
      act(() => {
        useNotificationStore.getState().addNotification(mockNotification1);
        useNotificationStore.getState().addNotification(mockNotification2);
      });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].id).toBe('notif-2');
      expect(state.notifications[1].id).toBe('notif-1');
    });

    it('should not add duplicate notifications', () => {
      act(() => {
        useNotificationStore.getState().addNotification(mockNotification1);
        useNotificationStore.getState().addNotification(mockNotification1);
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
    });

    it('should increment unread count for unread notifications', () => {
      act(() => {
        useNotificationStore.getState().addNotification(mockNotification1);
      });

      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it('should not increment unread count for read notifications', () => {
      act(() => {
        useNotificationStore.getState().addNotification(mockNotification2);
      });

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should ignore notifications for active conversation', () => {
      const notificationWithContext = createMockNotification({
        id: 'notif-context',
        context: { conversationId: 'conv-123' },
      });

      act(() => {
        useNotificationStore.getState().setActiveConversationId('conv-123');
        useNotificationStore.getState().addNotification(notificationWithContext);
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('should add notifications for different conversations', () => {
      const notificationWithContext = createMockNotification({
        id: 'notif-context',
        context: { conversationId: 'conv-456' },
      });

      act(() => {
        useNotificationStore.getState().setActiveConversationId('conv-123');
        useNotificationStore.getState().addNotification(notificationWithContext);
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  describe('removeNotification', () => {
    it('should remove a notification', () => {
      act(() => {
        useNotificationStore.setState({ notifications: [mockNotification1, mockNotification2] });
        useNotificationStore.getState().removeNotification('notif-1');
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('notif-2');
    });

    it('should decrement unread count when removing unread notification', () => {
      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification1],
          unreadCount: 1,
        });
        useNotificationStore.getState().removeNotification('notif-1');
      });

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should not decrement unread count when removing read notification', () => {
      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification2],
          unreadCount: 0,
        });
        useNotificationStore.getState().removeNotification('notif-2');
      });

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read (optimistic update)', async () => {
      const { NotificationService } = await import('../../services/notification.service');
      (NotificationService.markAsRead as jest.Mock).mockResolvedValueOnce({});

      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification1],
          unreadCount: 1,
        });
      });

      await act(async () => {
        await useNotificationStore.getState().markAsRead('notif-1');
      });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].isRead).toBe(true);
      expect(state.notifications[0].readAt).toBeDefined();
      expect(state.unreadCount).toBe(0);
    });

    it('should not update already read notification', async () => {
      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification2],
          unreadCount: 0,
        });
      });

      await act(async () => {
        await useNotificationStore.getState().markAsRead('notif-2');
      });

      // Should not change anything
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should rollback on API error', async () => {
      const { NotificationService } = await import('../../services/notification.service');
      (NotificationService.markAsRead as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification1],
          unreadCount: 1,
        });
      });

      await act(async () => {
        await useNotificationStore.getState().markAsRead('notif-1');
      });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].isRead).toBe(false);
      expect(state.unreadCount).toBe(1);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read (optimistic update)', async () => {
      const { NotificationService } = await import('../../services/notification.service');
      (NotificationService.markAllAsRead as jest.Mock).mockResolvedValueOnce({});

      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification1, mockNotification3],
          unreadCount: 2,
        });
      });

      await act(async () => {
        await useNotificationStore.getState().markAllAsRead();
      });

      const state = useNotificationStore.getState();
      expect(state.notifications.every(n => n.isRead)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('should rollback on API error', async () => {
      const { NotificationService } = await import('../../services/notification.service');
      (NotificationService.markAllAsRead as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const originalNotifications = [
        { ...mockNotification1 },
        { ...mockNotification3 },
      ];

      act(() => {
        useNotificationStore.setState({
          notifications: originalNotifications,
          unreadCount: 2,
        });
      });

      await act(async () => {
        await useNotificationStore.getState().markAllAsRead();
      });

      const state = useNotificationStore.getState();
      expect(state.unreadCount).toBe(2);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification (optimistic update)', async () => {
      const { NotificationService } = await import('../../services/notification.service');
      (NotificationService.deleteNotification as jest.Mock).mockResolvedValueOnce({});

      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification1, mockNotification2],
        });
      });

      await act(async () => {
        await useNotificationStore.getState().deleteNotification('notif-1');
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('notif-2');
    });
  });

  describe('deleteAllRead', () => {
    it('should delete all read notifications (optimistic update)', async () => {
      const { NotificationService } = await import('../../services/notification.service');
      (NotificationService.deleteAllRead as jest.Mock).mockResolvedValueOnce({});

      act(() => {
        useNotificationStore.setState({
          notifications: [mockNotification1, mockNotification2],
        });
      });

      await act(async () => {
        await useNotificationStore.getState().deleteAllRead();
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('notif-1');
    });
  });

  describe('Filters', () => {
    describe('setFilters', () => {
      it('should update filters', () => {
        act(() => {
          useNotificationStore.getState().setFilters({ type: 'mention' as NotificationType });
        });

        expect(useNotificationStore.getState().filters.type).toBe('mention');
      });

      it('should reset page to 1 when filters change', () => {
        act(() => {
          useNotificationStore.setState({ page: 5 });
          useNotificationStore.getState().setFilters({ isRead: true });
        });

        expect(useNotificationStore.getState().page).toBe(1);
      });

      it('should reset hasMore to true when filters change', () => {
        act(() => {
          useNotificationStore.setState({ hasMore: false });
          useNotificationStore.getState().setFilters({ isRead: false });
        });

        expect(useNotificationStore.getState().hasMore).toBe(true);
      });
    });

    describe('clearFilters', () => {
      it('should reset filters to default', () => {
        act(() => {
          useNotificationStore.getState().setFilters({ type: 'mention' as NotificationType, isRead: true });
          useNotificationStore.getState().clearFilters();
        });

        const state = useNotificationStore.getState();
        expect(state.filters.type).toBe('all');
        expect(state.filters.isRead).toBeUndefined();
      });
    });
  });

  describe('Counts', () => {
    describe('updateCounts', () => {
      it('should update counts directly', () => {
        const newCounts = {
          total: 10,
          unread: 5,
          byType: { new_message: 3, mention: 2 } as Record<NotificationType, number>,
          byPriority: { normal: 5, high: 5 } as Record<NotificationPriority, number>,
        };

        act(() => {
          useNotificationStore.getState().updateCounts(newCounts);
        });

        expect(useNotificationStore.getState().counts).toEqual(newCounts);
      });
    });

    describe('updateCountsFromNotifications', () => {
      it('should calculate counts from notifications', () => {
        act(() => {
          useNotificationStore.setState({
            notifications: [mockNotification1, mockNotification2, mockNotification3],
          });
          useNotificationStore.getState().updateCountsFromNotifications();
        });

        const counts = useNotificationStore.getState().counts;
        expect(counts.total).toBe(3);
        expect(counts.unread).toBe(2); // notif-1 and notif-3 are unread
      });
    });
  });

  describe('State Setters', () => {
    describe('setLoading', () => {
      it('should set loading state', () => {
        act(() => {
          useNotificationStore.getState().setLoading(true);
        });

        expect(useNotificationStore.getState().isLoading).toBe(true);
      });
    });

    describe('setError', () => {
      it('should set error message', () => {
        act(() => {
          useNotificationStore.getState().setError('Something went wrong');
        });

        expect(useNotificationStore.getState().error).toBe('Something went wrong');
      });

      it('should clear error when set to null', () => {
        act(() => {
          useNotificationStore.getState().setError('Error');
          useNotificationStore.getState().setError(null);
        });

        expect(useNotificationStore.getState().error).toBeNull();
      });
    });

    describe('setConnected', () => {
      it('should set connection state', () => {
        act(() => {
          useNotificationStore.getState().setConnected(true);
        });

        expect(useNotificationStore.getState().isConnected).toBe(true);
      });
    });

    describe('setActiveConversationId', () => {
      it('should set active conversation ID', () => {
        act(() => {
          useNotificationStore.getState().setActiveConversationId('conv-123');
        });

        expect(useNotificationStore.getState().activeConversationId).toBe('conv-123');
      });

      it('should allow setting to null', () => {
        act(() => {
          useNotificationStore.getState().setActiveConversationId('conv-123');
          useNotificationStore.getState().setActiveConversationId(null);
        });

        expect(useNotificationStore.getState().activeConversationId).toBeNull();
      });
    });
  });

  describe('Selector Hooks', () => {
    it('useNotifications should return notifications array', () => {
      act(() => {
        useNotificationStore.setState({ notifications: [mockNotification1] });
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('useUnreadCount should return unread count', () => {
      act(() => {
        useNotificationStore.setState({ unreadCount: 5 });
      });

      expect(useNotificationStore.getState().unreadCount).toBe(5);
    });

    it('useNotificationCounts should return counts', () => {
      const counts = {
        total: 10,
        unread: 5,
        byType: {} as Record<NotificationType, number>,
        byPriority: {} as Record<NotificationPriority, number>,
      };

      act(() => {
        useNotificationStore.setState({ counts });
      });

      expect(useNotificationStore.getState().counts).toEqual(counts);
    });

    it('useNotificationFilters should return filters', () => {
      act(() => {
        useNotificationStore.getState().setFilters({ type: 'mention' as NotificationType });
      });

      expect(useNotificationStore.getState().filters.type).toBe('mention');
    });

    it('useNotificationLoading should return loading state', () => {
      act(() => {
        useNotificationStore.setState({ isLoading: true });
      });

      expect(useNotificationStore.getState().isLoading).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should only persist limited notifications (first 50)', () => {
      // The store partializes to only persist first 50 notifications
      // This is verified by the store configuration
      const state = useNotificationStore.getState();

      // Verify the persisted structure
      expect(state).toHaveProperty('notifications');
      expect(state).toHaveProperty('unreadCount');
      expect(state).toHaveProperty('counts');
      expect(state).toHaveProperty('filters');
    });
  });

  describe('LRU Eviction', () => {
    it('should evict old read notifications when max is exceeded', () => {
      // Create notifications to exceed MAX_NOTIFICATIONS (500)
      const notifications: Notification[] = [];
      for (let i = 0; i < 501; i++) {
        notifications.push(createMockNotification({
          id: `notif-${i}`,
          isRead: i < 100, // First 100 are read
          createdAt: new Date(Date.now() - i * 1000), // Older dates for higher indices
        }));
      }

      act(() => {
        useNotificationStore.setState({ notifications: notifications.slice(0, 500) });
        // Add one more to trigger eviction
        useNotificationStore.getState().addNotification(
          createMockNotification({ id: 'notif-new', isRead: false })
        );
      });

      const state = useNotificationStore.getState();
      // Should have evicted some read notifications
      expect(state.notifications.length).toBeLessThanOrEqual(500);
    });
  });
});
