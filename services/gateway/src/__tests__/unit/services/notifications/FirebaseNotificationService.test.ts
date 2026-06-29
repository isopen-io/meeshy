/**
 * FirebaseNotificationService Unit Tests
 *
 * Covers:
 * - FirebaseStatusChecker.checkFirebase(): admin missing, env var missing,
 *   file not found, invalid JSON, init error, happy path, idempotency
 * - FirebaseStatusChecker.isFirebaseAvailable(): delegates to checkFirebase once
 * - FirebaseNotificationService.sendPushNotification(): Firebase unavailable,
 *   no tokens, successful multicast, stale-token cleanup, timeout, error branches
 * - FirebaseNotificationService.isAvailable(): delegates to FirebaseStatusChecker
 *
 * @jest-environment node
 */

// Mock firebase-admin BEFORE module load
const mockSendEachForMulticast = jest.fn();
const mockInitializeApp = jest.fn();
const mockCredentialCert = jest.fn().mockReturnValue({});
const mockMessaging = jest.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast }));

const firebaseAdminMock = {
  initializeApp: mockInitializeApp,
  credential: { cert: mockCredentialCert },
  messaging: mockMessaging,
};

jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: firebaseAdminMock,
  ...firebaseAdminMock,
}));

// Mock fs
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}), { virtual: true });

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  FirebaseStatusChecker,
  FirebaseNotificationService,
} from '../../../../services/notifications/FirebaseNotificationService';
import type { NotificationEventData } from '../../../../services/notifications/types';

function resetFirebaseStatusChecker() {
  (FirebaseStatusChecker as any).checked = false;
  (FirebaseStatusChecker as any).firebaseAvailable = false;
}

function makeNotification(overrides?: Partial<NotificationEventData>): NotificationEventData {
  return {
    id: 'notif_001',
    userId: 'user_abc',
    type: 'new_message',
    title: 'New message',
    content: 'Hello world',
    priority: 'normal',
    isRead: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    conversationId: 'conv_123',
    messageId: 'msg_456',
    ...overrides,
  };
}

function makePrisma(tokens: { token: string; id: string }[] = []) {
  return {
    pushToken: {
      findMany: jest.fn().mockResolvedValue(tokens),
      deleteMany: jest.fn().mockResolvedValue({ count: tokens.length }),
    },
  } as any;
}

describe('FirebaseStatusChecker', () => {
  beforeEach(() => {
    resetFirebaseStatusChecker();
    jest.clearAllMocks();
    delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
    // Reset module-level firebaseInitialized: not directly accessible, but
    // mockInitializeApp tracking gives us full observability
  });

  describe('checkFirebase', () => {
    it('returns true and initializes when everything is configured correctly', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"service_account"}');
      mockInitializeApp.mockReturnValue(undefined);

      const result = FirebaseStatusChecker.checkFirebase();

      expect(result).toBe(true);
      expect(FirebaseStatusChecker.isFirebaseAvailable()).toBe(true);
    });

    it('is idempotent — does not re-run after first check', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"service_account"}');

      FirebaseStatusChecker.checkFirebase();
      FirebaseStatusChecker.checkFirebase();
      FirebaseStatusChecker.checkFirebase();

      expect(mockExistsSync).toHaveBeenCalledTimes(1);
    });

    it('returns false when FIREBASE_ADMIN_CREDENTIALS_PATH is not set', () => {
      delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;

      const result = FirebaseStatusChecker.checkFirebase();

      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('returns false when credentials file does not exist', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/missing/creds.json';
      mockExistsSync.mockReturnValue(false);

      const result = FirebaseStatusChecker.checkFirebase();

      expect(result).toBe(false);
    });

    it('returns false when credentials file contains invalid JSON', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('NOT_JSON{{{');

      const result = FirebaseStatusChecker.checkFirebase();

      expect(result).toBe(false);
    });

    it('returns false when fs.existsSync throws unexpectedly (outer catch)', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockImplementation(() => {
        throw new Error('Unexpected fs error');
      });

      const result = FirebaseStatusChecker.checkFirebase();

      expect(result).toBe(false);
    });

    it('handles initializeApp throwing on first call (isolated module)', async () => {
      // initializeApp throwing can only be observed on the very first module load
      // (firebaseInitialized is a module-level variable). We use isolateModules to
      // get a fresh copy where firebaseInitialized is false.
      await jest.isolateModulesAsync(async () => {
        process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('{"type":"service_account"}');
        mockInitializeApp.mockImplementationOnce(() => {
          throw new Error('Firebase init failed');
        });

        // Dynamic import of a fresh module instance
        const { FirebaseStatusChecker: FreshChecker } =
          await import('../../../../services/notifications/FirebaseNotificationService');

        const result = FreshChecker.checkFirebase();
        expect(result).toBe(false);
      });
    });
  });

  describe('isFirebaseAvailable', () => {
    it('calls checkFirebase when not yet checked', () => {
      delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;

      const result = FirebaseStatusChecker.isFirebaseAvailable();

      expect(result).toBe(false);
      expect((FirebaseStatusChecker as any).checked).toBe(true);
    });

    it('returns cached result on subsequent calls without re-checking', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"service_account"}');
      mockInitializeApp.mockReturnValue(undefined);

      FirebaseStatusChecker.checkFirebase();
      jest.clearAllMocks();

      const result = FirebaseStatusChecker.isFirebaseAvailable();

      expect(result).toBe(true);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });
  });
});

