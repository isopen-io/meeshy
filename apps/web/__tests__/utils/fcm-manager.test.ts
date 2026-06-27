/**
 * Tests for utils/fcm-manager.ts
 *
 * Strategy: mock firebase/app, firebase/messaging, @/firebase-config and
 * the firebase-availability-checker so no real Firebase calls are made.
 */

const mockIsAvailable = jest.fn(() => false);
const mockIsPushEnabled = jest.fn(() => false);
const mockIsBadgeEnabled = jest.fn(() => false);

jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    isAvailable: () => mockIsAvailable(),
    isPushEnabled: () => mockIsPushEnabled(),
    isBadgeEnabled: () => mockIsBadgeEnabled(),
  },
}));

const mockGetApps = jest.fn(() => []);
const mockInitializeApp = jest.fn(() => ({ name: '[DEFAULT]' }));
jest.mock('firebase/app', () => ({
  getApps: () => mockGetApps(),
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
}));

const mockIsMessagingSupported = jest.fn(async () => true);
const mockGetMessaging = jest.fn(() => ({ app: {} }));
const mockGetToken = jest.fn(async () => 'fcm-token-xyz');
const mockOnMessage = jest.fn(() => jest.fn());
const mockDeleteToken = jest.fn(async () => true);

jest.mock('firebase/messaging', () => ({
  getMessaging: (...args: unknown[]) => mockGetMessaging(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
  onMessage: (...args: unknown[]) => mockOnMessage(...args),
  deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
  isSupported: () => mockIsMessagingSupported(),
}));

const mockGetFirebaseConfig = jest.fn(() => ({ apiKey: 'test' }));
const mockGetVapidKey = jest.fn(() => 'vapid-key');
const mockIsFirebaseConfigured = jest.fn(() => true);
const mockNotificationFeatureFlags = { enablePushNotifications: true, debugNotifications: false };
const mockNotificationConfig = {
  repromptAfterDenialDays: 7,
  defaultNotificationOptions: { icon: '/icon.png', badge: '/badge.png', tag: 'meeshy', vibrate: [200], requireInteraction: false },
};

jest.mock('@/firebase-config', () => ({
  getFirebaseConfig: () => mockGetFirebaseConfig(),
  getVapidKey: () => mockGetVapidKey(),
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
  get notificationFeatureFlags() { return mockNotificationFeatureFlags; },
  get notificationConfig() { return mockNotificationConfig; },
}));

import { getFCMManager, resetFCMManager, fcm } from '@/utils/fcm-manager';

beforeEach(async () => {
  jest.clearAllMocks();
  await resetFCMManager();

  mockIsAvailable.mockReturnValue(true);
  mockIsPushEnabled.mockReturnValue(true);
  mockIsMessagingSupported.mockResolvedValue(true);
  mockGetApps.mockReturnValue([]);
  mockGetToken.mockResolvedValue('fcm-token-xyz');
  mockOnMessage.mockReturnValue(jest.fn());
  mockDeleteToken.mockResolvedValue(true);
  mockGetVapidKey.mockReturnValue('vapid-key');
  mockGetFirebaseConfig.mockReturnValue({ apiKey: 'test' });
  mockIsFirebaseConfigured.mockReturnValue(true);

  // Default Notification.permission = 'default'
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'default', requestPermission: jest.fn(async () => 'default') },
    writable: true,
    configurable: true,
  });

  localStorage.clear();
});

// ─── isSupported ──────────────────────────────────────────────────────────────

describe('isSupported', () => {
  it('returns false when firebase is not available', async () => {
    mockIsAvailable.mockReturnValue(false);
    const result = await getFCMManager().isSupported();
    expect(result).toBe(false);
  });

  it('returns false when push is not enabled', async () => {
    mockIsPushEnabled.mockReturnValue(false);
    const result = await getFCMManager().isSupported();
    expect(result).toBe(false);
  });

  it('returns false when isMessagingSupported() returns false', async () => {
    mockIsMessagingSupported.mockResolvedValue(false);
    const result = await getFCMManager().isSupported();
    expect(result).toBe(false);
  });

  it('returns true when all checks pass', async () => {
    const result = await getFCMManager().isSupported();
    expect(result).toBe(true);
  });

  it('returns false when isMessagingSupported throws', async () => {
    mockIsMessagingSupported.mockRejectedValue(new Error('crash'));
    const result = await getFCMManager().isSupported();
    expect(result).toBe(false);
  });
});

// ─── initialize ───────────────────────────────────────────────────────────────

describe('initialize', () => {
  it('returns false when firebase is not available', async () => {
    mockIsAvailable.mockReturnValue(false);
    const result = await getFCMManager().initialize();
    expect(result).toBe(false);
  });

  it('returns false when FCM not supported', async () => {
    mockIsMessagingSupported.mockResolvedValue(false);
    const result = await getFCMManager().initialize();
    expect(result).toBe(false);
  });

  it('initializes Firebase app and returns true', async () => {
    const result = await getFCMManager().initialize();
    expect(result).toBe(true);
    expect(mockGetMessaging).toHaveBeenCalled();
  });

  it('reuses existing Firebase app when apps already initialized', async () => {
    const existingApp = { name: '[DEFAULT]' };
    mockGetApps.mockReturnValue([existingApp]);
    const result = await getFCMManager().initialize();
    expect(result).toBe(true);
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('is idempotent — second call returns true without re-initializing', async () => {
    await getFCMManager().initialize();
    const result = await getFCMManager().initialize();
    expect(result).toBe(true);
    expect(mockGetMessaging).toHaveBeenCalledTimes(1);
  });
});

// ─── getPermissionStatus ──────────────────────────────────────────────────────

describe('getPermissionStatus', () => {
  it('returns default when Notification is unavailable', () => {
    delete (window as unknown as Record<string, unknown>).Notification;
    expect(getFCMManager().getPermissionStatus()).toBe('default');
  });

  it('returns current Notification.permission', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    expect(getFCMManager().getPermissionStatus()).toBe('granted');
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns true when permission is granted', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    expect(getFCMManager().hasPermission()).toBe(true);
  });

  it('returns false when permission is default', () => {
    expect(getFCMManager().hasPermission()).toBe(false);
  });

  it('returns false when permission is denied', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'denied', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    expect(getFCMManager().hasPermission()).toBe(false);
  });
});

