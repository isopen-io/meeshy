/**
 * #13350 (audit) — un commentaire sous la story de A ne prévient pas, par
 * `friend_story_comment` ni `story_thread_reply`, une personne en relation de
 * blocage avec A (l'amitié reste en base, #13303) : la notification porte le
 * nom de A et un extrait du fil de sa story. La garde de dernier recours de
 * `createNotification` ne compare que le destinataire à l'ACTEUR (le
 * commentateur) : le blocage avec l'AUTEUR se tranche à la source.
 *
 * Et une interaction sociale (réponse, commentaire, réaction, republication,
 * fil de story) ne part jamais vers une personne en relation de blocage avec
 * son acteur : la garde de dernier recours couvre ces types aussi.
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
import { NotificationService } from '../NotificationService';
import { createStoryCommentNotificationsBatch } from '../fanout/story-comment';
import type { FanoutDependencies } from '../fanout/dependencies';
import type { NotificationType } from '@meeshy/shared/types/notification';

const AUTEUR = '507f1f77bcf86cd799439021';
const COMMENTATEUR = '507f1f77bcf86cd799439022';
const AMI = '507f1f77bcf86cd799439023';
const BLOQUE = '507f1f77bcf86cd799439024';
const ENGAGE = '507f1f77bcf86cd799439025';
const POST = 'cccccccccccccccccccccccc';

type BlockLists = Record<string, string[]>;
type ManyArgs = { where: { id?: { in: string[] }; blockedUserIds: { has: string } } };
type FirstArgs = { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } };

function withBlocks(prisma: ReturnType<typeof makeNotificationPrisma>, blocks: BlockLists) {
  const blockedOf = (id: string): string[] => blocks[id] ?? [];
  prisma.user.findUnique.mockImplementation(async (args: unknown) => {
    const id = (args as { where: { id: string } }).where.id;
    return { id, username: id, displayName: id, avatar: null, blockedUserIds: blockedOf(id) };
  });
  prisma.user.findMany.mockImplementation(async (args: unknown) => {
    const { where } = args as ManyArgs;
    return Object.keys(blocks)
      .filter((id) => (where.id ? where.id.in.includes(id) : true))
      .filter((id) => blockedOf(id).includes(where.blockedUserIds.has))
      .map((id) => ({ id }));
  });
  prisma.user.findFirst.mockImplementation(async (args: unknown) => {
    const { where } = args as FirstArgs;
    const hit = where.OR.find((c) => blockedOf(c.id).includes(c.blockedUserIds.has));
    return hit ? { id: hit.id } : null;
  });
  return prisma;
}

const tous = (overrides: BlockLists): BlockLists => ({
  [AUTEUR]: [],
  [COMMENTATEUR]: [],
  [AMI]: [],
  [BLOQUE]: [],
  [ENGAGE]: [],
  ...overrides,
});

describe("#13350 — l'éventail d'un commentaire de story écarte les personnes bloquées avec l'AUTEUR", () => {
  const run = async (blocks: BlockLists) => {
    const prisma = withBlocks(makeNotificationPrisma(), blocks);
    prisma.postComment.findMany.mockResolvedValue([{ authorId: BLOQUE }]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: AUTEUR, receiverId: AMI },
      { senderId: BLOQUE, receiverId: AUTEUR },
    ]);
    const createNotification = jest.fn(async () => null);
    const deps = {
      prisma: prisma as unknown as PrismaClient,
      createNotification,
      resolveRecipientLangs: async () => new Map<string, string>(),
      shouldCreateMentionNotification: () => true,
      isConversationMutedFor: async () => false,
    } as unknown as FanoutDependencies;
    await createStoryCommentNotificationsBatch(deps, {
      postId: POST,
      commentId: 'dddddddddddddddddddddddd',
      storyAuthorId: AUTEUR,
      commenterId: COMMENTATEUR,
      commentExcerpt: 'secret',
      postType: 'STORY',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    return createNotification.mock.calls.map((call) => {
      const [p] = call as unknown as [{ userId: string; type: string }];
      return `${p.type}:${p.userId}`;
    });
  };

  it.each<[string, BlockLists]>([
    ["l'auteur a bloqué la personne", tous({ [AUTEUR]: [BLOQUE] })],
    ["la personne a bloqué l'auteur", tous({ [BLOQUE]: [AUTEUR] })],
  ])('%s — ni friend_story_comment ni story_thread_reply ne lui parviennent', async (_sens, blocks) => {
    const sent = await run(blocks);
    expect(sent.filter((s) => s.endsWith(BLOQUE))).toEqual([]);
    expect(sent).toContain(`friend_story_comment:${AMI}`);
    expect(sent).toContain(`story_new_comment:${AUTEUR}`);
  });

  it("sans blocage, l'engagé antérieur reçoit story_thread_reply", async () => {
    expect(await run(tous({}))).toContain(`story_thread_reply:${BLOQUE}`);
  });

  it("une lecture de blocage en échec n'envoie rien aux seaux d'éventail", async () => {
    const prisma = withBlocks(makeNotificationPrisma(), tous({}));
    prisma.postComment.findMany.mockResolvedValue([{ authorId: ENGAGE }]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([{ senderId: AUTEUR, receiverId: AMI }]);
    prisma.user.findMany.mockRejectedValue(new Error('mongo down'));
    const createNotification = jest.fn(async () => null);
    const deps = {
      prisma: prisma as unknown as PrismaClient,
      createNotification,
      resolveRecipientLangs: async () => new Map<string, string>(),
    } as unknown as FanoutDependencies;
    await createStoryCommentNotificationsBatch(deps, {
      postId: POST,
      commentId: 'dddddddddddddddddddddddd',
      storyAuthorId: AUTEUR,
      commenterId: COMMENTATEUR,
      commentExcerpt: 'secret',
      postType: 'STORY',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const types = createNotification.mock.calls.map((call) => (call as unknown as [{ type: string }])[0].type);
    expect(types).toEqual(['story_new_comment']);
  });
});

describe("#13350 — createNotification refuse une interaction sociale entre l'acteur et une personne bloquée", () => {
  const create = async (blocks: BlockLists, type: NotificationType) => {
    const prisma = withBlocks(makeNotificationPrisma(), blocks);
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockImplementation(async (args: unknown) => ({
      id: 'n1',
      createdAt: new Date(),
      isRead: false,
      ...((args as { data: Record<string, unknown> }).data),
    }));
    const service = new NotificationService(prisma as unknown as PrismaClient);
    await service.createNotification({
      userId: BLOQUE,
      type,
      priority: 'normal',
      content: 'secret',
      actor: { id: COMMENTATEUR, username: 'c', displayName: 'C', avatar: null },
      context: { postId: POST },
      metadata: {},
    });
    return prisma.notification.create.mock.calls.length;
  };

  const SOCIAL: NotificationType[] = [
    'comment_reply',
    'post_comment',
    'comment_like',
    'comment_reaction',
    'post_like',
    'story_reaction',
    'status_reaction',
    'post_repost',
    'story_new_comment',
    'story_thread_reply',
  ];

  it.each(SOCIAL)('%s — la personne a bloqué l’acteur', async (type) => {
    expect(await create(tous({ [BLOQUE]: [COMMENTATEUR] }), type)).toBe(0);
  });

  it.each(SOCIAL)('%s — l’acteur a bloqué la personne', async (type) => {
    expect(await create(tous({ [COMMENTATEUR]: [BLOQUE] }), type)).toBe(0);
  });

  it.each(SOCIAL)('%s — sans blocage, la notification part', async (type) => {
    expect(await create(tous({}), type)).toBe(1);
  });
});