describe('FirebaseNotificationService', () => {
  beforeEach(() => {
    resetFirebaseStatusChecker();
    jest.clearAllMocks();
    delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  });

  function makeServiceWithFirebaseReady(tokens: { token: string; id: string }[] = []) {
    process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{"type":"service_account"}');
    mockInitializeApp.mockReturnValue(undefined);

    const prisma = makePrisma(tokens);
    const svc = new FirebaseNotificationService(prisma);
    return { svc, prisma };
  }

  describe('sendPushNotification', () => {
    it('returns false when Firebase is not available', async () => {
      delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
      const prisma = makePrisma();
      const svc = new FirebaseNotificationService(prisma);

      const result = await svc.sendPushNotification('user_1', makeNotification());

      expect(result).toBe(false);
      expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
    });

    it('returns false when user has no FCM tokens', async () => {
      const { svc, prisma } = makeServiceWithFirebaseReady([]);

      const result = await svc.sendPushNotification('user_1', makeNotification());

      expect(result).toBe(false);
      expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', type: 'fcm' },
        select: { token: true, id: true },
      });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('sends multicast with correct message structure and returns true on success', async () => {
      const tokens = [
        { token: 'fcm_token_A', id: 'tok_1' },
        { token: 'fcm_token_B', id: 'tok_2' },
      ];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        responses: [
          { success: true },
          { success: true },
        ],
      });

      const { svc } = makeServiceWithFirebaseReady(tokens);
      const notif = makeNotification({ data: { extra: 'val' } });

      const result = await svc.sendPushNotification('user_1', notif);

      expect(result).toBe(true);
      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['fcm_token_A', 'fcm_token_B'],
          notification: {
            title: notif.title,
            body: notif.content,
          },
          data: expect.objectContaining({
            notificationId: notif.id,
            type: notif.type,
            conversationId: notif.conversationId,
            messageId: notif.messageId,
            additionalData: JSON.stringify(notif.data),
          }),
          android: expect.objectContaining({
            priority: 'high',
          }),
          apns: expect.objectContaining({
            payload: { aps: { sound: 'default', badge: 1 } },
          }),
        })
      );
    });

    it('sets empty strings for missing conversationId and messageId', async () => {
      const tokens = [{ token: 'fcm_token_A', id: 'tok_1' }];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        responses: [{ success: true }],
      });

      const { svc } = makeServiceWithFirebaseReady(tokens);
      const notif = makeNotification({ conversationId: undefined, messageId: undefined });

      await svc.sendPushNotification('user_1', notif);

      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: '',
            messageId: '',
          }),
        })
      );
    });

    it('does not include additionalData field when notification.data is absent', async () => {
      const tokens = [{ token: 'fcm_token_A', id: 'tok_1' }];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        responses: [{ success: true }],
      });

      const { svc } = makeServiceWithFirebaseReady(tokens);
      const notif = makeNotification({ data: undefined });

      await svc.sendPushNotification('user_1', notif);

      const callArg = mockSendEachForMulticast.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('additionalData');
    });

    it('returns false when successCount is 0', async () => {
      const tokens = [{ token: 'fcm_token_A', id: 'tok_1' }];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        responses: [{ success: false, error: { code: 'messaging/unknown' } }],
      });

      const { svc } = makeServiceWithFirebaseReady(tokens);

      const result = await svc.sendPushNotification('user_1', makeNotification());

      expect(result).toBe(false);
    });

    it('removes stale tokens with invalid-registration-token error code', async () => {
      const tokens = [
        { token: 'valid_token', id: 'tok_1' },
        { token: 'stale_token', id: 'tok_2' },
      ];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ],
      });

      const { svc, prisma } = makeServiceWithFirebaseReady(tokens);

      await svc.sendPushNotification('user_1', makeNotification());

      // Give the fire-and-forget deleteMany a tick to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['tok_2'] } },
      });
    });

    it('removes stale tokens with registration-token-not-registered error code', async () => {
      const tokens = [{ token: 'expired_token', id: 'tok_expired' }];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        responses: [
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        ],
      });

      const { svc, prisma } = makeServiceWithFirebaseReady(tokens);

      await svc.sendPushNotification('user_1', makeNotification());
      await new Promise(resolve => setImmediate(resolve));

      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['tok_expired'] } },
      });
    });

    it('does not call deleteMany when no stale tokens', async () => {
      const tokens = [{ token: 'good_token', id: 'tok_1' }];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        responses: [{ success: true }],
      });

      const { svc, prisma } = makeServiceWithFirebaseReady(tokens);

      await svc.sendPushNotification('user_1', makeNotification());
      await new Promise(resolve => setImmediate(resolve));

      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it('logs but does not throw when deleteMany rejects for stale tokens', async () => {
      const tokens = [{ token: 'stale_token', id: 'tok_stale' }];
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        responses: [
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ],
      });

      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"service_account"}');
      mockInitializeApp.mockReturnValue(undefined);

      const prisma = {
        pushToken: {
          findMany: jest.fn().mockResolvedValue(tokens),
          deleteMany: jest.fn().mockRejectedValue(new Error('DB error')),
        },
      } as any;

      const svc = new FirebaseNotificationService(prisma);

      await expect(svc.sendPushNotification('user_1', makeNotification())).resolves.toBe(false);
      // Let the fire-and-forget catch run
      await new Promise(resolve => setImmediate(resolve));
    });

    it('returns false and does not throw on Firebase timeout', async () => {
      const tokens = [{ token: 'fcm_token_A', id: 'tok_1' }];
      // Simulate a long-running request by rejecting with a timeout-like error
      mockSendEachForMulticast.mockRejectedValue(new Error('Firebase timeout'));

      const { svc } = makeServiceWithFirebaseReady(tokens);

      const result = await svc.sendPushNotification('user_1', makeNotification());
      expect(result).toBe(false);
    });

    it('returns false and does not throw on generic Firebase error', async () => {
      const tokens = [{ token: 'fcm_token_A', id: 'tok_1' }];
      mockSendEachForMulticast.mockRejectedValue(new Error('Network error'));

      const { svc } = makeServiceWithFirebaseReady(tokens);

      const result = await svc.sendPushNotification('user_1', makeNotification());

      expect(result).toBe(false);
    });

    it('returns false on invalid-registration-token top-level error without throwing', async () => {
      const tokens = [{ token: 'fcm_token_A', id: 'tok_1' }];
      const err: any = new Error('Invalid token');
      err.code = 'messaging/invalid-registration-token';
      mockSendEachForMulticast.mockRejectedValue(err);

      const { svc } = makeServiceWithFirebaseReady(tokens);

      const result = await svc.sendPushNotification('user_1', makeNotification());

      expect(result).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('returns false when Firebase is not configured', () => {
      delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
      const prisma = makePrisma();
      const svc = new FirebaseNotificationService(prisma);

      expect(svc.isAvailable()).toBe(false);
    });

    it('returns true when Firebase is configured correctly', () => {
      process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/path/to/creds.json';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"service_account"}');
      mockInitializeApp.mockReturnValue(undefined);

      const prisma = makePrisma();
      const svc = new FirebaseNotificationService(prisma);

      expect(svc.isAvailable()).toBe(true);
    });
  });
});
