/**
 * #16894 — par porte : un blocage, dans un sens ou dans l'autre, retire la
 * source d'une republication et les commentaires en aperçu de l'auteur séparé,
 * et le blocage n'est lu qu'UNE fois par requête (le filtre de liste et le
 * post servi partagent la même lecture).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import { chargerPostsParHashtag } from '../../../routes/posts/hashtag';
import { chargerPostsProches } from '../../../routes/posts/nearby';

const VIEWER = '507f1f77bcf86cd799439001';
const AUTHOR = '507f1f77bcf86cd799439002';
const BLOCKED = '507f1f77bcf86cd799439003';
const BLOCKER = '507f1f77bcf86cd799439004';
const COMMUNITY_ID = '507f1f77bcf86cd799439044';

const person = (id: string) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null });

const servedPost = (id: string) => ({
  id,
  authorId: AUTHOR,
  createdAt: new Date('2026-11-20T10:00:00Z'),
  content: 'post',
  author: person(AUTHOR),
  postMentions: [],
  comments: [
    { id: 'c-ok', content: 'bonjour', author: person(AUTHOR) },
    { id: 'c-blocked', content: 'de l’auteur bloqué', author: person(BLOCKED) },
    { id: 'c-blocker', content: 'de celui qui m’a bloqué', author: person(BLOCKER) },
  ],
  repostOf: { id: `src-${id}`, content: 'source bloquée', author: person(BLOCKER), postMentions: [] },
});

function prismaServing(posts: unknown[]) {
  return {
    post: { findMany: jest.fn<any>(async () => posts) },
    postReaction: { findMany: jest.fn<any>(async () => []) },
    postBookmark: { findMany: jest.fn<any>(async () => []) },
    community: { findFirst: jest.fn<any>(async () => ({ isPrivate: false, createdBy: 'creator-1' })) },
    communityMember: { findFirst: jest.fn<any>(async () => ({ id: 'm1' })), findMany: jest.fn<any>(async () => []) },
    hashtag: { findUnique: jest.fn<any>(async () => ({ id: 'h1' })) },
    postHashtag: { findMany: jest.fn<any>(async () => [{ postId: 'p1' }]) },
    user: {
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [BLOCKED] })),
      findMany: jest.fn<any>(async () => [{ id: BLOCKER }]),
    },
  };
}

type Served = { comments: Array<{ id: string }>; repostOf: unknown };

const expectCompanionsGone = (items: readonly unknown[]) => {
  const [first] = items as Served[];
  expect(first?.comments.map((c) => c.id)).toEqual(['c-ok']);
  expect(first?.repostOf).toBeNull();
  expect(JSON.stringify(items)).not.toContain('source bloquée');
};

describe('#16894 — ce qui voyage avec un post, par porte', () => {
  it('les publications d’une communauté', async () => {
    const prisma = prismaServing([servedPost('p1')]);
    const page = await new PostFeedService(prisma as never).getCommunityFeed(COMMUNITY_ID, VIEWER);
    expectCompanionsGone(page.items);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('un hashtag écarte l’auteur séparé de la requête ET ce qui voyage avec un post lisible', async () => {
    const prisma = prismaServing([servedPost('p1')]);
    const page = await chargerPostsParHashtag(prisma as never, 'tag', VIEWER, { cursor: 0, limit: 10 }, {});
    expectCompanionsGone(page.data);
    const where = (prisma.post.findMany.mock.calls[0] as unknown as [{ where: { authorId?: unknown } }])[0].where;
    expect(where.authorId).toEqual({ notIn: expect.arrayContaining([BLOCKED, BLOCKER]) });
  });

  it('sans blocage, un hashtag ne porte aucune exclusion et sert tout', async () => {
    const prisma = prismaServing([servedPost('p1')]);
    prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [] });
    prisma.user.findMany.mockResolvedValue([]);
    const page = await chargerPostsParHashtag(prisma as never, 'tag', VIEWER, { cursor: 0, limit: 10 }, {});
    const where = (prisma.post.findMany.mock.calls[0] as unknown as [{ where: { authorId?: unknown } }])[0].where;
    expect(where.authorId).toBeUndefined();
    expect((page.data as unknown as Served[])[0]?.comments).toHaveLength(3);
  });

  it('à proximité, l’auteur séparé est écarté de la relecture ET ce qui voyage avec un post lisible', async () => {
    const prisma = {
      ...prismaServing([servedPost('507f1f77bcf86cd7994390aa')]),
      $runCommandRaw: jest.fn<any>(async () => ({ cursor: { firstBatch: [{ _id: { $oid: '507f1f77bcf86cd7994390aa' }, distanceMeters: 12 }] } })),
    };
    const page = await chargerPostsProches(prisma as never, { lat: 48.85, lng: 2.35, radiusKm: 5, cursor: 0, limit: 10, viewerUserId: VIEWER }, {});
    expectCompanionsGone(page.data);
    const where = (prisma.post.findMany.mock.calls[0] as unknown as [{ where: { authorId?: unknown } }])[0].where;
    expect(where.authorId).toEqual({ notIn: expect.arrayContaining([BLOCKED, BLOCKER]) });
  });

  it('le profil (lu par son auteur, sans filtre d’audience) sert quand même la séparation du lecteur', async () => {
    const prisma = prismaServing([servedPost('p1')]);
    const page = await new PostFeedService(prisma as never).getUserPosts(VIEWER, VIEWER);
    expectCompanionsGone(page.items);
  });

  it('les favoris : une lecture du blocage pour le filtre ET le post servi', async () => {
    const prisma = {
      ...prismaServing([]),
      friendRequest: { findMany: jest.fn<any>(async () => []) },
      participant: { findMany: jest.fn<any>(async () => []) },
      userRelation: { findMany: jest.fn<any>(async () => []), findUnique: jest.fn<any>(async () => null) },
      conversation: { findMany: jest.fn<any>(async () => []) },
      postBookmark: { findMany: jest.fn<any>(async () => [{ id: 'b1', createdAt: new Date(), post: servedPost('p1') }]) },
    };
    const page = await new PostFeedService(prisma as never).getBookmarks(VIEWER);
    expectCompanionsGone(page.items);
    const blockReads = prisma.user.findMany.mock.calls.filter((call) => JSON.stringify(call).includes('blockedUserIds'));
    expect(blockReads).toHaveLength(1);
    const where = (prisma.postBookmark.findMany.mock.calls[0] as unknown as [{ where: { post: { is: { AND: Array<{ AND?: unknown[] }> } } } }])[0].where;
    expect(JSON.stringify(where)).toContain('snapshotAuthorId');
  });
});

