/**
 * PushNotificationService Unit Tests
 *
 * Tests:
 * - Service initialization with Firebase and APNS providers
 * - Configuration flags (enabled/disabled)
 * - sendToUser method with various token types, incl. VoIP calls and the
 *   ENABLE_VOIP_PUSH kill switch
 * - sendViaFCM method (private, tested via sendToUser)
 * - sendViaAPNS method (private, tested via sendToUser)
 * - handleFailedToken method for invalid tokens
 * - cleanupInactiveTokens method for cleanup operations
 * - Error handling and edge cases
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

// Mock modules BEFORE any imports
// Firebase Admin mock
const mockFirebaseMessagingSend = jest.fn();
const mockFirebaseInitializeApp = jest.fn();
const mockFirebaseCredentialCert = jest.fn().mockReturnValue({});

// firebase-admin 14 modular API: production imports `getApps`/`initializeApp`/
// `cert` from 'firebase-admin/app' and `getMessaging` from
// 'firebase-admin/messaging' (the v13 namespace `admin.apps`/`admin.credential`/
// `admin.messaging()` no longer exists).
const mockFirebaseGetApps = jest.fn(() => []);
const mockFirebaseGetMessaging = jest.fn(() => ({
  send: mockFirebaseMessagingSend,
}));
const firebaseAppMockShape = {
  getApps: mockFirebaseGetApps,
  initializeApp: mockFirebaseInitializeApp,
  cert: mockFirebaseCredentialCert,
};
const firebaseMessagingMockShape = {
  getMessaging: mockFirebaseGetMessaging,
};

jest.mock('firebase-admin/app', () => ({
  __esModule: true,
  ...firebaseAppMockShape,
}));

jest.mock('firebase-admin/messaging', () => ({
  __esModule: true,
  ...firebaseMessagingMockShape,
}));

// APNS mock
const mockApnsProviderSend = jest.fn();
const mockApnsProviderShutdown = jest.fn();
const MockApnsProvider = jest.fn().mockImplementation(() => ({
  send: mockApnsProviderSend,
  shutdown: mockApnsProviderShutdown,
}));
const MockApnsNotification = jest.fn().mockImplementation(() => ({
  alert: {},
  badge: undefined,
  sound: 'default',
  topic: '',
  pushType: undefined,
  priority: undefined,
  threadId: undefined,
  payload: undefined,
}));

jest.mock('@parse/node-apn', () => ({
  __esModule: true,
  default: {
    Provider: MockApnsProvider,
    Notification: MockApnsNotification,
  },
  Provider: MockApnsProvider,
  Notification: MockApnsNotification,
}), { virtual: true });

// File system mock
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockStatSync = jest.fn().mockReturnValue({ isFile: () => true });

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    statSync: mockStatSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  statSync: mockStatSync,
}));

// Path mock
jest.mock('path', () => ({
  __esModule: true,
  default: {
    resolve: jest.fn((p: string) => p),
  },
  resolve: jest.fn((p: string) => p),
}));

// Prisma mock
const mockPrisma = {
  pushToken: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Structured logger mock.
// PushNotificationService logs through `enhancedLogger.child(...)` (Pino → stdout),
// NOT through console.*. Capture the child logger's level methods so tests can
// assert on the structured message + context payload that the service emits.
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockChildLogger = {
  trace: jest.fn(),
  debug: mockLoggerDebug,
  info: mockLoggerInfo,
  warn: mockLoggerWarn,
  error: mockLoggerError,
  fatal: jest.fn(),
};
const enhancedLoggerMockShape = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockChildLogger),
};
const performanceLoggerMockShape = {
  start: jest.fn(() => ({ end: jest.fn() })),
  withTiming: jest.fn(async (_step: string, fn: () => Promise<unknown>) => fn()),
};

jest.mock('../../../utils/logger-enhanced', () => ({
  __esModule: true,
  enhancedLogger: enhancedLoggerMockShape,
  performanceLogger: performanceLoggerMockShape,
  notificationLogger: mockChildLogger,
  default: enhancedLoggerMockShape,
}));

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Store original environment variables
const originalEnv = { ...process.env };

// Mock console methods
let mockConsoleLog: jest.SpyInstance;
let mockConsoleError: jest.SpyInstance;
let mockConsoleWarn: jest.SpyInstance;
let mockConsoleInfo: jest.SpyInstance;

describe('PushNotificationService', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock behaviors
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      project_id: 'test-project',
      private_key: 'test-key',
      client_email: 'test@test.iam.gserviceaccount.com',
    }));

    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {});

    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    mockConsoleLog?.mockRestore();
    mockConsoleError?.mockRestore();
    mockConsoleWarn?.mockRestore();
    mockConsoleInfo?.mockRestore();
  });

  // Helper function to get fresh service with specific env config
  async function getServiceWithEnv(envOverrides: Record<string, string> = {}) {
    // Clear environment variables
    delete process.env.ENABLE_PUSH_NOTIFICATIONS;
    delete process.env.ENABLE_APNS_PUSH;
    delete process.env.ENABLE_FCM_PUSH;
    delete process.env.ENABLE_VOIP_PUSH;
    delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_KEY_PATH;
    delete process.env.APNS_KEY_CONTENT;
    delete process.env.APNS_BUNDLE_ID;
    delete process.env.APNS_VOIP_BUNDLE_ID;
    delete process.env.APNS_ENVIRONMENT;

    // Set new environment variables
    Object.entries(envOverrides).forEach(([key, value]) => {
      process.env[key] = value;
    });

    // Reset module cache to get fresh config
    jest.resetModules();

    // Re-apply mocks after module reset (firebase-admin 14 modular subpaths).
    jest.doMock('firebase-admin/app', () => ({
      __esModule: true,
      ...firebaseAppMockShape,
    }));
    jest.doMock('firebase-admin/messaging', () => ({
      __esModule: true,
      ...firebaseMessagingMockShape,
    }));

    jest.doMock('@parse/node-apn', () => ({
      __esModule: true,
      default: {
        Provider: MockApnsProvider,
        Notification: MockApnsNotification,
      },
      Provider: MockApnsProvider,
      Notification: MockApnsNotification,
    }));

    jest.doMock('fs', () => ({
      __esModule: true,
      default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
        statSync: mockStatSync,
      },
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
      statSync: mockStatSync,
    }));

    jest.doMock('path', () => ({
      __esModule: true,
      default: {
        resolve: jest.fn((p: string) => p),
      },
      resolve: jest.fn((p: string) => p),
    }));

    jest.doMock('@meeshy/shared/prisma/client', () => ({
      PrismaClient: jest.fn(() => mockPrisma),
    }));

    jest.doMock('../../../utils/logger-enhanced', () => ({
      __esModule: true,
      enhancedLogger: enhancedLoggerMockShape,
      performanceLogger: performanceLoggerMockShape,
      notificationLogger: mockChildLogger,
      default: enhancedLoggerMockShape,
    }));

    // Reset prisma mocks
    Object.values(mockPrisma.pushToken).forEach(fn => (fn as jest.Mock).mockReset());

    const module = await import('../../../services/PushNotificationService');
    return {
      PushNotificationService: module.PushNotificationService,
      getPushNotificationService: module.getPushNotificationService,
    };
  }

  // ==============================================
  // INITIALIZATION TESTS
  // ==============================================

  describe('Initialization', () => {
    it('should create service instance with Prisma client', async () => {
      const { PushNotificationService } = await getServiceWithEnv({});
      const service = new PushNotificationService(mockPrisma as any);

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(PushNotificationService);
    });

    it('should log when push notifications are disabled', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'false',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Push notifications disabled');
    });

    it('should warn when Firebase credentials file not found', async () => {
      mockExistsSync.mockReturnValue(false);

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/nonexistent/path.json',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Firebase credentials invalid',
        expect.objectContaining({
          credentialsPath: '/nonexistent/path.json',
          reason: 'file not found',
        })
      );
    });

    it('should initialize APNS when key ID and team ID are set', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();

      expect(mockLoggerInfo).toHaveBeenCalledWith('APNS clients initialized');
    });

    it('should only initialize once (idempotent) for APNS', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();
      await service.initialize();
      await service.initialize();

      // APNS initialization log should appear only once
      const apnsLogs = mockLoggerInfo.mock.calls.filter(
        (call: any[]) => call[0] === 'APNS clients initialized'
      );
      expect(apnsLogs.length).toBe(1);
    });
  });

  // ==============================================
  // SEND TO USER TESTS
  // ==============================================

  describe('sendToUser', () => {
    it('should return empty array when push notifications are disabled', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'false',
      });
      const service = new PushNotificationService(mockPrisma as any);

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Test',
          body: 'Test message',
        },
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when user has no active tokens', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([]);

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Test',
          body: 'Test message',
        },
      });

      expect(result).toEqual([]);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'No active tokens found for user',
        expect.objectContaining({ userId: 'user-123' })
      );
    });

    it('should return error for FCM token when Firebase not initialized', async () => {
      // FCM enabled but no credentials path, so Firebase won't initialize
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        // No FIREBASE_ADMIN_CREDENTIALS_PATH set
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'fcm-token-123', type: 'fcm', platform: 'android', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Test Notification',
          body: 'This is a test',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('Firebase not initialized');
    });

    it('should send APNS notification successfully', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
        APNS_BUNDLE_ID: 'me.meeshy.app',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Test',
          body: 'Test message',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });

    it('should send VoIP notification via APNS', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'voip-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        ENABLE_VOIP_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
        APNS_VOIP_BUNDLE_ID: 'me.meeshy.app.voip',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'voip-token-123', type: 'voip', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Incoming Call',
          body: 'John is calling...',
          callId: 'call-123',
          callerName: 'John',
        },
        types: ['voip'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });

    // Gateway audit finding (2026-07-08): the `ENABLE_VOIP_PUSH` kill switch
    // was only enforced inside the unused `sendVoIPPush` helper. The real
    // incoming-call path (CallEventsHandler) calls `sendToUser({types:
    // ['voip']})` directly, so setting ENABLE_VOIP_PUSH=false never actually
    // stopped VoIP pushes from going out.
    it('does not deliver a voip push when ENABLE_VOIP_PUSH=false, even called via sendToUser directly', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        ENABLE_VOIP_PUSH: 'false',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
        APNS_VOIP_BUNDLE_ID: 'me.meeshy.app.voip',
      });
      const service = new PushNotificationService(mockPrisma as any);

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Incoming Call',
          body: 'John is calling...',
          callId: 'call-123',
          callerName: 'John',
        },
        types: ['voip'],
        bypassDnd: true,
      });

      expect(result).toEqual([]);
      expect(mockPrisma.pushToken.findMany).not.toHaveBeenCalled();
      expect(mockApnsProviderSend).not.toHaveBeenCalled();
    });

    // Gateway audit finding (2026-07-08): DND blocked call-management pushes
    // with no exemption, unlike every comparable calling product (FaceTime,
    // WhatsApp, Signal all ring through Do Not Disturb).
    describe('DND (Do Not Disturb)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        // Midday UTC, safely inside a '00:00'-'23:59' DND window regardless
        // of the machine running the suite's real wall-clock time.
        jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      });

      // Mirrors the `isPushAllowed` describe block's own convention below:
      // `userPreferences` isn't part of the base mock, so each test adds it
      // and this cleans it up afterward — jest.clearAllMocks() does not
      // reset the mockResolvedValue implementation on a re-added mock.
      afterEach(() => {
        jest.useRealTimers();
        delete (mockPrisma as any).userPreferences;
      });

      it('blocks a normal push during the user\'s DND window', async () => {
        mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
          ENABLE_APNS_PUSH: 'true',
          APNS_KEY_ID: 'test-key-id',
          APNS_TEAM_ID: 'test-team-id',
          APNS_KEY_PATH: '/path/to/key.p8',
          APNS_BUNDLE_ID: 'me.meeshy.app',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: { pushEnabled: true, dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59' },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
        ]);

        const result = await service.sendToUser({
          userId: 'user-123',
          payload: { title: 'Test', body: 'Test message' },
        });

        expect(result).toEqual([]);
        expect(mockApnsProviderSend).not.toHaveBeenCalled();
      });

      it('bypassDnd:true still delivers an incoming-call VoIP push during the DND window', async () => {
        mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'voip-token-123' }], failed: [] });

        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
          ENABLE_APNS_PUSH: 'true',
          ENABLE_VOIP_PUSH: 'true',
          APNS_KEY_ID: 'test-key-id',
          APNS_TEAM_ID: 'test-team-id',
          APNS_KEY_PATH: '/path/to/key.p8',
          APNS_VOIP_BUNDLE_ID: 'me.meeshy.app.voip',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: { pushEnabled: true, dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59' },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'token-1', token: 'voip-token-123', type: 'voip', platform: 'ios', bundleId: null },
        ]);

        const result = await service.sendToUser({
          userId: 'user-123',
          payload: {
            title: 'Incoming Call',
            body: 'John is calling...',
            callId: 'call-123',
            callerName: 'John',
          },
          types: ['voip'],
          bypassDnd: true,
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
      });

      // GW6 — pushEnabled governs NOTIFICATION pushes only. Call pushes are a
      // separate product category gated by the dedicated `callsEnabled`
      // preference (default true): disabling message banners must not make
      // incoming calls silently unreachable (FaceTime/WhatsApp/Signal parity).
      it('pushEnabled:false still delivers an incoming-call VoIP push (callsEnabled default)', async () => {
        mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'voip-token-123' }], failed: [] });

        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
          ENABLE_APNS_PUSH: 'true',
          ENABLE_VOIP_PUSH: 'true',
          APNS_KEY_ID: 'test-key-id',
          APNS_TEAM_ID: 'test-team-id',
          APNS_KEY_PATH: '/path/to/key.p8',
          APNS_VOIP_BUNDLE_ID: 'me.meeshy.app.voip',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: { pushEnabled: false, dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59' },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'token-1', token: 'voip-token-123', type: 'voip', platform: 'ios', bundleId: null },
        ]);

        const result = await service.sendToUser({
          userId: 'user-123',
          payload: { title: 'Incoming Call', body: 'John is calling...', callId: 'call-123', callerName: 'John' },
          types: ['voip'],
          bypassDnd: true,
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
      });

      it('pushEnabled:false still delivers a call-management data push (call_cancel)', async () => {
        mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
          ENABLE_APNS_PUSH: 'true',
          APNS_KEY_ID: 'test-key-id',
          APNS_TEAM_ID: 'test-team-id',
          APNS_KEY_PATH: '/path/to/key.p8',
          APNS_BUNDLE_ID: 'me.meeshy.app',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: { pushEnabled: false },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
        ]);

        const result = await service.sendToUser({
          userId: 'user-123',
          payload: { title: '', body: '', silent: true, data: { type: 'call_cancel', callId: 'call-123' } },
          types: ['apns'],
          bypassDnd: true,
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
      });

      it('callsEnabled:false blocks call pushes even with bypassDnd', async () => {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
          ENABLE_APNS_PUSH: 'true',
          ENABLE_VOIP_PUSH: 'true',
          APNS_KEY_ID: 'test-key-id',
          APNS_TEAM_ID: 'test-team-id',
          APNS_KEY_PATH: '/path/to/key.p8',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: { pushEnabled: true, callsEnabled: false },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'token-1', token: 'voip-token-123', type: 'voip', platform: 'ios', bundleId: null },
        ]);

        const result = await service.sendToUser({
          userId: 'user-123',
          payload: { title: 'Incoming Call', body: 'John is calling...', callId: 'call-123', callerName: 'John' },
          types: ['voip'],
          bypassDnd: true,
        });

        expect(result).toEqual([]);
        expect(mockApnsProviderSend).not.toHaveBeenCalled();
      });

      it('callsEnabled:false does not affect normal notification pushes', async () => {
        mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
          ENABLE_APNS_PUSH: 'true',
          APNS_KEY_ID: 'test-key-id',
          APNS_TEAM_ID: 'test-team-id',
          APNS_KEY_PATH: '/path/to/key.p8',
          APNS_BUNDLE_ID: 'me.meeshy.app',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: { pushEnabled: true, callsEnabled: false },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
        ]);

        const result = await service.sendToUser({
          userId: 'user-123',
          payload: { title: 'Test', body: 'Regular message', data: { type: 'new_message' } },
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
      });
    });

    it('silent payload builds a pure background APNS push: no alert, no sound, pushType background, priority 5', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
        APNS_BUNDLE_ID: 'me.meeshy.app',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: '',
          body: '',
          silent: true,
          data: { type: 'call_cancel', callId: 'call-123' },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      const sentNotification = mockApnsProviderSend.mock.calls[0][0];
      // A visible alert/sound on a cancellation signal would surface a blank
      // banner; the whole point is a data-only background wake.
      expect(sentNotification.alert).toBeUndefined();
      expect(sentNotification.sound).toBeUndefined();
      expect(sentNotification.pushType).toBe('background');
      expect(sentNotification.priority).toBe(5);
      expect(sentNotification.contentAvailable).toBe(true);
      expect(sentNotification.payload).toEqual(
        expect.objectContaining({ type: 'call_cancel', callId: 'call-123' })
      );
      // Expiration ~60 s (fenêtre de sonnerie) : un stop-ring livré plus tard
      // n'a plus rien à éteindre — miroir du TTL FCM Android.
      const nowSec = Math.floor(Date.now() / 1000);
      expect(sentNotification.expiry).toBeGreaterThanOrEqual(nowSec + 55);
      expect(sentNotification.expiry).toBeLessThanOrEqual(nowSec + 65);
    });

    it('should filter tokens by type when specified', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([]);

      await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
        types: ['fcm'],
      });

      expect(mockPrisma.pushToken.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isActive: true,
          type: { in: ['fcm'] },
        },
        select: {
          id: true,
          token: true,
          type: true,
          platform: true,
          bundleId: true,
          apnsEnvironment: true,
        },
      });
    });

    it('should filter tokens by platform when specified', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([]);

      await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
        platforms: ['ios', 'android'],
      });

      expect(mockPrisma.pushToken.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isActive: true,
          // No explicit `types` filter was passed, so all token types are
          // queried (equivalent to no type filter — apns/fcm/voip are the
          // only token types that exist).
          type: { in: ['apns', 'fcm', 'voip'] },
          platform: { in: ['ios', 'android'] },
        },
        select: expect.any(Object),
      });
    });

    it('should return error for unknown token type', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'unknown-token', type: 'unknown', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toContain('Unknown token type');
    });

    it('should handle APNS send failure', async () => {
      mockApnsProviderSend.mockResolvedValue({
        sent: [],
        failed: [{ device: 'apns-token-123', response: { reason: 'BadDeviceToken' } }],
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('BadDeviceToken');
    });

    it('should handle APNS exception', async () => {
      mockApnsProviderSend.mockRejectedValue(new Error('APNS connection failed'));

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('APNS connection failed');
    });

    it('should retry a transient APNS failure (InternalServerError) and succeed', async () => {
      mockApnsProviderSend
        .mockResolvedValueOnce({ sent: [], failed: [{ device: 'apns-token-123', response: { reason: 'InternalServerError' } }] })
        .mockResolvedValueOnce({ sent: [{ device: 'apns-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(mockApnsProviderSend).toHaveBeenCalledTimes(2);
    });

    it('should not retry a permanent APNS failure (BadDeviceToken)', async () => {
      mockApnsProviderSend.mockResolvedValue({
        sent: [],
        failed: [{ device: 'apns-token-123', response: { reason: 'BadDeviceToken' } }],
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result[0].error).toBe('BadDeviceToken');
      expect(mockApnsProviderSend).toHaveBeenCalledTimes(1);
    });

    it('should give up after exhausting retries on a persistently transient APNS failure', async () => {
      mockApnsProviderSend.mockResolvedValue({
        sent: [],
        failed: [{ device: 'apns-token-123', response: { reason: 'ServiceUnavailable' } }],
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      // 1 initial attempt + 2 retries = 3 calls, then surfaced as a failure
      expect(mockApnsProviderSend).toHaveBeenCalledTimes(3);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('ServiceUnavailable');

      // Transient failure must NOT count toward the 3-strike deactivation —
      // the token is fine, Apple's servers had a hiccup.
      expect(mockPrisma.pushToken.update).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Push delivery failed transiently, token left active',
        expect.objectContaining({ tokenId: 'token-1' })
      );
    });

    it('should fan out to multiple device tokens concurrently, not sequentially', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      mockApnsProviderSend.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return { sent: [{ device: 'apns-token' }], failed: [] };
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
        APNS_BUNDLE_ID: 'me.meeshy.app',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-1', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
        { id: 'token-2', token: 'apns-token-2', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
        { id: 'token-3', token: 'apns-token-3', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test message' },
      });

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.success)).toBe(true);
      // Sequential fan-out would cap concurrency at 1; parallel fan-out overlaps.
      expect(maxInFlight).toBeGreaterThan(1);
    });

    it('still delivers to healthy tokens when one token send rejects', async () => {
      mockApnsProviderSend
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ sent: [{ device: 'apns-token' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
        APNS_BUNDLE_ID: 'me.meeshy.app',
      });
      const service = new PushNotificationService(mockPrisma as any);
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-1', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
        { id: 'token-2', token: 'apns-token-2', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app' },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test message' },
      });

      expect(result).toHaveLength(2);
      expect(result.filter((r) => r.success)).toHaveLength(1);
      expect(result.filter((r) => !r.success)).toHaveLength(1);
    });
  });

  // ==============================================
  // SEND VIA FCM TESTS
  // Note: Firebase Admin SDK uses dynamic imports which are difficult to mock
  // in Jest. These tests focus on the "not initialized" error path which works
  // without actual Firebase initialization.
  // ==============================================

  describe('sendViaFCM (via sendToUser)', () => {
    it('should return error when Firebase is not initialized (no config)', async () => {
      // FCM not configured at all
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        // FCM not enabled
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'fcm-token-123', type: 'fcm', platform: 'android', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('Firebase not initialized');
    });

    it('should return error when Firebase credentials path not set', async () => {
      // FCM enabled but no credentials path
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        // No FIREBASE_ADMIN_CREDENTIALS_PATH
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'fcm-token-123', type: 'fcm', platform: 'android', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('Firebase not initialized');
    });

    it('should return error when Firebase credentials file not found', async () => {
      mockExistsSync.mockReturnValue(false);

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/nonexistent/path.json',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'fcm-token-123', type: 'fcm', platform: 'android', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('Firebase not initialized');
    });

    it('should fail gracefully when Firebase fails to read credentials', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Cannot read file');
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/path/to/creds.json',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'fcm-token-123', type: 'fcm', platform: 'android', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      // Service should have logged the error
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to initialize Firebase',
        expect.objectContaining({ error: expect.any(Error) })
      );

      // And return Firebase not initialized error for the token
      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('Firebase not initialized');
    });
  });

  // ==============================================
  // SEND VIA APNS TESTS
  // ==============================================

  describe('sendViaAPNS (via sendToUser)', () => {
    it('should return error when APNS is not initialized', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        // APNS not enabled
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('APNS production client not initialized');
    });

    it('should send APNS notification with badge and custom sound', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'com.test.app' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Test',
          body: 'Test message',
          badge: 10,
          sound: 'custom.caf',
          category: 'MESSAGE_CATEGORY',
          threadId: 'thread-abc',
          data: { key: 'value' },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });

    it('should propagate subtitle to APNs alert for group/global conversations', async () => {
      // RED: this test currently fails because PushNotificationPayload has no
      // `subtitle` field and sendViaAPNS never sets notification.alert.subtitle.
      // Once the gateway is fixed to forward subtitle, iOS will display it
      // natively between title and body on lock-screen banners, even when
      // INSendMessageIntent.donate rewrites the title for Communication
      // Notifications (the subtitle survives the rewrite).
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'com.test.app' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'meeshy sama',
          subtitle: 'Meeshy Global',
          body: '3 mois de chantier intense, voici le récap !',
        } as any,
      });

      expect(mockApnsProviderSend).toHaveBeenCalled();
      const notification = mockApnsProviderSend.mock.calls.at(-1)?.[0];
      expect(notification.alert).toEqual(expect.objectContaining({
        title: 'meeshy sama',
        subtitle: 'Meeshy Global',
        body: '3 mois de chantier intense, voici le récap !',
      }));
    });

    it('should omit subtitle from APNs alert when not provided (direct messages)', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'com.test.app' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Alice',
          body: 'Hey!',
        },
      });

      const notification = mockApnsProviderSend.mock.calls.at(-1)?.[0];
      expect(notification.alert.subtitle).toBeUndefined();
    });

    it('should propagate subtitle to FCM iOS alert via apns.payload.aps.alert.subtitle', async () => {
      // Firebase Admin requires the credentials file to exist and be parseable
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({
        type: 'service_account',
        project_id: 'meeshy-test',
        private_key: 'fake',
        client_email: 'test@meeshy-test.iam.gserviceaccount.com',
      }));
      mockFirebaseMessagingSend.mockResolvedValue('message-id-123');

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/creds.json',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'fcm-token-123', type: 'fcm', platform: 'ios' },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'meeshy sama',
          subtitle: 'Meeshy Global',
          body: '3 mois de chantier intense',
        } as any,
      });

      const sentMessage = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      // For iOS via FCM, the canonical place for subtitle is
      // `apns.payload.aps.alert.subtitle` (overrides the flat top-level
      // `notification.title/body` which doesn't carry subtitle).
      expect(sentMessage?.apns?.payload?.aps?.alert).toEqual(expect.objectContaining({
        title: 'meeshy sama',
        subtitle: 'Meeshy Global',
        body: '3 mois de chantier intense',
      }));
    });
  });

  // ==============================================
  // SEND VOIP PUSH TESTS
  // ==============================================
  //
  // There is no dedicated sendVoIPPush() method — real callers (e.g. the
  // incoming-call push in CallEventsHandler) send VoIP pushes via
  // sendToUser({ types: ['voip'], platforms: ['ios'], bypassDnd: true }).
  // Coverage lives in the `sendToUser` describe block above, including the
  // ENABLE_VOIP_PUSH kill-switch test.

  it('only targets iOS VoIP tokens when types/platforms scope to voip', async () => {
    const { PushNotificationService } = await getServiceWithEnv({
      ENABLE_PUSH_NOTIFICATIONS: 'true',
      ENABLE_VOIP_PUSH: 'true',
      ENABLE_APNS_PUSH: 'true',
      APNS_KEY_ID: 'test-key-id',
      APNS_TEAM_ID: 'test-team-id',
      APNS_KEY_PATH: '/path/to/key.p8',
    });
    const service = new PushNotificationService(mockPrisma as any);

    mockPrisma.pushToken.findMany.mockResolvedValue([]);

    await service.sendToUser({
      userId: 'user-123',
      payload: { title: 'Incoming Call', body: 'John Doe is calling...', callId: 'call-123', callerName: 'John Doe' },
      types: ['voip'],
      platforms: ['ios'],
      bypassDnd: true,
    });

    expect(mockPrisma.pushToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        isActive: true,
        type: { in: ['voip'] },
        platform: { in: ['ios'] },
      },
      select: expect.any(Object),
    });
  });

  // ==============================================
  // HANDLE FAILED TOKEN TESTS
  // ==============================================

  describe('handleFailedToken', () => {
    it('should increment failed attempts on first failure', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'unknown-token', type: 'unknown', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(mockPrisma.pushToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: expect.objectContaining({
          failedAttempts: 1,
          isActive: true,
        }),
      });
    });

    it('should deactivate token after 3 consecutive failures', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'unknown-token', type: 'unknown', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 2 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(mockPrisma.pushToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: {
          failedAttempts: 3,
          lastError: expect.any(String),
          isActive: false,
        },
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Token deactivated',
        expect.objectContaining({
          tokenId: 'token-1',
          failedAttempts: 3,
        })
      );
    });

    it('should deactivate token on NotRegistered error', async () => {
      mockApnsProviderSend.mockResolvedValue({
        sent: [],
        failed: [{ device: 'apns-token-123', response: { reason: 'NotRegistered' } }],
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(mockPrisma.pushToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: expect.objectContaining({
          isActive: false,
        }),
      });
    });

    it('should handle token not found gracefully', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'unknown-token', type: 'unknown', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue(null);

      // Should not throw
      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
    });
  });

  // ==============================================
  // CLEANUP INACTIVE TOKENS TESTS
  // ==============================================

  describe('cleanupInactiveTokens', () => {
    it('should delete inactive tokens older than specified days', async () => {
      const { PushNotificationService } = await getServiceWithEnv({});
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 15 });

      const count = await service.cleanupInactiveTokens(90);

      expect(count).toBe(15);
      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              isActive: false,
              updatedAt: { lt: expect.any(Date) },
            },
            {
              lastUsedAt: { lt: expect.any(Date) },
            },
            {
              failedAttempts: { gte: 5 },
            },
          ],
        },
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Cleaned up inactive/stale tokens',
        expect.objectContaining({ count: 15 })
      );
    });

    it('should use default 90 days when not specified', async () => {
      const { PushNotificationService } = await getServiceWithEnv({});
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 5 });

      const count = await service.cleanupInactiveTokens();

      expect(count).toBe(5);
    });

    it('should handle custom cleanup period', async () => {
      const { PushNotificationService } = await getServiceWithEnv({});
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.cleanupInactiveTokens(30);

      expect(count).toBe(3);
    });

    it('should return 0 when no tokens to cleanup', async () => {
      const { PushNotificationService } = await getServiceWithEnv({});
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.cleanupInactiveTokens();

      expect(count).toBe(0);
    });
  });

  // ==============================================
  // SHUTDOWN TESTS
  // ==============================================

  describe('shutdown', () => {
    it('should shutdown APNS client when initialized', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();
      await service.shutdown();

      expect(mockApnsProviderShutdown).toHaveBeenCalled();
    });
  });

  // ==============================================
  // SINGLETON TESTS
  // ==============================================

  describe('getPushNotificationService', () => {
    it('should return singleton instance', async () => {
      const { getPushNotificationService } = await getServiceWithEnv({});

      const instance1 = getPushNotificationService(mockPrisma as any);
      const instance2 = getPushNotificationService(mockPrisma as any);

      expect(instance1).toBe(instance2);
    });
  });

  // ==============================================
  // MULTIPLE TOKENS TESTS
  // ==============================================

  describe('Multiple tokens handling', () => {
    it('should handle mixed success and failure results', async () => {
      mockApnsProviderSend
        .mockResolvedValueOnce({ sent: [{ device: 'apns-1' }], failed: [] })
        .mockResolvedValueOnce({ sent: [], failed: [{ device: 'apns-2', response: { reason: 'BadToken' } }] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-1', type: 'apns', platform: 'ios', bundleId: null },
        { id: 'token-2', token: 'apns-2', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
    });
  });

  // ==============================================
  // PAYLOAD OPTIONS TESTS
  // ==============================================

  describe('Payload options', () => {
    it('should handle payload with all options', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Full Notification',
          body: 'With all options',
          badge: 5,
          sound: 'notification.caf',
          category: 'MESSAGE',
          threadId: 'conversation-123',
          callId: 'call-456',
          callerName: 'John Doe',
          callerAvatar: 'https://example.com/avatar.jpg',
          data: {
            type: 'message',
            conversationId: 'conv-789',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });

    it('should handle minimal payload', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'apns-token' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token', type: 'apns', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-123',
        payload: {
          title: 'Simple',
          body: 'Just a message',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });
  });

  // ==============================================
  // ERROR EDGE CASES
  // ==============================================

  describe('Error edge cases', () => {
    it('should handle Firebase initialization error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Cannot read file');
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/path/to/creds.json',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to initialize Firebase',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should handle APNS initialization error', async () => {
      MockApnsProvider.mockImplementationOnce(() => {
        throw new Error('APNS init failed');
      });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'key-id',
        APNS_TEAM_ID: 'team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to initialize APNS',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  // ==============================================
  // FIREBASE CREDENTIALS AS DIRECTORY (line 205)
  // ==============================================

  describe('Initialization — credentials path is a directory', () => {
    it('should warn when Firebase credentials path exists but is a directory', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => false });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/some/directory',
      });
      const service = new PushNotificationService(mockPrisma as any);

      await service.initialize();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Firebase credentials invalid',
        expect.objectContaining({ reason: 'path is a directory, not a file' })
      );
    });
  });

  // ==============================================
  // isPushAllowed — preferences gate (lines 224-269)
  // ==============================================

  describe('isPushAllowed', () => {
    // Cleanup userPreferences after each test so subsequent describe blocks don't
    // inherit mockResolvedValue implementations (jest.clearAllMocks does NOT reset those).
    afterEach(() => {
      delete (mockPrisma as any).userPreferences;
    });

    it('should block push and log when pushEnabled is false in user preferences', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      (mockPrisma as any).userPreferences = {
        findUnique: jest.fn().mockResolvedValue({ notification: { pushEnabled: false } }),
      };
      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'any', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-push-off',
        payload: { title: 'Test', body: 'Test' },
      });

      expect(result).toEqual([]);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Push blocked by user preferences',
        expect.objectContaining({ userId: 'user-push-off' })
      );
    });

    it('should allow push when dndEnabled but today is not in dndDays list', async () => {
      // Wednesday January 7 2026 12:00 UTC (getUTCDay() = 3 = wed)
      jest.useFakeTimers({ now: new Date('2026-01-07T12:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['mon', 'tue'], // Wednesday not in list
              dndStartTime: '09:00',
              dndEndTime: '17:00',
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([]);

        const result = await service.sendToUser({
          userId: 'user-wed',
          payload: { title: 'Test', body: 'Test' },
        });

        // Push allowed (today not DND) — returns [] because no tokens, not because blocked
        expect(mockLoggerInfo).not.toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.anything()
        );
        expect(result).toEqual([]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should block push when DND enabled, today is DND day, and time is in the window', async () => {
      // Monday 2026-01-05 14:00 UTC (getUTCDay() = 1 = mon), window 09:00–17:00
      jest.useFakeTimers({ now: new Date('2026-01-05T14:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['mon'],
              dndStartTime: '09:00',
              dndEndTime: '17:00',
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'tok', token: 'any', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        ]);

        const result = await service.sendToUser({
          userId: 'user-dnd-blocked',
          payload: { title: 'Test', body: 'Test' },
        });

        expect(result).toEqual([]);
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.objectContaining({ userId: 'user-dnd-blocked' })
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should allow push when DND enabled and time is outside the window (normal window)', async () => {
      // Monday 2026-01-05 18:00 UTC, window 09:00–17:00 (outside)
      jest.useFakeTimers({ now: new Date('2026-01-05T18:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['mon'],
              dndStartTime: '09:00',
              dndEndTime: '17:00',
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([]);

        await service.sendToUser({
          userId: 'user-outside-dnd',
          payload: { title: 'Test', body: 'Test' },
        });

        expect(mockLoggerInfo).not.toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.anything()
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should block push when DND uses crossover window (start > end) and time >= start', async () => {
      // Tuesday 2026-01-06 23:00 UTC — in the 22:00–08:00 overnight window
      jest.useFakeTimers({ now: new Date('2026-01-06T23:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['tue'],
              dndStartTime: '22:00',
              dndEndTime: '08:00', // crossover: start > end
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'tok', token: 'any', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        ]);

        const result = await service.sendToUser({
          userId: 'user-crossover-dnd',
          payload: { title: 'Test', body: 'Test' },
        });

        expect(result).toEqual([]);
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.objectContaining({ userId: 'user-crossover-dnd' })
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should allow push when DND crossover window but time is between end and start (not in window)', async () => {
      // Tuesday 2026-01-06 12:00 UTC — between 08:00 and 22:00 (outside overnight window)
      jest.useFakeTimers({ now: new Date('2026-01-06T12:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['tue'],
              dndStartTime: '22:00',
              dndEndTime: '08:00',
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([]);

        await service.sendToUser({
          userId: 'user-crossover-outside',
          payload: { title: 'Test', body: 'Test' },
        });

        expect(mockLoggerInfo).not.toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.anything()
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should block push in an overnight window morning tail when the window START day is selected', async () => {
      // dndDays ['mon'] + 22:00→08:00 means "quiet Monday night → Tuesday morning".
      // Tuesday 2026-01-06 07:00 UTC is the tail of Monday night's window and must
      // be blocked — even though today's weekday ('tue') is not itself in dndDays.
      jest.useFakeTimers({ now: new Date('2026-01-06T07:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['mon'],
              dndStartTime: '22:00',
              dndEndTime: '08:00', // overnight
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([
          { id: 'tok', token: 'any', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        ]);

        const result = await service.sendToUser({
          userId: 'user-morning-tail-blocked',
          payload: { title: 'Test', body: 'Test' },
        });

        expect(result).toEqual([]);
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.objectContaining({ userId: 'user-morning-tail-blocked' })
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should allow push in an overnight window morning tail when the window START day is NOT selected', async () => {
      // Monday 2026-01-05 07:00 UTC is the tail of Sunday night's window. With
      // dndDays ['mon'] the Sunday-night window is not selected, so the push must
      // be allowed — the naive "check today's weekday" logic wrongly blocked it.
      jest.useFakeTimers({ now: new Date('2026-01-05T07:00:00Z') });
      try {
        const { PushNotificationService } = await getServiceWithEnv({
          ENABLE_PUSH_NOTIFICATIONS: 'true',
        });
        const service = new PushNotificationService(mockPrisma as any);

        (mockPrisma as any).userPreferences = {
          findUnique: jest.fn().mockResolvedValue({
            notification: {
              pushEnabled: true,
              dndEnabled: true,
              dndDays: ['mon'],
              dndStartTime: '22:00',
              dndEndTime: '08:00', // overnight
            },
          }),
        };
        mockPrisma.pushToken.findMany.mockResolvedValue([]);

        await service.sendToUser({
          userId: 'user-morning-tail-allowed',
          payload: { title: 'Test', body: 'Test' },
        });

        expect(mockLoggerInfo).not.toHaveBeenCalledWith(
          'Push blocked by user preferences',
          expect.anything()
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ==============================================
  // sendToUser outer catch — DB error on success path (lines 338-340)
  // ==============================================

  describe('sendToUser — success-path bookkeeping error', () => {
    it('keeps a delivered push as success when the lastUsedAt update throws', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{}], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'key-id',
        APNS_TEAM_ID: 'team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'apns-tok', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
      ]);
      // The success-path bookkeeping update throws — but the push was delivered.
      mockPrisma.pushToken.update.mockRejectedValue(new Error('DB connection lost'));
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });

      const result = await service.sendToUser({
        userId: 'user-db-error',
        payload: { title: 'Test', body: 'Test' },
      });

      // One result per token; the delivered push stays a success even though the
      // best-effort bookkeeping write failed (avoids a double-send retry).
      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Failed to update push token bookkeeping after successful send',
        expect.objectContaining({ tokenId: 'tok', error: 'DB connection lost' })
      );
    });
  });

  // ==============================================
  // FCM platform-specific options (lines 445–476)
  // ==============================================

  describe('FCM platform-specific message options', () => {
    async function getFCMService() {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'service_account',
          project_id: 'meeshy-test',
          private_key: 'fake-key',
          client_email: 'test@meeshy.iam.gserviceaccount.com',
        })
      );
      mockFirebaseMessagingSend.mockResolvedValue('msg-id-123');

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/creds.json',
      });
      const service = new PushNotificationService(mockPrisma as any);
      mockPrisma.pushToken.update.mockResolvedValue({});
      return service;
    }

    it('should include android-specific config for android FCM tokens', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android',
        payload: { title: 'Message', body: 'Hello', sound: 'notification.mp3' },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.android).toEqual({
        priority: 'high',
        notification: { sound: 'notification.mp3', channelId: 'meeshy_notifications' },
      });
    });

    it('should include default sound for android FCM when no sound specified', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android-default',
        payload: { title: 'Message', body: 'Hello' },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.android?.notification?.sound).toBe('default');
    });

    // --- Pushes d'appel Android : DATA-ONLY obligatoire ---------------------
    // Un message FCM portant un bloc `notification` est rendu par le SYSTÈME
    // quand l'app est backgroundée/tuée : onMessageReceived ne s'exécute
    // JAMAIS — le full-screen ring, StopRing (call_cancel/answered_elsewhere)
    // et SeenCallRing étaient donc morts précisément dans le scénario visé.

    it('un push silent android part data-only — aucun bloc notification', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android',
        payload: {
          title: '',
          body: '',
          silent: true,
          data: { type: 'call_cancel', callId: 'call-1' },
        } as any,
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.notification).toBeUndefined();
      expect(sentMsg?.android).toEqual({ priority: 'high', ttl: 60_000 });
      expect(sentMsg?.data).toEqual({ type: 'call_cancel', callId: 'call-1' });
    });

    it('le ring android part data-only avec le title/body localisés DANS data', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android',
        payload: {
          title: 'Alice vous appelle',
          body: 'Appel audio',
          data: { type: 'call', callId: 'call-1', callerName: 'Alice' },
        } as any,
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.notification).toBeUndefined();
      expect(sentMsg?.data?.title).toBe('Alice vous appelle');
      expect(sentMsg?.data?.body).toBe('Appel audio');
      expect(sentMsg?.data?.callId).toBe('call-1');
      expect(sentMsg?.android).toEqual({ priority: 'high', ttl: 60_000 });
    });

    it('un push d’appel iOS-via-FCM garde son bloc notification (hors périmètre android)', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-ios', type: 'fcm', platform: 'ios', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-ios',
        payload: {
          title: 'Alice vous appelle',
          body: 'Appel audio',
          data: { type: 'call', callId: 'call-1' },
        } as any,
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.notification).toEqual({ title: 'Alice vous appelle', body: 'Appel audio' });
    });

    it('should include webpush config with link for web FCM tokens', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-web', type: 'fcm', platform: 'web', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-web',
        payload: {
          title: 'Message',
          body: 'Hello',
          data: { conversationId: 'conv-999' },
        },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.webpush).toBeDefined();
      expect(sentMsg?.webpush?.fcmOptions?.link).toBe('/conversations/conv-999');
      expect(sentMsg?.webpush?.notification?.icon).toBe('/android-chrome-192x192.png');
    });

    it('should include webpush without fcmOptions when no link or conversationId', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-web', type: 'fcm', platform: 'web', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-web-no-link',
        payload: { title: 'Alert', body: 'System notification' },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.webpush).toBeDefined();
      expect(sentMsg?.webpush?.fcmOptions).toBeUndefined();
    });

    it('should use explicit payload.link over conversationId for web webpush', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-web', type: 'fcm', platform: 'web', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-web-link',
        payload: {
          title: 'Post',
          body: 'New post',
          link: '/posts/123',
          data: { conversationId: 'conv-ignore' },
        },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.webpush?.fcmOptions?.link).toBe('/posts/123');
    });

    it('should forward payload.badge as android notificationCount for android FCM', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android-badge',
        payload: { title: 'Message', body: 'Hello', badge: 7 },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.android?.notification?.notificationCount).toBe(7);
    });

    it('should forward a zero badge as android notificationCount for android FCM', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android-badge-zero',
        payload: { title: 'Message', body: 'Hello', badge: 0 },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.android?.notification?.notificationCount).toBe(0);
    });

    it('should omit android notificationCount when no badge is provided', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-android-no-badge',
        payload: { title: 'Message', body: 'Hello' },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.android?.notification).not.toHaveProperty('notificationCount');
    });

    it('should include collapseKey in FCM android config when collapseId set', async () => {
      const service = await getFCMService();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-android', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      await service.sendToUser({
        userId: 'user-collapse',
        payload: { title: 'Msg', body: 'Body', collapseId: 'conv-456' },
      });

      const sentMsg = mockFirebaseMessagingSend.mock.calls.at(-1)?.[0];
      expect(sentMsg?.android?.collapseKey).toBe('conv-456');
    });
  });

  // ==============================================
  // FCM error code handling (lines 499–515)
  // ==============================================

  describe('FCM error code handling', () => {
    async function getFCMServiceForErrors() {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'service_account',
          project_id: 'meeshy-test',
          private_key: 'fake-key',
          client_email: 'test@meeshy.iam.gserviceaccount.com',
        })
      );

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/creds.json',
      });
      const service = new PushNotificationService(mockPrisma as any);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});
      return service;
    }

    it('should return TOKEN_INVALID for messaging/registration-token-not-registered', async () => {
      const err: any = new Error('Not registered');
      err.code = 'messaging/registration-token-not-registered';
      mockFirebaseMessagingSend.mockRejectedValue(err);

      const service = await getFCMServiceForErrors();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-invalid-tok',
        payload: { title: 'T', body: 'B' },
      });

      expect(result[0].error).toBe('TOKEN_INVALID');
    });

    it('should return TOKEN_INVALID for messaging/invalid-registration-token', async () => {
      const err: any = new Error('Invalid token');
      err.code = 'messaging/invalid-registration-token';
      mockFirebaseMessagingSend.mockRejectedValue(err);

      const service = await getFCMServiceForErrors();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-invalid-tok2',
        payload: { title: 'T', body: 'B' },
      });

      expect(result[0].error).toBe('TOKEN_INVALID');
    });

    it('should return TOKEN_INVALID when error code is on errorInfo (Firebase Admin v10+ shape)', async () => {
      const err: any = new Error('Bad token');
      err.errorInfo = { code: 'messaging/registration-token-not-registered' };
      mockFirebaseMessagingSend.mockRejectedValue(err);

      const service = await getFCMServiceForErrors();

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-error-info',
        payload: { title: 'T', body: 'B' },
      });

      expect(result[0].error).toBe('TOKEN_INVALID');
    });

    it('should return FCM error message for unknown error codes', async () => {
      const err: any = new Error('Internal FCM error');
      err.code = 'messaging/internal-error';
      mockFirebaseMessagingSend.mockRejectedValue(err);

      const service = await getFCMServiceForErrors();
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-fcm-err',
        payload: { title: 'T', body: 'B' },
      });

      // 'messaging/internal-error' is a transient code: 1 initial attempt + 2
      // retries before it's surfaced as a real failure.
      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(3);
      expect(result[0].error).toBe('Internal FCM error');
      expect(result[0].success).toBe(false);

      // Transient failures must not deactivate the token.
      expect(mockPrisma.pushToken.update).not.toHaveBeenCalled();
    });

    it('should retry a transient FCM failure (messaging/internal-error) and succeed', async () => {
      const err: any = new Error('Internal FCM error');
      err.code = 'messaging/internal-error';
      mockFirebaseMessagingSend
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce('message-id-retry-success');

      const service = await getFCMServiceForErrors();
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-fcm-retry',
        payload: { title: 'T', body: 'B' },
      });

      expect(result[0].success).toBe(true);
      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(2);
    });

    it('should not retry a permanent FCM failure (messaging/invalid-registration-token)', async () => {
      const err: any = new Error('Invalid token');
      err.code = 'messaging/invalid-registration-token';
      mockFirebaseMessagingSend.mockRejectedValue(err);

      const service = await getFCMServiceForErrors();
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);

      const result = await service.sendToUser({
        userId: 'user-fcm-permanent',
        payload: { title: 'T', body: 'B' },
      });

      expect(result[0].error).toBe('TOKEN_INVALID');
      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(1);
    });
  });

  // ==============================================
  // APNS collapseId (line 580)
  // ==============================================

  describe('APNS collapseId', () => {
    it('should set collapseId on APNS notification when payload includes collapseId', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{}], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'key-id',
        APNS_TEAM_ID: 'team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'tok', token: 'apns-tok', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: null },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      await service.sendToUser({
        userId: 'user-apns-collapse',
        payload: { title: 'Msg', body: 'Body', collapseId: 'thread-123' },
      });

      const sentNotification = mockApnsProviderSend.mock.calls.at(-1)?.[0];
      expect(sentNotification.collapseId).toBe('thread-123');
    });

    it('should send APNS using sandbox provider when apnsEnvironment is development', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{}], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'key-id',
        APNS_TEAM_ID: 'team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        {
          id: 'tok',
          token: 'apns-sandbox-tok',
          type: 'apns',
          platform: 'ios',
          bundleId: 'me.meeshy.app',
          apnsEnvironment: 'development',
        },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendToUser({
        userId: 'user-apns-sandbox',
        payload: { title: 'Sandbox', body: 'Test' },
      });

      // Should succeed via sandbox provider
      expect(result[0].success).toBe(true);
      expect(mockApnsProviderSend).toHaveBeenCalled();
    });
  });

  // ==============================================
  // Circuit breaker fallbacks (lines 118, 127)
  // ==============================================

  describe('Circuit breaker fallbacks', () => {
    it('FCM: after 5 consecutive failures, circuit opens and bypasses Firebase on 6th call', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'service_account',
          project_id: 'test',
          private_key: 'fake',
          client_email: 'test@test.iam.gserviceaccount.com',
        })
      );
      mockFirebaseMessagingSend.mockRejectedValue(new Error('FCM service down'));

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_FCM_PUSH: 'true',
        FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/creds.json',
      });
      const service = new PushNotificationService(mockPrisma as any);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      // First fan-out: 5 failing tokens open the circuit (5 real Firebase calls).
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { id: 't1', token: 'fcm-1', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        { id: 't2', token: 'fcm-2', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        { id: 't3', token: 'fcm-3', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        { id: 't4', token: 'fcm-4', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
        { id: 't5', token: 'fcm-5', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);
      const first = await service.sendToUser({
        userId: 'user-circuit',
        payload: { title: 'Test', body: 'Test' },
      });
      expect(first).toHaveLength(5);
      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(5);

      // Second fan-out: circuit is now OPEN, so the next token fails fast via the
      // fallback without touching Firebase (call count stays at 5).
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { id: 't6', token: 'fcm-6', type: 'fcm', platform: 'android', bundleId: null, apnsEnvironment: null },
      ]);
      const second = await service.sendToUser({
        userId: 'user-circuit',
        payload: { title: 'Test', body: 'Test' },
      });
      expect(second).toHaveLength(1);
      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(5);
    });

    it('APNS: after 5 consecutive failures, circuit opens and bypasses APNS provider on 6th call', async () => {
      mockApnsProviderSend.mockRejectedValue(new Error('APNS service down'));

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'key-id',
        APNS_TEAM_ID: 'team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);
      jest.spyOn(service as any, 'wait').mockResolvedValue(undefined);
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockPrisma.pushToken.update.mockResolvedValue({});

      // First fan-out: 5 failing tokens open the circuit (5 real APNS calls).
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { id: 't1', token: 'apns-1', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
        { id: 't2', token: 'apns-2', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
        { id: 't3', token: 'apns-3', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
        { id: 't4', token: 'apns-4', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
        { id: 't5', token: 'apns-5', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
      ]);
      const first = await service.sendToUser({
        userId: 'user-apns-circuit',
        payload: { title: 'Test', body: 'Test' },
      });
      expect(first).toHaveLength(5);
      expect(mockApnsProviderSend).toHaveBeenCalledTimes(5);

      // Second fan-out: circuit is now OPEN, so the next token fails fast via the
      // fallback without touching the APNS provider (call count stays at 5).
      mockPrisma.pushToken.findMany.mockResolvedValueOnce([
        { id: 't6', token: 'apns-6', type: 'apns', platform: 'ios', bundleId: null, apnsEnvironment: null },
      ]);
      const second = await service.sendToUser({
        userId: 'user-apns-circuit',
        payload: { title: 'Test', body: 'Test' },
      });
      expect(second).toHaveLength(1);
      expect(mockApnsProviderSend).toHaveBeenCalledTimes(5);
    });
  });

  // ==============================================
  // In-flight dedup guard (lines 656-657)
  // ==============================================

  describe('handleFailedToken — in-flight dedup guard', () => {
    it('should skip duplicate DB write when same token is already being deactivated', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
      });
      const service = new PushNotificationService(mockPrisma as any);

      // First findUnique is manually deferred — simulates slow DB during concurrent calls
      let resolveFirstFindUnique!: (val: any) => void;
      const deferredFindUnique = new Promise<any>(resolve => {
        resolveFirstFindUnique = resolve;
      });

      mockPrisma.pushToken.findUnique
        .mockReturnValueOnce(deferredFindUnique)
        .mockResolvedValue({ failedAttempts: 0 });

      mockPrisma.pushToken.findMany.mockResolvedValue([
        {
          id: 'shared-tok',
          token: 'bad-token',
          type: 'unknown',
          platform: 'ios',
          bundleId: null,
          apnsEnvironment: null,
        },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      // Start first call — will be suspended in findUnique
      const p1 = service.sendToUser({
        userId: 'user-x',
        payload: { title: 'A', body: 'A' },
      });

      // Allow p1 to advance until it's suspended in deferred findUnique
      // (needs: await initialize → await isPushAllowed → await findMany → handleFailedToken → await findUnique)
      await new Promise<void>(resolve => setTimeout(resolve, 10));

      // Start second call while p1 is in-flight for 'shared-tok'
      const p2 = service.sendToUser({
        userId: 'user-x',
        payload: { title: 'B', body: 'B' },
      });

      // Allow p2 to advance through its chain to the in-flight guard
      await new Promise<void>(resolve => setTimeout(resolve, 10));

      // Resolve p1's suspended findUnique
      resolveFirstFindUnique({ failedAttempts: 0 });

      await Promise.all([p1, p2]);

      // The debug log proves the guard fired for p2
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'handleFailedToken skipped (already in-flight)',
        expect.objectContaining({ tokenId: 'shared-tok' })
      );
      // findUnique called only once (p2's call was skipped by the guard)
      expect(mockPrisma.pushToken.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
