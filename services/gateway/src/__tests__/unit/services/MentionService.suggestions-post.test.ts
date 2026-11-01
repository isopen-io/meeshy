/**
 * MentionService.getUserSuggestionsForPost — le contexte post (story, réel, mood
 * compris : tous des `Post`).
 *
 * Ordre (#14052, directive porteur 2026-10-31) : connaissances (≥ ACQUAINTANCE)
 * > intervenants (auteur, commentateurs, réacteurs) > contacts de tout cercle >
 * annuaire, plafonné à 10. Un post absent, supprimé ou illisible ne livre personne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/CacheStore', () => {
  const cache = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
    keys: jest.fn(async () => []),
    isAvailable: jest.fn(() => false),
  };
  return { getCacheStore: jest.fn(() => cache) };
});

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

import { MentionService, type MentionSuggestion } from '../../../services/MentionService';

const POST_ID = '507f1f77bcf86cd799439011';
const CURRENT_USER_ID = '507f1f77bcf86cd799439099';
const AUTHOR_ID = '507f1f77bcf86cd799439001';
const COMMENTER_ID = '507f1f77bcf86cd799439002';
const REACTOR_ID = '507f1f77bcf86cd799439003';
const FRIEND_ID = '507f1f77bcf86cd799439004';

type User = {
  id: string; username: string; firstName: string | null; lastName: string | null;
  displayName: string | null; avatar: string | null; equippedAvatarRing: string | null;
};

const user = (id: string, username: string, displayName: string | null = username): User => ({
  id, username, firstName: null, lastName: null, displayName, avatar: null, equippedAvatarRing: null,
});

type Scenario = {
  readonly post?: { authorId: string; visibility?: string } | null;
  readonly commenters?: readonly User[];
  readonly reactors?: readonly User[];
  readonly friends?: readonly User[];
  readonly directory?: readonly User[];
};

const AUTHOR = user(AUTHOR_ID, 'author_user', 'Author User');

function fakePrisma(scenario: Scenario) {
  const people = new Map<string, User>(
    [AUTHOR, ...(scenario.commenters ?? []), ...(scenario.reactors ?? []), ...(scenario.friends ?? []), ...(scenario.directory ?? [])]
      .map((u) => [u.id, u])
  );
  const friendIds = (scenario.friends ?? []).map((f) => f.id);
  const post = scenario.post === undefined ? { authorId: AUTHOR_ID } : scenario.post;

  return {
    post: {
      findFirst: jest.fn(async () =>
        post ? { id: POST_ID, authorId: post.authorId, visibility: post.visibility ?? 'PUBLIC', visibilityUserIds: [], expiresAt: null } : null
      ),
    },
    postComment: {
      findMany: jest.fn(async () => (scenario.commenters ?? []).map((c) => ({ authorId: c.id }))),
    },
    postReaction: {
      findMany: jest.fn(async () => (scenario.reactors ?? []).map((r) => ({ userId: r.id }))),
    },
    postMention: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    communityMember: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    participant: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    userRelation: { findMany: jest.fn(async () => []) },
    userContact: { findMany: jest.fn(async () => []) },
    friendRequest: {
      findMany: jest.fn(async () =>
        friendIds.map((friendId) => ({ senderId: CURRENT_USER_ID, receiverId: friendId, respondedAt: null, updatedAt: null }))
      ),
    },
    user: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = (where.id as { in?: string[] } | undefined)?.in;
        if (ids) return ids.flatMap((id) => (people.has(id) ? [people.get(id) as User] : []));
        if (where.blockedUserIds) return [];
        const notIn = ((where.AND as Array<Record<string, unknown>> | undefined)?.find((c) => c.id) as { id: { notIn: string[] } } | undefined)?.id.notIn ?? [];
        return (scenario.directory ?? []).filter((u) => !notIn.includes(u.id));
      }),
      findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
    },
    userPreferences: { findMany: jest.fn(async () => []) },
    userPreference: { findMany: jest.fn(async () => []) },
  };
}

const suggestionsFor = (scenario: Scenario, query = ''): Promise<MentionSuggestion[]> =>
  new MentionService(fakePrisma(scenario) as never).getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, query);

const ids = (list: readonly MentionSuggestion[]) => list.map((s) => s.id);

describe('MentionService.getUserSuggestionsForPost', () => {
  describe('accès au post', () => {
    it('refuse un post absent ou supprimé (loadPostAcl rend null dans les deux cas)', async () => {
      await expect(suggestionsFor({ post: null })).rejects.toThrow('Post non trouvé ou accès refusé');
    });

    it("refuse un post que l'appelant ne peut pas lire", async () => {
      await expect(suggestionsFor({ post: { authorId: AUTHOR_ID, visibility: 'PRIVATE' } })).rejects.toThrow(
        'Post non trouvé ou accès refusé'
      );
    });
  });

  describe('intervenants', () => {
    it("l'auteur ouvre le contexte, badgé « conversation »", async () => {
      const [first] = await suggestionsFor({});
      expect(first).toMatchObject({ id: AUTHOR_ID, username: 'author_user', badge: 'conversation', inConversation: true, group: 'context' });
    });

    it("n'inclut jamais l'appelant, même auteur du post", async () => {
      expect(ids(await suggestionsFor({ post: { authorId: CURRENT_USER_ID } }))).not.toContain(CURRENT_USER_ID);
    });

    it("les commentateurs suivent l'auteur ; qui a réagi ne sort pas pour un tiers (#14057)", async () => {
      const list = await suggestionsFor({
        commenters: [user(COMMENTER_ID, 'commenter')],
        reactors: [user(REACTOR_ID, 'reactor')],
      });
      expect(ids(list)).toEqual([AUTHOR_ID, COMMENTER_ID]);
      expect(list.every((s) => s.badge === 'conversation')).toBe(true);
    });

    it('un auteur qui commente ne paraît qu’une fois', async () => {
      expect(ids(await suggestionsFor({ commenters: [AUTHOR] }))).toEqual([AUTHOR_ID]);
    });
  });

  describe('connaissances', () => {
    it("un ami vient AVANT les intervenants, badgé « friend »", async () => {
      const list = await suggestionsFor({ friends: [user(FRIEND_ID, 'friend_user')], commenters: [user(COMMENTER_ID, 'commenter')] });
      expect(ids(list)).toEqual([FRIEND_ID, AUTHOR_ID, COMMENTER_ID]);
      expect(list[0]).toMatchObject({ badge: 'friend', isFriend: true, group: 'known' });
    });
  });

  describe('filtre de la requête', () => {
    it('par nom d’utilisateur', async () => {
      expect(ids(await suggestionsFor({}, 'author'))).toEqual([AUTHOR_ID]);
    });

    it('par nom affiché', async () => {
      expect(ids(await suggestionsFor({}, 'Author User'))).toEqual([AUTHOR_ID]);
    });

    it('écarte qui ne correspond pas', async () => {
      expect(ids(await suggestionsFor({}, 'zzz'))).toEqual([]);
    });
  });

  it('plafonne à 10 suggestions', async () => {
    const commenters = Array.from({ length: 15 }, (_, i) => user(`507f1f77bcf86cd7994391${String(i).padStart(2, '0')}`, `c${i}`));
    expect(await suggestionsFor({ commenters })).toHaveLength(10);
  });

  it('rend la forme MentionSuggestion', async () => {
    const [first] = await suggestionsFor({});
    expect(Object.keys(first).sort()).toEqual(
      ['avatar', 'badge', 'displayName', 'group', 'id', 'inConversation', 'isFriend', 'username'].sort()
    );
  });
});
