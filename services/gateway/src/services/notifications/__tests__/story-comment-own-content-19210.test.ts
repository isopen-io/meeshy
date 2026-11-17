/**
 * #19210 — l'auteur d'une story qui répond dans son propre fil est l'ACTEUR de la notification : le titre le nomme
 * déjà, et `showSenderName:false` le masque. Son nom ne doit pas revenir par l'action (« a répondu dans une story DE
 * Alice »), que la bannière pousse en sous-titre. Même garde que la jumelle `activity-relay.ts` (`ownContent`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { makeNotificationPrisma } from '../../../__tests__/helpers/notification-service-doubles';
import { sharedFriendships } from '../../../__tests__/helpers/shared-friendships';
import { createStoryCommentNotificationsBatch } from '../fanout/story-comment';
import type { FanoutDependencies } from '../fanout/dependencies';
import { CIRCLE_NOTIFY_KEYS } from '@meeshy/shared/utils/relation-levels';

const ENTOURAGE_AMI = { notification: Object.fromEntries(CIRCLE_NOTIFY_KEYS.map((key) => [key, 'FRIEND'])) };

const AUTEUR = '507f1f77bcf86cd799439031';
const AUTRE = '507f1f77bcf86cd799439032';
const AMI = '507f1f77bcf86cd799439033';
const ENGAGE = '507f1f77bcf86cd799439035';
const POST = 'cccccccccccccccccccccccc';

type Created = { userId: string; type: string; subtitle?: string; metadata?: Record<string, unknown> };

const fanout = async (commenterId: string): Promise<Created[]> => {
  const prisma = makeNotificationPrisma();
  prisma.user.findUnique.mockImplementation(async (args: unknown) => {
    const id = (args as { where: { id: string } }).where.id;
    return { id, username: id === AUTEUR ? 'alice' : 'bob', displayName: id === AUTEUR ? 'Alice Martin' : 'Bob', avatar: null, blockedUserIds: [] };
  });
  prisma.user.findMany.mockImplementation(async (args: unknown) => {
    const where = (args as { where: { isActive?: boolean; id?: { in: string[] } } }).where;
    return where.isActive === true ? (where.id?.in ?? []).map((id) => ({ id })) : [];
  });
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.userRelation.findMany.mockResolvedValue([]);
  prisma.userRelation.findUnique.mockResolvedValue(null);
  prisma.communityMember.findMany.mockResolvedValue([]);
  prisma.participant.findMany.mockResolvedValue([]);
  prisma.userPreferences.findUnique.mockResolvedValue(ENTOURAGE_AMI);
  prisma.postComment.findMany.mockResolvedValue([{ authorId: ENGAGE }]);
  prisma.postReaction.findMany.mockResolvedValue([]);
  const friendships = [{ senderId: AUTEUR, receiverId: AMI }];
  if (commenterId === AUTEUR) prisma.friendRequest.findMany.mockResolvedValue(friendships);
  else sharedFriendships(prisma.friendRequest.findMany, AUTEUR, commenterId)(friendships);
  const createNotification = jest.fn(async () => null);
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    createNotification,
    resolveRecipientLangs: async () => new Map<string, string>(),
    consumeMentionBudget: () => true,
    isConversationMutedFor: async () => false,
  } as unknown as FanoutDependencies;
  await createStoryCommentNotificationsBatch(deps, {
    postId: POST,
    commentId: 'dddddddddddddddddddddddd',
    storyAuthorId: AUTEUR,
    commenterId,
    commentExcerpt: 'Merci à tous',
    postType: 'STORY',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
  });
  return createNotification.mock.calls.map((call) => (call as unknown as [Created])[0]);
};

describe("#19210 — l'auteur qui répond dans le fil de sa propre story n'est pas nommé une seconde fois", () => {
  it.each(['story_thread_reply', 'friend_story_comment'])('%s : ni contentAuthorName ni sous-titre ne portent son nom', async (type) => {
    const created = (await fanout(AUTEUR)).filter((c) => c.type === type);

    expect(created.length).toBeGreaterThan(0);
    created.forEach((c) => {
      expect(c.metadata?.contentAuthorName).toBeUndefined();
      expect(c.subtitle ?? '').not.toContain('Alice Martin');
    });
  });

  it("le commentaire d'un AUTRE garde le nom de l'auteur dans la phrase", async () => {
    const thread = (await fanout(AUTRE)).find((c) => c.type === 'story_thread_reply');

    expect(thread?.metadata?.contentAuthorName).toBe('Alice Martin');
  });
});
