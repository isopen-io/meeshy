/**
 * Tests for useFCMNotifications hook
 *
 * Tests cover:
 * - Initial state
 * - Firebase availability check
 * - Service Worker registration
 * - Permission request
 * - Token management
 * - iOS detection
 * - Error handling
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFCMNotifications, useSimpleFCMNotifications } from '@/hooks/use-fcm-notifications';

// Mock FCM manager
const mockFCMIsSupported = jest.fn(() => Promise.resolve(true));
const mockFCMInitialize = jest.fn(() => Promise.resolve());
const mockFCMRequestPermission = jest.fn(() => Promise.resolve('granted' as NotificationPermission));
const mockFCMGetToken = jest.fn(() => Promise.resolve('fcm-token-123'));
const mockFCMDeleteToken = jest.fn(() => Promise.resolve());
const mockFCMGetPermissionStatus = jest.fn(() => 'default' as NotificationPermission);
const mockFCMShouldPrompt = jest.fn(() => true);

jest.mock('@/utils/fcm-manager', () => ({
  fcm: {
    isSupported: () => mockFCMIsSupported(),
    initialize: () => mockFCMInitialize(),
    requestPermission: () => mockFCMRequestPermission(),
    getToken: () => mockFCMGetToken(),
    deleteToken: () => mockFCMDeleteToken(),
    getPermissionStatus: () => mockFCMGetPermissionStatus(),
    shouldPrompt: () => mockFCMShouldPrompt(),
  },
}));

// Mock iOS notification manager
const mockIsIOS = jest.fn(() => false);
const mockGetCapabilities = jest.fn(() => null);
const mockShouldShowInstallPrompt = jest.fn(() => false);
const mockGetDebugReport = jest.fn(() => ({}));

jest.mock('@/utils/ios-notification-manager', () => ({
  iosNotifications: {
    isIOS: () => mockIsIOS(),
    getCapabilities: () => mockGetCapabilities(),
    shouldShowInstallPrompt: () => mockShouldShowInstallPrompt(),
    getDebugReport: () => mockGetDebugReport(),
  },
}));

// Mock push token service
const mockSync = jest.fn(() => Promise.resolve(true));
const mockDelete = jest.fn(() => Promise.resolve(true));

jest.mock('@/services/push-token.service', () => ({
  pushTokenService: {
    sync: (token: string) => mockSync(token),
    delete: (token: string) => mockDelete(token),
  },
}));

// Mock service worker registration
const mockSwRegister = jest.fn(() => Promise.resolve(true));

jest.mock('@/utils/service-worker-registration', () => ({
  swRegistration: {
    register: (path: string) => mockSwRegister(path),
  },
}));

// Mock firebase availability checker
const mockFirebaseIsAvailable = jest.fn(() => true);

jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    isAvailable: () => mockFirebaseIsAvailable(),
  },
}));

describe('useFCMNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset to default values
    mockFirebaseIsAvailable.mockReturnValue(true);
    mockFCMIsSupported.mockResolvedValue(true);
    mockFCMGetPermissionStatus.mockReturnValue('default');
    mockFCMRequestPermission.mockResolvedValue('granted');
    mockFCMGetToken.mockResolvedValue('fcm-token-123');
    mockIsIOS.mockReturnValue(false);

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return isLoading true initially', () => {
      const { result } = renderHook(() => useFCMNotifications());

      expect(result.current.isLoading).toBe(true);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() => useFCMNotifications());

      expect(result.current.error).toBeNull();
    });

    it('should return token as null initially', () => {
      const { result } = renderHook(() => useFCMNotifications());

      expect(result.current.token).toBeNull();
    });

    it('should return permission as default initially', () => {
      const { result } = renderHook(() => useFCMNotifications());

      expect(result.current.permission).toBe('default');
    });
  });

  describe('Initialization', () => {
    it('should check Firebase availability', async () => {
      renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(mockFirebaseIsAvailable).toHaveBeenCalled();
      });
    });

    it('should skip initialization when Firebase not available', async () => {
      mockFirebaseIsAvailable.mockReturnValue(false);

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSupported).toBe(false);
      expect(mockFCMIsSupported).not.toHaveBeenCalled();
    });

    it('should register service worker when autoRegisterServiceWorker is true', async () => {
      renderHook(() => useFCMNotifications({ autoRegisterServiceWorker: true }));

      await waitFor(() => {
        expect(mockSwRegister).toHaveBeenCalledWith('/sw.js');
      });
    });

    it('should not register service worker when autoRegisterServiceWorker is false', async () => {
      const { result } = renderHook(() => useFCMNotifications({ autoRegisterServiceWorker: false }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockSwRegister).not.toHaveBeenCalled();
    });

    it('should check FCM support', async () => {
      renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(mockFCMIsSupported).toHaveBeenCalled();
      });
    });

    it('should get token when permission already granted', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.token).toBe('fcm-token-123');
      });
    });

    it('should sync token with backend when autoSyncToken is true', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      renderHook(() => useFCMNotifications({ autoSyncToken: true }));

      await waitFor(() => {
        expect(mockSync).toHaveBeenCalledWith('fcm-token-123');
      });
    });

    it('should call onTokenReceived callback', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      const onTokenReceived = jest.fn();

      renderHook(() => useFCMNotifications({ onTokenReceived }));

      await waitFor(() => {
        expect(onTokenReceived).toHaveBeenCalledWith('fcm-token-123');
      });
    });

    it('should detect iOS', async () => {
      mockIsIOS.mockReturnValue(true);
      mockGetCapabilities.mockReturnValue({ canPush: true });

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isIOS).toBe(true);
        expect(result.current.iosCapabilities).toEqual({ canPush: true });
      });
    });
  });

  describe('Request Permission', () => {
    it('should request notification permission', async () => {
      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = false;

      await act(async () => {
        success = await result.current.requestPermission();
      });

      expect(success).toBe(true);
      expect(mockFCMRequestPermission).toHaveBeenCalled();
    });

    it('should get token after permission granted', async () => {
      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(mockFCMGetToken).toHaveBeenCalled();
      expect(result.current.token).toBe('fcm-token-123');
    });

    it('should sync token after permission granted', async () => {
      const { result } = renderHook(() => useFCMNotifications({ autoSyncToken: true }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(mockSync).toHaveBeenCalledWith('fcm-token-123');
    });

    it('should return false when permission denied', async () => {
      mockFCMRequestPermission.mockResolvedValue('denied');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;

      await act(async () => {
        success = await result.current.requestPermission();
      });

      expect(success).toBe(false);
      expect(result.current.permission).toBe('denied');
    });

    it('should handle permission request error', async () => {
      mockFCMRequestPermission.mockRejectedValue(new Error('Permission error'));

      const onError = jest.fn();

      const { result } = renderHook(() => useFCMNotifications({ onError }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;

      await act(async () => {
        success = await result.current.requestPermission();
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe('Permission error');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Revoke Permission', () => {
    it('should delete token and remove from backend', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.token).toBe('fcm-token-123');
      });

      let success: boolean = false;

      await act(async () => {
        success = await result.current.revokePermission();
      });

      expect(success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('fcm-token-123');
      expect(mockFCMDeleteToken).toHaveBeenCalled();
      expect(result.current.token).toBeNull();
    });

    it('should handle revoke error', async () => {
      mockFCMDeleteToken.mockRejectedValue(new Error('Delete error'));

      const onError = jest.fn();

      const { result } = renderHook(() => useFCMNotifications({ onError }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;

      await act(async () => {
        success = await result.current.revokePermission();
      });

      expect(success).toBe(false);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Refresh Token', () => {
    it('should refresh FCM token', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockFCMGetToken.mockResolvedValue('new-token-456');

      let newToken: string | null = null;

      await act(async () => {
        newToken = await result.current.refreshToken();
      });

      expect(newToken).toBe('new-token-456');
      expect(result.current.token).toBe('new-token-456');
    });

    it('should return null if permission not granted', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('default');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let newToken: string | null = 'should-be-null';

      await act(async () => {
        newToken = await result.current.refreshToken();
      });

      expect(newToken).toBeNull();
    });
  });

  describe('Helper Functions', () => {
    it('should return shouldShowPrompt correctly', async () => {
      mockFCMShouldPrompt.mockReturnValue(true);

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shouldShowPrompt()).toBe(true);
    });

    it('should not show prompt when permission already granted', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shouldShowPrompt()).toBe(false);
    });

    it('should return shouldShowIOSInstallPrompt correctly', async () => {
      mockShouldShowInstallPrompt.mockReturnValue(true);

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shouldShowIOSInstallPrompt()).toBe(true);
    });

    it('should return hasPermission correctly', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('granted');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.hasPermission).toBe(true);
      });
    });

    it('should return isPermissionDenied correctly', async () => {
      mockFCMGetPermissionStatus.mockReturnValue('denied');

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isPermissionDenied).toBe(true);
    });
  });

  describe('Debug Info', () => {
    it('should return debug info', async () => {
      mockIsIOS.mockReturnValue(true);

      const { result } = renderHook(() => useFCMNotifications());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const debugInfo = result.current.getDebugInfo();

      expect(debugInfo).toHaveProperty('isSupported');
      expect(debugInfo).toHaveProperty('permission');
      expect(debugInfo).toHaveProperty('shouldShowPrompt');
      expect(debugInfo).toHaveProperty('shouldShowIOSInstallPrompt');
    });
  });
});

describe('useSimpleFCMNotifications', () => {
  it('should return hook with default options', () => {
    const { result } = renderHook(() => useSimpleFCMNotifications());

    expect(result.current).toHaveProperty('requestPermission');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('permission');
  });
});
