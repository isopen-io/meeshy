/**
 * PostCommentService Unit Tests — Phase 1C
 *
 * Covers currentUserReactions enrichment added to getComments / getReplies.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import { encodeCursor } from '../../../routes/posts/types';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeComment = (id: string) => ({
  id,
  content: 'Hello',
  originalLanguage: 'fr',
  translations: [],
  likeCount: 0,
  replyCount: 0,
  reactionCount: 0,
  effectFlags: 0,
  parentId: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
});

const makeReactionRow = (commentId: string, emoji: string) => ({ commentId, emoji });

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

let mockPostCommentFindMany: jest.Mock;
let mockCommentReactionFindMany: jest.Mock;
let mockPrisma: Pick<PrismaClient, 'postComment' | 'commentReaction' | 'post'>;

beforeEach(() => {
  mockPostCommentFindMany = jest.fn();
  mockCommentReactionFindMany = jest.fn();

  mockPrisma = {
    postComment: {
      findMany: mockPostCommentFindMany,
      findFirst: jest.fn(),
      findUnique: jest.fn(),
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
    } as unknown as PrismaClient['postComment'],
    commentReaction: {
      findMany: mockCommentReactionFindMany,
      // Plafond des cinq réactions (2026-08-20) : `likeComment` consulte
      // `findFirst` (l'émoji est-il déjà posé ?) puis, si non, `count` (place
      // encore disponible ?) AVANT toute purge/upsert. Défauts « personne n'a
      // encore réagi » : les tests existants qui ne les redéfinissent pas
      // veulent une création normale, jamais un refus au plafond.
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateManyAndReturn: jest.fn(),
      fields: {} as any,
    } as unknown as PrismaClient['commentReaction'],
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
    } as unknown as PrismaClient['post'],
  } as unknown as PrismaClient;
});

// ---------------------------------------------------------------------------
// getComments — currentUserReactions enrichment
// ---------------------------------------------------------------------------

describe('PostCommentService.getComments', () => {
  it('returns currentUserReactions: [] when the user has not reacted to any comment', async () => {
    const comment = makeComment('c-1');
    mockPostCommentFindMany.mockResolvedValue([comment]);
    mockCommentReactionFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when the user reacted with that emoji', async () => {
    const comment = makeComment('c-2');
    mockPostCommentFindMany.mockResolvedValue([comment]);
    mockCommentReactionFindMany.mockResolvedValue([makeReactionRow('c-2', '❤️')]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️']);
  });

  it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
    const comment = makeComment('c-3');
    mockPostCommentFindMany.mockResolvedValue([comment]);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('c-3', '❤️'),
      makeReactionRow('c-3', '🔥'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️', '🔥']);
  });

  it('returns currentUserReactions: [] for all items when currentUserId is undefined (anonymous)', async () => {
    const comments = [makeComment('c-4'), makeComment('c-5')];
    mockPostCommentFindMany.mockResolvedValue(comments);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, undefined);

    for (const item of result.items) {
      expect(item.currentUserReactions).toEqual([]);
    }
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('does not call commentReaction.findMany when there are no comments', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    expect(result.items).toHaveLength(0);
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('correctly assigns reactions to different comments', async () => {
    const comments = [makeComment('c-6'), makeComment('c-7')];
    mockPostCommentFindMany.mockResolvedValue(comments);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('c-6', '👍'),
      makeReactionRow('c-7', '🔥'),
      makeReactionRow('c-7', '❤️'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getComments('post-1', undefined, 20, 'user-1');

    const c6 = result.items.find((i) => i.id === 'c-6');
    const c7 = result.items.find((i) => i.id === 'c-7');
    expect(c6?.currentUserReactions).toEqual(['👍']);
    expect(c7?.currentUserReactions).toEqual(['🔥', '❤️']);
  });
});

// ---------------------------------------------------------------------------
// getReplies — currentUserReactions enrichment (same five cases)
// ---------------------------------------------------------------------------

describe('PostCommentService.getReplies', () => {
  it('returns currentUserReactions: [] when the user has not reacted to any reply', async () => {
    const reply = makeComment('r-1');
    mockPostCommentFindMany.mockResolvedValue([reply]);
    mockCommentReactionFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual([]);
  });

  it('returns currentUserReactions: ["❤️"] when the user reacted with that emoji', async () => {
    const reply = makeComment('r-2');
    mockPostCommentFindMany.mockResolvedValue([reply]);
    mockCommentReactionFindMany.mockResolvedValue([makeReactionRow('r-2', '❤️')]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️']);
  });

  it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
    const reply = makeComment('r-3');
    mockPostCommentFindMany.mockResolvedValue([reply]);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('r-3', '❤️'),
      makeReactionRow('r-3', '🔥'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items[0].currentUserReactions).toEqual(['❤️', '🔥']);
  });

  it('returns currentUserReactions: [] for all items when currentUserId is undefined (anonymous)', async () => {
    const replies = [makeComment('r-4'), makeComment('r-5')];
    mockPostCommentFindMany.mockResolvedValue(replies);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, undefined);

    for (const item of result.items) {
      expect(item.currentUserReactions).toEqual([]);
    }
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('does not call commentReaction.findMany when there are no replies', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    expect(result.items).toHaveLength(0);
    expect(mockCommentReactionFindMany).not.toHaveBeenCalled();
  });

  it('correctly assigns reactions to different replies', async () => {
    const replies = [makeComment('r-6'), makeComment('r-7')];
    mockPostCommentFindMany.mockResolvedValue(replies);
    mockCommentReactionFindMany.mockResolvedValue([
      makeReactionRow('r-6', '👍'),
      makeReactionRow('r-7', '🔥'),
    ]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const result = await service.getReplies('parent-1', undefined, 20, 'user-1');

    const r6 = result.items.find((i) => i.id === 'r-6');
    const r7 = result.items.find((i) => i.id === 'r-7');
    expect(r6?.currentUserReactions).toEqual(['👍']);
    expect(r7?.currentUserReactions).toEqual(['🔥']);
  });
});

// ---------------------------------------------------------------------------
// getReplies — cursor advances forward (asc ordering)
//
// Regression: replies order ASCENDING but the cursor predicate used `lt`
// (descending semantics), so page 2 walked BACKWARD — re-yielding already-shown
// replies and permanently dropping the newer ones. The comparator must be `gt`.
// ---------------------------------------------------------------------------
describe('PostCommentService.getReplies — pagination', () => {
  it('sélectionne les réponses APRÈS le curseur (gt) pour un ordre ascendant', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const cursor = encodeCursor(new Date('2025-01-01T10:01:00Z'), 'r-2');
    await service.getReplies('parent-1', cursor, 2, 'user-1');

    const where = mockPostCommentFindMany.mock.calls[0][0].where;
    const orderBy = mockPostCommentFindMany.mock.calls[0][0].orderBy;

    // L'ordre est ascendant …
    expect(orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    // … donc le curseur DOIT avancer avec `gt`, jamais `lt`.
    const serialized = JSON.stringify(where.OR);
    expect(serialized).toContain('gt');
    expect(serialized).not.toContain('lt');
    expect(where.OR[0].createdAt.gt).toEqual(new Date('2025-01-01T10:01:00Z'));
    expect(where.OR[1].id.gt).toBe('r-2');
  });

  it('conserve le filtre parentId à côté du curseur', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const cursor = encodeCursor(new Date('2025-01-01T00:00:00Z'), 'r-1');
    await service.getReplies('parent-9', cursor, 20, 'user-1');

    const where = mockPostCommentFindMany.mock.calls[0][0].where;
    expect(where.parentId).toBe('parent-9');
    expect(Array.isArray(where.OR)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getComments — top-level filter survives pagination
//
// Regression: when a cursor was present, `where.OR = [cursor clauses]` clobbered
// the `OR: [{parentId:null},{parentId:{isSet:false}}]` top-level guard, so page
// 2+ leaked replies (parentId set) into the top-level comment list.
// ---------------------------------------------------------------------------
describe('PostCommentService.getComments — pagination', () => {
  it('garde le filtre parentId (niveau 1 only) même avec un curseur', async () => {
    mockPostCommentFindMany.mockResolvedValue([]);

    const service = new PostCommentService(mockPrisma as PrismaClient);
    const cursor = encodeCursor(new Date('2025-01-01T00:00:00Z'), 'c-1');
    await service.getComments('post-1', cursor, 20, 'user-1');

    const where = mockPostCommentFindMany.mock.calls[0][0].where;
    expect(where.postId).toBe('post-1');
    // Le filtre parentId DOIT survivre à la pagination (était écrasé par where.OR).
    expect(JSON.stringify(where.AND)).toContain('parentId');
    // Le curseur est une clause AND distincte, pas un remplacement.
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// addComment — single-media attachment (reuses PostMedia via commentId FK)
// ---------------------------------------------------------------------------

const noopTrackingLinks = {
  collectContentTrackingLinks: jest.fn().mockResolvedValue([]),
} as any;

const makePostMediaMock = () => ({
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
});

const buildPrismaForAdd = (postMedia: ReturnType<typeof makePostMediaMock>) => {
  const created = {
    id: 'c-new', content: 'hi', originalLanguage: 'fr', translations: null,
    likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null,
    createdAt: new Date('2025-01-01T00:00:00Z'), metadata: null,
    author: { id: 'a1', username: 'al', displayName: 'Al', avatar: null },
  };
  return {
    post: {
      findFirst: jest.fn().mockResolvedValue({ id: 'post-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue({}),
    },
    postMedia,
  } as unknown as PrismaClient;
};

// ---------------------------------------------------------------------------
// deleteComment — cascade & commentCount invariant
//
// Regression: deleting a top-level comment decremented commentCount by exactly 1
// and never touched its replies. Since addComment increments commentCount for
// EVERY comment (top-level + reply), a parent with N surviving replies left
// commentCount over-counted by N and orphaned those replies (invisible via
// getComments, and getReplies is never called for a deleted parent).
// ---------------------------------------------------------------------------

const buildPrismaForDelete = (
  target: { id: string; authorId: string; postId: string; parentId: string | null },
  subtree: Record<string, Array<{ id: string }>> = {},
) => {
  const findFirst = jest.fn().mockResolvedValue(target);
  const findMany = jest.fn().mockImplementation(async (args: any) => {
    const parents: string[] = args.where.parentId.in;
    return parents.flatMap((p) => subtree[p] ?? []);
  });
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const update = jest.fn().mockResolvedValue({});
  const postUpdate = jest.fn().mockResolvedValue({});
  // Le retrait des notifications produites par le commentaire lit par commande
  // brute (le lien vit dans deux chemins JSON, que Prisma ne sait pas filtrer
  // sur MongoDB). Défaut = fil vide : les cas de cascade ci-dessous portent sur
  // les compteurs et n'ont pas à se soucier de l'inbox.
  const runCommandRaw = jest.fn().mockResolvedValue({ cursor: { firstBatch: [] }, ok: 1 });
  const notificationDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    postComment: { findFirst, findMany, updateMany, update },
    post: { update: postUpdate },
    $runCommandRaw: runCommandRaw,
    notification: { deleteMany: notificationDeleteMany },
  } as unknown as PrismaClient;
  return { prisma, findMany, updateMany, update, postUpdate, runCommandRaw, notificationDeleteMany };
};

describe('PostCommentService.deleteComment', () => {
  it('returns null when the comment does not exist', async () => {
    const { prisma } = buildPrismaForDelete({ id: 'x', authorId: 'u1', postId: 'p1', parentId: null });
    (prisma.postComment.findFirst as jest.Mock).mockResolvedValue(null);

    const service = new PostCommentService(prisma);
    expect(await service.deleteComment('x', 'u1')).toBeNull();
  });

  it('throws FORBIDDEN when a non-author deletes the comment', async () => {
    const { prisma } = buildPrismaForDelete({ id: 'c1', authorId: 'owner', postId: 'p1', parentId: null });
    const service = new PostCommentService(prisma);
    await expect(service.deleteComment('c1', 'intruder')).rejects.toThrow('FORBIDDEN');
  });

  it('decrements commentCount by 1 for a leaf top-level comment', async () => {
    const { prisma, updateMany, postUpdate } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
    );
    const service = new PostCommentService(prisma);
    await service.deleteComment('c1', 'u1');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['c1'] } }, data: { deletedAt: expect.any(Date) } }),
    );
    expect(postUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { commentCount: { decrement: 1 } } }),
    );
  });

  it('cascades to surviving replies and decrements commentCount by 1 + reply count', async () => {
    const { prisma, updateMany, postUpdate } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
      { c1: [{ id: 'r1' }, { id: 'r2' }] },
    );
    const service = new PostCommentService(prisma);
    await service.deleteComment('c1', 'u1');

    const softDeleted = updateMany.mock.calls[0][0].where.id.in;
    expect(softDeleted.sort()).toEqual(['c1', 'r1', 'r2']);
    expect(postUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { commentCount: { decrement: 3 } } }),
    );
  });

  it('cascades through arbitrary-depth reply chains', async () => {
    const { prisma, updateMany, postUpdate } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
      { c1: [{ id: 'r1' }], r1: [{ id: 'r1a' }], r1a: [{ id: 'r1a1' }] },
    );
    const service = new PostCommentService(prisma);
    await service.deleteComment('c1', 'u1');

    const softDeleted = updateMany.mock.calls[0][0].where.id.in;
    expect(softDeleted.sort()).toEqual(['c1', 'r1', 'r1a', 'r1a1']);
    expect(postUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { commentCount: { decrement: 4 } } }),
    );
  });

  it("decrements the direct parent's replyCount by 1 when deleting a reply", async () => {
    const { prisma, update } = buildPrismaForDelete(
      { id: 'r1', authorId: 'u1', postId: 'p1', parentId: 'c1' },
    );
    const service = new PostCommentService(prisma);
    await service.deleteComment('r1', 'u1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { replyCount: { decrement: 1 } } }),
    );
  });

  // Le décrément ci-dessus ne touche que le parent DIRECT, et l'affordance
  // « N réponses » qui l'affiche ne se voit que fil REPLIÉ — donc quand la
  // cible n'est PAS dans le cache du client et ne peut pas livrer son propre
  // parent. Le rendre est la seule façon pour un client de refléter le
  // décrément.
  it("rend le parent direct de la cible pour que l'annonce puisse le porter", async () => {
    const { prisma } = buildPrismaForDelete(
      { id: 'r1', authorId: 'u1', postId: 'p1', parentId: 'c1' },
    );
    const service = new PostCommentService(prisma);
    const result = await service.deleteComment('r1', 'u1');

    expect(result?.parentId).toBe('c1');
  });

  it("rend parentId: null pour une cible racine — rien à décrémenter", async () => {
    const { prisma } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
    );
    const service = new PostCommentService(prisma);
    const result = await service.deleteComment('c1', 'u1');

    expect(result?.parentId).toBeNull();
  });

  it("does not touch replyCount when deleting a top-level comment", async () => {
    const { prisma, update } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
    );
    const service = new PostCommentService(prisma);
    await service.deleteComment('c1', 'u1');

    expect(update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteComment — les notifications que le commentaire a produites
//
// Sixième occurrence de la famille des cycles 46/47/48/50/51 : le retrait est
// DOUX (`deletedAt`), le lien vers la ligne vit dans un blob JSON, et la
// notification garde une copie DÉNORMALISÉE du contenu retiré (`content` =
// l'extrait du commentaire). Aucune cascade ne peut se déclencher, aucun filtre
// à la lecture ne peut rattraper : la ligne ne relit jamais le commentaire.
//
// Ce que ces témoins verrouillent, et que les compteurs ci-dessus ne voient
// pas : le retrait porte sur le SOUS-ARBRE ENTIER — même liste d'ids que le
// soft-delete — et il n'a pas le droit de transformer une suppression réussie
// en erreur.
// ---------------------------------------------------------------------------

describe('PostCommentService.deleteComment — retrait des notifications', () => {
  const announcer = { announceNotificationsRetracted: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    announcer.announceNotificationsRetracted.mockClear();
  });

  it('retire les notifications de TOUT le sous-arbre soft-deleté, pas seulement de la cible', async () => {
    const { prisma, runCommandRaw } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
      { c1: [{ id: 'r1' }], r1: [{ id: 'r1a' }] },
    );
    const service = new PostCommentService(prisma);

    await service.deleteComment('c1', 'u1', announcer);

    expect(runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        find: 'Notification',
        filter: {
          $or: [
            { 'context.commentId': { $in: ['c1', 'r1', 'r1a'] } },
            { 'metadata.commentId': { $in: ['c1', 'r1', 'r1a'] } },
          ],
        },
      }),
    );
  });

  it("n'annonce le retrait qu'APRÈS le soft-delete durable", async () => {
    const order: string[] = [];
    const { prisma, updateMany, runCommandRaw, notificationDeleteMany } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
    );
    updateMany.mockImplementation(async () => {
      order.push('soft-delete');
      return { count: 1 };
    });
    runCommandRaw.mockResolvedValue({
      cursor: { firstBatch: [{ _id: { $oid: 'n1' }, userId: { $oid: 'u9' } }] },
      ok: 1,
    });
    notificationDeleteMany.mockImplementation(async () => {
      order.push('retract');
      return { count: 1 };
    });
    const service = new PostCommentService(prisma);

    await service.deleteComment('c1', 'u1', announcer);

    expect(order).toEqual(['soft-delete', 'retract']);
    expect(announcer.announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n1', userId: 'u9' },
    ]);
  });

  /**
   * Best-effort DÉLIBÉRÉ, comme les quatre effets du retrait de post : quand le
   * retrait s'exécute, `deletedAt` est déjà committé. Une inbox récalcitrante ne
   * doit pas transformer une suppression réussie en 500 — le commentaire EST
   * retiré, c'est l'invariant qui compte pour la personne qui a cliqué.
   */
  it('rend la suppression réussie même si le retrait des notifications échoue', async () => {
    const { prisma, runCommandRaw } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
    );
    runCommandRaw.mockRejectedValue(new Error('mongo down'));
    const service = new PostCommentService(prisma);

    await expect(service.deleteComment('c1', 'u1', announcer)).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
  });

  it('ne retire rien quand la suppression est refusée', async () => {
    const { prisma, runCommandRaw } = buildPrismaForDelete(
      { id: 'c1', authorId: 'owner', postId: 'p1', parentId: null },
    );
    const service = new PostCommentService(prisma);

    await expect(service.deleteComment('c1', 'intruder', announcer)).rejects.toThrow('FORBIDDEN');
    expect(runCommandRaw).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteComment — ce que le retrait REND à son appelant
//
// Le soft-delete, le décompte et le retrait des notifications portent déjà sur
// le SOUS-ARBRE ENTIER (témoins ci-dessus). Mais la valeur de retour ne disait
// que « c'est fait » : la liste des ids réellement retirés mourait dans la
// méthode. Son seul appelant — la route DELETE — n'avait donc rien d'autre à
// annoncer que la cible, et les réponses survivaient à l'écran de tout client
// qui les avait dépliées (elles ne reviennent d'aucun refetch : `getComments`
// filtre `parentId: null`, et leur parent supprimé n'est plus rendu, donc
// `getReplies` n'est plus jamais appelé pour elles).
//
// Ces témoins verrouillent le CONTRAT : le retrait rend la même liste que celle
// qu'il a soft-deletée, cible en tête.
// ---------------------------------------------------------------------------

describe('PostCommentService.deleteComment — les ids retirés remontent à l\'appelant', () => {
  it('rend la cible seule quand elle n\'a aucune réponse', async () => {
    const { prisma } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
    );
    const service = new PostCommentService(prisma);

    await expect(service.deleteComment('c1', 'u1')).resolves.toEqual(
      expect.objectContaining({ deletedCommentIds: ['c1'] }),
    );
  });

  it('rend TOUT le sous-arbre retiré, pas seulement la cible', async () => {
    const { prisma } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
      { c1: [{ id: 'r1' }, { id: 'r2' }], r1: [{ id: 'r1a' }] },
    );
    const service = new PostCommentService(prisma);

    const result = await service.deleteComment('c1', 'u1');

    expect([...(result?.deletedCommentIds ?? [])].sort()).toEqual(['c1', 'r1', 'r1a', 'r2']);
  });

  /**
   * La liste rendue est la MÊME que celle passée au soft-delete — pas une
   * seconde dérivation qui pourrait s'en écarter en silence.
   */
  it('rend exactement la liste soft-deletée', async () => {
    const { prisma, updateMany } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p1', parentId: null },
      { c1: [{ id: 'r1' }], r1: [{ id: 'r1a' }] },
    );
    const service = new PostCommentService(prisma);

    const result = await service.deleteComment('c1', 'u1');

    expect(result?.deletedCommentIds).toEqual(updateMany.mock.calls[0][0].where.id.in);
  });

  /**
   * Le post du COMMENTAIRE remonte aussi, pour la même raison que la liste :
   * c'est la seule chose que l'appelant ne peut pas redériver sans une lecture
   * supplémentaire — après le soft-delete, `NOT_DELETED` masque la ligne. La
   * route DELETE n'avait donc, pour adresser son annonce, que le `:postId` du
   * chemin, que le client choisit. Le service, lui, tient déjà la vérité : il
   * s'en sert deux lignes plus haut pour décrémenter `commentCount`.
   */
  it('rend le post du COMMENTAIRE — la seule adresse possible de son annonce', async () => {
    const { prisma, postUpdate } = buildPrismaForDelete(
      { id: 'c1', authorId: 'u1', postId: 'p-racine', parentId: null },
    );
    const service = new PostCommentService(prisma);

    const result = await service.deleteComment('c1', 'u1');

    expect(result?.postId).toBe('p-racine');
    // Le même post que celui dont le compteur bouge : une seule vérité.
    expect(postUpdate.mock.calls[0][0].where.id).toBe('p-racine');
  });
});

