/**
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

jest.mock('@parse/node-apn', () => ({
  __esModule: true,
  default: { Provider: jest.fn(), Notification: jest.fn() },
  Provider: jest.fn(),
  Notification: jest.fn(),
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

async function getFCMService() {
  process.env = {
    ...originalEnv,
    ENABLE_PUSH_NOTIFICATIONS: 'true',
    ENABLE_FCM_PUSH: 'true',
    FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/firebase-creds.json',
  };
  jest.resetModules();
  const { PushNotificationService } = await import('../../../services/PushNotificationService');
  return new PushNotificationService(mockPrisma as never);
}

async function sendGameBanner(tokens: ReadonlyArray<{ id: string; token: string; bundleId: string | null }>) {
  const service = await getFCMService();
  mockPrisma.pushToken.findMany.mockResolvedValue(
    tokens.map((t) => ({ ...t, type: 'fcm', platform: 'android', apnsEnvironment: null })),
  );
  await service.sendToUser({
    userId: 'user-android',
    payload: { title: 'Jeu', body: 'Duo', data: { type: 'game_duo_invited' } },
  });
  return mockFirebaseMessagingSend.mock.calls.map((call) => {
    const message = call[0] as { android?: { notification?: { channelId?: string } } };
    return message.android?.notification?.channelId;
  });
}

describe('PushNotificationService — the Android Game channel (#10266)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      type: 'service_account',
      project_id: 'meeshy-test',
      private_key: 'fake-key',
      client_email: 'test@meeshy.iam.gserviceaccount.com',
    }));
    mockFirebaseMessagingSend.mockResolvedValue('msg-id-123');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('a game banner reaches the Game channel only on the shell token, which creates it (#10266)', async () => {
    const channels = await sendGameBanner([{ id: 'tok', token: 'fcm-shell', bundleId: 'me.meeshy.app' }]);

    expect(channels).toEqual(['meeshy_game']);
  });

  it('a game banner stays on the default channel for the native app, which never creates the Game channel (#9223)', async () => {
    const channels = await sendGameBanner([
      { id: 'tok', token: 'fcm-native', bundleId: 'me.meeshy.android' },
      { id: 'tok-2', token: 'fcm-unknown', bundleId: null },
    ]);

    expect(channels).toEqual(['meeshy_notifications', 'meeshy_notifications']);
  });
});
