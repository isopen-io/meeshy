/**
 * #14251 — un compte supprimé ou désactivé ne reçoit aucune notification d'un
 * fil (anciens commentateurs et réacteurs, `story_thread_reply`), ni la
 * notification qui le vise directement (réaction, commentaire, réponse,
 * republication) ; et un acteur ou un auteur supprimé ou désactivé ne prévient
 * personne. Vivant = ce que le schéma déclare : `User.isActive` vrai et
 * `User.deletedAt` absent ou nul (leçon 318 : un compte jamais supprimé n'a pas
 * la clé, il reste prévenu).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationType } from '@meeshy/shared/types/notification';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { makeNotificationPrisma } from '../../../__tests__/helpers/notification-service-doubles';
import { NotificationService } from '../NotificationService';
import { createStoryCommentNotificationsBatch } from '../fanout/story-comment';
import { AUTEUR, COMMENTATEUR, POST, monde, type World } from '../../../__tests__/helpers/circle-world';

const ANCIEN = '6000000000000000000000e1';
const COMMENT = '6000000000000000000000e2';

const commenter = async (world: World) => {
  const m = monde({ ...world, previousCommenters: [ANCIEN] });
  await createStoryCommentNotificationsBatch(m.deps, {
    postId: POST, commentId: COMMENT, storyAuthorId: AUTEUR, commenterId: COMMENTATEUR, commentExcerpt: 'bravo', postType: 'STORY', visibility: 'PUBLIC',
  });
  return m;
};

describe('le fil d’un commentaire ne prévient que des comptes vivants (#14251)', () => {
  it('témoin : un ancien commentateur jamais supprimé reçoit story_thread_reply, l’auteur story_new_comment', async () => {
    const m = await commenter({});
    expect(m.notified('story_thread_reply')).toEqual([ANCIEN]);
    expect(m.notified('story_new_comment')).toEqual([AUTEUR]);
  });

  it('un ancien commentateur supprimé ou désactivé ne reçoit rien', async () => {
    expect((await commenter({ deleted: [ANCIEN] })).notified('story_thread_reply')).toEqual([]);
    expect((await commenter({ inactive: [ANCIEN] })).notified('story_thread_reply')).toEqual([]);
  });

  it('un auteur supprimé : ni lui ni le fil ne sont prévenus', async () => {
    expect((await commenter({ deleted: [AUTEUR] })).notified()).toEqual([]);
  });

  it('un commentateur désactivé ne prévient personne', async () => {
    expect((await commenter({ inactive: [COMMENTATEUR] })).notified()).toEqual([]);
  });
});

const VISE = '6000000000000000000000f1';
const ACTEUR = '6000000000000000000000f2';

type LivingWhere = { readonly id?: { readonly in?: readonly string[] }; readonly isActive?: boolean; readonly OR?: ReadonlyArray<{ deletedAt?: unknown }> };

/** Un double FIDÈLE : `{ deletedAt: null }` n'apparie pas une clé absente, `{ isSet: false }` si. */
type Etats = { readonly deleted?: readonly string[]; readonly inactive?: readonly string[]; readonly restored?: readonly string[] };

const directe = async (type: NotificationType, dead: Etats) => {
  const prisma = makeNotificationPrisma();
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.user.findMany.mockImplementation(async (args: unknown) => {
    const where = (args as { where: LivingWhere }).where;
    if (where.isActive !== true) return [];
    const matchesDeletedAt = (id: string, clause: { deletedAt?: unknown }) => {
      const restored = (dead.restored ?? []).includes(id);
      const present = (dead.deleted ?? []).includes(id) || restored;
      if (clause.deletedAt === null) return restored;
      if (typeof clause.deletedAt === 'object' && clause.deletedAt !== null && 'isSet' in clause.deletedAt) return (clause.deletedAt as { isSet: boolean }).isSet === present;
      return false;
    };
    return (where.id?.in ?? [])
      .filter((id) => !(dead.inactive ?? []).includes(id) && (where.OR ?? []).some((clause) => matchesDeletedAt(id, clause)))
      .map((id) => ({ id }));
  });
  prisma.userPreferences.findUnique.mockResolvedValue(null);
  prisma.notification.create.mockImplementation(async (args: unknown) => ({ id: 'n1', createdAt: new Date(), isRead: false, ...((args as { data: Record<string, unknown> }).data) }));
  const service = new NotificationService(prisma as unknown as PrismaClient);
  await service.createNotification({
    userId: VISE,
    type,
    priority: 'normal',
    content: 'bravo',
    actor: { id: ACTEUR, username: 'a', displayName: 'A', avatar: null },
    context: { postId: POST },
    metadata: {},
  });
  return prisma.notification.create.mock.calls.length;
};

const DIRECTES: NotificationType[] = ['post_like', 'post_comment', 'comment_reply', 'post_repost', 'story_new_comment', 'story_thread_reply', 'friend_story_comment'];

describe('la notification qui vise une personne ne part qu’entre comptes vivants (#14251)', () => {
  it.each(DIRECTES)('%s — témoin : deux comptes jamais supprimés, elle part', async (type) => {
    expect(await directe(type, {})).toBe(1);
  });

  it.each(DIRECTES)('%s — comptes restaurés (`deletedAt: null` explicite) : elle part', async (type) => {
    expect(await directe(type, { restored: [VISE, ACTEUR] })).toBe(1);
  });

  it.each(DIRECTES)('%s — destinataire supprimé : rien', async (type) => {
    expect(await directe(type, { deleted: [VISE] })).toBe(0);
  });

  it.each(DIRECTES)('%s — acteur désactivé : rien', async (type) => {
    expect(await directe(type, { inactive: [ACTEUR] })).toBe(0);
  });
});
