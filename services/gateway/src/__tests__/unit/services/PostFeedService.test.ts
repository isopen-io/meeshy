/**
 * PostFeedService Unit Tests — Phase 3D
 *
 * Covers currentUserReactions enrichment added to getFeed / getStories /
 * getUserPosts / getCommunityFeed / getBookmarks.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import { decodeCursor } from '../../../routes/posts/types';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Test post',
    reactions: [],
    reactionSummary: {},
    reactionCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    deletedAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: null,
    author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
    media: [],
    comments: [],
    repostOf: null,
    ...overrides,
  };
}

function makeReactionRow(postId: string, emoji: string) {
  return { postId, emoji };
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

let mockPostFindMany: jest.Mock;
let mockPostReactionFindMany: jest.Mock;
let mockFriendRequestFindMany: jest.Mock;
let mockParticipantFindMany: jest.Mock;
let mockPostViewFindMany: jest.Mock;
let mockPostBookmarkFindMany: jest.Mock;
let mockPostImpressionGroupBy: jest.Mock;
let mockUserFindUnique: jest.Mock;
let mockPostFindUnique: jest.Mock;
let mockPostMentionFindMany: jest.Mock;
let mockPrisma: PrismaClient;

beforeEach(() => {
  mockPostFindMany = jest.fn();
  mockPostReactionFindMany = jest.fn();
  mockFriendRequestFindMany = jest.fn().mockResolvedValue([]);
  mockParticipantFindMany = jest.fn().mockResolvedValue([]);
  mockPostViewFindMany = jest.fn().mockResolvedValue([]);
  mockPostBookmarkFindMany = jest.fn().mockResolvedValue([]);
  mockPostImpressionGroupBy = jest.fn().mockResolvedValue([]);
  mockUserFindUnique = jest.fn().mockResolvedValue(null);
  mockPostFindUnique = jest.fn().mockResolvedValue(null);
  mockPostMentionFindMany = jest.fn().mockResolvedValue([]);

  mockPrisma = {
    post: {
      findMany: mockPostFindMany,
      findFirst: jest.fn(),
      findUnique: mockPostFindUnique,
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['post'],
    postReaction: {
      findMany: mockPostReactionFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['postReaction'],
    friendRequest: {
      findMany: mockFriendRequestFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['friendRequest'],
    participant: {
      findMany: mockParticipantFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['participant'],
    postView: {
      findMany: mockPostViewFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['postView'],
    postBookmark: {
      findMany: mockPostBookmarkFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['postBookmark'],
    postImpression: {
      groupBy: mockPostImpressionGroupBy,
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['postImpression'],
    user: {
      findUnique: mockUserFindUnique,
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    } as unknown as PrismaClient['user'],
    postMention: {
      findMany: mockPostMentionFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    } as unknown as PrismaClient['postMention'],
  } as unknown as PrismaClient;
});

// ---------------------------------------------------------------------------
// PostFeedService.getFeed — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getFeed', () => {
  it('returns currentUserReactions: [] when user has not reacted to any post', async () => {
    const post = makePost('p-1');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a post', async () => {
    const post = makePost('p-2');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('p-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
    const post = makePost('p-3');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([
      makeReactionRow('p-3', '❤️'),
      makeReactionRow('p-3', '🔥'),
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️', '🔥']);
  });

  it('skips the postReaction batch query when the post list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(result.items).toHaveLength(0);
    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('correctly maps each reaction to the right post in a multi-post batch', async () => {
    const posts = [makePost('p-4'), makePost('p-5')];
    mockPostFindMany.mockResolvedValue(posts);
    mockPostReactionFindMany.mockResolvedValue([
      makeReactionRow('p-4', '👍'),
      makeReactionRow('p-5', '🔥'),
      makeReactionRow('p-5', '❤️'),
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    const p4 = result.items.find((i: any) => i.id === 'p-4') as any;
    const p5 = result.items.find((i: any) => i.id === 'p-5') as any;
    expect(p4.currentUserReactions).toEqual(['👍']);
    expect(p5.currentUserReactions).toEqual(['🔥', '❤️']);
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getStories — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getStories', () => {
  it('returns currentUserReactions: [] when user has not reacted to any story', async () => {
    const story = makePost('s-1', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect(result).toHaveLength(1);
    expect((result[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a story', async () => {
    const story = makePost('s-2', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('s-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('adds an updatedAt delta filter when updatedSince is provided (G1 delta-sync)', async () => {
    mockPostFindMany.mockResolvedValue([]);
    const since = new Date('2026-07-03T10:00:00Z');

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { updatedSince: since });

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([{ updatedAt: { gt: since } }]));
  });

  it('omits the delta filter without updatedSince (full tray, backward compatible)', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('updatedAt');
  });

  it('skips the postReaction batch query when the stories list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getUserPosts — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getUserPosts', () => {
  it('returns currentUserReactions: [] when viewerUserId is undefined (anonymous)', async () => {
    const post = makePost('up-1');
    mockPostFindMany.mockResolvedValue([post]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', undefined);

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('returns currentUserReactions: ["❤️"] when viewer has reacted', async () => {
    const post = makePost('up-2');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('up-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', 'viewer-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('skips postReaction batch query when post list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getUserPosts('author-1', 'viewer-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getCommunityFeed — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getCommunityFeed', () => {
  it('returns currentUserReactions: [] when viewerUserId is undefined (anonymous)', async () => {
    const post = makePost('cp-1');
    mockPostFindMany.mockResolvedValue([post]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', undefined);

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('returns currentUserReactions: ["🔥"] when viewer has reacted', async () => {
    const post = makePost('cp-2');
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('cp-2', '🔥')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', 'viewer-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['🔥']);
  });

  it('correctly maps reactions to their respective posts in multi-post batch', async () => {
    const posts = [makePost('cp-3'), makePost('cp-4')];
    mockPostFindMany.mockResolvedValue(posts);
    mockPostReactionFindMany.mockResolvedValue([
      makeReactionRow('cp-3', '❤️'),
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', 'viewer-1');

    const cp3 = result.items.find((i: any) => i.id === 'cp-3') as any;
    const cp4 = result.items.find((i: any) => i.id === 'cp-4') as any;
    expect(cp3.currentUserReactions).toEqual(['❤️']);
    expect(cp4.currentUserReactions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getBookmarks — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostFeedService.getBookmarks', () => {
  it('returns currentUserReactions: [] when user has not reacted to any bookmarked post', async () => {
    const post = makePost('bp-1');
    mockPostBookmarkFindMany.mockResolvedValue([{ post, createdAt: new Date(), id: 'bk-1' }]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('user-1');

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a bookmarked post', async () => {
    const post = makePost('bp-2');
    mockPostBookmarkFindMany.mockResolvedValue([{ post, createdAt: new Date(), id: 'bk-2' }]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('bp-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  it('skips postReaction batch query when bookmarks list is empty', async () => {
    mockPostBookmarkFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getBookmarks('user-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getFeed — intent/interest ranking
//
// The affinity query (getInterestAffinity) and the enrichment query both hit
// postReaction.findMany. We disambiguate by the query shape: the affinity query
// selects the related post's authorId, the enrichment query selects postId/emoji.
// ---------------------------------------------------------------------------

function rankById(items: unknown[]): string[] {
  return items.map((i: any) => i.id);
}

function routeReactionQuery(args: any, affinityRows: unknown[], enrichmentRows: unknown[]) {
  return args?.select?.post ? Promise.resolve(affinityRows) : Promise.resolve(enrichmentRows);
}

describe('PostFeedService.getFeed — intent/interest ranking', () => {
  const recent = () => new Date(Date.now() - 60_000); // 1 min ago → recency ~equal across posts

  it('ranks a reel above an otherwise-identical text post via the watch-signal boost', async () => {
    const textPost = makePost('text-1', { type: 'POST', createdAt: recent(), viewCount: 200 });
    const reel = makePost('reel-1', { type: 'REEL', createdAt: recent(), viewCount: 200 });
    mockPostFindMany.mockResolvedValue([textPost, reel]);
    mockPostReactionFindMany.mockImplementation((args: any) => routeReactionQuery(args, [], []));

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(rankById(result.items)[0]).toBe('reel-1');
  });

  it('demotes a post the viewer has already seen (impression fatigue)', async () => {
    const seen = makePost('seen-1', { authorId: 'a-seen', createdAt: recent() });
    const fresh = makePost('fresh-1', { authorId: 'a-fresh', createdAt: recent() });
    mockPostFindMany.mockResolvedValue([seen, fresh]);
    mockPostReactionFindMany.mockImplementation((args: any) => routeReactionQuery(args, [], []));
    mockPostImpressionGroupBy.mockResolvedValue([{ postId: 'seen-1', _count: { postId: 3 } }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(rankById(result.items)[0]).toBe('fresh-1');
  });

  it('boosts posts from a creator the viewer actively engages with (interest affinity)', async () => {
    const fromLoved = makePost('loved-1', { authorId: 'creator-loved', createdAt: recent() });
    const fromOther = makePost('other-1', { authorId: 'creator-other', createdAt: recent() });
    mockPostFindMany.mockResolvedValue([fromOther, fromLoved]);
    // Viewer has reacted to creator-loved's content repeatedly → strong interest.
    const affinityRows = Array.from({ length: 10 }, () => ({ post: { authorId: 'creator-loved' } }));
    mockPostReactionFindMany.mockImplementation((args: any) => routeReactionQuery(args, affinityRows, []));

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(rankById(result.items)[0]).toBe('loved-1');
  });

  it('degrades gracefully when impression grouping throws (no penalty applied)', async () => {
    const post = makePost('p-graceful', { createdAt: recent() });
    mockPostFindMany.mockResolvedValue([post]);
    mockPostReactionFindMany.mockImplementation((args: any) => routeReactionQuery(args, [], []));
    mockPostImpressionGroupBy.mockRejectedValue(new Error('db down'));

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(result.items).toHaveLength(1);
  });

  it('advances nextCursor by chronological order, never by score order (lossless infinite scroll)', async () => {
    // The older post outscores the newer one (reel watch-signal boost), but the
    // cursor must still track the chronological boundary so the next page does
    // not skip or duplicate. With limit=1 the window is the single newest post;
    // the higher-scoring older reel must surface on the *next* page, not vanish.
    const newer = makePost('newer-1', { type: 'POST', createdAt: new Date('2026-06-02T00:00:00Z') });
    const olderReel = makePost('older-reel', {
      type: 'REEL',
      viewCount: 9999,
      createdAt: new Date('2026-06-01T00:00:00Z'),
    });
    mockPostFindMany.mockResolvedValue([newer, olderReel]); // DB order: createdAt desc
    mockPostReactionFindMany.mockImplementation((args: any) => routeReactionQuery(args, [], []));

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1', undefined, 1);

    expect(rankById(result.items)).toEqual(['newer-1']);
    expect(result.hasMore).toBe(true);
    const decoded = decodeCursor(result.nextCursor as string);
    expect(decoded?.id).toBe('newer-1');
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getReels — thread plein écran seedé par affinité (2026-06-13)
//
// Toucher un réel dans le Feed ouvre un thread plein écran de réels classés par
// affinité au réel touché (« seed ») + affinité utilisateur. Scoring pur dans
// reelAffinity.ts (testé à part) ; ici on couvre le câblage service.
// ---------------------------------------------------------------------------

describe('PostFeedService.getReels', () => {
  it('filtre type=REEL et exclut les réels de l\'utilisateur lui-même', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getReels('user-1');

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(where.type).toBe('REEL');
    // MongoDB: live posts have NO `deletedAt` key — match on isSet, not null.
    expect(where.deletedAt).toEqual({ isSet: false });
    expect(where.AND).toEqual(
      expect.arrayContaining([{ authorId: { not: 'user-1' } }])
    );
  });

  it('exclut le réel seed de la liste (déjà affiché par le client)', async () => {
    mockPostFindMany.mockResolvedValue([]);
    mockPostFindUnique.mockResolvedValue({ id: 'seed-1', authorId: 'author-9', originalLanguage: 'fr' });

    const service = new PostFeedService(mockPrisma);
    await service.getReels('user-1', { seedReelId: 'seed-1' });

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([{ id: { not: 'seed-1' } }]));
  });

  it('récupère une fenêtre chronologique limit+1 (pas d\'over-fetch-then-drop, cf. getFeed)', async () => {
    // Anciennement `limit * 4` : la fenêtre était sur-dimensionnée puis tronquée,
    // et le curseur pris sur un item réordonné par score sautait/re-servait des
    // réels. Aligné sur l'invariant lossless documenté de getFeed : fenêtre
    // chronologique + 1 ligne sonde pour détecter hasMore ; le scoring ne
    // réordonne QUE l'affichage.
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getReels('user-1', { limit: 5 });

    expect(mockPostFindMany.mock.calls[0][0].take).toBe(6);
  });

  it('classe le réel du même auteur que le seed AVANT un réel sans affinité', async () => {
    const sameAuthorAsSeed = makePost('r-same', {
      type: 'REEL',
      authorId: 'author-seed',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    const unrelated = makePost('r-other', {
      type: 'REEL',
      authorId: 'author-x',
      createdAt: new Date('2025-06-01T00:00:00Z'), // plus récent mais sans affinité seed
    });
    // Pool dans l'ordre chronologique (unrelated d'abord) — l'affinité doit réordonner.
    mockPostFindMany.mockResolvedValue([unrelated, sameAuthorAsSeed]);
    mockPostFindUnique.mockResolvedValue({ id: 'seed-1', authorId: 'author-seed', originalLanguage: 'fr' });
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1', { seedReelId: 'seed-1', limit: 10 });

    expect(result.items.map((p: any) => p.id)).toEqual(['r-same', 'r-other']);
  });

  it('fait couler un réel déjà vu sous un réel non vu', async () => {
    const seen = makePost('r-seen', {
      type: 'REEL',
      authorId: 'author-x',
      createdAt: new Date('2025-06-01T00:00:00Z'),
    });
    const fresh = makePost('r-fresh', {
      type: 'REEL',
      authorId: 'author-x',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    mockPostFindMany.mockResolvedValue([seen, fresh]);
    mockPostViewFindMany.mockResolvedValue([{ postId: 'r-seen' }]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1', { limit: 10 });

    expect(result.items.map((p: any) => p.id)).toEqual(['r-fresh', 'r-seen']);
  });

  it('enrichit chaque reel avec currentUserReactions du viewer', async () => {
    const reel = makePost('r-9', { type: 'REEL' });
    mockPostFindMany.mockResolvedValue([reel]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('r-9', '🔥')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['🔥']);
  });

  it('enrichit chaque reel avec isBookmarkedByMe du viewer', async () => {
    // Sans ce champ, le reel viewer ne pouvait pas réhydrater l'état favori
    // → le bookmark « disparaissait » à la réouverture. Aligné sur getFeed.
    const bookmarked = makePost('r-bm', { type: 'REEL' });
    const plain = makePost('r-plain', { type: 'REEL' });
    mockPostFindMany.mockResolvedValue([bookmarked, plain]);
    mockPostReactionFindMany.mockResolvedValue([]);
    mockPostBookmarkFindMany.mockResolvedValue([{ postId: 'r-bm' }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1');

    const byId = Object.fromEntries(result.items.map((p: any) => [p.id, p.isBookmarkedByMe]));
    expect(byId['r-bm']).toBe(true);
    expect(byId['r-plain']).toBe(false);
  });

  it('reste fonctionnel quand les requêtes d\'affinité auxiliaires échouent (best-effort)', async () => {
    const reel = makePost('r-1', { type: 'REEL' });
    mockPostFindMany.mockResolvedValue([reel]);
    mockUserFindUnique.mockRejectedValue(new Error('db down'));
    mockPostMentionFindMany.mockRejectedValue(new Error('db down'));
    mockPostViewFindMany.mockRejectedValue(new Error('db down'));
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1');

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).id).toBe('r-1');
  });
});

// ---------------------------------------------------------------------------
// Regression — MongoDB soft-delete matcher (deletedAt isSet:false)
//
// Prisma's bare `{ deletedAt: null }` filter does NOT match MongoDB documents
// where the field is ABSENT (Prisma omits unset optionals at insert time), so
// it silently dropped every live post → feed / reels returned `data: []` in
// production despite a full Post collection. The queries MUST match on
// `isSet:false`. A mocked Prisma client cannot reproduce the query-engine
// behaviour, so we assert the query SHAPE instead — the exact locus of the bug.
// ---------------------------------------------------------------------------
describe('PostFeedService — deletedAt soft-delete matcher (MongoDB isSet)', () => {
  it('getFeed exclut les posts supprimés via { isSet: false }, jamais un null nu', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getFeed('user-1');

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ isSet: false });
    expect(where.deletedAt).not.toBeNull();
  });

  it('getReels exclut les réels supprimés via { isSet: false }, jamais un null nu', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getReels('user-1');

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ isSet: false });
    expect(where.deletedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getReels — chronological cursor (lossless infinite scroll)
//
// Regression: getReels used to over-fetch a `limit * 4` pool, score the whole
// pool, and take `nextCursor` from the score-sorted last item. Since the next
// page filters `createdAt < cursor.createdAt`, a cursor pulled from an
// arbitrary score position silently skips (or re-serves) reels. The cursor MUST
// be the chronologically-oldest reel of the SHOWN window — captured before
// score reordering — mirroring getFeed's documented lossless-window invariant.
// ---------------------------------------------------------------------------
describe('PostFeedService.getReels — chronological cursor', () => {
  beforeEach(() => {
    mockPostReactionFindMany.mockResolvedValue([]);
  });

  const rNew = makePost('r-new', {
    type: 'REEL',
    createdAt: new Date('2025-03-03T00:00:00Z'),
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
  });
  const rMid = makePost('r-mid', {
    type: 'REEL',
    createdAt: new Date('2025-03-02T00:00:00Z'),
    commentCount: 1000,
    viewCount: 100000,
  });
  const rOld = makePost('r-old', {
    type: 'REEL',
    createdAt: new Date('2025-03-01T00:00:00Z'),
  });

  it('derives nextCursor from the chronologically-oldest SHOWN reel, not the score-sorted last item', async () => {
    // findMany returns createdAt desc: [r-new, r-mid, r-old]. limit=2 → the
    // probe row (r-old) proves hasMore; the shown window is [r-new, r-mid].
    mockPostFindMany.mockResolvedValue([rNew, rMid, rOld]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1', { limit: 2 });

    // Scoring still reorders the DISPLAY: r-mid has heavy engagement and
    // outscores the fresher-but-empty r-new, so it renders first.
    expect(result.items.map((p: any) => p.id)).toEqual(['r-mid', 'r-new']);

    // But the cursor is the chronological boundary of the shown window (r-mid,
    // the oldest of the two shown) — NOT the score-sorted last item (r-new).
    expect(result.hasMore).toBe(true);
    const decoded = decodeCursor(result.nextCursor as string);
    expect(decoded?.id).toBe('r-mid');
    expect(decoded?.createdAt).toBe(rMid.createdAt.toISOString());
    // Guard against the reintroduced bug: never the newest (r-new) reel.
    expect(decoded?.createdAt).not.toBe(rNew.createdAt.toISOString());
  });

  it('fetches only a limit+1 window (no over-fetch-then-drop)', async () => {
    mockPostFindMany.mockResolvedValue([rNew, rMid, rOld]);

    const service = new PostFeedService(mockPrisma);
    await service.getReels('user-1', { limit: 2 });

    expect(mockPostFindMany.mock.calls[0][0].take).toBe(3);
  });

  it('returns hasMore:false and a null cursor when the window fits in one page', async () => {
    mockPostFindMany.mockResolvedValue([rNew, rMid]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1', { limit: 2 });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(2);
  });
});
