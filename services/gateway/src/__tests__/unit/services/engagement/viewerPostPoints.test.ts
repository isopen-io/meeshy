/**
 * Ce qu'un post a rapporté à son lecteur (#9569) — la LECTURE.
 *
 * Trois propriétés, et chacune se prouve sur la REQUÊTE autant que sur le
 * rendu : une page coûte une lecture du cumul quel que soit son nombre de
 * posts ; chaque lecture est bornée au lecteur ; un lecteur sans compte n'en
 * coûte aucune et ne reçoit pas le champ.
 *
 * Le double HONORE les filtres qu'il reçoit et REFUSE ceux qu'il ne sait pas
 * lire : un double qui approuve tout rendrait les lignes d'un autre lecteur
 * sans qu'aucun témoin ne rougisse.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  PUBLICATION_OPERATIONS,
  creditLivesInPublicationMemory,
  loadViewerPostPoints,
  loadViewerPostPointsOrNone,
  withViewerPoints,
} from '../../../../services/engagement/viewerPostPoints';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const VIEWER = '68a000000000000000000021';
const SOMEONE = '68a000000000000000000022';
const postId = (n: number) => `68c0000000000000000002${String(n).padStart(2, '0')}`;

type PointsRow = { readonly userId: string; readonly postId: string; readonly totalPoints: number };
type MemoryRow = { readonly userId: string; readonly operationKey: string; readonly bucket: string; readonly points: number };

const inList = (filter: unknown, value: string): boolean => {
  if (typeof filter === 'string') return filter === value;
  if (typeof filter === 'object' && filter !== null && Array.isArray((filter as { in?: unknown }).in)) {
    return ((filter as { in: string[] }).in).includes(value);
  }
  throw new Error(`double Prisma : filtre non interprété ${JSON.stringify(filter)}`);
};

const onlyKeys = (where: Record<string, unknown>, allowed: readonly string[]): void => {
  const unknown = Object.keys(where).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`double Prisma : clés de where non interprétées ${unknown.join(', ')}`);
};

function doublePrisma(state: { readonly points?: readonly PointsRow[]; readonly memory?: readonly MemoryRow[] } = {}) {
  const engagementPostPoints = {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      onlyKeys(where, ['userId', 'postId']);
      if (typeof where.userId !== 'string') throw new Error('double Prisma : lecture du cumul sans lecteur');
      return (state.points ?? []).filter((row) => row.userId === where.userId && inList(where.postId, row.postId));
    }),
  };
  const engagementQuota = {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      onlyKeys(where, ['userId', 'operationKey', 'bucket']);
      if (typeof where.userId !== 'string') throw new Error('double Prisma : lecture de la mémoire sans lecteur');
      return (state.memory ?? []).filter(
        (row) => row.userId === where.userId && inList(where.operationKey, row.operationKey) && inList(where.bucket, row.bucket),
      );
    }),
  };
  return { engagementPostPoints, engagementQuota };
}

const page = (count: number, authorId: string = SOMEONE) =>
  Array.from({ length: count }, (_unused, n) => ({ id: postId(n), authorId }));

describe('une page de fil', () => {
  it('coûte UNE lecture du cumul, quel que soit le nombre de posts', async () => {
    const prisma = doublePrisma();

    await loadViewerPostPoints(prisma as never, VIEWER, page(20));

    expect(prisma.engagementPostPoints.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.engagementPostPoints.findMany.mock.calls[0]?.[0].where).toEqual({
      userId: VIEWER,
      postId: { in: page(20).map((post) => post.id) },
    });
  });

  it('ne lit pas la mémoire de publication quand aucun post n’est du lecteur', async () => {
    const prisma = doublePrisma();

    await loadViewerPostPoints(prisma as never, VIEWER, page(20));

    expect(prisma.engagementQuota.findMany).not.toHaveBeenCalled();
  });

  it('lit la mémoire de publication UNE fois, pour les seuls posts du lecteur', async () => {
    const prisma = doublePrisma();
    const mine = [{ id: postId(40), authorId: VIEWER }, { id: postId(41), authorId: VIEWER }];

    await loadViewerPostPoints(prisma as never, VIEWER, [...page(18), ...mine]);

    expect(prisma.engagementQuota.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.engagementQuota.findMany.mock.calls[0]?.[0].where).toEqual({
      userId: VIEWER,
      operationKey: { in: [...PUBLICATION_OPERATIONS] },
      bucket: { in: mine.map((post) => `content:${post.id}`) },
    });
  });

  it('ne coûte aucune lecture quand elle est vide', async () => {
    const prisma = doublePrisma();

    expect(await loadViewerPostPoints(prisma as never, VIEWER, [])).toEqual(new Map());

    expect(prisma.engagementPostPoints.findMany).not.toHaveBeenCalled();
    expect(prisma.engagementQuota.findMany).not.toHaveBeenCalled();
  });
});

describe('la valeur servie', () => {
  it('additionne les gestes du lecteur et, sur ses posts, le crédit de sa publication', async () => {
    const prisma = doublePrisma({
      points: [
        { userId: VIEWER, postId: postId(1), totalPoints: 4 },
        { userId: VIEWER, postId: postId(2), totalPoints: 3 },
      ],
      memory: [{ userId: VIEWER, operationKey: 'content.post', bucket: `content:${postId(2)}`, points: 99 }],
    });

    const points = await loadViewerPostPoints(prisma as never, VIEWER, [
      { id: postId(1), authorId: SOMEONE },
      { id: postId(2), authorId: VIEWER },
    ]);

    expect([...points]).toEqual([[postId(1), 4], [postId(2), 102]]);
  });

  it('vaut zéro pour un post qui n’a rien rapporté', async () => {
    const points = await loadViewerPostPoints(doublePrisma() as never, VIEWER, page(2));

    expect([...points]).toEqual([[postId(0), 0], [postId(1), 0]]);
  });

  it('ne rend jamais les points d’un autre lecteur', async () => {
    const prisma = doublePrisma({
      points: [{ userId: SOMEONE, postId: postId(1), totalPoints: 40 }],
      memory: [{ userId: SOMEONE, operationKey: 'content.post', bucket: `content:${postId(1)}`, points: 99 }],
    });

    const points = await loadViewerPostPoints(prisma as never, VIEWER, [{ id: postId(1), authorId: SOMEONE }]);

    expect(points.get(postId(1))).toBe(0);
  });

  it('lit la mémoire de publication quand l’auteur du post n’est pas connu', async () => {
    const prisma = doublePrisma({
      memory: [{ userId: VIEWER, operationKey: 'content.reel', bucket: `content:${postId(3)}`, points: 199 }],
    });

    const points = await loadViewerPostPoints(prisma as never, VIEWER, [{ id: postId(3) }]);

    expect(points.get(postId(3))).toBe(199);
  });

  it('additionne deux lignes de cumul d’un même post — la course d’avant l’index unique ne perd aucun point', async () => {
    const prisma = doublePrisma({
      points: [
        { userId: VIEWER, postId: postId(1), totalPoints: 1 },
        { userId: VIEWER, postId: postId(1), totalPoints: 3 },
      ],
    });

    const points = await loadViewerPostPoints(prisma as never, VIEWER, [{ id: postId(1), authorId: SOMEONE }]);

    expect(points.get(postId(1))).toBe(4);
  });

  it('ne descend jamais sous zéro', async () => {
    const prisma = doublePrisma({ points: [{ userId: VIEWER, postId: postId(1), totalPoints: -5 }] });

    const points = await loadViewerPostPoints(prisma as never, VIEWER, [{ id: postId(1), authorId: SOMEONE }]);

    expect(points.get(postId(1))).toBe(0);
  });
});

describe('un lecteur sans compte', () => {
  it('ne coûte aucune lecture', async () => {
    const prisma = doublePrisma({ points: [{ userId: SOMEONE, postId: postId(1), totalPoints: 40 }] });

    expect(await loadViewerPostPointsOrNone(prisma as never, undefined, page(3))).toBeNull();

    expect(prisma.engagementPostPoints.findMany).not.toHaveBeenCalled();
    expect(prisma.engagementQuota.findMany).not.toHaveBeenCalled();
  });

  it('ne reçoit pas le champ — absent, pas zéro', async () => {
    const served = await withViewerPoints(doublePrisma() as never, undefined, page(2));

    expect(served).toEqual(page(2));
    expect(served.every((post) => !('viewerPoints' in post))).toBe(true);
  });
});

describe('un lecteur connecté', () => {
  it('reçoit le champ sur chaque post, zéro compris', async () => {
    const prisma = doublePrisma({ points: [{ userId: VIEWER, postId: postId(1), totalPoints: 7 }] });

    const served = await withViewerPoints(prisma as never, VIEWER, page(2));

    expect(served).toEqual([
      { id: postId(0), authorId: SOMEONE, viewerPoints: 0 },
      { id: postId(1), authorId: SOMEONE, viewerPoints: 7 },
    ]);
  });

  it('reçoit sa page sans le champ quand le cumul ne se lit pas — la page ne tombe pas', async () => {
    const prisma = doublePrisma();
    prisma.engagementPostPoints.findMany.mockRejectedValueOnce(new Error('mongo down') as never);

    const served = await withViewerPoints(prisma as never, VIEWER, page(2));

    expect(served).toEqual(page(2));
  });
});

describe('où vit un crédit', () => {
  const POST = postId(9);

  it.each(PUBLICATION_OPERATIONS)('la publication %s gardée par la mémoire de SON post y vit', (operationKey) => {
    expect(creditLivesInPublicationMemory({ operationKey, postId: POST, rememberedTargetId: POST })).toBe(true);
  });

  it.each([
    ['une publication que la mémoire n’a pas gardée', { operationKey: 'content.post', rememberedTargetId: undefined }],
    ['une publication gardée sous une autre cible', { operationKey: 'content.post', rememberedTargetId: postId(8) }],
    ['un geste gardé par la mémoire sans être une publication', { operationKey: 'social.repost', rememberedTargetId: POST }],
    ['une humeur, que la suppression ne reprend pas', { operationKey: 'content.status', rememberedTargetId: POST }],
  ] as const)('%s vit dans le cumul', (_label, credit) => {
    expect(creditLivesInPublicationMemory({ ...credit, postId: POST })).toBe(false);
  });
});