// ─── shouldPromptForPermission ────────────────────────────────────────────────

describe('shouldPromptForPermission', () => {
  it('returns false when push notifications feature flag is off', () => {
    mockNotificationFeatureFlags.enablePushNotifications = false;
    expect(getFCMManager().shouldPromptForPermission()).toBe(false);
    mockNotificationFeatureFlags.enablePushNotifications = true;
  });

  it('returns false when permission is already granted', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    expect(getFCMManager().shouldPromptForPermission()).toBe(false);
  });

  it('returns false when permission is denied', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'denied', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    expect(getFCMManager().shouldPromptForPermission()).toBe(false);
  });

  it('returns true when permission is default and no recent denial', () => {
    expect(getFCMManager().shouldPromptForPermission()).toBe(true);
  });

  it('returns false when permission was recently denied (within repromptAfterDenialDays)', () => {
    const recentDenial = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago
    localStorage.setItem('fcm_last_denied', recentDenial.toString());
    expect(getFCMManager().shouldPromptForPermission()).toBe(false);
  });

  it('returns true when denial was longer ago than repromptAfterDenialDays', () => {
    const oldDenial = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    localStorage.setItem('fcm_last_denied', oldDenial.toString());
    expect(getFCMManager().shouldPromptForPermission()).toBe(true);
  });
});

// ─── recordPermissionDenial ───────────────────────────────────────────────────

describe('recordPermissionDenial', () => {
  it('stores current timestamp in localStorage', () => {
    getFCMManager().recordPermissionDenial();
    const stored = localStorage.getItem('fcm_last_denied');
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0);
  });
});

// ─── getCurrentToken ──────────────────────────────────────────────────────────

describe('getCurrentToken', () => {
  it('returns null before initialization', () => {
    expect(getFCMManager().getCurrentToken()).toBeNull();
  });
});

// ─── getOrRefreshToken ────────────────────────────────────────────────────────

describe('getOrRefreshToken', () => {
  it('returns null when messaging is not initialized', async () => {
    const result = await getFCMManager().getOrRefreshToken();
    expect(result).toBeNull();
  });

  it('returns null when permission is not granted', async () => {
    await getFCMManager().initialize();
    // permission is 'default' by default
    const result = await getFCMManager().getOrRefreshToken();
    expect(result).toBeNull();
  });

  it('returns token when permission is granted and messaging is initialized', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    await getFCMManager().initialize();
    const result = await getFCMManager().getOrRefreshToken();
    expect(result).toBe('fcm-token-xyz');
  });

  it('returns null when VAPID key is not configured', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    mockGetVapidKey.mockReturnValue(null);
    await getFCMManager().initialize();
    const result = await getFCMManager().getOrRefreshToken();
    expect(result).toBeNull();
  });

  it('calls onTokenReceived callback when token obtained', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    const onTokenReceived = jest.fn();
    await resetFCMManager();
    const mgr = getFCMManager({ onTokenReceived });
    await mgr.initialize();
    await mgr.getOrRefreshToken();
    expect(onTokenReceived).toHaveBeenCalledWith('fcm-token-xyz');
  });
});

// ─── deleteToken ──────────────────────────────────────────────────────────────

describe('deleteToken', () => {
  it('returns true (no token to delete) when not initialized', async () => {
    const result = await getFCMManager().deleteToken();
    expect(result).toBe(true);
  });

  it('calls firebase deleteToken and returns true on success', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    await getFCMManager().initialize();
    await getFCMManager().getOrRefreshToken();
    const result = await getFCMManager().deleteToken();
    expect(result).toBe(true);
    expect(mockDeleteToken).toHaveBeenCalled();
  });

  it('returns false when deleteToken throws', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      writable: true,
      configurable: true,
    });
    await getFCMManager().initialize();
    await getFCMManager().getOrRefreshToken();
    mockDeleteToken.mockRejectedValue(new Error('delete failed'));
    const result = await getFCMManager().deleteToken();
    expect(result).toBe(false);
  });
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('resets state and calls message unsubscribe', async () => {
    const unsubscribe = jest.fn();
    mockOnMessage.mockReturnValue(unsubscribe);
    await getFCMManager().initialize();
    await getFCMManager().cleanup();
    expect(unsubscribe).toHaveBeenCalled();
    expect(getFCMManager().getCurrentToken()).toBeNull();
  });
});

// ─── fcm facade ───────────────────────────────────────────────────────────────

describe('fcm facade', () => {
  it('isSupported delegates to manager', async () => {
    const result = await fcm.isSupported();
    expect(typeof result).toBe('boolean');
  });

  it('getPermissionStatus delegates to manager', () => {
    expect(['default', 'granted', 'denied']).toContain(fcm.getPermissionStatus());
  });

  it('hasPermission delegates to manager', () => {
    expect(typeof fcm.hasPermission()).toBe('boolean');
  });

  it('shouldPrompt delegates to manager', () => {
    expect(typeof fcm.shouldPrompt()).toBe('boolean');
  });

  it('getCurrentToken returns null when no token set', () => {
    expect(fcm.getCurrentToken()).toBeNull();
  });
});
