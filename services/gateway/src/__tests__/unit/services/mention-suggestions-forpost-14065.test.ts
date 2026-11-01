/**
 * #14065 — les suggestions sous un post :
 * - le plafond de lecture compte des PERSONNES : un compte qui écrit les 200
 *   premiers commentaires ne cache plus les commentateurs suivants, et la lecture
 *   d'un fil viral reste bornée ;
 * - la réponse est mise en cache par lecteur, post et requête ; la garde de lecture
 *   du post passe AVANT le cache, et le blocage se relit à chaque appel.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

import { MentionSuggestionFinder } from '../../../services/mentions/mentionSuggestions';

const ME = '507f1f77bcf86cd799439099';
const POST = '6a0000000000000000000001';
const AUTHOR = '507f1f77bcf86cd799439001';
const SPAMMER = '507f1f77bcf86cd799439002';
const LATE = '507f1f77bcf86cd799439003';
const commenterId = (n: number): string => `5f${String(n).padStart(22, '0')}`;

type Person = {
  id: string; username: string; firstName: null; lastName: null; displayName: string; avatar: null;
  equippedAvatarRing: null; isActive: boolean;
};
const person = (id: string, username: string): Person => ({
  id, username, firstName: null, lastName: null, displayName: username, avatar: null, equippedAvatarRing: null, isActive: true,
});

type World = {
  readonly comments: readonly string[];
  readonly visibility?: string;
  readonly blockedByMe?: readonly string[];
};

type AnyWhere = Record<string, unknown>;
const inList = (clause: unknown): string[] | undefined => (clause as { in?: string[] } | undefined)?.in;

function fakePrisma(world: World) {
  const people = new Map<string, Person>([
    [AUTHOR, person(AUTHOR, 'author')],
    [SPAMMER, person(SPAMMER, 'spammer')],
    [LATE, person(LATE, 'late')],
    ...world.comments.filter((id) => id.startsWith('5f')).map((id) => [id, person(id, `c${id.slice(-4)}`)] as const),
  ]);
  const prisma = {
    post: {
      findFirst: jest.fn(async () => ({
        id: POST, authorId: AUTHOR, type: 'POST', visibility: world.visibility ?? 'PUBLIC', visibilityUserIds: [],
        expiresAt: null, isQuote: false, repostOfId: null, originalRepostOfId: null, commentsDisabled: false, deletedAt: null,
      })),
    },
    postComment: {
      findMany: jest.fn(async ({ skip = 0, take }: { skip?: number; take?: number }) =>
        world.comments.slice(skip, take === undefined ? undefined : skip + take).map((authorId) => ({ authorId }))
      ),
    },
    postReaction: { findMany: jest.fn(async () => []) },
    postMention: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    communityMember: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    userRelation: { findMany: jest.fn(async () => []) },
    friendRequest: { findMany: jest.fn(async () => []) },
    userContact: { findMany: jest.fn(async () => []) },
    participant: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    user: {
      findMany: jest.fn(async ({ where }: { where: AnyWhere }) => {
        const ids = inList(where.id);
        if (ids) return ids.flatMap((id) => (people.has(id) ? [people.get(id) as Person] : []));
        return [];
      }),
      findUnique: jest.fn(async () => ({ blockedUserIds: [...(world.blockedByMe ?? [])] })),
    },
    userPreferences: { findMany: jest.fn(async () => []) },
    userPreference: { findMany: jest.fn(async () => []) },
  };
  return prisma;
}

function memoryCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    keys: jest.fn(async () => [...store.keys()]),
    del: jest.fn(async (key: string) => void store.delete(key)),
  };
}

const ids = (list: ReadonlyArray<{ id: string }>) => list.map((s) => s.id);

describe('#14065 — le plafond de lecture compte des personnes', () => {
  it('un commentateur en rafale ne cache pas celui qui écrit après ses 200 commentaires', async () => {
    const comments = [...Array.from({ length: 200 }, () => SPAMMER), LATE];
    const finder = new MentionSuggestionFinder(fakePrisma({ comments }) as never, memoryCache() as never);
    expect(ids(await finder.forPost(POST, ME, ''))).toEqual([AUTHOR, SPAMMER, LATE]);
  });

  it("la lecture d'un fil viral reste bornée", async () => {
    const comments = Array.from({ length: 5000 }, () => SPAMMER);
    const prisma = fakePrisma({ comments });
    await new MentionSuggestionFinder(prisma as never, memoryCache() as never).forPost(POST, ME, '');
    const rowsRead = prisma.postComment.findMany.mock.calls.reduce(
      (sum, [args]) => sum + ((args as { take?: number }).take ?? Infinity),
      0
    );
    expect(rowsRead).toBeLessThanOrEqual(1000);
  });

  it('la lecture s’arrête dès 200 personnes distinctes', async () => {
    const comments = Array.from({ length: 900 }, (_, i) => commenterId(i));
    const prisma = fakePrisma({ comments });
    await new MentionSuggestionFinder(prisma as never, memoryCache() as never).forPost(POST, ME, '');
    expect(prisma.postComment.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('#14065 — la réponse sous un post est mise en cache', () => {
  it('un second appel identique ne relit pas les intervenants', async () => {
    const prisma = fakePrisma({ comments: [LATE] });
    const finder = new MentionSuggestionFinder(prisma as never, memoryCache() as never);
    const first = await finder.forPost(POST, ME, 'la');
    const second = await finder.forPost(POST, ME, 'la');
    expect(second).toEqual(first);
    expect(prisma.postComment.findMany).toHaveBeenCalledTimes(1);
  });

  it('la garde de lecture du post passe avant le cache', async () => {
    const cache = memoryCache();
    const open = new MentionSuggestionFinder(fakePrisma({ comments: [LATE] }) as never, cache as never);
    await open.forPost(POST, ME, '');
    expect(cache.store.size).toBe(1);
    const closed = new MentionSuggestionFinder(fakePrisma({ comments: [LATE], visibility: 'PRIVATE' }) as never, cache as never);
    await expect(closed.forPost(POST, ME, '')).rejects.toThrow('accès refusé');
  });

  it('un blocage posé après la mise en cache prend effet aussitôt', async () => {
    const cache = memoryCache();
    await new MentionSuggestionFinder(fakePrisma({ comments: [LATE] }) as never, cache as never).forPost(POST, ME, '');
    const list = await new MentionSuggestionFinder(
      fakePrisma({ comments: [LATE], blockedByMe: [LATE] }) as never,
      cache as never
    ).forPost(POST, ME, '');
    expect(ids(list)).not.toContain(LATE);
  });

  it('la clé est propre au lecteur, au post et à la requête', async () => {
    const cache = memoryCache();
    const finder = new MentionSuggestionFinder(fakePrisma({ comments: [LATE] }) as never, cache as never);
    await finder.forPost(POST, ME, 'La ');
    expect([...cache.store.keys()]).toEqual([`mentions:suggestions:v4:post:${POST}:${ME}:la`]);
  });
});
