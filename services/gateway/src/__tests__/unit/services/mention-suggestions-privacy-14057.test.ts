/**
 * #14057 — l'audit adversarial de #14055. Les suggestions de mention ne servent
 * pas d'oracle :
 * - qui a RÉAGI à un post ne sort que pour le lecteur à qui `viewerListAccess`
 *   ouvre cette liste (l'auteur d'une story ou d'un statut, décision porteur du
 *   2026-10-09) ;
 * - un compte qui a coupé sa découvrabilité (#8104) ne sort par un lien inférieur
 *   à l'amitié ni par le carnet d'adresses ;
 * - le fil d'une republication dont l'original est illisible ne livre personne ;
 * - un compte désactivé ne sort pas du fil.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

const HIDDEN_IDS = new Set<string>();

jest.mock('../../../services/preferences/privacy-cache', () => ({
  ...(jest.requireActual('../../../services/preferences/privacy-cache') as object),
  loadPrivacyPreferencesCached: jest.fn(async (_prisma: unknown, ids: ReadonlyArray<string>) =>
    new Map(ids.filter((id) => HIDDEN_IDS.has(id)).map((id) => [id, { hideProfileFromSearch: true }]))
  ),
}));

import { MentionSuggestionFinder } from '../../../services/mentions/mentionSuggestions';

const ME = '507f1f77bcf86cd799439099';
const id = (n: number): string => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;
const POST = '6a0000000000000000000001';
const ORIGINAL = '6a0000000000000000000002';

const AUTHOR = id(1);
const COMMENTER = id(2);
const REACTOR = id(3);
const HIDDEN = id(4);
const DEACTIVATED = id(5);
const MEMBER_ACQUAINTANCE = id(6);
const ORIGINAL_COMMENTER = id(7);

type Person = {
  id: string; username: string; firstName: null; lastName: null; displayName: string; avatar: null;
  equippedAvatarRing: null; isActive: boolean;
};
const person = (userId: string, username: string, isActive = true): Person => ({
  id: userId, username, firstName: null, lastName: null, displayName: username, avatar: null, equippedAvatarRing: null, isActive,
});

const PEOPLE: Record<string, Person> = {
  [ME]: person(ME, 'me'),
  [AUTHOR]: person(AUTHOR, 'author'),
  [COMMENTER]: person(COMMENTER, 'commenter'),
  [REACTOR]: person(REACTOR, 'hidreactor'),
  [HIDDEN]: person(HIDDEN, 'hidden'),
  [DEACTIVATED]: person(DEACTIVATED, 'gone', false),
  [MEMBER_ACQUAINTANCE]: person(MEMBER_ACQUAINTANCE, 'acqmember'),
  [ORIGINAL_COMMENTER]: person(ORIGINAL_COMMENTER, 'origcommenter'),
};

type PostRow = {
  id: string; authorId: string; type: string; visibility: string; visibilityUserIds: string[]; expiresAt: null;
  isQuote: boolean; repostOfId: string | null; originalRepostOfId: string | null; commentsDisabled: boolean; deletedAt: null;
};
const post = (overrides: Partial<PostRow> = {}): PostRow => ({
  id: POST, authorId: AUTHOR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null,
  isQuote: false, repostOfId: null, originalRepostOfId: null, commentsDisabled: false, deletedAt: null, ...overrides,
});

type World = {
  readonly posts?: readonly PostRow[];
  readonly commenters?: readonly string[];
  readonly commentsByPost?: Readonly<Record<string, readonly string[]>>;
  readonly reactors?: readonly string[];
  readonly relations?: ReadonlyArray<readonly [string, string]>;
  readonly addressBook?: readonly string[];
  readonly members?: readonly string[];
};

type AnyWhere = Record<string, unknown>;
const inList = (clause: unknown): string[] | undefined => (clause as { in?: string[] } | undefined)?.in;

function fakePrisma(world: World) {
  const posts = new Map((world.posts ?? [post()]).map((p) => [p.id, p]));
  const rows = (world.relations ?? []).map(([other, level]) => {
    const [low, high] = [ME, other].sort();
    return { id: `r-${other}`, userLowId: low, userHighId: high, grantedByLow: level, grantedByHigh: level, transitions: [] };
  });
  const otherOf = (row: { userLowId: string; userHighId: string }) => (row.userLowId === ME ? row.userHighId : row.userLowId);

  return {
    post: { findFirst: jest.fn(async ({ where }: { where: { id: string } }) => posts.get(where.id) ?? null) },
    postComment: {
      findMany: jest.fn(async ({ where }: { where: { postId: string } }) =>
        (world.commentsByPost ? world.commentsByPost[where.postId] ?? [] : world.commenters ?? []).map((authorId) => ({ authorId }))
      ),
    },
    postReaction: { findMany: jest.fn(async () => (world.reactors ?? []).map((userId) => ({ userId }))) },
    postMention: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    communityMember: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    userRelation: {
      findMany: jest.fn(async ({ where }: { where: { OR?: AnyWhere[] } }) => {
        const restrict = (where.OR ?? []).flatMap((c) => inList(c.userHighId) ?? inList(c.userLowId) ?? []);
        return rows.filter((r) => restrict.length === 0 || restrict.includes(otherOf(r)));
      }),
    },
    friendRequest: { findMany: jest.fn(async () => []) },
    userContact: { findMany: jest.fn(async () => (world.addressBook ?? []).map((matchedUserId) => ({ matchedUserId }))) },
    conversation: { findUnique: jest.fn(async () => ({ id: 'c1', type: 'public' })) },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-me' })),
      findMany: jest.fn(async () => (world.members ?? []).map((m) => ({ user: PEOPLE[m] }))),
    },
    conversationMessageStats: { findUnique: jest.fn(async () => null) },
    user: {
      findMany: jest.fn(async ({ where }: { where: AnyWhere }) => {
        const ids = inList(where.id);
        if (ids) return ids.flatMap((u) => (PEOPLE[u] && PEOPLE[u].isActive ? [PEOPLE[u]] : []));
        return [];
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

describe('#14057 — qui a réagi ne sort que pour qui a le droit de le lire', () => {
  it("B1 — un réacteur, caché ou non, ne sort pas pour un TIERS lecteur d'un post public", async () => {
    HIDDEN_IDS.clear();
    HIDDEN_IDS.add(REACTOR);
    const list = await finder({ reactors: [REACTOR] }).forPost(POST, ME, 'hid');
    expect(ids(list)).not.toContain(REACTOR);
    HIDDEN_IDS.clear();
    expect(ids(await finder({ reactors: [REACTOR] }).forPost(POST, ME, ''))).toEqual([AUTHOR]);
  });

  it("l'auteur d'une story retrouve ceux qui y ont réagi", async () => {
    HIDDEN_IDS.clear();
    const story = post({ authorId: ME, type: 'STORY' });
    const list = await finder({ posts: [story], reactors: [REACTOR] }).forPost(POST, ME, '');
    expect(ids(list)).toEqual([REACTOR]);
  });

  it("l'auteur d'un POST ne lit pas la liste de ses réacteurs (décision 2026-10-09 : des nombres seulement)", async () => {
    HIDDEN_IDS.clear();
    const own = post({ authorId: ME, type: 'POST' });
    expect(ids(await finder({ posts: [own], reactors: [REACTOR] }).forPost(POST, ME, ''))).toEqual([]);
  });
});

describe('#14057 — un compte caché ne sort par aucun lien inférieur à l’amitié', () => {
  it('C1 — une connaissance (ACQUAINTANCE) cachée ne sort pas', async () => {
    HIDDEN_IDS.clear();
    HIDDEN_IDS.add(HIDDEN);
    const list = await finder({ relations: [[HIDDEN, 'ACQUAINTANCE']] }).forPost(POST, ME, 'hi');
    expect(ids(list)).not.toContain(HIDDEN);
  });

  it('un lien COMMUNITY caché ne sort pas non plus', async () => {
    HIDDEN_IDS.clear();
    HIDDEN_IDS.add(HIDDEN);
    expect(ids(await finder({ relations: [[HIDDEN, 'COMMUNITY']] }).forPost(POST, ME, 'hi'))).not.toContain(HIDDEN);
  });

  it('un AMI caché reste proposé : la loi #8104 exempte les amis acceptés', async () => {
    HIDDEN_IDS.clear();
    HIDDEN_IDS.add(HIDDEN);
    expect(ids(await finder({ relations: [[HIDDEN, 'FRIEND']] }).forPost(POST, ME, 'hi'))).toEqual([HIDDEN]);
  });
});

describe('#14057 — la garde de lecture est celle du fil', () => {
  it("C2 — la republication publique d'un original PRIVÉ ne livre personne", async () => {
    HIDDEN_IDS.clear();
    const repost = post({ id: POST, authorId: COMMENTER, repostOfId: ORIGINAL });
    const original = post({ id: ORIGINAL, authorId: AUTHOR, visibility: 'PRIVATE' });
    await expect(finder({ posts: [repost, original] }).forPost(POST, ME, '')).rejects.toThrow('accès refusé');
  });

  it('un identifiant malformé est un refus, jamais une erreur serveur', async () => {
    await expect(finder({}).forPost('cmid_123', ME, '')).rejects.toThrow('accès refusé');
  });

  it('le fil d’une republication lisible propose son auteur puis celui de l’original', async () => {
    HIDDEN_IDS.clear();
    const repost = post({ id: POST, authorId: COMMENTER, repostOfId: ORIGINAL });
    const original = post({ id: ORIGINAL, authorId: AUTHOR });
    expect(ids(await finder({ posts: [repost, original] }).forPost(POST, ME, ''))).toEqual([COMMENTER, AUTHOR]);
  });

  it('une republication lisible propose les commentateurs de SON fil, jamais ceux de l’original', async () => {
    HIDDEN_IDS.clear();
    const repost = post({ id: POST, authorId: COMMENTER, repostOfId: ORIGINAL });
    const original = post({ id: ORIGINAL, authorId: AUTHOR });
    const list = await finder({
      posts: [repost, original],
      commentsByPost: { [POST]: [MEMBER_ACQUAINTANCE], [ORIGINAL]: [ORIGINAL_COMMENTER] },
    }).forPost(POST, ME, '');
    expect(ids(list)).toEqual([COMMENTER, AUTHOR, MEMBER_ACQUAINTANCE]);
  });
});

describe('#14057 — le fil ne sort que des comptes actifs, et les membres gardent leur badge', () => {
  it('N1 — un commentateur désactivé ne sort pas', async () => {
    HIDDEN_IDS.clear();
    expect(ids(await finder({ commenters: [DEACTIVATED, COMMENTER] }).forPost(POST, ME, ''))).toEqual([AUTHOR, COMMENTER]);
  });

  it('N2 — une connaissance membre d’une conversation ouverte garde le badge « conversation »', async () => {
    HIDDEN_IDS.clear();
    const [first] = await finder({ members: [MEMBER_ACQUAINTANCE], relations: [[MEMBER_ACQUAINTANCE, 'ACQUAINTANCE']] })
      .forConversation('c1', ME, '');
    expect(first).toMatchObject({ id: MEMBER_ACQUAINTANCE, group: 'known', inConversation: true, badge: 'conversation' });
  });
});
