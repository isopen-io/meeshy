/**
 * #13567 — un push FCM nomme son destinataire (`data.recipientUserId`) : un appareil dont le compte est parti hors ligne
 * garde son jeton rattaché à ce compte, et le client écarte un push qui ne vise pas le compte connecté. Champ AJOUTÉ :
 * un client antérieur l'ignore.
 *
 * @jest-environment node
 */

const mockSend = jest.fn();

jest.mock('firebase-admin/app', () => ({
  __esModule: true,
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn().mockReturnValue({}),
}));
jest.mock('firebase-admin/messaging', () => ({
  __esModule: true,
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));
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

type Token = { id: string; token: string; type: string; platform: string };

function prismaWith(tokens: Token[]) {
  return {
    pushToken: {
      findMany: jest.fn(async () => tokens),
      findUnique: jest.fn(),
      update: jest.fn(async () => ({})),
      deleteMany: jest.fn(),
    },
  };
}

async function serviceFor(tokens: Token[]) {
  const { PushNotificationService } = await import('../../../services/PushNotificationService');
  return new PushNotificationService(prismaWith(tokens) as never);
}

function lastSentData(): Record<string, string> | undefined {
  const message = mockSend.mock.calls.at(-1)?.[0] as { data?: Record<string, string> } | undefined;
  return message?.data;
}

describe('push FCM — destinataire nommé (#13567)', () => {
  beforeAll(() => {
    process.env.ENABLE_PUSH_NOTIFICATIONS = 'true';
    process.env.ENABLE_FCM_PUSH = 'true';
    process.env.FIREBASE_ADMIN_CREDENTIALS_PATH = '/fake/creds.json';
  });

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue('message-id');
  });

  it('un push de message vers Android porte le destinataire, sans perdre ses autres champs', async () => {
    const service = await serviceFor([{ id: 't1', token: 'fcm-a', type: 'fcm', platform: 'android' }]);

    await service.sendToUser({
      userId: 'user-a',
      payload: { title: 'Alice', body: 'Bonjour', data: { type: 'new_message', conversationId: 'c1' } },
    });

    expect(lastSentData()).toEqual(expect.objectContaining({ recipientUserId: 'user-a', type: 'new_message', conversationId: 'c1' }));
  });

  it('un push de données seules (appel Android) porte aussi le destinataire', async () => {
    const service = await serviceFor([{ id: 't1', token: 'fcm-a', type: 'fcm', platform: 'android' }]);

    await service.sendToUser({
      userId: 'user-a',
      payload: { title: 'Appel', body: 'Alice vous appelle', data: { type: 'call', callId: 'call-1' } },
    });

    expect(lastSentData()).toEqual(expect.objectContaining({ recipientUserId: 'user-a', callId: 'call-1' }));
  });

  it('un push sans charge data en reçoit une qui nomme le destinataire', async () => {
    const service = await serviceFor([{ id: 't1', token: 'fcm-a', type: 'fcm', platform: 'android' }]);

    await service.sendToUser({ userId: 'user-a', payload: { title: 'Meeshy', body: 'Nouveauté' } });

    expect(lastSentData()).toEqual({ recipientUserId: 'user-a' });
  });
});
