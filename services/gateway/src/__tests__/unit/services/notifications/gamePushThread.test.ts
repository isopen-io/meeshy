/**
 * LE FIL « JEU » (#10267, § 5.16.4) — les notifications du jeu s'EMPILENT dans un fil sur iOS (`aps.thread-id`,
 * qui regroupe sans remplacer). Sur Android et sur le web, le fil d'une charge devient le `tag` de la bannière,
 * et un tag identique REMPLACE la bannière d'avant : un fil commun y ferait effacer l'invitation de duo d'Alice
 * par celle de Bob, et laisserait sur l'écran de la coque une bannière que la révocation (par `notificationId`)
 * ne sait plus retirer. Le fil « jeu » ne voyage donc que vers iOS ; une conversation garde son fil partout.
 *
 * Les deux chemins qui composent un push le posent : la création ET la reproduction d'une notification réécrite.
 *
 * @jest-environment node
 */
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

import { describe, it, expect, jest } from '@jest/globals';
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { GAME_PUSH_THREAD_ID, apnsThreadIdOf, pushThreadFields } from '../../../../services/notifications/push-thread';
import { androidNotificationConfig } from '../../../../services/android-push-config';
import { webPushConfig } from '../../../../services/web-push-config';
import { applyUserPreferences } from '../../../../services/push-delivery-preferences';
import type { PushNotificationPayload } from '../../../../services/PushNotificationService';

const PLAYER = '64a000000000000000000001';
const ALICE = '64a000000000000000000002';
const BOB = '64a000000000000000000003';
const CONVERSATION_ID = '507f1f77bcf86cd799439021';

/** Un Prisma PERMISSIF : chaque délégué répond « rien », sauf ce que le témoin fixe. */
function permissivePrisma(overrides: Record<string, Record<string, unknown>>): unknown {
  const delegate = (name: string) =>
    new Proxy(overrides[name] ?? {}, {
      get: (target, method: string) =>
        method in target
          ? target[method]
          : async () => (method === 'findMany' || method === 'groupBy' ? [] : method === 'count' ? 0 : null),
    });
  return new Proxy({}, { get: (_target, name: string) => (name === 'then' ? undefined : delegate(name)) });
}

