/**
 * #18910 (serveur-transport-6) — le push « badge seul » (`badge_sync`) au chokepoint de livraison.
 *
 * Après une lecture faite ailleurs, la pastille de l'icône iOS doit redescendre sans bannière ni son :
 * `aps = { badge }` seul, sans alert, sans son, sans mutable-content, sans content-available (ce n'est pas un
 * push silencieux, que iOS bride), en-tête `apns-push-type: alert` et priorité 5, remplaçable par
 * `collapse-id badge-<userId>`. Il obéit à `pushEnabled` et à `notificationBadgeEnabled`, jamais à Ne pas
 * déranger : il ne montre rien.
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
import { buildBadgeSyncPush, isBadgeSyncPush } from '../../../services/notifications/badgeSyncPush';

const originalEnv = { ...process.env };
const USER = 'a'.repeat(24);

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

const IOS = { id: 'ios', token: 'apns-tok', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: 'production', appVersion: '1.0.0' };
const IOS_VIA_FCM = { id: 'iosfcm', token: 'fcm-ios', type: 'fcm', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: null, appVersion: '1.0.0' };
const ANDROID = { id: 'and', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: 'me.meeshy.app', apnsEnvironment: null, appVersion: '3.1.0' };

const PREFS_ON = { pushEnabled: true, notificationBadgeEnabled: true, dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59', dndDays: [] };

describe('PushNotificationService — le badge seul (#18910)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockImplementation((path: unknown) => String(path).endsWith('.p8')
      ? '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----'
      : JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }));
    mockFirebaseMessagingSend.mockResolvedValue('msg-id');
    mockApnsSend.mockResolvedValue({ sent: [{ device: 'apns-tok' }], failed: [] });
    mockPrisma.pushToken.update.mockResolvedValue({});
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ notification: PREFS_ON });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('le constructeur vise l’iPhone seul, sans bannière, remplaçable', () => {
    const push = buildBadgeSyncPush(USER, 0);

    expect(push.platforms).toEqual(['ios']);
    expect(push.types).toEqual(['apns', 'fcm']);
    expect(push.payload).toMatchObject({ badge: 0, collapseId: `badge-${USER}`, data: { type: 'badge_sync', unreadCount: '0' } });
    expect(push.payload.silent).toBeUndefined();
    expect(isBadgeSyncPush(push.payload)).toBe(true);
  });

  it('APNs : badge 0, ni alert ni son, ni mutable-content ni content-available, alert/5, collapse-id par compte — même en Ne pas déranger', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);

    const results = await svc.sendToUser(buildBadgeSyncPush(USER, 0));

    expect(results).toEqual([expect.objectContaining({ success: true })]);
    const note = mockApnsSend.mock.calls[0][0] as Record<string, any>;
    expect(note.badge).toBe(0);
    expect(note.alert).toBeUndefined();
    expect(note.sound).toBeUndefined();
    expect(note.mutableContent).not.toBe(true);
    expect(note.contentAvailable).not.toBe(true);
    expect(note.pushType).toBe('alert');
    expect(note.priority).toBe(5);
    expect(note.collapseId).toBe(`badge-${USER}`);
    expect(note.payload).toEqual({ type: 'badge_sync', unreadCount: '0' });
  });

  it('FCM vers un iPhone : aucun bloc notification, aps = { badge } seul, en-têtes alert/5 et collapse-id', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS_VIA_FCM]);

    await svc.sendToUser(buildBadgeSyncPush(USER, 2));

    const message = mockFirebaseMessagingSend.mock.calls[0][0] as Record<string, any>;
    expect(message.notification).toBeUndefined();
    expect(message.apns.payload.aps).toEqual({ badge: 2 });
    expect(message.apns.headers).toMatchObject({
      'apns-push-type': 'alert', 'apns-priority': '5', 'apns-collapse-id': `badge-${USER}`,
    });
  });

  it('un Android n’en reçoit jamais : la plateforme du push est iOS', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockImplementation(async ({ where }: any) =>
      [IOS, ANDROID].filter((token) => where.platform.in.includes(token.platform)));

    await svc.sendToUser(buildBadgeSyncPush(USER, 1));

    expect(mockFirebaseMessagingSend).not.toHaveBeenCalled();
    expect(mockApnsSend).toHaveBeenCalledTimes(1);
  });

  it('pushEnabled:false le retient : une pastille ne se pose pas chez qui a coupé les notifications', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ notification: { ...PREFS_ON, pushEnabled: false } });

    expect(await svc.sendToUser(buildBadgeSyncPush(USER, 1))).toEqual([]);
    expect(mockApnsSend).not.toHaveBeenCalled();
  });

  it('notificationBadgeEnabled:false le retient aussi', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ notification: { ...PREFS_ON, notificationBadgeEnabled: false } });

    expect(await svc.sendToUser(buildBadgeSyncPush(USER, 1))).toEqual([]);
    expect(mockApnsSend).not.toHaveBeenCalled();
  });
});
