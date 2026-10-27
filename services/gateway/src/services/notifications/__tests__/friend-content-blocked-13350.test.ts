/**
 * #13350 — une personne en relation de blocage avec l'auteur, dans un sens ou
 * dans l'autre, ne reçoit aucune notification de son contenu (`friend_new_*`,
 * `friend_story_comment`) : ni par l'éventail, qui la retire à la source, ni
 * par `createNotification`, qui refuse en dernier recours (fail-closed).
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
import { createFriendContentNotificationsBatch } from '../fanout/friend-content';
import type { FanoutDependencies } from '../fanout/dependencies';

const AUTEUR = '507f1f77bcf86cd799439011';
const AMI = '507f1f77bcf86cd799439012';
const BLOQUE = '507f1f77bcf86cd799439013';
const POST = 'aaaaaaaaaaaaaaaaaaaaaaaa';

type BlockLists = Record<string, string[]>;
type ManyArgs = { where: { id?: { in: string[] }; blockedUserIds: { has: string } } };
type FirstArgs = { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } };

const SENS: Array<[string, BlockLists]> = [
  ["l'auteur a bloqué l'ami", { [AUTEUR]: [BLOQUE], [BLOQUE]: [], [AMI]: [] }],
  ["l'ami a bloqué l'auteur", { [AUTEUR]: [], [BLOQUE]: [AUTEUR], [AMI]: [] }],
];

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

describe("#13350 — l'éventail de publication ne notifie pas une personne bloquée", () => {
  const run = async (blocks: BlockLists, visibility: string, visibilityUserIds: string[] = []) => {
    const prisma = withBlocks(makeNotificationPrisma(), blocks);
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: AUTEUR, receiverId: AMI },
      { senderId: BLOQUE, receiverId: AUTEUR },
    ]);
    prisma.postMedia.findFirst.mockResolvedValue(null);
    const createNotification = jest.fn(async () => null);
    const deps = {
      prisma: prisma as unknown as PrismaClient,
      createNotification,
      resolveRecipientLangs: async () => new Map<string, string>(),
      shouldCreateMentionNotification: () => true,
      isConversationMutedFor: async () => false,
    } as unknown as FanoutDependencies;
    await createFriendContentNotificationsBatch(deps, {
      postId: POST,
      authorId: AUTEUR,
      contentType: 'STORY',
      excerpt: 'secret',
      visibility,
      visibilityUserIds,
    });
    return createNotification.mock.calls.map((call) => (call as unknown as [{ userId: string }])[0].userId);
  };

  it.each(SENS)('FRIENDS — %s', async (_sens, blocks) => {
    expect(await run(blocks, 'FRIENDS')).toEqual([AMI]);
  });

  it.each(SENS)('ONLY qui nomme la personne bloquée — %s', async (_sens, blocks) => {
    expect(await run(blocks, 'ONLY', [AMI, BLOQUE])).toEqual([AMI]);
  });
});

describe('#13350 — createNotification refuse un contenu d’ami entre personnes bloquées (dernier recours)', () => {
  const create = async (blocks: BlockLists, type: 'friend_new_story' | 'friend_story_comment' | 'new_message', actorId?: string) => {
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
      actor: actorId ? { id: actorId, username: 'auteur', displayName: 'Auteur', avatar: null } : undefined,
      context: { postId: POST },
      metadata: {},
    });
    return prisma.notification.create.mock.calls.length;
  };

  it.each(SENS)('friend_new_story — %s', async (_sens, blocks) => {
    expect(await create(blocks, 'friend_new_story', AUTEUR)).toBe(0);
  });

  it.each(SENS)('friend_story_comment — %s', async (_sens, blocks) => {
    expect(await create(blocks, 'friend_story_comment', AUTEUR)).toBe(0);
  });

  it('sans blocage, la notification de contenu part', async () => {
    expect(await create({ [AUTEUR]: [], [BLOQUE]: [] }, 'friend_new_story', AUTEUR)).toBe(1);
  });

  it("un contenu d'ami sans acteur est refusé (fail-closed)", async () => {
    expect(await create({ [AUTEUR]: [], [BLOQUE]: [] }, 'friend_new_story')).toBe(0);
  });

  it('les autres types ne sont pas concernés par cette garde', async () => {
    expect(await create({ [AUTEUR]: [BLOQUE], [BLOQUE]: [] }, 'new_message', AUTEUR)).toBe(1);
  });
});
