/**
 * Tests for hooks/use-fcm-notifications.ts
 */

const mockFcmIsSupported = jest.fn(async () => false);
const mockFcmGetPermissionStatus = jest.fn(() => 'default' as const);
const mockFcmInitialize = jest.fn(async () => {});
const mockFcmGetToken = jest.fn(async () => null as string | null);
const mockFcmRequestPermission = jest.fn(async () => 'default' as const);
const mockFcmOnMessage = jest.fn(() => jest.fn() as () => void);

jest.mock('@/utils/fcm-manager', () => ({
  fcm: {
    isSupported: () => mockFcmIsSupported(),
    getPermissionStatus: () => mockFcmGetPermissionStatus(),
    initialize: () => mockFcmInitialize(),
    getToken: () => mockFcmGetToken(),
    requestPermission: () => mockFcmRequestPermission(),
    onMessage: (...args: unknown[]) => mockFcmOnMessage(...args),
  },
  NotificationPermission: {},
}));

const mockIsIOS = jest.fn(() => false);
const mockGetCapabilities = jest.fn(() => null);
jest.mock('@/utils/ios-notification-manager', () => ({
  iosNotifications: {
    isIOS: () => mockIsIOS(),
    getCapabilities: () => mockGetCapabilities(),
  },
}));

const mockPushTokenSync = jest.fn(async () => true);
jest.mock('@/services/push-token.service', () => ({
  pushTokenService: { sync: (...args: unknown[]) => mockPushTokenSync(...args) },
}));

const mockSwRegister = jest.fn(async () => true);
jest.mock('@/utils/service-worker-registration', () => ({
  swRegistration: { register: (...args: unknown[]) => mockSwRegister(...args) },
}));

const mockFirebaseIsAvailable = jest.fn(() => false);
jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: { isAvailable: () => mockFirebaseIsAvailable() },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFCMNotifications } from '@/hooks/use-fcm-notifications';

beforeEach(() => {
  jest.clearAllMocks();
  mockFcmIsSupported.mockResolvedValue(false);
  mockFcmGetPermissionStatus.mockReturnValue('default');
  mockFcmInitialize.mockResolvedValue(undefined);
  mockFcmGetToken.mockResolvedValue(null);
  mockFcmRequestPermission.mockResolvedValue('default');
  mockFcmOnMessage.mockReturnValue(jest.fn());
  mockIsIOS.mockReturnValue(false);
  mockGetCapabilities.mockReturnValue(null);
  mockPushTokenSync.mockResolvedValue(true);
  mockSwRegister.mockResolvedValue(true);
  mockFirebaseIsAvailable.mockReturnValue(false);
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isLoading becomes false after initialization', async () => {
    const { result } = renderHook(() => useFCMNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('error starts null', () => {
    const { result } = renderHook(() => useFCMNotifications());
    expect(result.current.error).toBeNull();
  });

  it('token starts null', () => {
    const { result } = renderHook(() => useFCMNotifications());
    expect(result.current.token).toBeNull();
  });
});

// ─── firebase not available ───────────────────────────────────────────────────

describe('firebase not available', () => {
  it('sets isSupported = false and isLoading = false when Firebase unavailable', async () => {
    mockFirebaseIsAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useFCMNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSupported).toBe(false);
  });

  it('does not register service worker when Firebase unavailable', async () => {
    mockFirebaseIsAvailable.mockReturnValue(false);
    renderHook(() => useFCMNotifications());
    await waitFor(() => expect(mockFcmIsSupported).not.toHaveBeenCalled());
    expect(mockSwRegister).not.toHaveBeenCalled();
  });

  it('sets isIOS from iosNotifications.isIOS()', async () => {
    mockIsIOS.mockReturnValue(true);
    const { result } = renderHook(() => useFCMNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isIOS).toBe(true);
  });
});

// ─── firebase available — not supported ──────────────────────────────────────

describe('firebase available but FCM not supported', () => {
  beforeEach(() => {
    mockFirebaseIsAvailable.mockReturnValue(true);
    mockFcmIsSupported.mockResolvedValue(false);
  });

  it('sets isSupported = false', async () => {
    const { result } = renderHook(() => useFCMNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSupported).toBe(false);
  });

  it('registers service worker when autoRegisterServiceWorker = true (default)', async () => {
    renderHook(() => useFCMNotifications());
    await waitFor(() => expect(mockSwRegister).toHaveBeenCalledWith('/sw.js'));
  });

  it('skips service worker registration when autoRegisterServiceWorker = false', async () => {
    renderHook(() => useFCMNotifications({ autoRegisterServiceWorker: false }));
    await waitFor(() => expect(mockFcmIsSupported).toHaveBeenCalled());
    expect(mockSwRegister).not.toHaveBeenCalled();
  });
});

// ─── firebase available — permission granted ──────────────────────────────────

describe('firebase available, permission granted', () => {
  beforeEach(() => {
    mockFirebaseIsAvailable.mockReturnValue(true);
    mockFcmIsSupported.mockResolvedValue(true);
    mockFcmGetPermissionStatus.mockReturnValue('granted');
    mockFcmGetToken.mockResolvedValue('fcm-token-abc');
  });

  it('obtains and exposes the token', async () => {
    const { result } = renderHook(() => useFCMNotifications());
    await waitFor(() => expect(result.current.token).toBe('fcm-token-abc'));
  });

  it('calls onTokenReceived callback with the token', async () => {
    const onTokenReceived = jest.fn();
    renderHook(() => useFCMNotifications({ onTokenReceived }));
    await waitFor(() => expect(onTokenReceived).toHaveBeenCalledWith('fcm-token-abc'));
  });

  it('syncs token with backend when autoSyncToken = true (default)', async () => {
    renderHook(() => useFCMNotifications());
    await waitFor(() => expect(mockPushTokenSync).toHaveBeenCalledWith('fcm-token-abc'));
  });

  it('skips token sync when autoSyncToken = false', async () => {
    renderHook(() => useFCMNotifications({ autoSyncToken: false }));
    await waitFor(() => expect(mockFcmGetToken).toHaveBeenCalled());
    expect(mockPushTokenSync).not.toHaveBeenCalled();
  });
});

// ─── initialization error ────────────────────────────────────────────────────

describe('initialization error', () => {
  it('sets error and clears isLoading on failure', async () => {
    mockFirebaseIsAvailable.mockReturnValue(true);
    mockFcmIsSupported.mockRejectedValue(new Error('FCM init failed'));
    const { result } = renderHook(() => useFCMNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('FCM init failed');
  });

  it('calls onError callback with the error', async () => {
    const onError = jest.fn();
    const err = new Error('crash');
    mockFirebaseIsAvailable.mockReturnValue(true);
    mockFcmIsSupported.mockRejectedValue(err);
    renderHook(() => useFCMNotifications({ onError }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(err));
  });
});