describe('PostCommentService.addComment — media', () => {
  it('links the pending media to the new comment via commentId and returns it', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findUnique.mockResolvedValue({ id: 'm-1', postId: null, commentId: null });
    postMedia.updateMany.mockResolvedValue({ count: 1 });
    postMedia.findMany.mockResolvedValue([{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'http://x/m-1' }]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    const result: any = await service.addComment('post-1', 'a1', 'hi', undefined, 0, 'fr', 'm-1');

    // La condition est portée par l'ÉCRITURE et non par une lecture préalable :
    // la base tranche en une opération, donc deux commentaires concurrents ne
    // peuvent plus réclamer le même média tous les deux.
    const call = postMedia.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe('m-1');
    // Les deux formes MongoDB d'un média libre (null OU champ absent) —
    // cf. l'incident prod 2026-07-31→08-01 sur `commentId` absent.
    expect(call.where.AND).toEqual([
      { OR: [{ postId: null }, { postId: { isSet: false } }] },
      { OR: [{ commentId: null }, { commentId: { isSet: false } }] },
    ]);
    // Et la garde de propriété : l'auteur du commentaire, pas n'importe qui.
    expect(call.where.uploaderId).toBe('a1');
    expect(call.data).toEqual(expect.objectContaining({ commentId: 'c-new' }));
    expect(result.media).toHaveLength(1);
    expect(result.media[0].id).toBe('m-1');
  });

  it('persists the mobile transcription on the linked audio media', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findUnique.mockResolvedValue({ id: 'm-2', postId: null, commentId: null });
    postMedia.updateMany.mockResolvedValue({ count: 1 });
    postMedia.findMany.mockResolvedValue([{ id: 'm-2', mimeType: 'audio/mp4', fileUrl: 'http://x/m-2' }]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', '', undefined, 0, 'fr', 'm-2', {
      text: 'bonjour', language: 'fr', segments: [],
    } as any);

    const data = postMedia.updateMany.mock.calls[0][0].data;
    expect(data.commentId).toBe('c-new');
    expect(data.transcription).toEqual(expect.objectContaining({ text: 'bonjour', source: 'mobile' }));
  });

  it('throws MEDIA_NOT_AVAILABLE when the media is already linked', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findUnique.mockResolvedValue({ id: 'm-3', postId: 'other-post', commentId: null });
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await expect(service.addComment('post-1', 'a1', 'hi', undefined, 0, 'fr', 'm-3'))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// likeComment — max-1-reaction-per-user invariant (REST/socket parity)
// ---------------------------------------------------------------------------

describe('PostCommentService.likeComment', () => {
  const wireCounters = () => {
    (mockPrisma.commentReaction.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.postComment.update as jest.Mock).mockResolvedValue({
      id: 'c-1', postId: 'post-1', authorId: 'author-1', content: 'Hello',
      likeCount: 1, reactionSummary: {},
    });
  };

  it('returns null when the comment does not exist', async () => {
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PostCommentService(mockPrisma as PrismaClient, noopTrackingLinks);

    const result = await service.likeComment('missing', 'u-1', '❤️');

    expect(result).toBeNull();
    expect(mockPrisma.commentReaction.upsert as jest.Mock).not.toHaveBeenCalled();
  });

  // Ce témoin affirmait l'INVERSE, sous un nom qui invoquait la « parity with
  // socket » : il assérait la purge `emoji: { not }` alors que le chemin socket
  // EMPILE. Un témoin qui grave un défaut le rend indéboulonnable — la session
  // suivante lit une assertion verte et conclut que la règle est voulue.
  it('empile un second emoji sans toucher au premier — la VRAIE parité avec le socket', async () => {
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue({ id: 'c-1' });
    (mockPrisma.commentReaction.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.commentReaction.upsert as jest.Mock).mockResolvedValue({});
    wireCounters();
    const service = new PostCommentService(mockPrisma as PrismaClient, noopTrackingLinks);

    await service.likeComment('c-1', 'u-1', '👍');

    expect(mockPrisma.commentReaction.deleteMany as jest.Mock).not.toHaveBeenCalled();
    expect(mockPrisma.commentReaction.upsert as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { comment_user_reaction_unique: { commentId: 'c-1', userId: 'u-1', emoji: '👍' } },
        create: { commentId: 'c-1', userId: 'u-1', emoji: '👍' },
      }),
    );
  });

  it('stays idempotent for a repeated same-emoji like (safe REST fallback of the socket)', async () => {
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue({ id: 'c-1' });
    (mockPrisma.commentReaction.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.commentReaction.upsert as jest.Mock).mockResolvedValue({});
    wireCounters();
    const service = new PostCommentService(mockPrisma as PrismaClient, noopTrackingLinks);

    await service.likeComment('c-1', 'u-1', '❤️');

    expect(mockPrisma.commentReaction.deleteMany as jest.Mock).not.toHaveBeenCalled();
    expect(mockPrisma.commentReaction.upsert as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });
});

