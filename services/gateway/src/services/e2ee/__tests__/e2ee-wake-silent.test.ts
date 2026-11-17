/**
 * #18910 (serveur-transport-3) — le réveil d'un signal chiffré est un push SILENCIEUX vers l'APNs
 * d'arrière-plan : il n'atteint jamais le jeton VoIP (PushKit), qui obligerait l'iPhone à déclarer un
 * appel fantôme — une entrée « appel manqué » sans nom dans l'historique du téléphone à chaque signal.
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
const BOB = 'b2'.repeat(12);

const iosToken = (id: string, type: 'apns' | 'voip') => ({
  id, token: `${id}-tok`, type, platform: 'ios', bundleId: 'me.meeshy.app',
  apnsEnvironment: 'production', appVersion: '3.0.0', sessionId: null,
});
const bobTokens = [iosToken('bob-apns', 'apns'), iosToken('bob-voip', 'voip')];

async function wake() {
  process.env = {
    ...originalEnv,
    ENABLE_PUSH_NOTIFICATIONS: 'true',
    ENABLE_APNS_PUSH: 'true',
    APNS_KEY_ID: 'k', APNS_TEAM_ID: 't', APNS_KEY_PATH: '/fake/key.p8', APNS_BUNDLE_ID: 'me.meeshy.app',
  };
  jest.resetModules();
  const { wakeE2EEDevices } = await import('../e2ee-wake');
  return wakeE2EEDevices(mockPrisma as never);
}

type Sent = { pushType?: string; priority?: number; topic?: string };
const sentNotifications = () => mockApnsSend.mock.calls.map(([notification]) => notification as Sent);

describe('wakeE2EEDevices — un réveil silencieux, jamais un appel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockReturnValue('-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----');
    mockApnsSend.mockResolvedValue({ sent: [{ device: 'x' }], failed: [] });
    mockPrisma.pushToken.update.mockResolvedValue({});
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userSession.findMany.mockResolvedValue([{ id: 'live-session' }]);
    mockPrisma.pushToken.findMany.mockImplementation(async (args: { where: { type: { in: string[] } } }) =>
      bobTokens.filter((candidate) => args.where.type.in.includes(candidate.type)));
  });

  afterEach(() => { process.env = originalEnv; });

  it('Bob, avec un jeton APNs et un jeton VoIP, ne reçoit qu\'un push d\'arrière-plan', async () => {
    await (await wake())([BOB]);

    expect(sentNotifications()).toHaveLength(1);
    expect(sentNotifications()[0]).toMatchObject({ pushType: 'background', priority: 5 });
  });

  it('aucun push PushKit ne part : aucune requête ne vise le jeton VoIP', async () => {
    await (await wake())([BOB]);

    const queriedTypes = mockPrisma.pushToken.findMany.mock.calls.flatMap(([args]) => (args as { where: { type: { in: string[] } } }).where.type.in);
    expect(queriedTypes).not.toContain('voip');
    expect(sentNotifications().map((notification) => notification.pushType)).not.toContain('voip');
  });
});
