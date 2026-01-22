/**
 * PushNotificationService Unit Tests
 *
 * Tests:
 * - Service initialization with Firebase and APNS providers
 * - Configuration flags (enabled/disabled)
 * - sendToUser method with various token types
 * - sendVoIPPush method for VoIP calls
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

jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: {
    apps: [],
    initializeApp: mockFirebaseInitializeApp,
    credential: {
      cert: mockFirebaseCredentialCert,
    },
    messaging: jest.fn(() => ({
      send: mockFirebaseMessagingSend,
    })),
  },
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

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
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

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Store original environment variables
const originalEnv = { ...process.env };

// Mock console methods
let mockConsoleLog: jest.SpyInstance;
let mockConsoleError: jest.SpyInstance;
let mockConsoleWarn: jest.SpyInstance;

describe('PushNotificationService', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock behaviors
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      project_id: 'test-project',
      private_key: 'test-key',
      client_email: 'test@test.iam.gserviceaccount.com',
    }));

    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    mockConsoleLog?.mockRestore();
    mockConsoleError?.mockRestore();
    mockConsoleWarn?.mockRestore();
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

    // Re-apply mocks after module reset
    jest.doMock('firebase-admin', () => ({
      __esModule: true,
      default: {
        apps: [],
        initializeApp: mockFirebaseInitializeApp,
        credential: {
          cert: mockFirebaseCredentialCert,
        },
        messaging: jest.fn(() => ({
          send: mockFirebaseMessagingSend,
        })),
      },
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
      },
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
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

      expect(mockConsoleLog).toHaveBeenCalledWith('[PUSH] Push notifications disabled');
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

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[PUSH] Firebase credentials not found')
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

      expect(mockConsoleLog).toHaveBeenCalledWith('[PUSH] APNS client initialized');
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
      const apnsLogs = mockConsoleLog.mock.calls.filter(
        (call: any[]) => call[0] === '[PUSH] APNS client initialized'
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
      expect(mockConsoleLog).toHaveBeenCalledWith('[PUSH] No active tokens found for user user-123');
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
        APNS_BUNDLE_ID: 'com.meeshy.app',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'apns-token-123', type: 'apns', platform: 'ios', bundleId: 'com.meeshy.app' },
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
        APNS_VOIP_BUNDLE_ID: 'com.meeshy.app.voip',
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
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[PUSH] Failed to initialize Firebase:',
        expect.any(Error)
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
      expect(result[0].error).toBe('APNS not initialized');
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
  });

  // ==============================================
  // SEND VOIP PUSH TESTS
  // ==============================================

  describe('sendVoIPPush', () => {
    it('should return empty array when VoIP push is disabled', async () => {
      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_VOIP_PUSH: 'false',
      });
      const service = new PushNotificationService(mockPrisma as any);

      const result = await service.sendVoIPPush('user-123', {
        callId: 'call-123',
        callerName: 'John Doe',
        callerAvatar: 'https://example.com/avatar.png',
        conversationId: 'conv-456',
      });

      expect(result).toEqual([]);
    });

    it('should send VoIP push notification successfully', async () => {
      mockApnsProviderSend.mockResolvedValue({ sent: [{ device: 'voip-token-123' }], failed: [] });

      const { PushNotificationService } = await getServiceWithEnv({
        ENABLE_PUSH_NOTIFICATIONS: 'true',
        ENABLE_VOIP_PUSH: 'true',
        ENABLE_APNS_PUSH: 'true',
        APNS_KEY_ID: 'test-key-id',
        APNS_TEAM_ID: 'test-team-id',
        APNS_KEY_PATH: '/path/to/key.p8',
      });
      const service = new PushNotificationService(mockPrisma as any);

      mockPrisma.pushToken.findMany.mockResolvedValue([
        { id: 'token-1', token: 'voip-token-123', type: 'voip', platform: 'ios', bundleId: null },
      ]);
      mockPrisma.pushToken.update.mockResolvedValue({});

      const result = await service.sendVoIPPush('user-123', {
        callId: 'call-123',
        callerName: 'John Doe',
        callerAvatar: 'https://example.com/avatar.png',
        conversationId: 'conv-456',
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });

    it('should only target iOS VoIP tokens', async () => {
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

      await service.sendVoIPPush('user-123', {
        callId: 'call-123',
        callerName: 'John Doe',
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
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('[PUSH] Deactivated token token-1')
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
      expect(mockConsoleLog).toHaveBeenCalledWith('[PUSH] Cleaned up 15 inactive/stale tokens');
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

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[PUSH] Failed to initialize Firebase:',
        expect.any(Error)
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

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[PUSH] Failed to initialize APNS:',
        expect.any(Error)
      );
    });
  });
});
