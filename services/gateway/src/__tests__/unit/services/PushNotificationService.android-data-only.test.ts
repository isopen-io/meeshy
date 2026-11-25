/**
 * #19091 — le fil FCM Android d'un message est DATA-ONLY vers l'application native qui le rend
 * elle-même (`MeeshyFcmService` → pipeline → scellé du verrou PIN). Un bloc `notification` serait
 * rendu par le SYSTÈME app fermée, hors du pipeline, donc hors du scellé : titre et corps en clair
 * d'une conversation verrouillée. Rétrocompatible : la coque et un jeton dont le client ou la
 * version ne se lit pas gardent le bloc `notification`, qu'ils sont seuls à savoir afficher.
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
  // Un compte qui garde une session vivante : ses jetons hérités (sans `sessionId`) partent (#18910).
  userSession: { findMany: jest.fn(async () => [{ id: 'live-session' }]) },
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

async function service() {
  process.env = {
    ...originalEnv,
    ENABLE_PUSH_NOTIFICATIONS: 'true',
    ENABLE_FCM_PUSH: 'true',
    ENABLE_APNS_PUSH: 'false',
    FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/firebase-creds.json',
  };
  jest.resetModules();
  const { PushNotificationService } = await import('../../../services/PushNotificationService');
  return new PushNotificationService(mockPrisma as never);
}

const androidToken = (overrides: Record<string, unknown> = {}) => ({
  id: 'and', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: 'me.meeshy.app', apnsEnvironment: null, appVersion: '3.1.0',
  ...overrides,
});

const messagePush = () => ({
  userId: 'u-to',
  payload: {
    title: 'Awa',
    body: 'Le code du portail est 4521',
    badge: 3,
    threadId: 'conv-1',
    data: { type: 'new_message', conversationId: 'conv-1', messageId: 'm-1', notificationId: 'n-1' },
  },
});

async function sentFcmMessage(token: Record<string, unknown>): Promise<Record<string, any>> {
  const svc = await service();
  mockPrisma.pushToken.findMany.mockResolvedValue([token]);
  const results = await svc.sendToUser(messagePush());
  expect(results).toEqual([expect.objectContaining({ success: true })]);
  return mockFirebaseMessagingSend.mock.calls[0][0] as Record<string, any>;
}

describe('#19091 — le fil FCM Android d’un message est data-only vers l’application native', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockReturnValue(JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }));
    mockFirebaseMessagingSend.mockResolvedValue('msg-id');
    mockPrisma.pushToken.update.mockResolvedValue({});
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
  });

  afterEach(() => { process.env = originalEnv; });

  it.each([['3.1.0'], ['3.2.4'], ['3.1.0 (412)']])(
    'native %s : aucun bloc notification, ni racine ni android ; titre et corps voyagent dans data',
    async (appVersion) => {
      const message = await sentFcmMessage(androidToken({ appVersion }));

      expect(message.notification).toBeUndefined();
      expect(message.android?.notification).toBeUndefined();
      expect(message.android).toMatchObject({ priority: 'high' });
      expect(message.data).toMatchObject({
        type: 'new_message', conversationId: 'conv-1', messageId: 'm-1', title: 'Awa', body: 'Le code du portail est 4521',
      });
    },
  );

  it.each([
    ['la coque Capacitor', { bundleId: 'me.meeshy.webapp', appVersion: '2.40.0' }],
    ['une coque 2.x encore sous me.meeshy.app', { appVersion: '2.39.1' }],
    ['une native sans version lisible', { appVersion: null }],
    ['un jeton Android sans bundleId reconnu', { bundleId: null }],
  ])('rétrocompatibilité — %s garde le bloc notification qu’il sait afficher', async (_label, overrides) => {
    const message = await sentFcmMessage(androidToken(overrides));

    expect(message.notification).toEqual({ title: 'Awa', body: 'Le code du portail est 4521' });
    expect(message.android?.notification).toBeDefined();
  });
});
