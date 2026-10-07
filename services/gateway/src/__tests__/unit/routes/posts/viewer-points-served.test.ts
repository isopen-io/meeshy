/**
 * #9569 — `viewerPoints` tel qu'il SORT des routes : stories et détail.
 *
 * Les listes du fil le reçoivent par `withViewerPostState`
 * (`hashtag-viewer-state.test.ts`). Deux surfaces ne passent pas par elle et le
 * posent à la route : la page de stories, dont `PostFeedService` compose l'état
 * du lecteur à part, et la fiche d'un post. Les témoins lisent la RÉPONSE HTTP —
 * ce qui sort du sérialiseur est ce qu'un client reçoit.
 *
 * `PostFeedService` et `PostService` sont doublés à leur frontière : ce que ces
 * routes font de la page qu'ils rendent est le sujet, pas la page. Le double
 * Prisma, lui, ne rend une ligne de cumul qu'au lecteur qui la possède.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockGetStories = jest.fn<any>();
const mockGetPostById = jest.fn<any>();

jest.mock('../../../../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getStories: (...args: any[]) => mockGetStories(...args),
  })),
}));
jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));
// Les collaborateurs que `registerCoreRoutes` CONSTRUIT au montage et que ces
// lectures n'appellent pas — doublés pour que la route se monte, rien de plus.
jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: {} },
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => null }),
}));
jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

import { registerFeedRoutes } from '../../../../routes/posts/feed';
import { registerCoreRoutes } from '../../../../routes/posts/core';

const LECTEUR = '507f1f77bcf86cd799439011';
const AUTRE_LECTEUR = '507f1f77bcf86cd799439033';
const AUTEUR = '507f1f77bcf86cd799439022';
const idDe = (n: number) => `aaaaaaaaaaaaaaaaaaaa${String(n).padStart(4, '0')}`;

type Points = { readonly userId: string; readonly postId: string; readonly totalPoints: number };
type PublicationMemory = { readonly userId: string; readonly operationKey: string; readonly bucket: string; readonly points: number };

const dans = (filtre: unknown, valeur: string): boolean => {
  if (typeof filtre === 'string') return filtre === valeur;
  if (typeof filtre === 'object' && filtre !== null && Array.isArray((filtre as { in?: unknown }).in)) {
    return (filtre as { in: string[] }).in.includes(valeur);
  }
  throw new Error(`double Prisma : filtre non interprété ${JSON.stringify(filtre)}`);
};

function doublePrisma(etat: {
  readonly points?: readonly Points[];
  readonly publications?: readonly PublicationMemory[];
  readonly servableSansCompte?: boolean;
} = {}) {
  return {
    engagementPostPoints: {
      findMany: jest.fn(async ({ where }: any) => {
        if (typeof where.userId !== 'string') throw new Error('double Prisma : lecture du cumul sans lecteur');
        return (etat.points ?? []).filter((l) => l.userId === where.userId && dans(where.postId, l.postId));
      }),
    },
    engagementQuota: {
      findMany: jest.fn(async ({ where }: any) => {
        if (typeof where.userId !== 'string') throw new Error('double Prisma : lecture de la mémoire sans lecteur');
        return (etat.publications ?? []).filter(
          (l) => l.userId === where.userId && dans(where.operationKey, l.operationKey) && dans(where.bucket, l.bucket),
        );
      }),
    },
    post: {
      findFirst: jest.fn(async () =>
        etat.servableSansCompte
          ? {
              visibility: 'PUBLIC',
              deletedAt: null,
              expiresAt: null,
              repostOfId: null,
              author: { isActive: true, deletedAt: null, deactivatedAt: null },
              repostOf: null,
            }
          : null,
      ),
    },
  };
}

type Double = ReturnType<typeof doublePrisma>;

/** Le lecteur est nommé par `x-test-user-id` ; sans lui, la requête est sans compte. */
async function monter(prisma: Double): Promise<FastifyInstance> {
  const auth = async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).authContext = userId
      ? { type: 'user', isAuthenticated: true, userId, registeredUser: { id: userId, role: 'USER' } }
      : null;
  };
  const app = Fastify({ logger: false });
  registerFeedRoutes(app, prisma as any, auth, auth);
  registerCoreRoutes(app, prisma as any, auth, auth as any);
  await app.ready();
  return app;
}

const lire = async (prisma: Double, url: string, lecteur?: string) => {
  const app = await monter(prisma);
  const res = await app.inject({ method: 'GET', url, headers: lecteur ? { 'x-test-user-id': lecteur } : {} });
  await app.close();
  return res;
};

const parId = (data: ReadonlyArray<Record<string, unknown>>) => new Map(data.map((p) => [p.id as string, p]));

const STORY_VUE = idDe(1);
const MA_STORY = idDe(2);

const storiesServies = () => ({
  items: [
    { id: STORY_VUE, authorId: AUTEUR, type: 'STORY', isViewedByMe: true },
    { id: MA_STORY, authorId: LECTEUR, type: 'STORY', isViewedByMe: false },
  ],
  hasMore: false,
  nextCursor: null,
  deletedIds: [],
  deletedIdsTruncated: false,
});

const etatDesStories = () =>
  doublePrisma({
    points: [
      { userId: LECTEUR, postId: STORY_VUE, totalPoints: 2 },
      { userId: AUTRE_LECTEUR, postId: STORY_VUE, totalPoints: 30 },
    ],
    publications: [{ userId: LECTEUR, operationKey: 'content.story', bucket: `content:${MA_STORY}`, points: 79 }],
  });

