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
const AUDIO = `https://gate.test/api/v1/talkie/${'c'.repeat(24)}/audio?e=1&t=x`;

const wake = (channel: 'pushtotalk' | 'push', fromName: string | null = 'Awa') =>
  buildTalkieWakePushes({ talkieId: TALKIE, toUserId: 'u-to', fromUserId: 'u-from', fromName, language: 'fr', phase: 'live', channel, audioUrl: AUDIO });

async function service(overrides: Record<string, string | undefined> = {}) {
  process.env = {
    ...originalEnv,
    ENABLE_PUSH_NOTIFICATIONS: 'true',
    ENABLE_FCM_PUSH: 'true',
    ENABLE_APNS_PUSH: 'true',
    FIREBASE_ADMIN_CREDENTIALS_PATH: '/fake/firebase-creds.json',
    APNS_KEY_ID: 'k', APNS_TEAM_ID: 't', APNS_KEY_PATH: '/fake/key.p8', APNS_BUNDLE_ID: 'me.meeshy.app',
    ...overrides,
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
    expect(note.payload).toMatchObject({ type: 'talkie_incoming', talkieId: TALKIE, fromUserId: 'u-from', fromName: 'Awa', audioUrl: AUDIO });
    expect(note.payload.attachmentUrl).toBeUndefined();
    expect(mockApnsSend.mock.calls[0][1]).toBe('ptt-tok');
  });

  it('le canal PushToTalk ne vise QUE les jetons pushtotalk ; un push ordinaire ne les atteint jamais par défaut', async () => {
    expect(wake('pushtotalk').map((p) => p.types)).toEqual([['pushtotalk']]);
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([]);
    await svc.sendToUser({ userId: 'u', payload: { title: 't', body: 'b' } });
    expect(mockPrisma.pushToken.findMany.mock.calls[0][0]).toMatchObject({ where: { type: { in: ['apns', 'fcm', 'voip'] } } });
  });

  it('sans PushToTalk : le push TALKIE est time-sensitive, de catégorie TALKIE, collapse-id et expiré avec la fenêtre ; data-only sur Android', () => {
    const [apns, fcm] = wake('push');

    expect(apns).toMatchObject({ types: ['apns'], platforms: ['ios'], payload: { interruptionLevel: 'time-sensitive', category: 'MEESHY_TALKIE', collapseId: `talkie-${TALKIE}`, ttlMs: TALKIE_WAKE_TTL_MS } });
    expect(apns.payload.title).toBe('Awa vous parle');
    expect(fcm).toMatchObject({ types: ['fcm'], platforms: ['android', 'web'], payload: { dataOnlyOnAndroid: true, ttlMs: TALKIE_WAKE_TTL_MS } });
  });

  it.each([[{ ...IOS, appVersion: '1.1.6' }], [ANDROID]])('rétrocompatibilité : un client qui ne route pas talkie_incoming (%j) ne reçoit RIEN', async (token) => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([token]);

    expect(await svc.sendToUser(wake('push')[token.type === 'apns' ? 0 : 1])).toEqual([]);
    expect(mockApnsSend).not.toHaveBeenCalled();
    expect(mockFirebaseMessagingSend).not.toHaveBeenCalled();
  });

  it('un iPhone à partir de 1.1.7 reçoit le push TALKIE', async () => {
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([{ ...IOS, appVersion: '1.1.7' }]);

    await svc.sendToUser(wake('push')[0]);

    expect(mockApnsSend).toHaveBeenCalledTimes(1);
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

  it('le suivi d’une voix finie sans être rejointe PORTE l’audio au format des pièces jointes : même catégorie, même collapse-id', () => {
    const until = new Date('2026-11-08T10:01:00Z');
    const pushes = buildTalkieWakePushes({
      talkieId: TALKIE, toUserId: 'u-to', fromUserId: 'u-from', fromName: 'Awa', language: 'fr', phase: 'ended', availableUntil: until, bytes: 4200, durationMs: 3100, audioUrl: AUDIO,
    });

    expect(pushes.map((p) => p.types)).toEqual([['apns'], ['fcm']]);
    expect(pushes[0].payload).toMatchObject({ category: 'MEESHY_TALKIE', collapseId: `talkie-${TALKIE}` });
    expect(pushes[0].payload.data).toMatchObject({
      type: 'talkie_incoming', phase: 'ended', audioUrl: AUDIO, availableUntil: until.toISOString(),
      attachmentUrl: AUDIO, attachmentMimeType: 'audio/aac', attachmentFileSize: '4200', attachmentDurationMs: '3100', attachmentId: TALKIE, attachmentLanguage: '',
    });
    expect(pushes[1].payload.data).toEqual(pushes[0].payload.data);
  });
});

