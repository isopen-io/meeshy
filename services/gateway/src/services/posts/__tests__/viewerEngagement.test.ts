/**
 * La liste des vues enrichie (#9727) — ce que chaque personne a fait sur UN
 * contenu, sans compteur à zéro, en une lecture agrégée par source. Décision
 * porteur 2026-10-09 : l'auteur d'une STORY (ou d'un statut) la lit ; celui
 * d'un POST ou d'un RÉEL n'en voit que les nombres. Un ADMIN/BIGBOSS la lit pour
 * tout contenu, et chacune de ses lectures laisse une ligne d'audit (#9733) —
 * sans trace écrite, pas de lecture.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  REPOSTS_INSPECTED_PER_PAGE,
  REPOSTS_INSPECTED_PER_PERSON,
  engagementOf,
  ADMIN_VIEWER_LIST_AUDIT_ACTION,
  readPostViews,
  readViewerEngagementPage,
  readViewerInteractions,
  viewerEngagementGates,
  viewerListAccess,
  type ViewerEngagementGates,
  type ViewerEngagementPrisma,
} from '../viewerEngagement';

const POST = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd799439aaa';
const ANNA = '507f1f77bcf86cd799439a01';
const BRUNO = '507f1f77bcf86cd799439b02';
const ADMIN_ID = '507f1f77bcf86cd799439ad1';
const ADMIN = { id: ADMIN_ID, role: 'ADMIN', ipAddress: '203.0.113.7', userAgent: 'console' } as const;

type Grouped<K extends string> = Record<K, string> & { _count: { _all: number } };

const viewRow = (id: string, minutes: number) => ({
  user: { id, username: id.slice(-3), displayName: `User ${id.slice(-3)}`, avatar: null },
  viewedAt: new Date(Date.UTC(2026, 9, 10, 12, minutes)),
});

const personId = (i: number) => `507f1f77bcf86cd7994${String(i).padStart(5, '0')}`;
const repostIds = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

const SINCE = new Date('2026-10-10T00:00:00.000Z');
const BEFORE = new Date(SINCE.getTime() - 60_000);
const AFTER = new Date(SINCE.getTime() + 60_000);

type DatedWhere = { where: { viewedAt?: { gte?: Date }; createdAt?: { gte?: Date } } };
const keptSince = (since: Date | undefined, at: Date) => since === undefined || at.getTime() >= since.getTime();

const makePrisma = (opts: {
  post?: { id: string; authorId: string; type?: string } | null;
  views?: ReturnType<typeof viewRow>[];
  total?: number;
  reactions?: Array<{ userId: string; emoji: string }>;
  shares?: Grouped<'createdBy'>[];
  datedShares?: Array<{ createdBy: string; createdAt: Date }>;
  datedViews?: Array<{ row: ReturnType<typeof viewRow>; at: Date }>;
  publicReposts?: Grouped<'authorId'>[];
  restrictedReposts?: Array<{ authorId: string; ids: string[] }>;
  restrictedRepostsFail?: boolean;
  comments?: Grouped<'authorId'>[];
  replies?: Grouped<'authorId'>[];
  bookmarks?: Array<{ userId: string }>;
  auditFails?: boolean;
} = {}) => {
  const views = opts.views ?? [viewRow(ANNA, 5), viewRow(BRUNO, 1)];
  // Les doubles de vues et de partages RESPECTENT la borne de date qu'on leur
  // demande, comme la base : une ligne antérieure n'en sort que si la requête
  // oublie de l'exclure.
  const viewsFor = (args: DatedWhere) =>
    opts.datedViews === undefined
      ? views
      : opts.datedViews.filter((v) => keptSince(args.where.viewedAt?.gte, v.at)).map((v) => v.row);
  const shareGroupBy = jest.fn<any>(async (args: DatedWhere) =>
    opts.datedShares === undefined
      ? opts.shares ?? []
      : Object.entries(
          opts.datedShares
            .filter((share) => keptSince(args.where.createdAt?.gte, share.createdAt))
            .reduce<Record<string, number>>((acc, share) => ({ ...acc, [share.createdBy]: (acc[share.createdBy] ?? 0) + 1 }), {}),
        ).map(([createdBy, count]) => ({ createdBy, _count: { _all: count } })),
  );
  const commentGroupBy = jest.fn<any>(async (args: { where: Record<string, unknown> }) =>
    'AND' in args.where ? opts.replies ?? [] : opts.comments ?? [],
  );
  // Un favori en base n'a aucune raison d'être lu : le double le sert quand
  // même, pour qu'une lecture oubliée se voie dans la réponse.
  const bookmarkFindMany = jest.fn<any>(async () => opts.bookmarks ?? []);
  return {
    post: {
      findFirst: jest.fn<any>(async () => (opts.post === undefined ? { id: POST, authorId: AUTHOR, type: 'POST' } : opts.post)),
      groupBy: jest.fn<any>(async () => opts.publicReposts ?? []),
      aggregateRaw: jest.fn<any>(async () => {
        if (opts.restrictedRepostsFail === true) throw new Error('agrégation indisponible');
        return (opts.restrictedReposts ?? []).map((row) => ({
          _id: { $oid: row.authorId },
          ids: row.ids.map((id) => ({ $oid: id })),
        }));
      }),
    },
    postView: {
      findMany: jest.fn<any>(async (args: DatedWhere) => viewsFor(args)),
      count: jest.fn<any>(async (args: DatedWhere) => opts.total ?? viewsFor(args).length),
    },
    postReaction: { findMany: jest.fn<any>(async () => opts.reactions ?? []) },
    trackingLink: { groupBy: shareGroupBy },
    postComment: { groupBy: commentGroupBy },
    postBookmark: { findMany: bookmarkFindMany },
    adminAuditLog: {
      create: jest.fn<any>(async () => {
        if (opts.auditFails === true) throw new Error('journal indisponible');
        return { id: 'audit-1' };
      }),
    },
  };
};

const openGates = (opts: { visibleReposts?: readonly string[]; blocked?: readonly string[] } = {}): ViewerEngagementGates => ({
  consumablePostIds: jest.fn(async (ids: readonly string[]) =>
    new Set(opts.visibleReposts ?? ids)) as ViewerEngagementGates['consumablePostIds'],
  blockRelatedIds: jest.fn(async () => new Set(opts.blocked ?? [])) as ViewerEngagementGates['blockRelatedIds'],
});

const read = (
  prisma: ReturnType<typeof makePrisma>,
  reader: { id: string; role?: string | null } = ADMIN,
  gates: ViewerEngagementGates = openGates(),
) => readViewerInteractions(prisma as unknown as ViewerEngagementPrisma, POST, reader, 50, 0, gates, SINCE);

const inspectedReposts = (gates: ViewerEngagementGates): readonly string[] =>
  ((gates.consumablePostIds as jest.Mock).mock.calls[0]?.[0] as readonly string[] | undefined) ?? [];

describe('qui lit la liste des vues (décision porteur 2026-10-09)', () => {
  const author = (type: string | null) => ({ authorId: AUTHOR, type });

  it.each(['STORY', 'STATUS'])("l'auteur d'un %s la lit, sans trace d'audit — même s'il est ADMIN", (type) => {
    expect(viewerListAccess(author(type), { id: AUTHOR, role: 'USER' })).toBe('author');
    expect(viewerListAccess(author(type), { id: AUTHOR, role: 'ADMIN' })).toBe('author');
  });

  it.each(['POST', 'REEL', 'ARTICLE', null])(
    "l'auteur d'un %s n'en voit que les nombres : la liste lui est refusée",
    (type) => {
      expect(viewerListAccess(author(type), { id: AUTHOR, role: 'USER' })).toBe('denied');
      expect(viewerListAccess(author(type), { id: AUTHOR, role: 'MODERATOR' })).toBe('denied');
    },
  );

  it.each([
    ['ADMIN', 'POST'],
    ['BIGBOSS', 'REEL'],
    ['admin', 'STORY'],
    ['BIGBOSS', null],
  ])('un %s la lit pour un %s, par son rôle — donc avec trace', (role, type) => {
    expect(viewerListAccess(author(type), { id: ADMIN_ID, role })).toBe('admin');
  });

  it("un ADMIN auteur d'un post la lit par son RÔLE, pas comme auteur : la lecture se trace", () => {
    expect(viewerListAccess(author('POST'), { id: AUTHOR, role: 'ADMIN' })).toBe('admin');
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST', 'AGENT', 'SUPERUSER', 'USER', '', null, undefined])(
    "un lecteur %s qui n'est pas l'auteur est refusé, quel que soit le contenu",
    (role) => {
      expect(viewerListAccess(author('STORY'), { id: ANNA, role })).toBe('denied');
      expect(viewerListAccess(author('POST'), { id: ANNA, role })).toBe('denied');
    },
  );

  it('un contenu supprimé ou introuvable rend null, sans trace', async () => {
    const prisma = makePrisma({ post: null });
    expect(await read(prisma)).toBeNull();
    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: POST, deletedAt: { isSet: false } } }),
    );
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe.each([
  ['GET /posts/:postId/interactions', 'interactions'],
  ['GET /posts/:postId/views', 'views'],
] as const)('%s — la porte et sa trace', (_, route) => {
  const readList = (prisma: ReturnType<typeof makePrisma>, reader: { id: string; role?: string | null }) =>
    route === 'interactions'
      ? readViewerInteractions(prisma as unknown as ViewerEngagementPrisma, POST, reader, 50, 0, openGates(), SINCE)
      : readPostViews(prisma as unknown as ViewerEngagementPrisma, POST, reader, 50, 0, SINCE);
  const rows = (result: Awaited<ReturnType<typeof readList>>): readonly unknown[] =>
    result === null ? [] : 'viewers' in result ? result.viewers : result.items;

  it.each(['POST', 'REEL'])("l'auteur d'un %s reçoit FORBIDDEN : rien n'est lu, rien n'est tracé", async (type) => {
    const prisma = makePrisma({ post: { id: POST, authorId: AUTHOR, type } });
    await expect(readList(prisma, { id: AUTHOR, role: 'USER' })).rejects.toThrow('FORBIDDEN');
    expect(prisma.postView.findMany).not.toHaveBeenCalled();
    expect(prisma.postView.count).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("un MODERATOR reçoit FORBIDDEN sur un post : rien n'est lu, rien n'est tracé", async () => {
    const prisma = makePrisma();
    await expect(readList(prisma, { id: ANNA, role: 'MODERATOR' })).rejects.toThrow('FORBIDDEN');
    expect(prisma.postView.findMany).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'BIGBOSS'])(
    "un %s lit la liste d'un post, et UNE ligne d'audit est écrite AVANT toute lecture",
    async (role) => {
      const prisma = makePrisma({ post: { id: POST, authorId: AUTHOR, type: 'POST' } });
      const result = await readList(prisma, { ...ADMIN, role });
      expect(rows(result)).toHaveLength(2);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
      const data = (prisma.adminAuditLog.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(data).toEqual(
        expect.objectContaining({
          userId: AUTHOR,
          adminId: ADMIN_ID,
          action: ADMIN_VIEWER_LIST_AUDIT_ACTION,
          entity: 'Post',
          entityId: POST,
          ipAddress: '203.0.113.7',
          userAgent: 'console',
        }),
      );
      expect(JSON.parse(String(data.metadata))).toEqual({ type: 'POST', list: route, limit: 50, offset: 0 });
      expect(prisma.adminAuditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.postView.findMany.mock.invocationCallOrder[0],
      );
    },
  );

  it("l'auteur d'une story la lit, sans trace d'audit", async () => {
    const prisma = makePrisma({ post: { id: POST, authorId: AUTHOR, type: 'STORY' } });
    const result = await readList(prisma, { id: AUTHOR, role: 'USER' });
    expect(rows(result)).toHaveLength(2);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("un ADMIN qui lit la liste d'une story laisse sa trace", async () => {
    const prisma = makePrisma({ post: { id: POST, authorId: AUTHOR, type: 'STORY' } });
    const result = await readList(prisma, ADMIN);
    expect(rows(result)).toHaveLength(2);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: AUTHOR, adminId: ADMIN_ID, entityId: POST }) }),
    );
  });

  it("une trace qui ne s'écrit pas REFUSE la lecture administrateur : rien n'est servi sans trace", async () => {
    const prisma = makePrisma({ auditFails: true });
    await expect(readList(prisma, ADMIN)).rejects.toThrow('AUDIT_UNAVAILABLE');
    expect(prisma.postView.findMany).not.toHaveBeenCalled();
    expect(prisma.postView.count).not.toHaveBeenCalled();
  });
});

describe('ce que chaque personne a fait', () => {
  it('sert réactions, partages, republications, commentaires et réponses par personne', async () => {
    const result = await read(
      makePrisma({
        reactions: [
          { userId: ANNA, emoji: '❤️' },
          { userId: ANNA, emoji: '😂' },
        ],
        shares: [{ createdBy: ANNA, _count: { _all: 1 } }],
        publicReposts: [{ authorId: ANNA, _count: { _all: 1 } }],
        restrictedReposts: [{ authorId: ANNA, ids: ['rp-amis'] }],
        comments: [{ authorId: ANNA, _count: { _all: 5 } }],
        replies: [{ authorId: ANNA, _count: { _all: 2 } }],
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
    const result = await readViewerInteractions(prisma as unknown as ViewerEngagementPrisma, POST, ADMIN, 2, 10, openGates(), SINCE);
    expect(prisma.postView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: POST, viewedAt: { gte: SINCE } }, orderBy: { viewedAt: 'desc' }, take: 2, skip: 10 }),
    );
    expect(result).toEqual(expect.objectContaining({ total: 120, hasMore: true }));
  });

  it("une page dont le détail est servi ne porte pas d'indicateur d'indisponibilité", async () => {
    const result = await read(makePrisma({ reactions: [{ userId: ANNA, emoji: '❤️' }] }));
    expect(result).not.toHaveProperty('engagement');
  });
});

describe('une lecture agrégée par source, jamais une requête par personne', () => {
  const sourceCalls = (prisma: ReturnType<typeof makePrisma>) =>
    prisma.postReaction.findMany.mock.calls.length +
    prisma.trackingLink.groupBy.mock.calls.length +
    prisma.post.groupBy.mock.calls.length +
    prisma.post.aggregateRaw.mock.calls.length +
    prisma.postComment.groupBy.mock.calls.length;

  it('six lectures, quelle que soit la taille de la page', async () => {
    const small = makePrisma({ views: [viewRow(ANNA, 1)] });
    const large = makePrisma({ views: Array.from({ length: 40 }, (_, i) => viewRow(personId(i), i)) });
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
      expect.objectContaining({ by: ['createdBy'], where: { targetId: POST, createdBy: ids, createdAt: { gte: SINCE } } }),
    );
    expect(prisma.post.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['authorId'],
        where: { repostOfId: POST, authorId: ids, deletedAt: { isSet: false }, visibility: 'PUBLIC' },
      }),
    );
    const pipeline = (prisma.post.aggregateRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> }).pipeline;
    expect(pipeline[0]).toEqual({
      $match: {
        repostOfId: { $oid: POST },
        authorId: { $in: [{ $oid: ANNA }, { $oid: BRUNO }] },
        visibility: { $ne: 'PUBLIC' },
        deletedAt: { $exists: false },
      },
    });
    expect(prisma.postComment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: POST, authorId: ids, deletedAt: { isSet: false } } }),
    );
  });
});

describe('le favori ne se montre jamais (décision porteur 2026-10-09)', () => {
  it("la base a beau en porter, aucune ligne ne sort avec 'bookmarked' et la table n'est pas lue", async () => {
    const prisma = makePrisma({
      reactions: [{ userId: ANNA, emoji: '❤️' }],
      bookmarks: [{ userId: ANNA }, { userId: BRUNO }],
    });
    const result = await read(prisma);
    expect(result?.viewers).toHaveLength(2);
    expect(result?.viewers.some((viewer) => 'bookmarked' in viewer)).toBe(false);
    expect(prisma.postBookmark.findMany).not.toHaveBeenCalled();
  });

  it('le module de la liste des vues ne cite pas la table des favoris', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'viewerEngagement.ts'), 'utf8');
    expect(source).not.toMatch(/postBookmark|bookmarked/);
  });
});

describe('« seulement à partir de maintenant » pour les posts et les réels (décision porteur 2026-10-09)', () => {
  const datedViews = [
    { row: viewRow(ANNA, 5), at: AFTER },
    { row: viewRow(BRUNO, 1), at: BEFORE },
  ];
  const datedShares = [
    { createdBy: ANNA, createdAt: BEFORE },
    { createdBy: ANNA, createdAt: AFTER },
  ];

  it.each(['POST', 'REEL'])(
    "un %s ne montre ni la vue ni le partage par lien antérieurs, et son total ne les compte pas",
    async (type) => {
      const prisma = makePrisma({ post: { id: POST, authorId: AUTHOR, type }, datedViews, datedShares });
      const result = await read(prisma);
      expect(result?.viewers.map((viewer) => viewer.id)).toEqual([ANNA]);
      expect(result?.viewers[0]).toEqual(expect.objectContaining({ shareCount: 1 }));
      expect(result).toEqual(expect.objectContaining({ total: 1, hasMore: false }));
      expect(prisma.postView.count).toHaveBeenCalledWith({ where: { postId: POST, viewedAt: { gte: SINCE } } });
    },
  );

  it.each(['STORY', 'STATUS'])('un %s garde tout son historique — vues, partages et total', async (type) => {
    const prisma = makePrisma({ post: { id: POST, authorId: AUTHOR, type }, datedViews, datedShares });
    const result = await read(prisma);
    expect(result?.viewers.map((viewer) => viewer.id)).toEqual([ANNA, BRUNO]);
    expect(result?.viewers[0]).toEqual(expect.objectContaining({ shareCount: 2 }));
    expect(result).toEqual(expect.objectContaining({ total: 2 }));
    expect(prisma.postView.count).toHaveBeenCalledWith({ where: { postId: POST } });
  });

  it("le type du contenu est lu avec sa porte", async () => {
    const prisma = makePrisma();
    await read(prisma);
    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, authorId: true, type: true } }),
    );
  });

  it("une date illisible (repli FUTUR) ne montre rien d'antérieur sur un post", async () => {
    const prisma = makePrisma({ datedViews, datedShares });
    const result = await readViewerInteractions(
      prisma as unknown as ViewerEngagementPrisma,
      POST,
      ADMIN,
      50,
      0,
      openGates(),
      new Date('9999-12-31T23:59:59.999Z'),
    );
    expect(result?.viewers).toEqual([]);
    expect(result?.total).toBe(0);
  });

  it("l'ancienne liste « Vu par » applique la même borne, total compris", async () => {
    const post = makePrisma({ post: { id: POST, authorId: AUTHOR, type: 'REEL' }, datedViews });
    const postViews = await readPostViews(post as unknown as ViewerEngagementPrisma, POST, ADMIN, 50, 0, SINCE);
    expect(postViews?.items).toHaveLength(1);
    expect(postViews?.total).toBe(1);

    const story = makePrisma({ post: { id: POST, authorId: AUTHOR, type: 'STORY' }, datedViews });
    const storyViews = await readPostViews(story as unknown as ViewerEngagementPrisma, POST, { id: AUTHOR }, 50, 0, SINCE);
    expect(storyViews?.items).toHaveLength(2);
    expect(storyViews?.total).toBe(2);
  });

});

describe("ce que l'auteur a le droit de voir de l'activité d'autrui (revue de sécurité)", () => {
  it("une republication PUBLIQUE se compte en base : elle ne coûte aucune lecture d'ACL", async () => {
    const gates = openGates();
    const result = await read(makePrisma({ publicReposts: [{ authorId: ANNA, _count: { _all: 3 } }] }), ADMIN, gates);
    expect(result?.viewers[0]).toEqual(expect.objectContaining({ repostCount: 3 }));
    expect(gates.consumablePostIds).not.toHaveBeenCalled();
  });

  it("une republication restreinte que l'auteur ne peut pas lire n'est pas comptée — son existence ne fuit pas", async () => {
    const gates = openGates({ visibleReposts: ['rp-ok'] });
    const result = await read(
      makePrisma({
        restrictedReposts: [
          { authorId: ANNA, ids: ['rp-ok', 'rp-amis'] },
          { authorId: BRUNO, ids: ['rp-restreint'] },
        ],
      }),
      ADMIN,
      gates,
    );
    expect([...inspectedReposts(gates)].sort()).toEqual(['rp-amis', 'rp-ok', 'rp-restreint']);
    expect(result?.viewers[0]).toEqual(expect.objectContaining({ repostCount: 1 }));
    expect(result?.viewers[1]).not.toHaveProperty('repostCount');
  });

  it("les republications restreintes sont BORNÉES PAR PERSONNE : cent d'Anna n'effacent pas celle de Bruno", async () => {
    const gates = openGates();
    const prisma = makePrisma({
      restrictedReposts: [
        { authorId: ANNA, ids: repostIds('anna', 100) },
        { authorId: BRUNO, ids: ['bruno-0'] },
      ],
    });
    const result = await read(prisma, ADMIN, gates);
    const inspected = inspectedReposts(gates);
    expect(inspected.filter((id) => id.startsWith('anna-'))).toHaveLength(REPOSTS_INSPECTED_PER_PERSON);
    expect(inspected).toContain('bruno-0');
    expect(result?.viewers[1]).toEqual(expect.objectContaining({ id: BRUNO, repostCount: 1 }));
    expect(result?.viewers[0]).toEqual(expect.objectContaining({ id: ANNA, repostCount: REPOSTS_INSPECTED_PER_PERSON }));
    const pipeline = (prisma.post.aggregateRaw.mock.calls[0][0] as { pipeline: Array<Record<string, unknown>> }).pipeline;
    expect(pipeline).toContainEqual({ $sort: { createdAt: -1 } });
    expect(pipeline).toContainEqual({
      $group: { _id: '$authorId', ids: { $firstN: { input: '$_id', n: REPOSTS_INSPECTED_PER_PERSON } } },
    });
  });

  it('et BORNÉES AU TOTAL, chaque personne gardant sa part : quarante personnes à dix chacune', async () => {
    const people = Array.from({ length: 40 }, (_, i) => personId(i));
    const gates = openGates();
    await read(
      makePrisma({
        views: people.map((id, i) => viewRow(id, i)),
        restrictedReposts: people.map((id) => ({ authorId: id, ids: repostIds(id, REPOSTS_INSPECTED_PER_PERSON) })),
      }),
      ADMIN,
      gates,
    );
    const inspected = inspectedReposts(gates);
    expect(inspected).toHaveLength(REPOSTS_INSPECTED_PER_PAGE);
    expect(people.every((id) => inspected.some((repost) => repost.startsWith(`${id}-`)))).toBe(true);
  });

  it("une personne en relation de blocage reste dans la liste, sans rien de ce qu'elle a fait, et ses sources ne sont pas lues", async () => {
    const prisma = makePrisma({
      reactions: [{ userId: BRUNO, emoji: '🔥' }],
      comments: [{ authorId: BRUNO, _count: { _all: 3 } }],
    });
    const result = await read(prisma, ADMIN, openGates({ blocked: [BRUNO] }));
    expect(result?.viewers.map((v) => v.id)).toEqual([ANNA, BRUNO]);
    expect(result?.viewers[1]).toEqual(expect.objectContaining({ id: BRUNO, reaction: null }));
    expect(result?.viewers[1]).not.toHaveProperty('commentCount');
    expect(prisma.postComment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ authorId: { in: [ANNA] } }) }),
    );
  });

  it("les filtres de blocage et de visibilité sont calculés pour l'AUTEUR du contenu, jamais pour qui demande la page", async () => {
    const gates = openGates();
    await readViewerEngagementPage(
      makePrisma({ restrictedReposts: [{ authorId: ANNA, ids: ['rp-1'] }] }) as unknown as ViewerEngagementPrisma,
      { id: POST, authorId: AUTHOR, type: 'POST' },
      50,
      0,
      gates,
      SINCE,
    );
    expect(gates.blockRelatedIds).toHaveBeenCalledWith(AUTHOR, [ANNA, BRUNO]);
    expect(gates.consumablePostIds).toHaveBeenCalledWith(['rp-1'], AUTHOR);
  });

  it("une garde qui ne conclut pas ferme : la page part SANS aucun engagement, et le DIT", async () => {
    const failing: ViewerEngagementGates = {
      consumablePostIds: jest.fn(async () => new Set<string>()) as ViewerEngagementGates['consumablePostIds'],
      blockRelatedIds: jest.fn(async () => {
        throw new Error('base indisponible');
      }) as ViewerEngagementGates['blockRelatedIds'],
    };
    const result = await read(
      makePrisma({ reactions: [{ userId: ANNA, emoji: '❤️' }] }),
      ADMIN,
      failing,
    );
    expect(result?.viewers.map((v) => v.id)).toEqual([ANNA, BRUNO]);
    expect(result?.viewers.every((v) => v.reaction === null && !('reactions' in v))).toBe(true);
    expect(result?.engagement).toBe('unavailable');
  });

  it.each([
    ['la garde de consommation lève', { gateFails: true, aggregateFails: false }],
    ["l'agrégation des republications restreintes lève", { gateFails: false, aggregateFails: true }],
  ])("%s : seules les republications restreintes sont retirées, le reste de la page est servi", async (_, failure) => {
    const gates: ViewerEngagementGates = {
      consumablePostIds: jest.fn(async (ids: readonly string[]) => {
        if (failure.gateFails) throw new Error('trop de lectures');
        return new Set(ids);
      }) as ViewerEngagementGates['consumablePostIds'],
      blockRelatedIds: jest.fn(async () => new Set<string>()) as ViewerEngagementGates['blockRelatedIds'],
    };
    const result = await read(
      makePrisma({
        reactions: [{ userId: ANNA, emoji: '❤️' }],
        publicReposts: [{ authorId: BRUNO, _count: { _all: 2 } }],
        restrictedReposts: [{ authorId: ANNA, ids: ['rp-1'] }],
        restrictedRepostsFail: failure.aggregateFails,
      }),
      ADMIN,
      gates,
    );
    expect(result?.viewers[0]).toEqual(expect.objectContaining({ reaction: '❤️', reactions: ['❤️'] }));
    expect(result?.viewers[0]).not.toHaveProperty('repostCount');
    expect(result?.viewers[1]).toEqual(expect.objectContaining({ repostCount: 2 }));
    expect(result).not.toHaveProperty('engagement');
  });

  it('les gardes par défaut lisent le blocage dans les DEUX sens', async () => {
    const prisma = {
      user: {
        findMany: jest.fn<any>(async () => [{ id: ANNA }]),
        findUnique: jest.fn<any>(async () => ({ blockedUserIds: [BRUNO] })),
      },
    };
    const blocked = await viewerEngagementGates(prisma as unknown as ViewerEngagementPrisma).blockRelatedIds(AUTHOR, [
      ANNA,
      BRUNO,
      '507f1f77bcf86cd799439c03',
    ]);
    expect([...blocked].sort()).toEqual([ANNA, BRUNO].sort());
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [ANNA, BRUNO, '507f1f77bcf86cd799439c03'] }, blockedUserIds: { has: AUTHOR } } }),
    );
  });
});

describe('engagementOf — un compteur à zéro n’est pas servi', () => {
  it('rend un objet vide quand tout vaut zéro', () => {
    expect(engagementOf({ reactions: [], shares: 0, reposts: 0, comments: 0, replies: 0 })).toEqual({});
  });

  it('ne garde que ce qui est positif', () => {
    expect(engagementOf({ reactions: ['👍'], shares: 0, reposts: 1, comments: 0, replies: 4 })).toEqual({
      reactions: ['👍'],
      repostCount: 1,
      replyCount: 4,
    });
  });
});
