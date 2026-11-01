/**
 * #14052 — l'ordre des suggestions de mention (directive porteur 2026-10-31) :
 * les CONNAISSANCES d'abord (≥ ACQUAINTANCE, du plus proche au plus lointain),
 * puis les personnes du CONTEXTE (auteur, commentateurs, réacteurs d'un post ;
 * membres d'une conversation), puis les CONTACTS de tout cercle (relations sous
 * la connaissance, carnet d'adresses apparié), puis l'annuaire. Une conversation
 * FERMÉE ne propose que ses membres, connaissances en tête. Un post qu'on ne peut
 * pas lire ne livre personne.
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
const id = (n: number): string => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

const AUTHOR = id(1);
const COMMENTER = id(2);
const REACTOR = id(3);
const ACQUAINTANCE = id(4);
const CLOSE = id(5);
const COMMUNITY_TIE = id(6);
const ADDRESS_BOOK = id(7);
const STRANGER = id(8);
const MEMBER = id(9);

type Level = 'PUBLIC' | 'COMMUNITY' | 'ACQUAINTANCE' | 'FRIEND' | 'CLOSE' | 'BLOOD';

const person = (userId: string, username: string) => ({
  id: userId, username, firstName: null, lastName: null, displayName: username, avatar: null, equippedAvatarRing: null,
});

const PEOPLE: Record<string, ReturnType<typeof person>> = {
  [AUTHOR]: person(AUTHOR, 'author'),
  [COMMENTER]: person(COMMENTER, 'commenter'),
  [REACTOR]: person(REACTOR, 'reactor'),
  [ACQUAINTANCE]: person(ACQUAINTANCE, 'acquaintance'),
  [CLOSE]: person(CLOSE, 'close'),
  [COMMUNITY_TIE]: person(COMMUNITY_TIE, 'community'),
  [ADDRESS_BOOK]: person(ADDRESS_BOOK, 'addressbook'),
  [STRANGER]: person(STRANGER, 'stranger'),
  [MEMBER]: person(MEMBER, 'member'),
};

type World = {
  readonly relations?: ReadonlyArray<readonly [string, Level]>;
  readonly addressBook?: readonly string[];
  readonly visibility?: 'PUBLIC' | 'PRIVATE';
  readonly conversationType?: string;
  readonly members?: readonly string[];
};

type AnyWhere = Record<string, unknown>;

const inList = (clause: unknown): string[] | undefined =>
  (clause as { in?: string[] } | undefined)?.in;

function fakePrisma(world: World) {
  const rows = (world.relations ?? []).map(([other, level]) => {
    const [low, high] = [ME, other].sort();
    return { id: `r-${other}`, userLowId: low, userHighId: high, grantedByLow: level, grantedByHigh: level, transitions: [] };
  });
  const otherOf = (row: { userLowId: string; userHighId: string }) => (row.userLowId === ME ? row.userHighId : row.userLowId);

  return {
    userRelation: {
      findMany: jest.fn(async ({ where }: { where: { OR?: AnyWhere[] } }) => {
        const restrict = (where.OR ?? []).flatMap((c) => inList(c.userHighId) ?? inList(c.userLowId) ?? []);
        return rows.filter((r) => restrict.length === 0 || restrict.includes(otherOf(r)));
      }),
    },
    friendRequest: { findMany: jest.fn(async () => []) },
    userContact: {
      findMany: jest.fn(async () => (world.addressBook ?? []).map((matchedUserId) => ({ matchedUserId }))),
    },
    post: {
      findFirst: jest.fn(async () => ({
        id: POST, authorId: AUTHOR, visibility: world.visibility ?? 'PUBLIC', visibilityUserIds: [], expiresAt: null,
      })),
    },
    postComment: { findMany: jest.fn(async () => [{ authorId: COMMENTER }]) },
    postReaction: { findMany: jest.fn(async () => [{ userId: REACTOR }]) },
    postMention: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    communityMember: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    conversation: { findUnique: jest.fn(async () => ({ id: 'c1', type: world.conversationType ?? 'group' })) },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-me' })),
      findMany: jest.fn(async () => (world.members ?? []).map((m) => ({ user: PEOPLE[m] }))),
    },
    conversationMessageStats: { findUnique: jest.fn(async () => null) },
    user: {
      findMany: jest.fn(async ({ where }: { where: AnyWhere }) => {
        const ids = inList(where.id);
        if (ids) return ids.flatMap((u) => (PEOPLE[u] ? [PEOPLE[u]] : []));
        if (where.blockedUserIds) return [];
        const notIn = ((where.AND as AnyWhere[] | undefined)?.find((c) => c.id) as { id: { notIn: string[] } } | undefined)?.id.notIn ?? [];
        return [PEOPLE[STRANGER]].filter((p) => !notIn.includes(p.id));
      }),
      findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
    },
    userPreferences: { findMany: jest.fn(async () => []) },
    userPreference: { findMany: jest.fn(async () => []) },
  } as never;
}

const cache = { get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined } as never;

const finder = (world: World) => new MentionSuggestionFinder(fakePrisma(world), cache);
const ids = (list: ReadonlyArray<{ id: string }>) => list.map((s) => s.id);

describe('#14052 — sous un post : connaissances, puis intervenants, puis contacts de tout cercle, puis annuaire', () => {
  const world: World = {
    relations: [[ACQUAINTANCE, 'ACQUAINTANCE'], [COMMUNITY_TIE, 'COMMUNITY'], [CLOSE, 'CLOSE']],
    addressBook: [ADDRESS_BOOK],
  };

  it('range les groupes dans cet ordre, les plus proches en tête', async () => {
    const list = await finder(world).forPost(POST, ME, '');
    // #14057 — qui a réagi ne sort pas pour un tiers lecteur (décision porteur 2026-10-09).
    expect(ids(list)).toEqual([CLOSE, ACQUAINTANCE, AUTHOR, COMMENTER, COMMUNITY_TIE, ADDRESS_BOOK]);
  });

  it('dit à quel groupe appartient chaque suggestion', async () => {
    const list = await finder(world).forPost(POST, ME, '');
    expect(list.map((s) => s.group)).toEqual(['known', 'known', 'context', 'context', 'contact', 'contact']);
  });

  it("garde les drapeaux d'avant : un proche est un ami, un intervenant est du contexte", async () => {
    const list = await finder(world).forPost(POST, ME, '');
    const byId = new Map(list.map((s) => [s.id, s]));
    expect(byId.get(CLOSE)).toMatchObject({ badge: 'friend', isFriend: true, inConversation: false });
    expect(byId.get(ACQUAINTANCE)).toMatchObject({ badge: 'other', isFriend: false });
    expect(byId.get(COMMENTER)).toMatchObject({ badge: 'conversation', inConversation: true });
  });

  it("ajoute l'annuaire après les contacts, à partir de deux caractères", async () => {
    const list = await finder(world).forPost(POST, ME, 'st');
    expect(ids(list)).toEqual([STRANGER]);
    expect(list[0].group).toBe('directory');
  });

  it('un intervenant qui est aussi une connaissance reste en tête, une seule fois', async () => {
    const list = await finder({ relations: [[COMMENTER, 'FRIEND']] }).forPost(POST, ME, '');
    expect(ids(list)).toEqual([COMMENTER, AUTHOR]);
    expect(list[0]).toMatchObject({ group: 'known', inConversation: true, badge: 'conversation' });
  });

  it("un post que l'appelant ne peut pas lire ne livre personne", async () => {
    await expect(finder({ ...world, visibility: 'PRIVATE' }).forPost(POST, ME, '')).rejects.toThrow('accès refusé');
  });
});

describe('#14052 — dans une conversation', () => {
  it('fermée : seulement ses membres, les connaissances en tête', async () => {
    const list = await finder({
      conversationType: 'group',
      members: [MEMBER, ACQUAINTANCE],
      relations: [[ACQUAINTANCE, 'ACQUAINTANCE'], [CLOSE, 'CLOSE']],
      addressBook: [ADDRESS_BOOK],
    }).forConversation('c1', ME, '');
    expect(ids(list)).toEqual([ACQUAINTANCE, MEMBER]);
  });

  it('ouverte : connaissances, puis membres, puis contacts de tout cercle', async () => {
    const list = await finder({
      conversationType: 'public',
      members: [MEMBER],
      relations: [[ACQUAINTANCE, 'ACQUAINTANCE'], [COMMUNITY_TIE, 'COMMUNITY']],
      addressBook: [ADDRESS_BOOK],
    }).forConversation('c1', ME, '');
    expect(ids(list)).toEqual([ACQUAINTANCE, MEMBER, COMMUNITY_TIE, ADDRESS_BOOK]);
    expect(list.map((s) => s.group)).toEqual(['known', 'context', 'contact', 'contact']);
  });
});