describe('#17249 — les transports qui peuvent RÉELLEMENT partir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockReturnValue(JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }));
  });
  afterEach(() => { process.env = originalEnv; });

  it('APNs complet et FCM configuré : les deux partent (cas nominal)', async () => {
    expect(await (await service()).deliveryTransports()).toEqual({ apns: true, fcm: true });
  });

  it('aucune variable APNS_* (le staging du 2026-11-09) : APNs ne part pas, aucun client créé', async () => {
    const svc = await service({ APNS_KEY_ID: undefined, APNS_TEAM_ID: undefined, APNS_KEY_PATH: undefined, APNS_BUNDLE_ID: undefined, ENABLE_APNS_PUSH: undefined });

    expect(await svc.deliveryTransports()).toEqual({ apns: false, fcm: true });
    expect(MockApnsProvider).not.toHaveBeenCalled();
  });

  it('Key ID et Team ID sans clé : APNs incomplet, aucun client créé', async () => {
    const svc = await service({ APNS_KEY_PATH: undefined, APNS_KEY_CONTENT: undefined });

    expect(await svc.deliveryTransports()).toEqual({ apns: false, fcm: true });
    expect(MockApnsProvider).not.toHaveBeenCalled();
  });

  it('pushs coupés pour le processus : rien ne part', async () => {
    expect(await (await service({ ENABLE_PUSH_NOTIFICATIONS: 'false' })).deliveryTransports()).toEqual({ apns: false, fcm: false });
  });

  it('identifiants Firebase introuvables : FCM ne part pas', async () => {
    mockExistsSync.mockReturnValue(false);
    expect(await (await service()).deliveryTransports()).toEqual({ apns: true, fcm: false });
  });
});

describe('#17142 — le canal de réveil d’un destinataire', () => {
  const prismaWith = (types: string[]) => ({
    pushToken: { findMany: jest.fn(async (_args: unknown) => types.map((type) => ({ id: type, type, sessionId: 'sess-ok' }))), deleteMany: jest.fn(async () => ({ count: 0 })) },
    userSession: { findMany: jest.fn(async () => [{ id: 'sess-ok' }]) },
  });

  it.each([
    [['pushtotalk', 'apns'], 'pushtotalk'],
    [['apns'], null],
    [['fcm'], null],
    [[], null],
  ])('jetons %j : %s — un APNs/FCM ne réveille que si son client route talkie_incoming (aucun client publié encore)', async (types, expected) => {
    expect(await talkieWakeChannel(prismaWith(types) as never, 'u')).toBe(expected);
  });

  it('ne lit que les jetons ACTIFS des types qui réveillent (jamais voip)', async () => {
    const prisma = prismaWith([]);
    await talkieWakeChannel(prisma as never, 'u');
    expect(prisma.pushToken.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: 'u', isActive: true, type: { in: ['pushtotalk', 'apns', 'fcm'] } } }));
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

    await sendTalkieWake({ prisma: prisma as never, push: { sendToUser }, now: () => new Date('2026-11-08T10:00:00Z') }, { talkieId: TALKIE, fromUserId: 'u-from', toUserId: 'u-to', phase: 'live', channel: 'push' });

    expect(sendToUser).toHaveBeenCalledTimes(2);
    expect((sendToUser.mock.calls[0] as unknown[])[0]).toMatchObject({ payload: { title: 'Awa is talking to you' } });
    const { audioUrl } = ((sendToUser.mock.calls[0] as unknown[])[0] as { payload: { data: { audioUrl: string } } }).payload.data;
    expect(audioUrl).toMatch(new RegExp(`^https?://.+/api/v1/talkie/${TALKIE}/audio\\?e=\\d+&t=[A-Za-z0-9_-]+$`));
  });

  it('showSenderName coupé : titre neutre', async () => {
    const sendToUser = jest.fn(async () => []);
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ displayName: 'Awa', username: 'awa', systemLanguage: 'fr' })) },
      userPreferences: { findUnique: jest.fn(async () => ({ notification: { showSenderName: false } })) },
    };

    await sendTalkieWake({ prisma: prisma as never, push: { sendToUser }, now: () => new Date('2026-11-08T10:00:00Z') }, { talkieId: TALKIE, fromUserId: 'u-from', toUserId: 'u-to', phase: 'live', channel: 'pushtotalk' });

    expect((sendToUser.mock.calls[0] as unknown[])[0]).toMatchObject({ payload: { title: 'Un proche vous parle', data: { fromName: '' } } });
  });
});
