/**
 * PostFeedService Unit Tests — Phase 3D
 *
 * Covers currentUserReactions enrichment added to getFeed / getStories /
 * getUserPosts / getCommunityFeed / getBookmarks.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import { decodeCursor, encodeCursor } from '../../../routes/posts/types';
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
  // Défaut `[]` comme tous les autres mocks du fichier : sans lui, un mock non
  // configuré rend `undefined`, et toute requête AJOUTÉE à une méthode déjà
  // testée casse ses témoins par un `TypeError` — un faux rouge qui ne parle
  // pas du comportement mesuré.
  mockPostFindMany = jest.fn().mockResolvedValue([]);
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

  // Repost simple → racine (chantier reposts cohérents & watermark, tâche 9) :
  // isLikedByMe/currentUserReactions d'un repost isQuote:false reflètent
  // l'état du viewer sur l'ORIGINAL — deuxième chemin d'enrichissement
  // (le premier est PostService.getPostById), même règle exacte.

  it('redirects currentUserReactions to the ROOT for a simple repost', async () => {
    const repost = makePost('repost-1', { isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostFindMany.mockResolvedValue([repost]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('root-1', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(mockPostReactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', postId: { in: ['root-1'] } } })
    );
    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
    expect((result.items[0] as any).isLikedByMe).toBe(true);
  });

  it('a QUOTE keeps its own currentUserReactions — no redirect', async () => {
    const quote = makePost('quote-1', { isQuote: true, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostFindMany.mockResolvedValue([quote]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getFeed('user-1');

    expect(mockPostReactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', postId: { in: ['quote-1'] } } })
    );
  });

  it('two distinct reposts of the SAME original both surface the ONE reaction posed on the root (idempotence)', async () => {
    const repostA = makePost('repost-a', { isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    const repostB = makePost('repost-b', { isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostFindMany.mockResolvedValue([repostA, repostB]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('root-1', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    const a = result.items.find((i: any) => i.id === 'repost-a') as any;
    const b = result.items.find((i: any) => i.id === 'repost-b') as any;
    expect(a.currentUserReactions).toEqual(['❤️']);
    expect(b.currentUserReactions).toEqual(['❤️']);
  });

  // Review task-9, critique #1 : un repost simple SOURCÉ depuis une
  // STORY/STATUS ne redirige JAMAIS ses flags perso vers la racine — il
  // porte son propre instantané et garde sa PROPRE vie sociale.
  // `repostOf.type` est déjà chargé par `feedPostInclude`, aucune requête
  // supplémentaire nécessaire pour trancher.
  it('keeps its own currentUserReactions for a repost sourced from a STORY — never redirects to the ephemeral root', async () => {
    const repost = makePost('repost-story-1', {
      isQuote: false,
      repostOfId: 'story-root-1',
      originalRepostOfId: 'story-root-1',
      repostOf: { id: 'story-root-1', type: 'STORY' },
    });
    mockPostFindMany.mockResolvedValue([repost]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('repost-story-1', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect(mockPostReactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', postId: { in: ['repost-story-1'] } } })
    );
    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
    expect((result.items[0] as any).isLikedByMe).toBe(true);
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

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when user reacted to a story', async () => {
    const story = makePost('s-2', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('s-2', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });

  // ── Mode archive auteur (GET /posts/stories/mine, 2026-08-12) ────────────

  it('archiveOfAuthor: returns ONLY the caller posts, without any expiry filter', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { archiveOfAuthor: true });

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(where.authorId).toBe('user-1');
    expect(where.type).toBe('STORY');
    // Champ ABSENT sur un post vivant : le filtre NOT_DELETED (isSet:false)
    // est requis, jamais `deletedAt: null`.
    expect(where.deletedAt).toEqual({ isSet: false });
    // L'archive lit TOUT l'historique — aucune clause d'expiration : les
    // stories ne sont plus jamais détruites et l'auteur les garde à vie.
    expect(JSON.stringify(where)).not.toContain('expiresAt');
  });

  it('archiveOfAuthor: never applies the visibility fan-out (own posts only)', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { archiveOfAuthor: true });

    const where = mockPostFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('visibility');
  });

  it('archiveOfAuthor: paginates with the keyset cursor and reports hasMore', async () => {
    const stories = Array.from({ length: 3 }, (_, i) => makePost(`arch-${i}`, { type: 'STORY' }));
    mockPostFindMany.mockResolvedValue(stories);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', { archiveOfAuthor: true, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(result.deletedIds).toEqual([]);
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

  // --- Archive de l'auteur -------------------------------------------------
  //
  // Le filtre d'expiration ne connaissait AUCUNE exception d'auteur : mes
  // propres stories disparaissaient de la réponse dès leur expiration. « Mes
  // stories » ne pouvait donc pas les lister, et le client ne pouvait pas les
  // garder — un pull-to-refresh écrase son cache avec la réponse serveur.
  //
  // Elles restent renvoyées à leur AUTEUR pendant une fenêtre bornée : sans
  // borne, la réponse enflerait indéfiniment avec l'ancienneté du compte.

  function expiryClause(where: any) {
    return where.AND.find(
      (clause: any) =>
        Array.isArray(clause.OR) &&
        clause.OR.some((branch: any) => branch.expiresAt?.gt !== undefined)
    );
  }

  it('keeps my own expired stories inside the author archive window', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const clause = expiryClause(mockPostFindMany.mock.calls[0][0].where);
    const authorBranch = clause.OR.find((branch: any) => Array.isArray(branch.AND));

    expect(authorBranch).toBeDefined();
    expect(authorBranch.AND).toEqual(
      expect.arrayContaining([{ authorId: 'user-1' }])
    );
  });

  it('bounds the author archive to a finite window in the past', async () => {
    mockPostFindMany.mockResolvedValue([]);
    const before = Date.now();

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const after = Date.now();
    const clause = expiryClause(mockPostFindMany.mock.calls[0][0].where);
    const authorBranch = clause.OR.find((branch: any) => Array.isArray(branch.AND));
    const floor = authorBranch.AND.find((c: any) => c.expiresAt)?.expiresAt?.gt as Date;

    expect(floor).toBeInstanceOf(Date);
    expect(floor.getTime()).toBeLessThan(before);
    // Le plancher est `serviceNow - WINDOW`, et `serviceNow` est une lecture
    // d'horloge PROPRE au service, prise APRÈS celle du test. Comparer
    // `before - floor` à la fenêtre au millième près supposait les deux lectures
    // égales : dès que l'horloge changeait de milliseconde entre les deux, le
    // test tombait à `WINDOW - 1` (observé en CI, 604799999 contre 604800000).
    // L'invariant réel est un encadrement : le plancher tombe dans la fenêtre
    // ouverte par les deux lectures qui bornent l'appel.
    expect(floor.getTime()).toBeGreaterThanOrEqual(before - PostFeedService.AUTHOR_ARCHIVE_WINDOW_MS);
    expect(floor.getTime()).toBeLessThanOrEqual(after - PostFeedService.AUTHOR_ARCHIVE_WINDOW_MS);
  });

  it('still hides OTHER authors expired stories', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const clause = expiryClause(mockPostFindMany.mock.calls[0][0].where);
    const authorBranches = clause.OR.filter((branch: any) => Array.isArray(branch.AND));

    expect(authorBranches).toHaveLength(1);
    expect(authorBranches[0].AND).toEqual(
      expect.arrayContaining([{ authorId: 'user-1' }])
    );
  });

  // --- Tombstones du delta-sync -------------------------------------------
  //
  // Un delta additif ne peut pas exprimer une disparition : il ne renvoie que
  // ce qui existe encore. Les suppressions ne voyageaient donc que par l'event
  // socket `story:deleted`, qui ne couvre pas l'app fermée ou hors-ligne (aucun
  // replay) — la story restait dans le cache du client jusqu'à l'expiration de
  // ce cache. Le delta porte maintenant les ids disparus.
  //
  // Ça couvre AUSSI l'expiration : `ExpiredStoriesCleanupService` soft-delete
  // les stories périmées toutes les heures, ce qui pose `deletedAt` et remonte
  // `updatedAt` — elles entrent alors dans la même fenêtre delta.

  it('returns the ids of stories deleted since the delta cursor', async () => {
    mockPostFindMany
      .mockResolvedValueOnce([])                            // page de stories vivantes
      .mockResolvedValueOnce([{ id: 'gone-1' }, { id: 'gone-2' }]); // tombstones
    const since = new Date('2026-07-03T10:00:00Z');

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', { updatedSince: since });

    expect(result.deletedIds).toEqual(['gone-1', 'gone-2']);
  });

  it('scopes the tombstone query to deleted stories updated after the cursor', async () => {
    mockPostFindMany.mockResolvedValue([]);
    const since = new Date('2026-07-03T10:00:00Z');

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { updatedSince: since });

    const tombstoneArgs = mockPostFindMany.mock.calls[1][0];
    expect(tombstoneArgs.where.type).toBe('STORY');
    expect(tombstoneArgs.where.deletedAt).toEqual({ not: null });
    expect(tombstoneArgs.where.updatedAt).toEqual({ gt: since });
    expect(tombstoneArgs.select).toEqual({ id: true });
  });

  it('applies the same visibility filter to tombstones as to the tray itself', async () => {
    // Sans ça, le delta divulguerait l'existence de stories que l'utilisateur
    // n'a jamais eu le droit de voir.
    mockPostFindMany.mockResolvedValue([]);
    const since = new Date('2026-07-03T10:00:00Z');

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { updatedSince: since });

    const trayVisibility = mockPostFindMany.mock.calls[0][0].where.AND[0];
    const tombstoneArgs = mockPostFindMany.mock.calls[1][0];
    expect(tombstoneArgs.where.AND).toEqual(expect.arrayContaining([trayVisibility]));
  });

  it('issues no tombstone query on a full tray fetch', async () => {
    // Le full fetch écrase le tray côté client : les disparitions y sont déjà
    // couvertes par construction, une requête de plus serait du gaspillage.
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect(mockPostFindMany).toHaveBeenCalledTimes(1);
    expect(result.deletedIds).toEqual([]);
  });

  // --- Troncature des tombstones ------------------------------------------
  //
  // Le plafond des tombstones n'a pas de curseur : rien ne permet de reprendre
  // la suite. Un client dont les tombstones ont été coupés garde donc des
  // stories fantômes, et il ne peut le découvrir que si la charge utile le lui
  // DIT — le plafond était jusqu'ici journalisé côté serveur seulement.
  //
  // Le drapeau se prouve par une ligne SONDE (`take: LIMIT + 1`), comme
  // `hasMore` : `length === LIMIT` ne distingue pas une page coupée d'une
  // fenêtre de très exactement LIMIT suppressions, qui est COMPLÈTE.

  const tombstoneRows = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `gone-${i}` }));

  it('flags the tombstones as truncated when the cap overflows', async () => {
    mockPostFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(tombstoneRows(501));

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', {
      updatedSince: new Date('2026-07-03T10:00:00Z'),
    });

    expect(result.deletedIdsTruncated).toBe(true);
    expect(result.deletedIds).toHaveLength(500);
  });

  it('does not flag a window of exactly the cap, which is complete', async () => {
    // La sonde est ce qui rend cette distinction possible : sans elle, cette
    // fenêtre COMPLÈTE déclencherait un full fetch inutile à chaque delta.
    mockPostFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(tombstoneRows(500));

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', {
      updatedSince: new Date('2026-07-03T10:00:00Z'),
    });

    expect(result.deletedIdsTruncated).toBe(false);
    expect(result.deletedIds).toHaveLength(500);
  });

  it('asks for one probe row beyond the tombstone cap', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { updatedSince: new Date('2026-07-03T10:00:00Z') });

    expect(mockPostFindMany.mock.calls[1][0].take).toBe(501);
  });

  it('reports no truncation on a full tray fetch, which queries no tombstone', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect(result.deletedIdsTruncated).toBe(false);
  });

  // --- Portée des tombstones : la FENÊTRE, pas la page ---------------------
  //
  // Le client draine désormais la fenêtre delta page par page
  // (`StoryViewModel.drainStoryPages`) — jusqu'à 6 requêtes pour une même
  // fenêtre. La requête de tombstones, elle, ne dépend PAS du curseur : sa
  // clause est `deletedAt != null AND updatedAt > since`, identique d'une page
  // à l'autre. La relancer à chaque page referait donc jusqu'à 6 fois la même
  // lecture de 501 lignes sous filtre de visibilité, pour un résultat que le
  // client tient déjà depuis la première.
  //
  // Elle ne court plus que sur la page qui OUVRE la fenêtre (`cursor` absent).
  // Le drain client fusionne par union (`formUnion`) et par `||`, jamais par
  // écrasement : des pages suivantes sans tombstone ne peuvent pas effacer ceux
  // de la première.

  it('issues no tombstone query on a PAGED delta — they scope the window, not the page', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', {
      updatedSince: new Date('2026-07-03T10:00:00Z'),
      cursor: encodeCursor(new Date('2026-07-03T09:00:00Z'), 'story-9'),
    });

    expect(mockPostFindMany).toHaveBeenCalledTimes(1);
    expect(result.deletedIds).toEqual([]);
    expect(result.deletedIdsTruncated).toBe(false);
  });

  it('still issues the tombstone query on the page that OPENS the delta window', async () => {
    // Garde-fou de l'optimisation ci-dessus : couper les tombstones sur la
    // première page les supprimerait purement et simplement du produit.
    mockPostFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'gone-1' }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', {
      updatedSince: new Date('2026-07-03T10:00:00Z'),
    });

    expect(mockPostFindMany).toHaveBeenCalledTimes(2);
    expect(result.deletedIds).toEqual(['gone-1']);
  });

  it('skips the postReaction batch query when the stories list is empty', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
  });

  it('uses the lean tray select without storyEffects when projection tray is requested (G1b)', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { projection: 'tray' });

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    expect(args.select.storyEffects).toBeUndefined();
    expect(args.select.translations).toBeUndefined();
    expect(args.select.media).toBeDefined();
    expect(args.select.author).toBeDefined();
  });

  it('keeps the full include without projection (backward compatible)', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.include).toBeDefined();
    expect(args.select).toBeUndefined();
  });

  it('still flags isViewedByMe in the tray projection', async () => {
    const story = makePost('s-tray', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([{ postId: 's-tray' }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', { projection: 'tray' });

    expect((result.items[0] as any).isViewedByMe).toBe(true);
  });

  it('skips the reactions batch query in the tray projection (rings need no reactions)', async () => {
    const story = makePost('s-tray-2', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostViewFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', { projection: 'tray' });

    expect(mockPostReactionFindMany).not.toHaveBeenCalled();
    expect((result.items[0] as any).currentUserReactions).toEqual([]);
  });

  it('adds a keyset filter and tiebreaker ordering when a cursor is provided (G1c)', async () => {
    mockPostFindMany.mockResolvedValue([]);
    const service = new PostFeedService(mockPrisma);
    const anchor = makePost('s-anchor', { type: 'STORY' });

    // Round-trip a real cursor (same encoder the service hands out).
    const first = await service.getStories('user-1');
    expect(first.nextCursor).toBeNull();
    await service.getStories('user-1', { cursor: encodeCursor(anchor.createdAt as Date, anchor.id) });

    const args = mockPostFindMany.mock.calls[1][0];
    expect(JSON.stringify(args.where)).toContain('"lt"');
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('returns hasMore + nextCursor when more stories exist than the limit (G1c)', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makePost(`s-page-${i}`, { type: 'STORY', createdAt: new Date(Date.UTC(2025, 0, 10 - i)) }));
    mockPostFindMany.mockResolvedValue(rows);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    const decoded = decodeCursor(result.nextCursor as string);
    expect(decoded?.id).toBe('s-page-1');
  });

  it('first page without cursor keeps the historic 50 cap and take limit+1 (G1c)', async () => {
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.take).toBe(51);
    expect(JSON.stringify(args.where)).not.toContain('"lt"');
  });
});

// ---------------------------------------------------------------------------
// PostFeedService.getStories — referenceAccess (Task 11, plan
// 2026-08-19-post-references-gateway). Le verdict voyage AVEC la story : le
// client calcule l'expiration en local et ne voit pas la référence.
// ---------------------------------------------------------------------------

describe('PostFeedService.getStories — referenceAccess', () => {
  beforeEach(() => {
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([]);
  });

  it('pose "none" quand le lecteur n\'est référencé par aucune story', async () => {
    const story = makePost('s-ref-1', { type: 'STORY' });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostMentionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result.items[0] as any).referenceAccess).toBe('none');
  });

  it('pose "granted" sur une story EXPIRÉE dont la référence n\'a jamais été ouverte', async () => {
    const story = makePost('s-ref-2', { type: 'STORY', expiresAt: new Date('2020-01-01T00:00:00Z') });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostMentionFindMany.mockResolvedValue([{ postId: 's-ref-2', expiredViewAt: null }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result.items[0] as any).referenceAccess).toBe('granted');
  });

  it('pose "consumed" sur une story EXPIRÉE dont la fenêtre de 24h est dépassée', async () => {
    const story = makePost('s-ref-3', { type: 'STORY', expiresAt: new Date('2020-01-01T00:00:00Z') });
    mockPostFindMany.mockResolvedValue([story]);
    mockPostMentionFindMany.mockResolvedValue([
      { postId: 's-ref-3', expiredViewAt: new Date('2019-01-01T00:00:00Z') },
    ]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result.items[0] as any).referenceAccess).toBe('consumed');
  });

  it('lit les références du lot en UNE seule requête groupée — pas un findUnique par story', async () => {
    const stories = [makePost('s-ref-a', { type: 'STORY' }), makePost('s-ref-b', { type: 'STORY' })];
    mockPostFindMany.mockResolvedValue(stories);
    mockPostMentionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    expect(mockPostMentionFindMany).toHaveBeenCalledTimes(1);
    expect(mockPostMentionFindMany).toHaveBeenCalledWith({
      where: { postId: { in: ['s-ref-a', 's-ref-b'] }, mentionedUserId: 'user-1' },
      select: { postId: true, expiredViewAt: true },
    });
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

  it('redirects currentUserReactions to the ROOT for a simple repost shown on a profile', async () => {
    const repost = makePost('up-repost', { isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostFindMany.mockResolvedValue([repost]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('root-1', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', 'viewer-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
  });
});

// ---------------------------------------------------------------------------
// Parité des flags d'action PERSONNELS
//
// `isLikedByMe` / `isBookmarkedByMe` / `isRepostedByMe` décrivent le LECTEUR,
// pas le post. Ils n'ont donc de sens que servis ENSEMBLE : un client qui reçoit
// l'un et pas les autres décode les absents en `false` (SDK :
// `isBookmarkedByMe ?? false`) et affiche « pas en favori » d'un post qui l'est.
//
// Le défaut mesuré le 2026-08-25 : seul `getFeed` posait les trois. L'onglet
// Posts d'un profil (`getUserPosts`) n'annonçait ni le favori ni le repost, et
// `getBookmarks` — la liste des favoris — ne disait pas que ses propres posts
// étaient en favori.
// ---------------------------------------------------------------------------

describe('PostFeedService — parité des flags personnels', () => {
  beforeEach(() => {
    mockPostReactionFindMany.mockResolvedValue([]);
  });

  it('getUserPosts sert isBookmarkedByMe et isRepostedByMe', async () => {
    mockPostFindMany
      .mockResolvedValueOnce([makePost('pf-1'), makePost('pf-2')])
      .mockResolvedValueOnce([{ repostOfId: 'pf-2' }]);
    mockPostBookmarkFindMany.mockResolvedValue([{ postId: 'pf-1' }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', 'viewer-1');

    const [first, second] = result.items as any[];
    expect(first.isBookmarkedByMe).toBe(true);
    expect(first.isRepostedByMe).toBe(false);
    expect(second.isBookmarkedByMe).toBe(false);
    expect(second.isRepostedByMe).toBe(true);
  });

  it('getUserPosts sert les flags à false — jamais absents — pour un lecteur sans favori', async () => {
    mockPostFindMany.mockResolvedValueOnce([makePost('pf-3')]).mockResolvedValueOnce([]);
    mockPostBookmarkFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', 'viewer-1');

    const item = result.items[0] as any;
    expect(item).toHaveProperty('isBookmarkedByMe', false);
    expect(item).toHaveProperty('isRepostedByMe', false);
  });

  it('getUserPosts anonyme sert les flags à false sans interroger la base', async () => {
    mockPostFindMany.mockResolvedValue([makePost('pf-4')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getUserPosts('author-1', undefined);

    const item = result.items[0] as any;
    expect(item.isBookmarkedByMe).toBe(false);
    expect(item.isRepostedByMe).toBe(false);
    expect(mockPostBookmarkFindMany).not.toHaveBeenCalled();
  });

  it('getBookmarks dit que ses propres posts SONT en favori', async () => {
    mockPostBookmarkFindMany.mockResolvedValue([{ postId: 'bm-1', post: makePost('bm-1') }]);
    mockPostFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('viewer-1');

    expect((result.items[0] as any).isBookmarkedByMe).toBe(true);
  });

  it('getCommunityFeed sert isBookmarkedByMe et isRepostedByMe', async () => {
    mockPostFindMany
      .mockResolvedValueOnce([makePost('cf-1')])
      .mockResolvedValueOnce([]);
    mockPostBookmarkFindMany.mockResolvedValue([{ postId: 'cf-1' }]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', 'viewer-1');

    const item = result.items[0] as any;
    expect(item.isBookmarkedByMe).toBe(true);
    expect(item).toHaveProperty('isRepostedByMe', false);
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

  it('redirects currentUserReactions to the ROOT for a simple repost shown in a community', async () => {
    const repost = makePost('cp-repost', { isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostFindMany.mockResolvedValue([repost]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('root-1', '🔥')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getCommunityFeed('community-1', 'viewer-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['🔥']);
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

  it('redirects currentUserReactions to the ROOT for a bookmarked simple repost', async () => {
    const repost = makePost('bp-repost', { isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostBookmarkFindMany.mockResolvedValue([{ post: repost, createdAt: new Date(), id: 'bk-3' }]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('root-1', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
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

  it('redirects currentUserReactions to the ROOT for a simple repost in the reel viewer', async () => {
    const repost = makePost('reel-repost', { type: 'REEL', isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
    mockPostFindMany.mockResolvedValue([repost]);
    mockPostReactionFindMany.mockResolvedValue([makeReactionRow('root-1', '❤️')]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1');

    expect((result.items[0] as any).currentUserReactions).toEqual(['❤️']);
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

// ---------------------------------------------------------------------------
// Partage de position — hoist `metadata.location` → `location` top-level.
//
// Un test PAR SURFACE, délibérément séparé : une seule assertion générique
// sur « le feed » aurait laissé passer les cinq autres méthodes sans hoist
// (c'est exactement ainsi que ce trou est né — core.ts/comments.ts hissaient
// déjà la position, mais aucune des 8 surfaces de PostFeedService ne le
// faisait). Chaque test ci-dessous appelle une méthode DIFFÉRENTE.
// ---------------------------------------------------------------------------

const GEOTAG = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };

function makeGeotaggedPost(id: string, overrides: Record<string, unknown> = {}) {
  return makePost(id, { metadata: { location: GEOTAG }, ...overrides });
}

describe('PostFeedService — hoist de position par surface', () => {
  it('getFeed restitue `location` sur un post géolocalisé', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-feed-1')]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getFeed('user-1');

    expect((result.items[0] as any).location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
  });

  it('getStories (corps complet) restitue `location` sur une story géolocalisée', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-story-1', { type: 'STORY' })]);
    mockPostViewFindMany.mockResolvedValue([]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1');

    expect((result.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it('getReels restitue `location` sur un reel géolocalisé', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-reel-1', { type: 'REEL' })]);
    mockPostReactionFindMany.mockResolvedValue([]);
    mockPostBookmarkFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getReels('user-1');

    expect((result.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it('getStatuses restitue `location` sur un statut géolocalisé', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-status-1', { type: 'STATUS' })]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getStatuses('user-1');

    expect((result.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it('getDiscoverStatuses restitue `location` sur un statut public géolocalisé', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-discover-1', { type: 'STATUS', visibility: 'PUBLIC' })]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getDiscoverStatuses('user-1');

    expect((result.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it('getUserPosts restitue `location` (viewer anonyme ET authentifié)', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-userposts-1')]);

    const service = new PostFeedService(mockPrisma);
    const anonymous = await service.getUserPosts('author-1', undefined);
    expect((anonymous.items[0] as any).location).toMatchObject({ latitude: 48.8566 });

    mockPostReactionFindMany.mockResolvedValue([]);
    const authenticated = await service.getUserPosts('author-1', 'viewer-1');
    expect((authenticated.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it('getCommunityFeed restitue `location` (viewer anonyme ET authentifié)', async () => {
    mockPostFindMany.mockResolvedValue([makeGeotaggedPost('geo-community-1')]);

    const service = new PostFeedService(mockPrisma);
    const anonymous = await service.getCommunityFeed('community-1', undefined);
    expect((anonymous.items[0] as any).location).toMatchObject({ latitude: 48.8566 });

    mockPostReactionFindMany.mockResolvedValue([]);
    const authenticated = await service.getCommunityFeed('community-1', 'viewer-1');
    expect((authenticated.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it('getBookmarks restitue `location` sur un post geolocalise mis en favori', async () => {
    const post = makeGeotaggedPost('geo-bookmark-1');
    mockPostBookmarkFindMany.mockResolvedValue([{ post, createdAt: new Date(), id: 'bk-geo-1' }]);
    mockPostReactionFindMany.mockResolvedValue([]);

    const service = new PostFeedService(mockPrisma);
    const result = await service.getBookmarks('user-1');

    expect((result.items[0] as any).location).toMatchObject({ latitude: 48.8566 });
  });

  it("n'ajoute aucun champ `location` quand le post ne porte aucun lieu", () => {
    // Garde de non-régression : hoistLocationDeep ne doit rien inventer.
    const plain = makePost('plain-1');
    expect((plain as any).location).toBeUndefined();
  });
});
