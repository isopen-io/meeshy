/**
 * #13936 — le Bring au chokepoint de livraison : une catégorie à part qui passe Ne pas
 * déranger, `pushEnabled` et `soundEnabled` ; iOS time-sensitive (ou critique) avec la
 * sonnerie d'appel et une expiration ; Android en data-only à TTL borné.
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
import { buildBringRingPushes, buildBringStoppedPushes } from '../../../services/bring/bringPush';

const originalEnv = { ...process.env };
const SENT = new Date('2026-11-02T03:00:00Z');
const EXPIRES = new Date(SENT.getTime() + 120_000);

const ringPushes = (criticalAlerts = false) => buildBringRingPushes({
  bringId: 'b'.repeat(24), toUserId: 'u-to', fromUserId: 'u-from', fromName: 'Awa', fromAvatar: null,
  sentAt: SENT, expiresAt: EXPIRES, language: 'fr', criticalAlerts,
});

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

const IOS = { id: 'ios', token: 'apns-tok', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: 'production', appVersion: '1.9.0' };
const ANDROID = { id: 'and', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: 'me.meeshy.app', apnsEnvironment: null, appVersion: '1.0.0' };

/** Toutes les préférences qui couperaient une notification ordinaire. */
const EVERYTHING_OFF = {
  pushEnabled: false, soundEnabled: false, dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59',
  dndDays: [], groupNotifications: false,
};

describe('PushNotificationService — le Bring (#13936)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: SENT, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'queueMicrotask'] });
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockImplementation((path: unknown) => String(path).endsWith('.p8')
      ? '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----'
      : JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }));
    mockFirebaseMessagingSend.mockResolvedValue('msg-id');
    mockApnsSend.mockResolvedValue({ sent: [{ device: 'apns-tok' }], failed: [] });
    mockPrisma.pushToken.update.mockResolvedValue({});
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ notification: EVERYTHING_OFF });
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it('iOS : la sonnerie part malgré pushEnabled:false, Ne pas déranger et soundEnabled:false — time-sensitive, Ringtone.caf, expirée avec la fenêtre', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);

    const [results] = await Promise.all([svc.sendToUser(ringPushes()[0])]);

    expect(results).toEqual([expect.objectContaining({ success: true })]);
    const note = mockApnsSend.mock.calls[0][0] as Record<string, any>;
    expect(note.sound).toBe('Ringtone.caf');
    expect(note.aps['interruption-level']).toBe('time-sensitive');
    expect(note.category).toBe('BRING');
    expect(note.expiry).toBe(Math.floor(EXPIRES.getTime() / 1000));
    expect(note.pushType).not.toBe('voip');
    expect(note.payload).toMatchObject({ type: 'bring', bringId: 'b'.repeat(24), title: 'Awa fait sonner votre téléphone' });
  });

  it('iOS, Critical Alerts accordé : niveau critical et son critique { critical: 1, name, volume }', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);

    await svc.sendToUser(ringPushes(true)[0]);

    const note = mockApnsSend.mock.calls[0][0] as Record<string, any>;
    expect(note.aps['interruption-level']).toBe('critical');
    expect(note.sound).toEqual({ critical: 1, name: 'Ringtone.caf', volume: 1 });
  });

  it('jamais par PushKit : la sonnerie ne vise aucun jeton voip', () => {
    expect(ringPushes().flatMap((p) => p.types ?? [])).not.toContain('voip');
    expect(buildBringStoppedPushes({ bringId: 'x', toUserId: 'u', reason: 'recipient' }).flatMap((p) => p.types ?? [])).not.toContain('voip');
  });

  it('Android : DATA-ONLY haute priorité, TTL = la fenêtre, libellés dans data, aucun bloc notification', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([ANDROID]);

    await svc.sendToUser(ringPushes()[1]);

    const message = mockFirebaseMessagingSend.mock.calls[0][0] as Record<string, any>;
    expect(message.notification).toBeUndefined();
    expect(message.android).toMatchObject({ priority: 'high', ttl: 120_000 });
    expect(message.android.notification).toBeUndefined();
    expect(message.data).toMatchObject({ type: 'bring', title: 'Awa fait sonner votre téléphone', stopLabel: 'Arrêter' });
  });

  it('l’arrêt REMPLACE la bannière sur iOS — alerte passive, même collapse-id — même sous les préférences qui coupent tout', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);

    await svc.sendToUser(buildBringStoppedPushes({ bringId: 'b'.repeat(24), toUserId: 'u-to', reason: 'recipient', language: 'fr' })[0]);

    const note = mockApnsSend.mock.calls[0][0] as Record<string, any>;
    expect(note.pushType).not.toBe('background');
    expect(note.aps['interruption-level']).toBe('passive');
    expect(note.collapseId).toBe(`bring-${'b'.repeat(24)}`);
    expect(note.alert).toMatchObject({ title: 'Bring arrêté' });
    expect(note.payload).toEqual({ type: 'bring_stopped', bringId: 'b'.repeat(24), reason: 'recipient' });
  });

  it('un jeton iOS SANS version déclarée reçoit aussi l’arrêt', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([{ ...IOS, appVersion: null }]);

    const results = await svc.sendToUser(buildBringStoppedPushes({ bringId: 'b'.repeat(24), toUserId: 'u-to', reason: 'sender' })[0]);

    expect(results).toEqual([expect.objectContaining({ success: true })]);
  });

  it('l’arrêt ne part PAS vers un Android natif qui ne sait pas le router : il y rendrait une bannière vide', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([ANDROID]);

    const results = await svc.sendToUser(buildBringStoppedPushes({ bringId: 'b'.repeat(24), toUserId: 'u-to', reason: 'recipient' })[1]);

    expect(results).toEqual([]);
    expect(mockFirebaseMessagingSend).not.toHaveBeenCalled();
  });

  it('l’arrêt part vers un Android natif 3.1.0+ en data-only haute priorité, borné à la fenêtre de sonnerie', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([{ ...ANDROID, appVersion: '3.1.0' }]);

    const results = await svc.sendToUser(buildBringStoppedPushes({ bringId: 'b'.repeat(24), toUserId: 'u-to', reason: 'sender' })[1]);

    expect(results).toEqual([expect.objectContaining({ success: true })]);
    const message = mockFirebaseMessagingSend.mock.calls[0][0] as Record<string, any>;
    expect(message.notification).toBeUndefined();
    expect(message.android).toMatchObject({ priority: 'high', ttl: 120_000 });
    expect(message.data).toMatchObject({ type: 'bring_stopped', bringId: 'b'.repeat(24), reason: 'sender' });
  });

  it('l’arrêt ne part pas vers un Android natif 3.0.x ni vers un jeton sans bundle : ils n’ont pas le récepteur', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([
      { ...ANDROID, appVersion: '3.0.0' },
      { ...ANDROID, id: 'nobundle', bundleId: null, appVersion: '3.1.0' },
    ]);

    const results = await svc.sendToUser(buildBringStoppedPushes({ bringId: 'b'.repeat(24), toUserId: 'u-to', reason: 'sender' })[1]);

    expect(results).toEqual([]);
    expect(mockFirebaseMessagingSend).not.toHaveBeenCalled();
  });

  it('une notification ORDINAIRE reste gouvernée : pushEnabled:false la retient', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);

    const results = await svc.sendToUser({ userId: 'u-to', payload: { title: 't', body: 'b', data: { type: 'new_message' } } });

    expect(results).toEqual([]);
    expect(mockApnsSend).not.toHaveBeenCalled();
  });
});
