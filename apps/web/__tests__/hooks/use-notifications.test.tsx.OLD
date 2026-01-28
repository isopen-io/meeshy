/**
 * Tests for useNotifications hook
 *
 * Tests cover:
 * - Initial state
 * - Notification service initialization
 * - Mark as read functionality
 * - Mark all as read
 * - Remove notification
 * - Clear all notifications
 * - Connection state tracking
 * - Toast display functionality
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from '@/hooks/use-notifications';

// Mock useAuth
let mockIsAuthenticated = true;
const mockUser = { id: 'user-123', username: 'testuser' };

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    user: mockIsAuthenticated ? mockUser : null,
    token: mockIsAuthenticated ? 'mock-token' : null,
  }),
}));

// Mock auth manager
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockIsAuthenticated ? 'auth-token-123' : null,
  },
}));

// Mock notification service
const mockInitialize = jest.fn();
const mockDisconnect = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockRemoveNotification = jest.fn();
const mockClearAll = jest.fn();
const mockGetNotifications = jest.fn(() => []);
const mockGetUnreadNotifications = jest.fn(() => []);
const mockGetCounts = jest.fn(() => ({
  total: 0,
  unread: 0,
  byType: {
    message: 0,
    system: 0,
    user_action: 0,
    conversation: 0,
    translation: 0,
  },
}));

jest.mock('@/services/notification.service', () => ({
  notificationService: {
    initialize: (...args: any[]) => mockInitialize(...args),
    disconnect: () => mockDisconnect(),
    markAsRead: (id: string) => mockMarkAsRead(id),
    markAllAsRead: () => mockMarkAllAsRead(),
    removeNotification: (id: string) => mockRemoveNotification(id),
    clearAll: () => mockClearAll(),
    getNotifications: () => mockGetNotifications(),
    getUnreadNotifications: () => mockGetUnreadNotifications(),
    getCounts: () => mockGetCounts(),
  },
}));

// Mock toast
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    success: (msg: string, opts?: any) => mockToastSuccess(msg, opts),
    error: (msg: string, opts?: any) => mockToastError(msg, opts),
    info: (msg: string, opts?: any) => mockToastInfo(msg, opts),
  },
}));

describe('useNotifications', () => {
  const mockNotification = {
    id: 'notif-1',
    type: 'message' as const,
    title: 'New Message',
    message: 'You have a new message',
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated = true;

    // Default mock returns
    mockGetNotifications.mockReturnValue([mockNotification]);
    mockGetUnreadNotifications.mockReturnValue([mockNotification]);
    mockGetCounts.mockReturnValue({
      total: 1,
      unread: 1,
      byType: {
        message: 1,
        system: 0,
        user_action: 0,
        conversation: 0,
        translation: 0,
      },
    });

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return notifications array', () => {
      const { result } = renderHook(() => useNotifications());

      expect(Array.isArray(result.current.notifications)).toBe(true);
    });

    it('should return unreadNotifications array', () => {
      const { result } = renderHook(() => useNotifications());

      expect(Array.isArray(result.current.unreadNotifications)).toBe(true);
    });

    it('should return counts object', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.counts).toBeDefined();
      expect(result.current.counts.total).toBeDefined();
      expect(result.current.counts.unread).toBeDefined();
    });

    it('should return unreadCount', () => {
      const { result } = renderHook(() => useNotifications());

      expect(typeof result.current.unreadCount).toBe('number');
    });

    it('should return totalCount', () => {
      const { result } = renderHook(() => useNotifications());

      expect(typeof result.current.totalCount).toBe('number');
    });

    it('should return isConnected', () => {
      const { result } = renderHook(() => useNotifications());

      expect(typeof result.current.isConnected).toBe('boolean');
    });
  });

  describe('Initialization', () => {
    it('should initialize notification service when authenticated', async () => {
      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalled();
      });
    });

    it('should pass correct options to initialize', async () => {
      renderHook(() => useNotifications());

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith(
          expect.objectContaining({
            token: 'auth-token-123',
            userId: mockUser.id,
            onConnect: expect.any(Function),
            onDisconnect: expect.any(Function),
            onError: expect.any(Function),
            onNotificationReceived: expect.any(Function),
            onCountsUpdated: expect.any(Function),
          })
        );
      });
    });

    it('should not initialize when not authenticated', async () => {
      mockIsAuthenticated = false;

      renderHook(() => useNotifications());

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('should disconnect on unmount', async () => {
      const { unmount } = renderHook(() => useNotifications());

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe('Mark As Read', () => {
    it('should call notificationService.markAsRead', async () => {
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        result.current.markAsRead('notif-1');
      });

      expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
    });

    it('should update notifications after marking as read', async () => {
      const { result } = renderHook(() => useNotifications());

      // Simulate marking as read
      mockGetUnreadNotifications.mockReturnValue([]);

      await act(async () => {
        result.current.markAsRead('notif-1');
      });

      expect(mockGetNotifications).toHaveBeenCalled();
      expect(mockGetUnreadNotifications).toHaveBeenCalled();
    });
  });

  describe('Mark All As Read', () => {
    it('should call notificationService.markAllAsRead', async () => {
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        result.current.markAllAsRead();
      });

      expect(mockMarkAllAsRead).toHaveBeenCalled();
    });
  });

  describe('Remove Notification', () => {
    it('should call notificationService.removeNotification', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.removeNotification('notif-1');
      });

      expect(mockRemoveNotification).toHaveBeenCalledWith('notif-1');
    });
  });

  describe('Clear All', () => {
    it('should call notificationService.clearAll', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.clearAll();
      });

      expect(mockClearAll).toHaveBeenCalled();
    });
  });

  describe('Connection State', () => {
    it('should update isConnected on connect', async () => {
      let onConnectCallback: () => void = () => {};

      mockInitialize.mockImplementation((options: any) => {
        onConnectCallback = options.onConnect;
      });

      const { result } = renderHook(() => useNotifications());

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalled();
      });

      expect(result.current.isConnected).toBe(false);

      act(() => {
        onConnectCallback();
      });

      expect(result.current.isConnected).toBe(true);
    });

    it('should update isConnected on disconnect', async () => {
      let onConnectCallback: () => void = () => {};
      let onDisconnectCallback: () => void = () => {};

      mockInitialize.mockImplementation((options: any) => {
        onConnectCallback = options.onConnect;
        onDisconnectCallback = options.onDisconnect;
      });

      const { result } = renderHook(() => useNotifications());

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalled();
      });

      // Connect first
      act(() => {
        onConnectCallback();
      });

      expect(result.current.isConnected).toBe(true);

      // Then disconnect
      act(() => {
        onDisconnectCallback();
      });

      expect(result.current.isConnected).toBe(false);
    });

    it('should update isConnected on error', async () => {
      let onConnectCallback: () => void = () => {};
      let onErrorCallback: (error: Error) => void = () => {};

      mockInitialize.mockImplementation((options: any) => {
        onConnectCallback = options.onConnect;
        onErrorCallback = options.onError;
      });

      const { result } = renderHook(() => useNotifications());

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalled();
      });

      // Connect first
      act(() => {
        onConnectCallback();
      });

      expect(result.current.isConnected).toBe(true);

      // Then error
      act(() => {
        onErrorCallback(new Error('Connection failed'));
      });

      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('Counts Update', () => {
    it('should update counts when onCountsUpdated is called', async () => {
      let onCountsUpdatedCallback: (counts: any) => void = () => {};

      mockInitialize.mockImplementation((options: any) => {
        onCountsUpdatedCallback = options.onCountsUpdated;
      });

      const { result } = renderHook(() => useNotifications());

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalled();
      });

      const newCounts = {
        total: 5,
        unread: 3,
        byType: {
          message: 2,
          system: 1,
          user_action: 0,
          conversation: 0,
          translation: 0,
        },
      };

      act(() => {
        onCountsUpdatedCallback(newCounts);
      });

      expect(result.current.counts).toEqual(newCounts);
      expect(result.current.unreadCount).toBe(3);
      expect(result.current.totalCount).toBe(5);
    });
  });

  describe('showToast', () => {
    it('should be a function', () => {
      const { result } = renderHook(() => useNotifications());

      expect(typeof result.current.showToast).toBe('function');
    });

    // Note: showToast is disabled in the hook, so toasts won't actually be shown
    it('should not show toast (disabled in hook)', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.showToast(mockNotification);
      });

      // Toast should not be called because it's disabled in the hook
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(mockToastInfo).not.toHaveBeenCalled();
    });
  });

  describe('Method Stability', () => {
    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useNotifications());

      const firstMarkAsRead = result.current.markAsRead;
      const firstMarkAllAsRead = result.current.markAllAsRead;
      const firstRemoveNotification = result.current.removeNotification;
      const firstClearAll = result.current.clearAll;

      rerender();

      expect(result.current.markAsRead).toBe(firstMarkAsRead);
      expect(result.current.markAllAsRead).toBe(firstMarkAllAsRead);
      expect(result.current.removeNotification).toBe(firstRemoveNotification);
      expect(result.current.clearAll).toBe(firstClearAll);
    });
  });
});
