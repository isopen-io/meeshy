/**
 * #19463 — la fin d'un partage de position, portée à l'appareil suspendu.
 *
 * - La poussée silencieuse `location_share_ended` : data seule (type, émetteur, heure), vers
 *   iPhone et Android du SEUL lecteur, signal de contrôle qu'aucune préférence ne retient (il
 *   retire un compte à rebours, il ne montre rien), routée par plancher de version — aucun
 *   client publié ne la route encore, chaque lot client pose le sien.
 * - La poussée `liveactivity` `event: end` vers un jeton d'Activité en direct : topic
 *   `<bundle>.push-type.liveactivity`, priorité 10, état final `{ endedAt }`, rien d'autre.
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
import { LOCATION_SHARE_ENDED_PUSH_TYPE } from '@meeshy/shared/types/shared-location-live-activity';
import { buildLocationShareEndedPush, sendViaLiveActivity } from '../../../services/notifications/liveActivityApns';
import { applyUserPreferences } from '../../../services/push-delivery-preferences';
import { PUSH_TYPE_ROUTING_FLOORS, tokenRoutesPushType } from '../../../services/push-type-routing';

const originalEnv = { ...process.env };
const LECTEUR = 'a'.repeat(24);
const EMETTEUR = 'b'.repeat(24);
const FIN = '2026-11-17T10:00:00.000Z';
const JETON = 'ab'.repeat(40);

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

const IOS = { id: 'ios', token: 'apns-tok', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: 'production', appVersion: '9.9.9' };
const ANDROID = { id: 'and', token: 'fcm-tok', type: 'fcm', platform: 'android', bundleId: 'me.meeshy.app', apnsEnvironment: null, appVersion: '9.9.9' };
const PREFS_OFF = { pushEnabled: false, dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59', dndDays: [] };

describe('la poussée silencieuse de fin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ notification: PREFS_OFF });
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('vise le seul lecteur, iPhone et Android, en silence, sans rien de la position', () => {
    const push = buildLocationShareEndedPush(LECTEUR, { type: LOCATION_SHARE_ENDED_PUSH_TYPE, userId: EMETTEUR, endedAt: FIN });
    expect(push.userId).toBe(LECTEUR);
    expect(push.types).toEqual(['apns', 'fcm']);
    expect(push.platforms).toEqual(['ios', 'android']);
    expect(push.payload).toMatchObject({ title: '', body: '', silent: true, collapseId: `location-share-${EMETTEUR}` });
    expect(push.payload.data).toEqual({ type: 'location_share_ended', userId: EMETTEUR, endedAt: FIN });
  });

  it('aucune préférence ne la retient : elle retire un compte à rebours, elle ne montre rien', async () => {
    const push = buildLocationShareEndedPush(LECTEUR, { type: LOCATION_SHARE_ENDED_PUSH_TYPE, userId: EMETTEUR, endedAt: FIN });
    expect(await applyUserPreferences(mockPrisma as never, push)).toEqual(push.payload);
  });

  it('aucun client publié ne la route encore : un ancien appareil ne reçoit rien', async () => {
    expect(PUSH_TYPE_ROUTING_FLOORS.get('location_share_ended')).toEqual({ ios: null, 'android-native': null, 'android-shell': null, web: null });
    expect(tokenRoutesPushType(IOS, 'location_share_ended')).toBe(false);
    const svc = await service();
    mockPrisma.pushToken.findMany.mockResolvedValue([IOS, ANDROID]);
    expect(await svc.sendToUser(buildLocationShareEndedPush(LECTEUR, { type: LOCATION_SHARE_ENDED_PUSH_TYPE, userId: EMETTEUR, endedAt: FIN }))).toEqual([]);
  });
});

describe('la poussée « liveactivity » de fin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockReadFileSync.mockImplementation((path: unknown) => String(path).endsWith('.p8')
      ? '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----'
      : JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }));
    mockApnsSend.mockResolvedValue({ sent: [{ device: JETON }], failed: [] });
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('APNs : topic liveactivity, type liveactivity, priorité 10, event end, état final { endedAt } seul', async () => {
    const svc = await service();
    const result = await svc.sendLiveActivityEnd({ token: JETON, apnsEnvironment: 'production' }, { endedAt: FIN });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockApnsSend).toHaveBeenCalledTimes(1);
    const [note, token] = mockApnsSend.mock.calls[0] as [Record<string, any>, string];
    expect(token).toBe(JETON);
    expect(note.topic).toBe('me.meeshy.app.push-type.liveactivity');
    expect(note.pushType).toBe('liveactivity');
    expect(note.priority).toBe(10);
    expect(note.aps).toEqual({ timestamp: expect.any(Number), event: 'end', 'content-state': { endedAt: FIN }, 'dismissal-date': expect.any(Number) });
    expect(note.alert).toBeUndefined();
    expect(note.sound).toBeUndefined();
    expect(JSON.stringify(note)).not.toMatch(/latitude|longitude|precision|radius/);
  });

  it('un jeton de développement part par le client sandbox, un jeton de production par le client de production', async () => {
    const envs: string[] = [];
    const transport = {
      hasClient: () => true,
      send: async (env: 'sandbox' | 'production') => { envs.push(env); return { failed: [] }; },
      defaultBundleId: 'me.meeshy.app',
      log: () => undefined,
    };
    await sendViaLiveActivity(transport, { token: JETON, apnsEnvironment: 'development' }, { endedAt: FIN });
    await sendViaLiveActivity(transport, { token: JETON, apnsEnvironment: 'production' }, { endedAt: FIN });
    expect(envs).toEqual(['sandbox', 'production']);
  });

  it('un refus d\'APNs rend un échec, sans lever', async () => {
    const svc = await service();
    mockApnsSend.mockResolvedValue({ sent: [], failed: [{ status: 410, response: { reason: 'Unregistered' } }] });
    const result = await svc.sendLiveActivityEnd({ token: JETON, apnsEnvironment: 'production' }, { endedAt: FIN });
    expect(result.success).toBe(false);
  });
});
