/**
 * #17142 — le réveil du talkie au chokepoint : PushToTalk (pushtotalk, topic .voip-ptt,
 * priorité 10, expiration 0) ou notification TALKIE haute priorité ; et les préférences
 * de livraison s’appliquent, comme à tout push.
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
import { buildTalkieWakePushes, sendTalkieWake, talkieWakeChannel, TALKIE_WAKE_TTL_MS } from '../../../services/talkie/talkiePush';

const originalEnv = { ...process.env };
const TALKIE = 'c'.repeat(24);

const wake = (channel: 'pushtotalk' | 'push', fromName: string | null = 'Awa') =>
  buildTalkieWakePushes({ talkieId: TALKIE, toUserId: 'u-to', fromUserId: 'u-from', fromName, language: 'fr', phase: 'live', channel });

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

const PTT = { id: 'ptt', token: 'ptt-tok', type: 'pushtotalk', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: 'production', appVersion: '3.0.0' };
const IOS = { id: 'ios', token: 'apns-tok', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: 'production', appVersion: '3.0.0' };
const ANDROID = { id: 'and', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: 'me.meeshy.app', apnsEnvironment: null, appVersion: '3.0.0' };

describe('#17142 — le réveil du talkie au chokepoint', () => {
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
  });

  afterEach(() => { process.env = originalEnv; });

  it('PushToTalk : apns-push-type pushtotalk, topic <bundle>.voip-ptt, priorité 10, expiration 0, ni alerte ni son', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([PTT]);

    const results = await svc.sendToUser(wake('pushtotalk')[0]);

    expect(results).toEqual([expect.objectContaining({ success: true })]);
    const note = mockApnsSend.mock.calls[0][0] as Record<string, any>;
    expect(note).toMatchObject({ pushType: 'pushtotalk', topic: 'me.meeshy.app.voip-ptt', priority: 10, expiry: 0 });
    expect(note.alert).toBeUndefined();
    expect(note.sound).toBeUndefined();
    expect(note.payload).toMatchObject({ type: 'talkie_incoming', talkieId: TALKIE, fromUserId: 'u-from', fromName: 'Awa', audioUrl: `/api/v1/talkie/${TALKIE}/audio` });
    expect(mockApnsSend.mock.calls[0][1]).toBe('ptt-tok');
  });

  it('le canal PushToTalk ne vise QUE les jetons pushtotalk ; un push ordinaire ne les atteint jamais par défaut', async () => {
    expect(wake('pushtotalk').map((p) => p.types)).toEqual([['pushtotalk']]);
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([]);
    await svc.sendToUser({ userId: 'u', payload: { title: 't', body: 'b' } });
    expect(mockPrisma.pushToken.findMany.mock.calls[0][0]).toMatchObject({ where: { type: { in: ['apns', 'fcm', 'voip'] } } });
  });

  it('sans PushToTalk : APNs time-sensitive de catégorie TALKIE, collapse-id, expirée avec la fenêtre de rattrapage', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS]);
    const before = Math.floor(Date.now() / 1000);

    await svc.sendToUser(wake('push')[0]);

    const note = mockApnsSend.mock.calls[0][0] as Record<string, any>;
    expect(note.aps['interruption-level']).toBe('time-sensitive');
    expect(note.category).toBe('TALKIE');
    expect(note.collapseId).toBe(`talkie-${TALKIE}`);
    expect(note.alert).toMatchObject({ title: 'Awa vous parle', body: 'Talkie — touchez pour écouter' });
    expect(note.expiry).toBeGreaterThanOrEqual(before + TALKIE_WAKE_TTL_MS / 1000);
    expect(note.pushType).not.toBe('voip');
  });

  it('sans PushToTalk : FCM Android en DATA-ONLY haute priorité, mêmes clés', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([ANDROID]);

    await svc.sendToUser(wake('push')[1]);

    const message = mockFirebaseMessagingSend.mock.calls[0][0] as Record<string, any>;
    expect(message.notification).toBeUndefined();
    expect(message.android).toMatchObject({ priority: 'high', ttl: TALKIE_WAKE_TTL_MS });
    expect(message.data).toMatchObject({ type: 'talkie_incoming', talkieId: TALKIE, fromName: 'Awa', title: 'Awa vous parle' });
  });

  it('les préférences s’appliquent : pushs coupés ⇒ rien ne part, PushToTalk compris', async () => {
    const svc = await service();
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ notification: { pushEnabled: false } });
    mockPrisma.pushToken.findMany.mockResolvedValue([PTT, IOS]);

    expect(await svc.sendToUser(wake('pushtotalk')[0])).toEqual([]);
    expect(await svc.sendToUser(wake('push')[0])).toEqual([]);
    expect(mockApnsSend).not.toHaveBeenCalled();
  });

  it('un nom masqué par le destinataire : titre neutre, fromName vide', () => {
    const [push] = wake('push', null);
    expect(push.payload.title).toBe('Un proche vous parle');
    expect(push.payload.data).toMatchObject({ fromName: '' });
  });

  it('le suivi d’une voix finie sans être rejointe : même catégorie, même collapse-id, phase ended et la date limite', () => {
    const until = new Date('2026-11-08T10:01:00Z');
    const pushes = buildTalkieWakePushes({ talkieId: TALKIE, toUserId: 'u-to', fromUserId: 'u-from', fromName: 'Awa', language: 'fr', phase: 'ended', availableUntil: until });

    expect(pushes.map((p) => p.types)).toEqual([['apns'], ['fcm']]);
    expect(pushes[0].payload).toMatchObject({ category: 'TALKIE', collapseId: `talkie-${TALKIE}` });
    expect(pushes[0].payload.data).toMatchObject({ type: 'talkie_incoming', phase: 'ended', audioUrl: `/api/v1/talkie/${TALKIE}/audio`, availableUntil: until.toISOString() });
  });
});

describe('#17142 — le canal de réveil d’un destinataire', () => {
  const prismaWith = (types: string[]) => ({ pushToken: { findMany: jest.fn(async () => types.map((type) => ({ type }))) } });

  it.each([
    [['pushtotalk', 'apns'], 'pushtotalk'],
    [['apns'], 'push'],
    [['fcm'], 'push'],
    [[], null],
  ])('jetons %j : %s', async (types, expected) => {
    expect(await talkieWakeChannel(prismaWith(types) as never, 'u')).toBe(expected);
  });

  it('ne lit que les jetons ACTIFS des types qui réveillent (jamais voip)', async () => {
    const prisma = prismaWith([]);
    await talkieWakeChannel(prisma as never, 'u');
    expect(prisma.pushToken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u', isActive: true, type: { in: ['pushtotalk', 'apns', 'fcm'] } } }));
  });
});

describe('#17142 — l’envoi du réveil résout le nom et la langue du destinataire', () => {
  it('nom affichable de l’émetteur, langue de cadrage du destinataire', async () => {
    const sendToUser = jest.fn(async () => []);
    const users: Record<string, object> = { 'u-from': { displayName: 'Awa', username: 'awa' }, 'u-to': { systemLanguage: null, regionalLanguage: 'en' } };
    const prisma = {
      user: { findUnique: jest.fn(async (args: { where: { id: string } }) => users[args.where.id] ?? null) },
      userPreferences: { findUnique: jest.fn(async () => null) },
    };

    await sendTalkieWake({ prisma: prisma as never, push: { sendToUser } }, { talkieId: TALKIE, fromUserId: 'u-from', toUserId: 'u-to', phase: 'live', channel: 'push' });

    expect(sendToUser).toHaveBeenCalledTimes(2);
    expect((sendToUser.mock.calls[0] as unknown[])[0]).toMatchObject({ payload: { title: 'Awa is talking to you' } });
  });

  it('showSenderName coupé : titre neutre', async () => {
    const sendToUser = jest.fn(async () => []);
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ displayName: 'Awa', username: 'awa', systemLanguage: 'fr' })) },
      userPreferences: { findUnique: jest.fn(async () => ({ notification: { showSenderName: false } })) },
    };

    await sendTalkieWake({ prisma: prisma as never, push: { sendToUser } }, { talkieId: TALKIE, fromUserId: 'u-from', toUserId: 'u-to', phase: 'live', channel: 'pushtotalk' });

    expect((sendToUser.mock.calls[0] as unknown[])[0]).toMatchObject({ payload: { title: 'Un proche vous parle', data: { fromName: '' } } });
  });
});
