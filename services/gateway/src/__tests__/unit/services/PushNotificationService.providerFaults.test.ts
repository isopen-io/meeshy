/**
 * #18910 (serveur-transport-1, -2) — une PANNE du fournisseur n'est jamais une FAUTE du jeton.
 *
 * - FCM : un disjoncteur ouvert ne ment plus (`success:true` pour un envoi jeté) et cinq jetons morts
 *   d'affilée ne l'ouvrent plus — un jeton désinscrit n'est pas une panne de Firebase.
 * - APNs : un échec sans raison Apple (réseau, délai, session fermée), une raison côté clé ou côté charge
 *   et un disjoncteur ouvert ne comptent pas une faute au jeton sain ; BadDeviceToken désactive toujours.
 *
 * @jest-environment node
 */
const mockFirebaseMessagingSend = jest.fn();

jest.mock('firebase-admin/app', () => ({
  __esModule: true,
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn().mockReturnValue({}),
}));

jest.mock('firebase-admin/messaging', () => ({
  __esModule: true,
  getMessaging: jest.fn(() => ({ send: mockFirebaseMessagingSend })),
}));

const mockApnsSend = jest.fn();
const MockApnsProvider = jest.fn().mockImplementation(() => ({ send: mockApnsSend, shutdown: jest.fn() }));
const MockApnsNotification = jest.fn().mockImplementation(() => ({ alert: {}, sound: 'default', payload: undefined }));
jest.mock('@parse/node-apn', () => ({
  __esModule: true,
  default: { Provider: MockApnsProvider, Notification: MockApnsNotification },
  Provider: MockApnsProvider,
  Notification: MockApnsNotification,
}), { virtual: true });

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockStatSync = jest.fn();

jest.mock('fs', () => ({
  __esModule: true,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync, statSync: mockStatSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  statSync: mockStatSync,
}));

jest.mock('path', () => ({
  __esModule: true,
  default: { resolve: jest.fn((p: string) => p) },
  resolve: jest.fn((p: string) => p),
}));