const harness = (rows: Record<string, Record<string, unknown>> = {}) => {
  const pushed: PushNotificationPayload[] = [];
  let next = 0;
  const prisma = permissivePrisma({
    user: { findUnique: async () => ({ username: 'kwame', displayName: 'Kwame', avatar: null, systemLanguage: 'fr' }) },
    notification: {
      create: async (args: { data: Record<string, unknown> }) => ({ id: `64d00000000000000000000${(next += 1)}`, ...args.data, createdAt: new Date() }),
      findUnique: async (args: { where: { id: string } }) => rows[args.where.id] ?? null,
    },
  });
  const service = new NotificationService(prisma as never);
  service.setSocketIO({ to: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn(async () => []), emit: jest.fn() } as never, new Map());
  service.setPushNotificationService({
    sendToUser: async (options: { payload: PushNotificationPayload }) => {
      pushed.push(options.payload);
      return [{ success: true, tokenId: 't' }];
    },
  } as never);
  return { service, pushed };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const inviteFrom = (service: NotificationService, actorId: string, duoId: string) =>
  service.createNotification({
    userId: PLAYER,
    type: 'game_duo_invited',
    priority: 'normal',
    lang: 'fr',
    content: 'Ton ami t’invite en duo cette semaine.',
    actor: { id: actorId, username: actorId, displayName: actorId, avatar: null },
    context: {},
    metadata: { action: 'view_details', route: 'progression', gameSection: 'duo', duoId, weekKey: '2026-W43' } as never,
    collapseId: `game-duo-${duoId}`,
  });

const gameRow = (id: string) => ({
  id,
  userId: PLAYER,
  type: 'game_duo_invited',
  priority: 'normal',
  title: null,
  subtitle: null,
  content: 'Ton ami t’invite en duo cette semaine.',
  context: {},
  metadata: { route: 'progression' },
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-10-25T09:00:00Z'),
  expiresAt: null,
  delivery: { emailSent: false, pushSent: true },
});

describe('le fil « jeu » à la création d’une notification', () => {
  it('deux invitations de duo gardent deux bannières distinctes sur Android et sur le web', async () => {
    const { service, pushed } = harness();
    await inviteFrom(service, ALICE, 'duo-alice');
    await inviteFrom(service, BOB, 'duo-bob');
    await flush();

    expect(pushed).toHaveLength(2);
    const androidTags = pushed.map((payload) => androidNotificationConfig(payload).tag);
    expect(androidTags).toEqual(pushed.map((payload) => payload.data?.notificationId));
    expect(new Set(androidTags).size).toBe(2);
    expect(pushed.map((payload) => webPushConfig(payload).notification?.tag)).toEqual([undefined, undefined]);
  });

  it('les mêmes invitations s’empilent dans le fil « jeu » sur iOS', async () => {
    const { service, pushed } = harness();
    await inviteFrom(service, ALICE, 'duo-alice');
    await inviteFrom(service, BOB, 'duo-bob');
    await flush();

    expect(pushed.map(apnsThreadIdOf)).toEqual([GAME_PUSH_THREAD_ID, GAME_PUSH_THREAD_ID]);
    expect(pushed.map((payload) => payload.threadId)).toEqual([undefined, undefined]);
  });
});

describe('le fil à la reproduction d’une notification réécrite', () => {
  it('une notification de jeu reproduite reste dans le fil « jeu » d’iOS, et garde son tag propre ailleurs', async () => {
    const id = '64d000000000000000000009';
    const { service, pushed } = harness({ [id]: gameRow(id) });

    await service.announceNotificationsReproduced([{ id, userId: PLAYER }]);
    await service.flushPendingRevocations();

    expect(pushed).toHaveLength(1);
    expect(apnsThreadIdOf(pushed[0])).toBe(GAME_PUSH_THREAD_ID);
    expect(pushed[0].threadId).toBeUndefined();
    expect(androidNotificationConfig(pushed[0]).tag).toBe(id);
  });

  it('une notification de conversation reproduite garde le fil de sa conversation, partout', async () => {
    const id = '64d00000000000000000000a';
    const row = { ...gameRow(id), type: 'new_message', context: { conversationId: CONVERSATION_ID } };
    const { service, pushed } = harness({ [id]: row });

    await service.announceNotificationsReproduced([{ id, userId: PLAYER }]);
    await service.flushPendingRevocations();

    expect(pushed).toHaveLength(1);
    expect(pushed[0].threadId).toBe(CONVERSATION_ID);
    expect(apnsThreadIdOf(pushed[0])).toBe(CONVERSATION_ID);
  });
});

describe('pushThreadFields — la loi', () => {
  it('une conversation garde son fil ; une notification de jeu n’a de fil que sur iOS ; le reste n’en a aucun', () => {
    expect(pushThreadFields({ type: 'new_message', conversationId: 'conv_1' })).toEqual({ threadId: 'conv_1' });
    expect(pushThreadFields({ type: 'game_duo_invited', conversationId: undefined })).toEqual({ apnsThreadId: GAME_PUSH_THREAD_ID });
    expect(pushThreadFields({ type: 'game_photo_moment', conversationId: null })).toEqual({ apnsThreadId: GAME_PUSH_THREAD_ID });
    expect(pushThreadFields({ type: 'friend_request', conversationId: undefined })).toEqual({});
    expect(pushThreadFields({ type: 'friend_request', conversationId: '' })).toEqual({});
  });

  it('groupNotifications:false retire aussi le fil iOS du jeu', async () => {
    const prisma = { userPreferences: { findUnique: async () => ({ notification: { pushEnabled: true, groupNotifications: false } }) } };
    const payload: PushNotificationPayload = { title: 'Meeshy', body: 'b', apnsThreadId: GAME_PUSH_THREAD_ID, data: { type: 'game_duo_invited' } };

    const delivered = await applyUserPreferences(prisma as never, { userId: PLAYER, payload });

    expect(delivered).not.toBeNull();
    expect(delivered && apnsThreadIdOf(delivered)).toBeUndefined();
  });
});
