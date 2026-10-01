/**
 * NotificationService.reactionReplacementPush.test.ts
 *
 * Changer sa réaction (❤️ → 😂) RETIRE la notification d'avant et en CRÉE une
 * autre — deux lignes, deux identités. Le retrait part en push silencieux
 * `notification_revoked`, qu'iOS bride, peut livrer APRÈS la nouvelle bannière
 * et ne livre jamais à une app tuée : « X a réagi ❤️ » restait alors à côté de
 * « X a réagi 😂 ».
 *
 * Le push d'une réaction DÉCLARE donc qu'il remplace la bannière du même
 * acteur sur le même sujet et du même type (`REPLACES_ACTOR_SUBJECT_FIELD`) :
 * l'annulation voyage avec la nouvelle bannière, que l'extension iOS honore
 * avant d'afficher. Aucun autre type ne la porte — un message, une mention,
 * un commentaire ne remplacent pas la notification précédente du même auteur.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

import { describe, it, expect, jest } from '@jest/globals';
import { NotificationService } from '../../../services/notifications/NotificationService';
import {
  REPLACES_ACTOR_SUBJECT_FIELD,
  REPLACES_ACTOR_SUBJECT_VALUE,
} from '@meeshy/shared/types/reproduced-notification-push';

type PushedPayload = { readonly data: Readonly<Record<string, string>> };

const AUTHOR_ID = '64a000000000000000000001';
const REACTOR_ID = '64a000000000000000000002';
const POST_ID = '64b000000000000000000001';
const COMMENT_ID = '64c000000000000000000001';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439021';

/**
 * Un Prisma PERMISSIF : chaque délégué répond « rien » (`null`, `[]`, `0`),
 * sauf ce que le témoin fixe. Ce fichier porte sur la charge POUSSÉE, pas sur
 * les lectures qui la composent.
 */
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

function harness() {
  const pushed: PushedPayload[] = [];
  const prisma = permissivePrisma({
    user: { findUnique: async () => ({ username: 'kwame', displayName: 'Kwame', avatar: null, systemLanguage: 'fr' }) },
    notification: { create: async (args: { data: Record<string, unknown> }) => ({ id: 'n-new', ...args.data, createdAt: new Date() }) },
    post: { findFirst: async () => ({ authorId: AUTHOR_ID, visibility: 'PUBLIC', visibilityUserIds: [] }) },
    conversation: { findUnique: async () => ({ title: null, type: 'direct' }) },
    message: { findUnique: async () => ({ content: 'Salut', messageType: 'text', createdAt: new Date() }) },
  });
  const service = new NotificationService(prisma as never);
  service.setPushNotificationService({
    sendToUser: async (options: { payload: PushedPayload }) => {
      pushed.push(options.payload);
      return [{ success: true, tokenId: 't' }];
    },
  } as never);
  return { service, pushed };
}

describe('le push d’une RÉACTION remplace la bannière du même acteur sur le même sujet', () => {
  it('réaction à un MESSAGE', async () => {
    const { service, pushed } = harness();
    await service.createReactionNotification({
      messageAuthorId: AUTHOR_ID,
      reactorUserId: REACTOR_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      reactionEmoji: '😂',
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0].data[REPLACES_ACTOR_SUBJECT_FIELD]).toBe(REPLACES_ACTOR_SUBJECT_VALUE);
    expect(pushed[0].data.senderId).toBe(REACTOR_ID);
    expect(pushed[0].data.messageId).toBe(MESSAGE_ID);
  });

  it.each([
    ['POST', 'post_like'],
    ['REEL', 'post_like'],
    ['STORY', 'story_reaction'],
    ['STATUS', 'status_reaction'],
  ] as const)('réaction à un contenu %s (%s)', async (postType, type) => {
    const { service, pushed } = harness();
    await service.createPostLikeNotification({
      actorId: REACTOR_ID,
      postId: POST_ID,
      postAuthorId: AUTHOR_ID,
      emoji: '😂',
      postType,
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0].data.type).toBe(type);
    expect(pushed[0].data[REPLACES_ACTOR_SUBJECT_FIELD]).toBe(REPLACES_ACTOR_SUBJECT_VALUE);
    expect(pushed[0].data.postId).toBe(POST_ID);
  });

  it('réaction à un COMMENTAIRE', async () => {
    const { service, pushed } = harness();
    await service.createCommentLikeNotification({
      actorId: REACTOR_ID,
      postId: POST_ID,
      commentId: COMMENT_ID,
      commentAuthorId: AUTHOR_ID,
      emoji: '😂',
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0].data[REPLACES_ACTOR_SUBJECT_FIELD]).toBe(REPLACES_ACTOR_SUBJECT_VALUE);
    expect(pushed[0].data.commentId).toBe(COMMENT_ID);
  });

  it('un COMMENTAIRE n’est pas une réaction : il ne remplace rien', async () => {
    const { service, pushed } = harness();
    await service.createPostCommentNotification({
      actorId: REACTOR_ID,
      postId: POST_ID,
      postAuthorId: AUTHOR_ID,
      commentId: COMMENT_ID,
      commentPreview: 'Bravo',
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0].data[REPLACES_ACTOR_SUBJECT_FIELD]).toBeUndefined();
  });
});
