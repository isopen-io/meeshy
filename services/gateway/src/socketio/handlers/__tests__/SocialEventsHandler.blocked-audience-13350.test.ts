/**
 * #13350 — une personne en relation de blocage avec l'auteur, dans un sens ou
 * dans l'autre, ne reçoit plus rien de son fil en temps réel, même si leur
 * amitié acceptée subsiste en base (décision #13303 ouverte).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { Post } from '@meeshy/shared/types/post';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

import { SocialEventsHandler } from '../SocialEventsHandler';

const AUTEUR = 'a'.repeat(24);
const AMI = 'b'.repeat(24);
const BLOQUE = 'c'.repeat(24);

type BlockLists = Record<string, string[]>;
type UserFindMany = { where: { id?: { in: string[] }; blockedUserIds: { has: string } } };

function fakePrisma(blocks: () => BlockLists, friends: string[] = [AMI, BLOQUE]) {
  const blockedOf = (id: string): string[] => blocks()[id] ?? [];
  return {
    friendRequest: {
      findMany: jest.fn(async () => friends.map((id) => ({ senderId: AUTEUR, receiverId: id }))),
    },
    communityMember: { findMany: jest.fn(async () => []) },
    user: {
      findMany: jest.fn(async ({ where }: UserFindMany) =>
        Object.keys(blocks())
          .filter((id) => (where.id ? where.id.in.includes(id) : true))
          .filter((id) => blockedOf(id).includes(where.blockedUserIds.has))
          .map((id) => ({ id })),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ blockedUserIds: blockedOf(where.id) })),
    },
  } as unknown as PrismaClient;
}

function fakeIo() {
  const rooms: string[] = [];
  const emitter = (target: string | string[]) => {
    const list = Array.isArray(target) ? target : [target];
    return { emit: () => { rooms.push(...list); }, except: () => ({ emit: () => { rooms.push(...list); } }) };
  };
  return { io: { to: jest.fn(emitter) }, rooms };
}

const story = (visibility: string, visibilityUserIds: string[] = []): Post =>
  ({ id: 'd'.repeat(24), authorId: AUTEUR, type: 'STORY', visibility, visibilityUserIds }) as unknown as Post;

const build = (blocks: () => BlockLists, friends?: string[]) => {
  const { io, rooms } = fakeIo();
  const handler = new SocialEventsHandler({ io: io as never, prisma: fakePrisma(blocks, friends) });
  return { handler, rooms };
};

const SENS: Array<[string, BlockLists]> = [
  ["l'auteur a bloqué l'ami", { [AUTEUR]: [BLOQUE], [BLOQUE]: [], [AMI]: [] }],
  ["l'ami a bloqué l'auteur", { [AUTEUR]: [], [BLOQUE]: [AUTEUR], [AMI]: [] }],
];

describe('#13350 — le fil temps réel ne part plus vers une personne bloquée', () => {
  it.each(SENS)('story:created PUBLIC — %s', async (_sens, blocks) => {
    const { handler, rooms } = build(() => blocks);
    await handler.broadcastStoryCreated(story('PUBLIC'), AUTEUR);
    expect(rooms).toContain(ROOMS.feed(AMI));
    expect(rooms).not.toContain(ROOMS.feed(BLOQUE));
  });

  it.each(SENS)('post:created ONLY qui nomme la personne bloquée — %s', async (_sens, blocks) => {
    const { handler, rooms } = build(() => blocks);
    await handler.broadcastPostCreated(story('ONLY', [AMI, BLOQUE]), AUTEUR);
    expect(rooms).toContain(ROOMS.feed(AMI));
    expect(rooms).not.toContain(ROOMS.feed(BLOQUE));
  });

  it.each(SENS)('story:deleted et post:deleted — %s', async (_sens, blocks) => {
    const { handler, rooms } = build(() => blocks);
    await handler.broadcastStoryDeleted('e'.repeat(24), AUTEUR);
    await handler.broadcastPostDeleted('f'.repeat(24), AUTEUR);
    expect(rooms).toContain(ROOMS.feed(AMI));
    expect(rooms).not.toContain(ROOMS.feed(BLOQUE));
  });

  it("le cache d'amitiés (30 s) ne prolonge pas l'audience après un blocage", async () => {
    let blocks: BlockLists = { [AUTEUR]: [], [BLOQUE]: [], [AMI]: [] };
    const { handler, rooms } = build(() => blocks);
    await handler.broadcastStoryCreated(story('FRIENDS'), AUTEUR);
    expect(rooms).toContain(ROOMS.feed(BLOQUE));

    rooms.length = 0;
    blocks = { [AUTEUR]: [BLOQUE], [BLOQUE]: [], [AMI]: [] };
    await handler.broadcastStoryCreated(story('FRIENDS'), AUTEUR);
    expect(rooms).toContain(ROOMS.feed(AMI));
    expect(rooms).not.toContain(ROOMS.feed(BLOQUE));
  });

  it('une lecture de blocage qui échoue ferme la diffusion aux amis (fail-closed)', async () => {
    const { io, rooms } = fakeIo();
    const prisma = fakePrisma(() => ({}));
    (prisma.user.findUnique as unknown as jest.Mock<() => Promise<never>>).mockRejectedValue(new Error('db down'));
    const handler = new SocialEventsHandler({ io: io as never, prisma });
    await handler.broadcastStoryCreated(story('PUBLIC'), AUTEUR);
    expect(rooms).not.toContain(ROOMS.feed(AMI));
    expect(rooms).not.toContain(ROOMS.feed(BLOQUE));
  });
});