const mockPrisma = {
  userPreferences: { findUnique: jest.fn() },
  pushToken: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  userSession: { findMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const mockChildLogger = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
};

jest.mock('../../../utils/logger-enhanced', () => {
  const root = { ...mockChildLogger, child: jest.fn(() => mockChildLogger) };
  return {
    __esModule: true,
    enhancedLogger: root,
    performanceLogger: {
      start: jest.fn(() => ({ end: jest.fn() })),
      withTiming: jest.fn(async (_step: string, fn: () => Promise<unknown>) => fn()),
    },
    notificationLogger: mockChildLogger,
    default: root,
  };
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const originalEnv = { ...process.env };
const USER = 'a1'.repeat(12);

async function service() {
  process.env = {
    ...originalEnv,
    ENABLE_PUSH_NOTIFICATIONS: 'true',
    ENABLE_FCM_PUSH: 'true',
    ENABLE_APNS_PUSH: 'true',
    FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/firebase-creds.json',
    APNS_KEY_ID: 'k', APNS_TEAM_ID: 't', APNS_KEY_PATH: '/fake/key.p8', APNS_BUNDLE_ID: 'me.meeshy.app',
  };
  jest.resetModules();
  const { PushNotificationService } = await import('../../../services/PushNotificationService');
  const instance = new PushNotificationService(mockPrisma as never);
  jest.spyOn(instance as never as { wait: () => Promise<void> }, 'wait').mockResolvedValue(undefined);
  return instance;
}

type Kind = 'fcm' | 'apns' | 'voip' | 'pushtotalk';
const token = (id: string, type: Kind = 'apns') => ({
  id, token: `${id}-tok`, type, platform: type === 'fcm' ? 'android' : 'ios', bundleId: 'me.meeshy.app',
  apnsEnvironment: type === 'fcm' ? null : 'production', appVersion: '3.0.0', sessionId: null,
});
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const payload = { title: 'T', body: 'B' };
const fcmError = (code: string) => Object.assign(new Error(code), { code });
const deactivations = () =>
  mockPrisma.pushToken.update.mock.calls.filter(([arg]) => (arg as { data: { isActive?: boolean } }).data.isActive === false);
const strikes = () =>
  mockPrisma.pushToken.update.mock.calls.filter(([arg]) => (arg as { data: { failedAttempts?: number } }).data.failedAttempts === 3);

const send = (svc: Awaited<ReturnType<typeof service>>, tokens: ReturnType<typeof token>[]) => {
  mockPrisma.pushToken.findMany.mockResolvedValueOnce(tokens);
  return svc.sendToUser({ userId: USER, payload });
};

describe('serveur-transport — la panne du fournisseur n\'est pas la faute du jeton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockImplementation((path: unknown) => String(path).endsWith('.p8')
      ? '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----'
      : JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }));
    mockFirebaseMessagingSend.mockResolvedValue('msg-id');
    mockApnsSend.mockResolvedValue({ sent: [{ device: 'x' }], failed: [] });
    mockPrisma.pushToken.update.mockResolvedValue({});
    mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 2 });
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userSession.findMany.mockResolvedValue([]);
  });

  afterEach(() => { process.env = originalEnv; });

  describe('FCM', () => {
    it('cinq pannes Firebase ouvrent le disjoncteur : le jeton sain suivant n\'est ni compté livré ni puni', async () => {
      const svc = await service();
      mockFirebaseMessagingSend.mockRejectedValue(fcmError('messaging/internal-error'));
      await send(svc, ids('f', 5).map((id) => token(id, 'fcm')));
      mockFirebaseMessagingSend.mockClear();
      mockPrisma.pushToken.update.mockClear();

      const [sixth] = await send(svc, [token('healthy', 'fcm')]);

      expect(mockFirebaseMessagingSend).not.toHaveBeenCalled();
      expect(sixth).toMatchObject({ success: false, transient: true });
      expect(deactivations()).toHaveLength(0);
    });

    it('cinq jetons désinscrits d\'affilée ne coupent pas Firebase aux autres : le sixième, sain, part', async () => {
      const svc = await service();
      mockFirebaseMessagingSend.mockRejectedValue(fcmError('messaging/registration-token-not-registered'));
      const dead = await send(svc, ids('d', 5).map((id) => token(id, 'fcm')));
      expect(dead.map((r) => r.error)).toEqual(Array(5).fill('TOKEN_INVALID'));
      mockFirebaseMessagingSend.mockReset();
      mockFirebaseMessagingSend.mockResolvedValue('msg-id');

      const [sixth] = await send(svc, [token('healthy', 'fcm')]);

      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(1);
      expect(sixth.success).toBe(true);
    });

    it('cinq jetons mal formés d\'affilée gardent leur faute mais ne coupent pas Firebase aux autres', async () => {
      const svc = await service();
      mockFirebaseMessagingSend.mockRejectedValue(fcmError('messaging/invalid-argument'));
      const malformed = await send(svc, ids('m', 5).map((id) => token(id, 'fcm')));
      expect(malformed.every((r) => r.success === false && !r.transient)).toBe(true);
      mockFirebaseMessagingSend.mockReset();
      mockFirebaseMessagingSend.mockResolvedValue('msg-id');

      const [sixth] = await send(svc, [token('healthy', 'fcm')]);

      expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(1);
      expect(sixth.success).toBe(true);
    });

    it('Firebase muet au-delà du délai du disjoncteur : le jeton sain à deux fautes n\'est ni puni ni désactivé', async () => {
      const svc = await service();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
      try {
        mockFirebaseMessagingSend.mockReturnValue(new Promise(() => undefined));
        const pending = send(svc, [token('healthy', 'fcm')]);
        await jest.advanceTimersByTimeAsync(10_000);
        const [result] = await pending;

        expect(result).toMatchObject({ success: false, transient: true });
        expect(strikes()).toHaveLength(0);
        expect(deactivations()).toHaveLength(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it.each(['messaging/mismatched-credential', 'messaging/third-party-auth-error', 'app/network-error'])(
      'un échec fournisseur %s ne compte aucune faute au jeton',
      async (code) => {
        const svc = await service();
        mockFirebaseMessagingSend.mockRejectedValue(fcmError(code));
        const [result] = await send(svc, [token('healthy', 'fcm')]);
        expect(result).toMatchObject({ success: false, transient: true });
        expect(deactivations()).toHaveLength(0);
        expect(strikes()).toHaveLength(0);
      },
    );
  });

  describe('APNs', () => {
    const outcomes: Array<[string, { sent: unknown[]; failed: unknown[] }]> = [
      ['un délai d\'écriture sans raison Apple', { sent: [], failed: [{ device: 'd', error: new Error('apn write timeout') }] }],
      ['une session fermée (500 sans réponse Apple)', { sent: [], failed: [{ device: 'd', status: 500, error: new Error('Error 500, stream ended unexpectedly') }] }],
      ['une clé fournisseur invalide', { sent: [], failed: [{ device: 'd', status: 403, response: { reason: 'InvalidProviderToken' } }] }],
      ['une clé fournisseur expirée', { sent: [], failed: [{ device: 'd', status: 403, response: { reason: 'ExpiredProviderToken' } }] }],
      ['une charge trop grosse', { sent: [], failed: [{ device: 'd', status: 413, response: { reason: 'PayloadTooLarge' } }] }],
    ];

    it.each(outcomes)('%s : le jeton sain à deux fautes n\'est ni puni ni désactivé', async (_label, outcome) => {
      const svc = await service();
      mockApnsSend.mockResolvedValue(outcome);
      const [result] = await send(svc, [token('healthy')]);
      expect(result.success).toBe(false);
      expect(deactivations()).toHaveLength(0);
      expect(strikes()).toHaveLength(0);
    });

    it('un jeton VoIP sain survit aussi à une panne réseau d\'APNs', async () => {
      const svc = await service();
      mockApnsSend.mockResolvedValue(outcomes[0][1]);
      await send(svc, [token('voip-healthy', 'voip')]);
      expect(deactivations()).toHaveLength(0);
    });

    it('disjoncteur APNs ouvert : le jeton sain à deux fautes n\'est pas désactivé', async () => {
      const svc = await service();
      mockApnsSend.mockRejectedValue(new Error('APNS service down'));
      await send(svc, ids('a', 5).map((id) => token(id)));
      mockApnsSend.mockClear();
      mockPrisma.pushToken.update.mockClear();

      const [sixth] = await send(svc, [token('healthy')]);

      expect(mockApnsSend).not.toHaveBeenCalled();
      expect(sixth.success).toBe(false);
      expect(deactivations()).toHaveLength(0);
    });

    it('un jeton PushToTalk sain survit à une panne réseau d\'APNs', async () => {
      const svc = await service();
      mockApnsSend.mockResolvedValue(outcomes[0][1]);
      await send(svc, [token('ptt-healthy', 'pushtotalk')]);
      expect(deactivations()).toHaveLength(0);
    });

    it('non-régression : BadDeviceToken désactive le jeton dès le premier échec', async () => {
      const svc = await service();
      mockPrisma.pushToken.findUnique.mockResolvedValue({ failedAttempts: 0 });
      mockApnsSend.mockResolvedValue({ sent: [], failed: [{ device: 'd', status: 400, response: { reason: 'BadDeviceToken' } }] });
      await send(svc, [token('dead')]);
      expect(deactivations()).toHaveLength(1);
    });

    it('non-régression : une raison inconnue garde la règle des trois fautes', async () => {
      const svc = await service();
      mockApnsSend.mockResolvedValue({ sent: [], failed: [{ device: 'd', status: 400, response: { reason: 'SomethingNew' } }] });
      await send(svc, [token('odd')]);
      expect(deactivations()).toHaveLength(1);
    });
  });
});