beforeEach(() => {
  mockGetStories.mockReset().mockImplementation(async () => storiesServies());
  mockGetPostById.mockReset();
});

describe('les stories — ce que chacune a rapporté au LECTEUR', () => {
  it.each([
    ['GET /social/posts?scope=stories', '/social/posts?scope=stories'],
    ['son alias GET /posts/feed/stories', '/posts/feed/stories'],
  ])('%s sert la vue créditée d’une story et la publication de la sienne', async (_label, url) => {
    const res = await lire(etatDesStories(), url, LECTEUR);

    expect(res.statusCode).toBe(200);
    const servies = parId(res.json().data);
    expect(servies.get(STORY_VUE)).toMatchObject({ isViewedByMe: true, viewerPoints: 2 });
    expect(servies.get(MA_STORY)).toMatchObject({ viewerPoints: 79 });
  });

  it.each([
    ['GET /social/posts?scope=stories.mine', '/social/posts?scope=stories.mine'],
    ['son alias GET /posts/stories/mine', '/posts/stories/mine'],
  ])('%s sert à l’auteur ce que ses stories lui ont rapporté', async (_label, url) => {
    const res = await lire(etatDesStories(), url, LECTEUR);

    expect(parId(res.json().data).get(MA_STORY)).toMatchObject({ viewerPoints: 79 });
  });

  it('un AUTRE lecteur reçoit les siens, jamais ceux du premier ni la publication de l’auteur', async () => {
    const res = await lire(etatDesStories(), '/social/posts?scope=stories', AUTRE_LECTEUR);

    const servies = parId(res.json().data);
    expect(servies.get(STORY_VUE)).toMatchObject({ viewerPoints: 30 });
    expect(servies.get(MA_STORY)).toMatchObject({ viewerPoints: 0 });
  });

  it('une page coûte UNE lecture du cumul', async () => {
    const prisma = etatDesStories();

    await lire(prisma, '/social/posts?scope=stories', LECTEUR);

    expect(prisma.engagementPostPoints.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.engagementPostPoints.findMany.mock.calls[0][0].where).toEqual({
      userId: LECTEUR,
      postId: { in: [STORY_VUE, MA_STORY] },
    });
  });

  it('la projection tray — anneaux et miniature — ne le porte pas et ne coûte aucune lecture', async () => {
    const prisma = etatDesStories();

    const res = await lire(prisma, '/social/posts?scope=stories&projection=tray', LECTEUR);

    expect(res.json().data.every((story: Record<string, unknown>) => !('viewerPoints' in story))).toBe(true);
    expect(prisma.engagementPostPoints.findMany).not.toHaveBeenCalled();
  });

  it('un cumul illisible ne fait pas tomber la page : elle part sans le champ', async () => {
    const prisma = etatDesStories();
    prisma.engagementPostPoints.findMany.mockRejectedValue(new Error('mongo down') as never);

    const res = await lire(prisma, '/social/posts?scope=stories', LECTEUR);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((story: Record<string, unknown>) => story.id)).toEqual([STORY_VUE, MA_STORY]);
    expect(res.json().data.every((story: Record<string, unknown>) => !('viewerPoints' in story))).toBe(true);
  });
});

describe('GET /posts/:postId — ce que le post a rapporté au LECTEUR', () => {
  const POST = idDe(10);
  const fiche = (authorId: string = AUTEUR) => ({
    id: POST,
    authorId,
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Bonjour',
    isLikedByMe: true,
    currentUserReactions: ['❤️'],
    isBookmarkedByMe: false,
    isRepostedByMe: false,
  });

  it('sert au lecteur ses gestes sur ce post', async () => {
    mockGetPostById.mockResolvedValue(fiche());
    const prisma = doublePrisma({ points: [{ userId: LECTEUR, postId: POST, totalPoints: 4 }] });

    const res = await lire(prisma, `/posts/${POST}`, LECTEUR);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: POST, isLikedByMe: true, viewerPoints: 4 });
  });

  it('sert à l’auteur sa publication ET ses gestes, en une valeur', async () => {
    mockGetPostById.mockResolvedValue(fiche(LECTEUR));
    const prisma = doublePrisma({
      points: [{ userId: LECTEUR, postId: POST, totalPoints: 3 }],
      publications: [{ userId: LECTEUR, operationKey: 'content.post', bucket: `content:${POST}`, points: 99 }],
    });

    const res = await lire(prisma, `/posts/${POST}`, LECTEUR);

    expect(res.json().data.viewerPoints).toBe(102);
  });

  it('sert zéro à un lecteur connecté à qui le post n’a rien rapporté', async () => {
    mockGetPostById.mockResolvedValue(fiche());
    const prisma = doublePrisma({ points: [{ userId: AUTRE_LECTEUR, postId: POST, totalPoints: 40 }] });

    const res = await lire(prisma, `/posts/${POST}`, LECTEUR);

    expect(res.json().data).toHaveProperty('viewerPoints', 0);
  });

  it('un lecteur SANS COMPTE reçoit le post sans le champ, et aucune lecture du cumul ne part', async () => {
    mockGetPostById.mockResolvedValue(fiche());
    const prisma = doublePrisma({
      servableSansCompte: true,
      points: [{ userId: AUTRE_LECTEUR, postId: POST, totalPoints: 40 }],
    });

    const res = await lire(prisma, `/posts/${POST}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(POST);
    expect(res.json().data).not.toHaveProperty('viewerPoints');
    expect(prisma.engagementPostPoints.findMany).not.toHaveBeenCalled();
    expect(prisma.engagementQuota.findMany).not.toHaveBeenCalled();
  });
});
