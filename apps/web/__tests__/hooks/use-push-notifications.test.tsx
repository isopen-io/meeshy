/**
 * Tests for usePushNotifications hook
 *
 * Tests cover:
 * - Initial state
 * - Subscribe functionality
 * - Unsubscribe functionality
 * - Refresh state
 * - Permission handling
 * - Backend sync
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePushNotifications, useCanReceivePushNotifications } from '@/hooks/use-push-notifications';

// Mock push notifications utils
const mockSubscribeToPushNotifications = jest.fn();
const mockUnsubscribeFromPushNotifications = jest.fn();
const mockGetCurrentSubscription = jest.fn();
const mockIsPushNotificationSupported = jest.fn(() => true);
const mockCanReceivePushNotifications = jest.fn(() => Promise.resolve(false));

jest.mock('@/utils/push-notifications', () => ({
  subscribeToPushNotifications: (...args: any[]) => mockSubscribeToPushNotifications(...args),
  unsubscribeFromPushNotifications: () => mockUnsubscribeFromPushNotifications(),
  getCurrentSubscription: () => mockGetCurrentSubscription(),
  isPushNotificationSupported: () => mockIsPushNotificationSupported(),
  canReceivePushNotifications: () => mockCanReceivePushNotifications(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Notification
const mockNotification = {
  permission: 'default' as NotificationPermission,
};

Object.defineProperty(global, 'Notification', {
  value: mockNotification,
  writable: true,
});

// Store original env
const originalEnv = process.env;

describe('usePushNotifications', () => {
  const mockSubscription = {
    endpoint: 'https://push.example.com/endpoint',
    toJSON: () => ({
      endpoint: 'https://push.example.com/endpoint',
      keys: { p256dh: 'key1', auth: 'key2' },
    }),
  } as unknown as PushSubscription;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set VAPID key
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-vapid-key',
    };

    // Default mock implementations
    mockGetCurrentSubscription.mockResolvedValue(null);
    mockSubscribeToPushNotifications.mockResolvedValue(mockSubscription);
    mockUnsubscribeFromPushNotifications.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true });

    // Reset Notification permission
    (global as any).Notification = { permission: 'default' };

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial permission', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.permission).toBe('default');
      });
    });

    it('should return subscription as null initially', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.subscription).toBeNull();
      });
    });

    it('should return isSubscribed false initially', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(false);
      });
    });

    it('should return isLoading false after init', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should check isSupported', () => {
      const { result } = renderHook(() => usePushNotifications());

      expect(result.current.isSupported).toBe(true);
    });
  });

  describe('Refresh', () => {
    it('should load current subscription on mount', async () => {
      mockGetCurrentSubscription.mockResolvedValue(mockSubscription);
      (global as any).Notification = { permission: 'granted' };

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.subscription).toEqual(mockSubscription);
        expect(result.current.isSubscribed).toBe(true);
      });
    });

    it('should update permission from Notification API', async () => {
      (global as any).Notification = { permission: 'granted' };

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.permission).toBe('granted');
      });
    });

    it('should handle refresh when not supported', async () => {
      mockIsPushNotificationSupported.mockReturnValue(false);

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isSupported).toBe(false);
      });

      expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
    });
  });

  describe('Subscribe', () => {
    it('should subscribe to push notifications', async () => {
      (global as any).Notification = { permission: 'granted' };

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let subscription: PushSubscription | null = null;

      await act(async () => {
        subscription = await result.current.subscribe();
      });

      expect(subscription).toEqual(mockSubscription);
      expect(mockSubscribeToPushNotifications).toHaveBeenCalledWith('test-vapid-key');
      expect(result.current.isSubscribed).toBe(true);
    });

    it('should send subscription to backend', async () => {
      (global as any).Notification = { permission: 'granted' };

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.subscribe();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockSubscription.toJSON()),
        credentials: 'include',
      });
    });

    it('should return null when not supported', async () => {
      mockIsPushNotificationSupported.mockReturnValue(false);

      const { result } = renderHook(() => usePushNotifications());

      let subscription: PushSubscription | null = mockSubscription;

      await act(async () => {
        subscription = await result.current.subscribe();
      });

      expect(subscription).toBeNull();
    });

    it('should return null when VAPID key not configured', async () => {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      const { result } = renderHook(() => usePushNotifications());

      let subscription: PushSubscription | null = mockSubscription;

      await act(async () => {
        subscription = await result.current.subscribe();
      });

      expect(subscription).toBeNull();
    });

    it('should handle subscribe error', async () => {
      mockSubscribeToPushNotifications.mockRejectedValue(new Error('Subscribe failed'));

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let subscription: PushSubscription | null = mockSubscription;

      await act(async () => {
        subscription = await result.current.subscribe();
      });

      expect(subscription).toBeNull();
    });

    it('should handle backend save failure gracefully', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let subscription: PushSubscription | null = null;

      await act(async () => {
        subscription = await result.current.subscribe();
      });

      // Should still return subscription even if backend fails
      expect(subscription).toEqual(mockSubscription);
    });
  });

  describe('Unsubscribe', () => {
    it('should unsubscribe from push notifications', async () => {
      mockGetCurrentSubscription.mockResolvedValue(mockSubscription);
      (global as any).Notification = { permission: 'granted' };

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(true);
      });

      let success: boolean = false;

      await act(async () => {
        success = await result.current.unsubscribe();
      });

      expect(success).toBe(true);
      expect(mockUnsubscribeFromPushNotifications).toHaveBeenCalled();
      expect(result.current.subscription).toBeNull();
      expect(result.current.isSubscribed).toBe(false);
    });

    it('should notify backend on unsubscribe', async () => {
      mockGetCurrentSubscription.mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(true);
      });

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/push/unsubscribe', {
        method: 'POST',
        credentials: 'include',
      });
    });

    it('should handle unsubscribe error', async () => {
      mockUnsubscribeFromPushNotifications.mockRejectedValue(new Error('Unsubscribe failed'));

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;

      await act(async () => {
        success = await result.current.unsubscribe();
      });

      expect(success).toBe(false);
    });
  });

  describe('Manual Refresh', () => {
    it('should refresh state when called', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetCurrentSubscription.mockClear();
      mockGetCurrentSubscription.mockResolvedValue(mockSubscription);
      (global as any).Notification = { permission: 'granted' };

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetCurrentSubscription).toHaveBeenCalled();
      expect(result.current.subscription).toEqual(mockSubscription);
    });
  });
});

describe('useCanReceivePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanReceivePushNotifications.mockResolvedValue(false);
  });

  it('should return false initially', () => {
    const { result } = renderHook(() => useCanReceivePushNotifications());

    expect(result.current).toBe(false);
  });

  it('should return true when can receive notifications', async () => {
    mockCanReceivePushNotifications.mockResolvedValue(true);

    const { result } = renderHook(() => useCanReceivePushNotifications());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('should return false when cannot receive notifications', async () => {
    mockCanReceivePushNotifications.mockResolvedValue(false);

    const { result } = renderHook(() => useCanReceivePushNotifications());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
