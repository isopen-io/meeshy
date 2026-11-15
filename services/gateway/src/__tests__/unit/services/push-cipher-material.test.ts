/**
 * #13114 / #14647 — contrat du FIL : ce que `PushNotificationService` remet à
 * APNs et à FCM, pour chacun des modes de chiffrement.
 *
 * L'éventail (`deviceEnvelopeForPush`) décide quel chiffré voyage ; le service
 * de push est le SECOND verrou : aucune matière de clé (métadonnées de
 * chiffrement, identifiant ou clé de conversation, clés de session) ne part
 * vers Apple ou Google, quel que soit l'appelant qui l'aurait glissée dans
 * `data`.
 *
 * @jest-environment node
 */

const mockFcmSend = jest.fn();
const mockApnsSend = jest.fn();
const sentApnsNotifications: Array<{ payload?: Record<string, unknown> }> = [];

jest.mock('firebase-admin/app', () => ({
  __esModule: true,
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn().mockReturnValue({}),
}));
jest.mock('firebase-admin/messaging', () => ({
  __esModule: true,
  getMessaging: jest.fn(() => ({ send: mockFcmSend })),
}));
jest.mock(
  '@parse/node-apn',
  () => {
    const Provider = jest.fn().mockImplementation(() => ({ send: mockApnsSend, shutdown: jest.fn() }));
    const Notification = jest.fn().mockImplementation(() => {
      const notification = { alert: {}, payload: undefined as Record<string, unknown> | undefined };
      sentApnsNotifications.push(notification);
      return notification;
    });
    return { __esModule: true, default: { Provider, Notification }, Provider, Notification };
  },
  { virtual: true },
);
jest.mock('fs', () => {
  const shape = {
    existsSync: jest.fn(() => true),
    statSync: jest.fn(() => ({ isFile: () => true })),
    readFileSync: jest.fn(() =>
      JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k', client_email: 'e@p.iam.gserviceaccount.com' }),
    ),
  };
  return { __esModule: true, default: shape, ...shape };
});
jest.mock('path', () => ({ __esModule: true, default: { resolve: (p: string) => p }, resolve: (p: string) => p }));
jest.mock('../../../utils/logger-enhanced', () => {
  const log = { trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };
  const enhanced = { ...log, child: jest.fn(() => log) };
  return {
    __esModule: true,
    enhancedLogger: enhanced,
    performanceLogger: { start: jest.fn(() => ({ end: jest.fn() })), withTiming: (_s: string, fn: () => Promise<unknown>) => fn() },
    notificationLogger: log,
    default: enhanced,
  };
});

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const AT_REST_KEY_ID = 'conv-key-7f3a';
const DEVICE_ENVELOPE = 'ZGV2aWNlLXNlYWxlZC1lbnZlbG9wZQ==';

const KEY_MATERIAL = {
  encryptionMetadata: JSON.stringify({ iv: 'aXY=', authTag: 'dGFn', keyId: AT_REST_KEY_ID }),
  serverEncryptionKeyId: AT_REST_KEY_ID,
  encryptionKey: 'a2V5LW1hdGVyaWFs',
  sessionKey: 'c2Vzc2lvbi1rZXk=',
};

function prismaWith() {
  return {
    pushToken: {
      findMany: jest.fn(async () => [
        { id: 't-fcm', token: 'fcm-a', type: 'fcm', platform: 'android' },
        { id: 't-apns', token: 'apns-a', type: 'apns', platform: 'ios', bundleId: 'me.meeshy.app', apnsEnvironment: 'production' },
      ]),
      findUnique: jest.fn(),
      update: jest.fn(async () => ({})),
      deleteMany: jest.fn(),
    },
  };
}

async function deliver(data: Record<string, string>): Promise<{ fcm: Record<string, unknown>; apns: Record<string, unknown> }> {
  const { PushNotificationService } = await import('../../../services/PushNotificationService');
  const service = new PushNotificationService(prismaWith() as never);
  await service.sendToUser({ userId: 'user-a', payload: { title: 'Alice', body: '🔒 💬', data } });
  const fcmMessage = mockFcmSend.mock.calls.at(-1)?.[0] as { data?: Record<string, unknown> } | undefined;
  return { fcm: fcmMessage?.data ?? {}, apns: sentApnsNotifications.at(-1)?.payload ?? {} };
}

const BASE_DATA = { type: 'new_message', conversationId: 'c1', messageId: 'm1' };

describe('#13114 — le fil APNs / FCM, mode par mode', () => {
  beforeAll(() => {
    process.env.ENABLE_PUSH_NOTIFICATIONS = 'true';
    process.env.ENABLE_FCM_PUSH = 'true';
    process.env.ENABLE_APNS_PUSH = 'true';
    process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/fake/creds.json';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'tid';
    process.env.APNS_KEY_PATH = '/fake/key.p8';
    process.env.APNS_BUNDLE_ID = 'me.meeshy.app';
  });

  beforeEach(() => {
    mockFcmSend.mockReset();
    mockFcmSend.mockResolvedValue('message-id');
    mockApnsSend.mockReset();
    mockApnsSend.mockResolvedValue({ sent: [{ device: 'apns-a' }], failed: [] });
    sentApnsNotifications.length = 0;
  });

  it.each(['server', 'hybrid'])('mode %s : la charge que l’éventail remet ne porte aucun chiffré, ni sur FCM ni sur APNs', async () => {
    const { fcm, apns } = await deliver({ ...BASE_DATA, notificationLocKey: 'notification.encrypted_message' });

    for (const wire of [fcm, apns]) {
      expect(wire).toEqual(expect.objectContaining(BASE_DATA));
      expect(wire).not.toHaveProperty('encryptedContent');
    }
  });

  it('mode e2ee : l’enveloppe de l’appareil arrive intacte sur FCM et sur APNs', async () => {
    const { fcm, apns } = await deliver({ ...BASE_DATA, encryptedContent: DEVICE_ENVELOPE });

    expect(fcm.encryptedContent).toBe(DEVICE_ENVELOPE);
    expect(apns.encryptedContent).toBe(DEVICE_ENVELOPE);
  });

  it.each(['server', 'hybrid', 'e2ee'])('mode %s : aucune matière de clé glissée dans data ne part vers Apple ou Google', async () => {
    const { fcm, apns } = await deliver({ ...BASE_DATA, ...KEY_MATERIAL });

    for (const wire of [fcm, apns]) {
      for (const key of Object.keys(KEY_MATERIAL)) expect(wire).not.toHaveProperty(key);
      expect(JSON.stringify(wire)).not.toContain(AT_REST_KEY_ID);
      expect(wire).toEqual(expect.objectContaining(BASE_DATA));
    }
  });
});
