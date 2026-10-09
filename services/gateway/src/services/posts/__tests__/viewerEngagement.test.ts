/**
 * La liste des vues enrichie (#9727) — ce que chaque personne a fait sur UN
 * contenu, servi à l'auteur seul (et ADMIN/BIGBOSS), sans compteur à zéro, en
 * une lecture agrégée par source.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  BOOKMARKS_DISCLOSED_SINCE,
  engagementOf,
  mayReadViewerInteractions,
  readViewerInteractions,
  type ViewerEngagementPrisma,
} from '../viewerEngagement';

const POST = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd799439aaa';
const ANNA = '507f1f77bcf86cd799439a01';
const BRUNO = '507f1f77bcf86cd799439b02';

type Grouped<K extends string> = Record<K, string> & { _count: { _all: number } };

const viewRow = (id: string, minutes: number) => ({
  user: { id, username: id.slice(-3), displayName: `User ${id.slice(-3)}`, avatar: null },
  viewedAt: new Date(Date.UTC(2026, 9, 10, 12, minutes)),
});

const makePrisma = (opts: {
  post?: { id: string; authorId: string } | null;
  views?: ReturnType<typeof viewRow>[];
  total?: number;
  reactions?: Array<{ userId: string; emoji: string }>;
  shares?: Grouped<'createdBy'>[];
  reposts?: Grouped<'authorId'>[];
  comments?: Grouped<'authorId'>[];
  replies?: Grouped<'authorId'>[];
  bookmarks?: Array<{ userId: string }>;
} = {}) => {
  const views = opts.views ?? [viewRow(ANNA, 5), viewRow(BRUNO, 1)];
  const commentGroupBy = jest.fn<any>(async (args: { where: Record<string, unknown> }) =>
    'AND' in args.where ? opts.replies ?? [] : opts.comments ?? [],
  );
  const prisma = {
    post: {
      findFirst: jest.fn<any>(async () => (opts.post === undefined ? { id: POST, authorId: AUTHOR } : opts.post)),
      groupBy: jest.fn<any>(async () => opts.reposts ?? []),
    },
    postView: {
      findMany: jest.fn<any>(async () => views),
      count: jest.fn<any>(async () => opts.total ?? views.length),
    },
    postReaction: { findMany: jest.fn<any>(async () => opts.reactions ?? []) },
    trackingLink: { groupBy: jest.fn<any>(async () => opts.shares ?? []) },
    postComment: { groupBy: commentGroupBy },
    postBookmark: { findMany: jest.fn<any>(async () => opts.bookmarks ?? []) },
  };
  return prisma;
};

const read = (prisma: ReturnType<typeof makePrisma>, reader: { id: string; role?: string | null } = { id: AUTHOR }) =>
  readViewerInteractions(prisma as unknown as ViewerEngagementPrisma, POST, reader, 50, 0);

describe('la porte de la liste des vues enrichie', () => {
  it("l'auteur la lit", () => {
    expect(mayReadViewerInteractions(AUTHOR, { id: AUTHOR })).toBe(true);
  });

  it.each(['ADMIN', 'BIGBOSS', 'admin'])('un administrateur global (%s) la lit', (role) => {
    expect(mayReadViewerInteractions(AUTHOR, { id: ANNA, role })).toBe(true);
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST', 'USER', '', null, undefined])(
    'tout autre lecteur (%s) est refusé — fail-closed',
    (role) => {
      expect(mayReadViewerInteractions(AUTHOR, { id: ANNA, role })).toBe(false);
    },
  );

  it("un lecteur qui n'est pas l'auteur reçoit FORBIDDEN et aucune source n'est lue", async () => {
    const prisma = makePrisma();
    await expect(read(prisma, { id: ANNA, role: 'USER' })).rejects.toThrow('FORBIDDEN');
    expect(prisma.postView.findMany).not.toHaveBeenCalled();
    expect(prisma.postBookmark.findMany).not.toHaveBeenCalled();
    expect(prisma.postReaction.findMany).not.toHaveBeenCalled();
  });

  it('un contenu supprimé ou introuvable rend null', async () => {
    const prisma = makePrisma({ post: null });
    expect(await read(prisma)).toBeNull();
    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: POST, deletedAt: { isSet: false } } }),
    );
  });

  it('un ADMIN lit la liste d’un contenu dont il n’est pas l’auteur', async () => {
    const result = await read(makePrisma(), { id: ANNA, role: 'BIGBOSS' });
    expect(result?.viewers.map((v) => v.id)).toEqual([ANNA, BRUNO]);
  });
});

describe('ce que chaque personne a fait', () => {
  it('sert réactions, partages, republications, commentaires, réponses et favori par personne', async () => {
    const result = await read(
      makePrisma({
        reactions: [
          { userId: ANNA, emoji: '❤️' },
          { userId: ANNA, emoji: '😂' },
        ],
        shares: [{ createdBy: ANNA, _count: { _all: 1 } }],
        reposts: [{ authorId: ANNA, _count: { _all: 2 } }],
        comments: [{ authorId: ANNA, _count: { _all: 5 } }],
        replies: [{ authorId: ANNA, _count: { _all: 2 } }],
        bookmarks: [{ userId: ANNA }],
      }),
    );

    expect(result?.viewers[0]).toEqual({
      id: ANNA,
      username: 'a01',
      displayName: 'User a01',
      avatarUrl: null,
      viewedAt: new Date(Date.UTC(2026, 9, 10, 12, 5)),
      reaction: '😂',
      reactions: ['❤️', '😂'],
      shareCount: 1,
      repostCount: 2,
      commentCount: 3,
      replyCount: 2,
      bookmarked: true,
    });
  });

  it("une personne qui n'a rien fait ne porte aucun compteur — seulement reaction: null", async () => {
    const result = await read(makePrisma({ reactions: [{ userId: ANNA, emoji: '🔥' }] }));
    expect(result?.viewers[1]).toEqual({
      id: BRUNO,
      username: 'b02',
      displayName: 'User b02',
      avatarUrl: null,
      viewedAt: new Date(Date.UTC(2026, 9, 10, 12, 1)),
      reaction: null,
    });
  });

  it("des réponses seules ne fabriquent pas de commentaire de premier niveau", async () => {
    const result = await read(
      makePrisma({
        comments: [{ authorId: BRUNO, _count: { _all: 2 } }],
        replies: [{ authorId: BRUNO, _count: { _all: 2 } }],
      }),
    );
    expect(result?.viewers[1]).toEqual(expect.objectContaining({ replyCount: 2 }));
    expect(result?.viewers[1]).not.toHaveProperty('commentCount');
  });

  it("garde l'ordre et la pagination des vues", async () => {
    const prisma = makePrisma({ total: 120 });
    const result = await readViewerInteractions(prisma as unknown as ViewerEngagementPrisma, POST, { id: AUTHOR }, 2, 10);
    expect(prisma.postView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: POST }, orderBy: { viewedAt: 'desc' }, take: 2, skip: 10 }),
    );
    expect(result).toEqual(expect.objectContaining({ total: 120, hasMore: true }));
  });
});

describe('une lecture agrégée par source, jamais une requête par personne', () => {
  const sourceCalls = (prisma: ReturnType<typeof makePrisma>) =>
    prisma.postReaction.findMany.mock.calls.length +
    prisma.trackingLink.groupBy.mock.calls.length +
    prisma.post.groupBy.mock.calls.length +
    prisma.postComment.groupBy.mock.calls.length +
    prisma.postBookmark.findMany.mock.calls.length;

  it('six lectures, quelle que soit la taille de la page', async () => {
    const small = makePrisma({ views: [viewRow(ANNA, 1)] });
    const large = makePrisma({
      views: Array.from({ length: 40 }, (_, i) => viewRow(`507f1f77bcf86cd7994${String(i).padStart(5, '0')}`, i)),
    });
    await read(small);
    await read(large);
    expect(sourceCalls(small)).toBe(6);
    expect(sourceCalls(large)).toBe(6);
  });

  it('une page vide ne lit aucune source', async () => {
    const prisma = makePrisma({ views: [] });
    const result = await read(prisma);
    expect(result?.viewers).toEqual([]);
    expect(sourceCalls(prisma)).toBe(0);
  });

  it('chaque source est bornée au contenu ET aux personnes de la page', async () => {
    const prisma = makePrisma();
    await read(prisma);
    const ids = { in: [ANNA, BRUNO] };
    expect(prisma.postReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: POST, userId: ids } }),
    );
    expect(prisma.trackingLink.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['createdBy'], where: { targetId: POST, createdBy: ids } }),
    );
    expect(prisma.post.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['authorId'], where: { repostOfId: POST, authorId: ids, deletedAt: { isSet: false } } }),
    );
    expect(prisma.postComment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: POST, authorId: ids, deletedAt: { isSet: false } } }),
    );
    expect(prisma.postBookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: POST, userId: ids, createdAt: { gte: BOOKMARKS_DISCLOSED_SINCE } } }),
    );
  });

  it("un favori posé avant la mise en service n'est jamais demandé à la base", async () => {
    const prisma = makePrisma();
    await read(prisma);
    const where = (prisma.postBookmark.findMany.mock.calls[0][0] as { where: { createdAt: { gte: Date } } }).where;
    expect(where.createdAt.gte.getTime()).toBeGreaterThan(new Date('2026-10-09T00:00:00Z').getTime());
  });
});

describe('engagementOf — un compteur à zéro n’est pas servi', () => {
  it('rend un objet vide quand tout vaut zéro', () => {
    expect(engagementOf({ reactions: [], shares: 0, reposts: 0, comments: 0, replies: 0, bookmarked: false })).toEqual({});
  });

  it('ne garde que ce qui est positif', () => {
    expect(engagementOf({ reactions: ['👍'], shares: 0, reposts: 1, comments: 0, replies: 4, bookmarked: false })).toEqual({
      reactions: ['👍'],
      repostCount: 1,
      replyCount: 4,
    });
  });
});
