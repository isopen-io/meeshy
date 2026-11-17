/**
 * #9616 (#18910, défense en profondeur) — `sendToUser` n'envoie jamais vers un jeton dont la
 * session est morte (révoquée, expirée) : même si le retrait à la fin de session a échoué ou
 * a été manqué, l'écran verrouillé de l'appareil révoqué ne reçoit rien. Un jeton sans session
 * (hérité, d'avant le lien) part toujours : rétrocompatibilité.
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
const LIVE = 'c3'.repeat(12);
const REVOKED = 'd4'.repeat(12);
const EXPIRED = 'e5'.repeat(12);

type Session = { id: string; isValid: boolean; expiresAt: Date };
const sessions: Session[] = [
  { id: LIVE, isValid: true, expiresAt: new Date(Date.now() + 86_400_000) },
  { id: REVOKED, isValid: false, expiresAt: new Date(Date.now() + 86_400_000) },
  { id: EXPIRED, isValid: true, expiresAt: new Date(Date.now() - 1000) },
];

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
  return new PushNotificationService(mockPrisma as never);
}

const token = (id: string, sessionId: string | null, type: 'apns' | 'fcm' = 'apns') => ({
  id, token: `${id}-tok`, type, platform: type === 'apns' ? 'ios' : 'android', bundleId: 'me.meeshy.app',
  apnsEnvironment: type === 'apns' ? 'production' : null, appVersion: '3.0.0', sessionId,
});

describe('sendToUser ne part pas vers un jeton dont la session est morte', () => {
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
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userSession.findMany.mockImplementation(async (args: { where: { id: { in: string[] }; isValid: boolean; expiresAt: { gt: Date } } }) =>
      sessions.filter((s) => args.where.id.in.includes(s.id) && s.isValid === args.where.isValid && s.expiresAt > args.where.expiresAt.gt).map((s) => ({ id: s.id })));
  });

  afterEach(() => { process.env = originalEnv; });

  it('une session révoquée ou échue ne reçoit rien ; la session vivante reçoit', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([
      token('revoque', REVOKED), token('echu', EXPIRED), token('vivant', LIVE, 'fcm'),
    ]);

    const results = await svc.sendToUser({ userId: USER, payload: { title: 'Awa', body: 'Rendez-vous à 18h' } });

    expect(results).toEqual([expect.objectContaining({ success: true, tokenId: 'vivant' })]);
    expect(mockApnsSend).not.toHaveBeenCalled();
    expect(mockFirebaseMessagingSend).toHaveBeenCalledTimes(1);
  });

  it('rétrocompatibilité : un jeton sans session (hérité) part toujours, sans lecture de session', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([token('herite', null)]);

    const results = await svc.sendToUser({ userId: USER, payload: { title: 'Awa', body: 'Rendez-vous à 18h' } });

    expect(results).toEqual([expect.objectContaining({ success: true })]);
    expect(mockPrisma.userSession.findMany).not.toHaveBeenCalled();
  });

  it("la session est lue pour CE compte : une session d'un autre compte ne valide pas le jeton", async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([token('vivant', LIVE)]);

    await svc.sendToUser({ userId: USER, payload: { title: 'Awa', body: 'Rendez-vous à 18h' } });

    expect(mockPrisma.userSession.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: USER } });
  });
});