// ---------------------------------------------------------------------------
// updateComment — édition par l'auteur (contenu / effets visuels)
// ---------------------------------------------------------------------------

describe('PostCommentService.updateComment', () => {
  const COMMENT_ID = 'comment-edit-1';
  const AUTHOR_ID = 'author-1';

  const setupUpdate = () => {
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue({
      id: COMMENT_ID, postId: 'post-1', authorId: AUTHOR_ID, content: 'Ancien texte',
    });
    (mockPrisma.postComment.update as jest.Mock).mockResolvedValue({
      ...makeComment(COMMENT_ID), content: 'Nouveau texte',
    });
    (mockPrisma as any).postMedia = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    return new PostCommentService(mockPrisma as PrismaClient);
  };

  it('rejette EMPTY_CONTENT quand un commentaire texte est édité vers du blanc', async () => {
    const service = setupUpdate();

    await expect(service.updateComment(COMMENT_ID, AUTHOR_ID, { content: '   ' }))
      .rejects.toThrow('EMPTY_CONTENT');
    expect(mockPrisma.postComment.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('accepte un contenu blanc pour un commentaire à média (retrait de légende)', async () => {
    const service = setupUpdate();
    ((mockPrisma as any).postMedia.count as jest.Mock).mockResolvedValue(1);

    const result = await service.updateComment(COMMENT_ID, AUTHOR_ID, { content: '' });

    expect(result?.contentChanged).toBe(true);
    expect(mockPrisma.postComment.update as jest.Mock).toHaveBeenCalled();
  });

  it('marque isEdited et purge les traductions quand le contenu change', async () => {
    const service = setupUpdate();

    const result = await service.updateComment(COMMENT_ID, AUTHOR_ID, { content: 'Nouveau texte' });

    const data = (mockPrisma.postComment.update as jest.Mock).mock.calls[0][0].data;
    expect(data.isEdited).toBe(true);
    expect(data.content).toBe('Nouveau texte');
    // Les traductions stockées décrivent l'ANCIEN texte — les garder les
    // servirait indéfiniment (les gardes de cache bloquent la régénération).
    expect(data.translations).toEqual({});
    // La langue d'origine décrivait aussi l'ANCIEN texte : purge → le pipeline
    // de retraduction redétecte celle du nouveau contenu.
    expect(data.originalLanguage).toBeNull();
    expect(result?.contentChanged).toBe(true);
  });

  it('un changement d effets seuls conserve traductions, langue et isEdited', async () => {
    const service = setupUpdate();

    const result = await service.updateComment(COMMENT_ID, AUTHOR_ID, { effectFlags: 65536 });

    const data = (mockPrisma.postComment.update as jest.Mock).mock.calls[0][0].data;
    expect(data.effectFlags).toBe(65536);
    expect(data.translations).toBeUndefined();
    expect(data.originalLanguage).toBeUndefined();
    expect(data.isEdited).toBeUndefined();
    expect(result?.contentChanged).toBe(false);
  });

  it('un contenu identique ne purge pas les traductions ni ne marque isEdited', async () => {
    const service = setupUpdate();

    await service.updateComment(COMMENT_ID, AUTHOR_ID, { content: 'Ancien texte', effectFlags: 0 });

    const data = (mockPrisma.postComment.update as jest.Mock).mock.calls[0][0].data;
    expect(data.translations).toBeUndefined();
    expect(data.originalLanguage).toBeUndefined();
    expect(data.isEdited).toBeUndefined();
  });

  it('rejette un non-auteur avec FORBIDDEN', async () => {
    const service = setupUpdate();

    await expect(service.updateComment(COMMENT_ID, 'intruder', { content: 'Pirate' }))
      .rejects.toThrow('FORBIDDEN');
    expect(mockPrisma.postComment.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('retourne null pour un commentaire introuvable ou supprimé', async () => {
    const service = setupUpdate();
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.updateComment(COMMENT_ID, AUTHOR_ID, { content: 'x' })).resolves.toBeNull();
  });

  it('filtre le commentaire vivant par deletedAt NOT_DELETED (champ absent sur Mongo)', async () => {
    const service = setupUpdate();

    await service.updateComment(COMMENT_ID, AUTHOR_ID, { content: 'x' });

    const where = (mockPrisma.postComment.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ isSet: false });
  });
});

// ---------------------------------------------------------------------------
// getCommentAsUpdateResult — relecture au format updateComment (rejeu PATCH)
// ---------------------------------------------------------------------------

describe('PostCommentService.getCommentAsUpdateResult', () => {
  it('retourne author + media + postId au même format que updateComment', async () => {
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue({
      ...makeComment('comment-replay-1'),
      postId: 'post-1',
    });
    (mockPrisma as any).postMedia = {
      findMany: jest.fn().mockResolvedValue([{ id: 'media-1' }]),
    };
    const service = new PostCommentService(mockPrisma as PrismaClient);

    const result = await service.getCommentAsUpdateResult('comment-replay-1');

    expect(result?.postId).toBe('post-1');
    expect(result?.contentChanged).toBe(false);
    expect(result?.media).toEqual([{ id: 'media-1' }]);
    const query = (mockPrisma.postComment.findFirst as jest.Mock).mock.calls[0][0];
    expect(query.where.deletedAt).toEqual({ isSet: false });
    expect(query.select.author).toBeDefined();
    expect(query.select.isEdited).toBe(true);
  });

  it('retourne null pour un commentaire supprimé/introuvable', async () => {
    (mockPrisma.postComment.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PostCommentService(mockPrisma as PrismaClient);

    await expect(service.getCommentAsUpdateResult('gone')).resolves.toBeNull();
  });
});
