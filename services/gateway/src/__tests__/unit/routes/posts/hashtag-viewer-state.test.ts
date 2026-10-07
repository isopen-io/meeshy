/**
 * #7396 — la page d'un hashtag sert l'ÉTAT DU LECTEUR sur chaque publication.
 *
 * `isLikedByMe` / `currentUserReactions` / `isBookmarkedByMe` / `isRepostedByMe`
 * décrivent la relation du LECTEUR à une publication, pas la publication. Les
 * listes du fil (accueil, réels, auteur, communauté, enregistrées) les posent
 * par UNE fonction (`withViewerPostState`) ; la page d'un hashtag ne les posait
 * pas : chaque publication y paraissait ni aimée ni enregistrée, et toucher le
 * cœur d'une publication déjà aimée envoyait `POST` puis revenait en 409.
 *
 * Les témoins lisent la RÉPONSE HTTP (`app.inject().json()`), jamais l'objet
 * rendu par le service : une route dont le schéma de réponse ne déclarerait pas
 * ces champs les JETTERAIT en silence (fast-json-stringify, CLAUDE.md du
 * gateway § « Un schéma de réponse sans `properties` EFFACE »), et seul ce qui
 * sort du sérialiseur dit ce que le client reçoit.
 *
 * Le double Prisma HONORE les filtres qu'on lui passe (`userId`, `postId.in`,
 * `authorId`, `repostOfId.in`, audience) et REFUSE toute clé qu'il ne sait pas
 * interpréter : un double qui approuve n'importe quel `where` rendrait l'état
 * d'un autre lecteur sans qu'aucun témoin ne rougisse.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => undefined }));

import { registerFeedRoutes } from '../../../../routes/posts/feed';
import { registerHashtagRoutes } from '../../../../routes/posts/hashtag';

const LECTEUR = '507f1f77bcf86cd799439011';
const AUTRE_LECTEUR = '507f1f77bcf86cd799439033';
const AUTEUR = '507f1f77bcf86cd799439022';
const NOW = new Date('2026-09-21T10:00:00.000Z');

type FakePost = {
  readonly id: string;
  readonly authorId: string;
  readonly type: 'POST' | 'REEL';
  readonly visibility: string;
  readonly deletedAt: null;
  readonly content: string;
  readonly createdAt: Date;
  readonly isQuote: boolean;
  readonly repostOfId: string | null;
  readonly originalRepostOfId: string | null;
  readonly repostOf: { readonly type: string } | null;
  readonly postMentions: readonly never[];
};
type Reaction = { readonly userId: string; readonly postId: string; readonly emoji: string };
type Bookmark = { readonly userId: string; readonly postId: string };
type Points = { readonly userId: string; readonly postId: string; readonly totalPoints: number };
type PublicationMemory = { readonly userId: string; readonly operationKey: string; readonly bucket: string; readonly points: number };

const idDe = (n: number) => `aaaaaaaaaaaaaaaaaaaa${String(n).padStart(4, '0')}`;

function publication(id: string, extra: Partial<FakePost> = {}): FakePost {
  return {
    id,
    authorId: AUTEUR,
    type: 'POST',
    visibility: 'PUBLIC',
    deletedAt: null,
    content: `Publication ${id} #livraison`,
    createdAt: NOW,
    isQuote: false,
    repostOfId: null,
    originalRepostOfId: null,
    repostOf: null,
    postMentions: [],
    ...extra,
  };
}

function contient(valeur: unknown, champ: string | null): boolean {
  if (valeur !== null && typeof valeur === 'object' && 'in' in valeur) {
    return ((valeur as { in: readonly string[] }).in).includes(champ as string);
  }
  return champ === valeur;
}

function correspond(post: FakePost, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([cle, valeur]) => {
    switch (cle) {
      case 'OR':
        return (valeur as Array<Record<string, unknown>>).some((sous) => correspond(post, sous));
      case 'id':
      case 'authorId':
      case 'type':
      case 'visibility':
      case 'repostOfId':
        return contient(valeur, post[cle]);
      case 'deletedAt':
        return post.deletedAt === null;
      default:
        throw new Error(`double Prisma : clé de where non interprétée « ${cle} »`);
    }
  });
}

function doublePrisma(etat: {
  readonly posts: readonly FakePost[];
  readonly reactions?: readonly Reaction[];
  readonly bookmarks?: readonly Bookmark[];
  readonly points?: readonly Points[];
  readonly publications?: readonly PublicationMemory[];
}) {
  const parLecteur = <R extends { userId: string; postId: string }>(lignes: readonly R[]) =>
    jest.fn(async ({ where }: any) => lignes.filter((l) => l.userId === where.userId && contient(where.postId, l.postId)));
  return {
    hashtag: { findUnique: jest.fn(async ({ where }: any) => (where.tag === 'livraison' ? { id: 'h1' } : null)) },
    postHashtag: {
      findMany: jest.fn(async ({ skip, take }: any) =>
        etat.posts.map((p) => ({ postId: p.id })).slice(skip ?? 0, (skip ?? 0) + (take ?? etat.posts.length)),
      ),
    },
    communityMember: { findMany: jest.fn(async () => []) },
    post: {
      findMany: jest.fn(async ({ where, take }: any) => {
        const trouves = etat.posts.filter((p) => correspond(p, where));
        return typeof take === 'number' ? trouves.slice(0, take) : trouves;
      }),
    },
    postReaction: { findMany: parLecteur(etat.reactions ?? []) },
    postBookmark: { findMany: parLecteur(etat.bookmarks ?? []) },
    engagementPostPoints: { findMany: parLecteur(etat.points ?? []) },
    engagementQuota: {
      findMany: jest.fn(async ({ where }: any) =>
        (etat.publications ?? []).filter(
          (l) => l.userId === where.userId && contient(where.operationKey, l.operationKey) && contient(where.bucket, l.bucket),
        ),
      ),
    },
  };
}

type Double = ReturnType<typeof doublePrisma>;

const requetesServies = (prisma: Double): number =>
  [prisma.hashtag.findUnique, prisma.postHashtag.findMany, prisma.communityMember.findMany, prisma.post.findMany, prisma.postReaction.findMany, prisma.postBookmark.findMany]
    .reduce((somme, fn) => somme + fn.mock.calls.length, 0);

/** Le lecteur est nommé par `x-test-user-id` ; sans lui, la requête est anonyme. */
async function monter(prisma: Double): Promise<FastifyInstance> {
  const auth = async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).authContext = userId
      ? { type: 'user', isAuthenticated: true, userId, registeredUser: { id: userId, role: 'USER' } }
      : null;
  };
  const app = Fastify({ logger: false });
  registerFeedRoutes(app, prisma as any, auth, auth);
  registerHashtagRoutes(app, prisma as any, auth);
  await app.ready();
  return app;
}

const AIMEE = idDe(1);
const NEUTRE = idDe(2);
const REPUBLIEE = idDe(3);

function scenarioNominal() {
  return doublePrisma({
    posts: [publication(AIMEE), publication(NEUTRE), publication(REPUBLIEE), publication(idDe(4), { authorId: LECTEUR, repostOfId: REPUBLIEE })],
    reactions: [
      { userId: LECTEUR, postId: AIMEE, emoji: '❤️' },
      { userId: AUTRE_LECTEUR, postId: AIMEE, emoji: '🔥' },
      { userId: AUTRE_LECTEUR, postId: NEUTRE, emoji: '😂' },
    ],
    bookmarks: [{ userId: LECTEUR, postId: AIMEE }, { userId: AUTRE_LECTEUR, postId: NEUTRE }],
  });
}

const parId = (data: ReadonlyArray<Record<string, unknown>>) => new Map(data.map((p) => [p.id as string, p]));

describe('scope=hashtag — l’état du LECTEUR sur chaque publication (#7396)', () => {
  it('une publication aimée et enregistrée par le lecteur ressort isLikedByMe et isBookmarkedByMe VRAIS, lue sur la réponse HTTP', async () => {
    const prisma = scenarioNominal();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison', headers: { 'x-test-user-id': LECTEUR } });

    expect(res.statusCode).toBe(200);
    const servies = parId(res.json().data);
    expect(servies.get(AIMEE)).toMatchObject({ isLikedByMe: true, currentUserReactions: ['❤️'], isBookmarkedByMe: true, isRepostedByMe: false });
    expect(servies.get(NEUTRE)).toMatchObject({ isLikedByMe: false, currentUserReactions: [], isBookmarkedByMe: false, isRepostedByMe: false });
    expect(servies.get(REPUBLIEE)).toMatchObject({ isLikedByMe: false, isBookmarkedByMe: false, isRepostedByMe: true });
    await app.close();
  });

  it('l’alias déprécié GET /posts/hashtag/:tag sert le MÊME état — les deux adresses partagent le noyau', async () => {
    const prisma = scenarioNominal();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: '/posts/hashtag/livraison', headers: { 'x-test-user-id': LECTEUR } });

    expect(parId(res.json().data).get(AIMEE)).toMatchObject({ isLikedByMe: true, isBookmarkedByMe: true });
    await app.close();
  });

  it('un AUTRE lecteur ne reçoit pas l’état du premier : seulement le sien', async () => {
    const prisma = scenarioNominal();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison', headers: { 'x-test-user-id': AUTRE_LECTEUR } });

    const servies = parId(res.json().data);
    expect(servies.get(AIMEE)).toMatchObject({ isLikedByMe: true, currentUserReactions: ['🔥'], isBookmarkedByMe: false, isRepostedByMe: false });
    expect(servies.get(NEUTRE)).toMatchObject({ isLikedByMe: true, currentUserReactions: ['😂'], isBookmarkedByMe: true });
    expect(servies.get(REPUBLIEE)).toMatchObject({ isRepostedByMe: false });
    await app.close();
  });

  it('la MÊME règle que le fil : une republication simple montre l’état du lecteur sur l’ORIGINAL', async () => {
    const ORIGINAL = idDe(10);
    const REPUBLICATION = idDe(11);
    const prisma = doublePrisma({
      posts: [publication(REPUBLICATION, { repostOfId: ORIGINAL, originalRepostOfId: ORIGINAL, repostOf: { type: 'POST' } })],
      reactions: [{ userId: LECTEUR, postId: ORIGINAL, emoji: '❤️' }],
    });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison', headers: { 'x-test-user-id': LECTEUR } });

    expect(parId(res.json().data).get(REPUBLICATION)).toMatchObject({ isLikedByMe: true, currentUserReactions: ['❤️'] });
    await app.close();
  });

  it('ce qui part À CÔTÉ : la page n’ajoute que les clés du lecteur, aucune donnée sur les autres', async () => {
    const prisma = scenarioNominal();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison', headers: { 'x-test-user-id': LECTEUR } });

    const servie = parId(res.json().data).get(AIMEE) as Record<string, unknown>;
    const ajoutees = Object.keys(servie).filter((cle) => !(cle in publication(AIMEE))).sort();
    expect(ajoutees).toEqual(['currentUserReactions', 'isBookmarkedByMe', 'isLikedByMe', 'isRepostedByMe', 'mentions', 'viewerPoints']);
    expect(servie.currentUserReactions).toEqual(['❤️']);
    await app.close();
  });
});

describe('scope=hashtag — l’état du lecteur coûte TROIS requêtes par page, quel que soit le nombre de publications', () => {
  it('une requête GROUPÉE par table (réactions, favoris, republications), jamais une par publication', async () => {
    const mesurer = async (nombre: number) => {
      const prisma = doublePrisma({ posts: Array.from({ length: nombre }, (_, i) => publication(idDe(100 + i))) });
      const app = await monter(prisma);
      await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison', headers: { 'x-test-user-id': LECTEUR } });
      await app.close();
      return {
        total: requetesServies(prisma),
        reactions: prisma.postReaction.findMany.mock.calls.length,
        favoris: prisma.postBookmark.findMany.mock.calls.length,
      };
    };

    const petite = await mesurer(2);
    const pleine = await mesurer(20);

    expect(petite).toEqual({ total: 7, reactions: 1, favoris: 1 });
    expect(pleine).toEqual(petite);
  });
});

describe('le visiteur non connecté', () => {
  it('scope=hashtag reste réservé aux comptes : 401, aucune lecture d’état', async () => {
    const prisma = scenarioNominal();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison' });

    expect(res.statusCode).toBe(401);
    expect(prisma.postReaction.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('la liste d’un auteur lui sert les QUATRE clés à faux — la même fonction que le hashtag, sans requête d’état', async () => {
    const prisma = scenarioNominal();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: `/social/posts?scope=author&authorId=${AUTEUR}` });

    expect(res.statusCode).toBe(200);
    const servies = res.json().data as Array<Record<string, unknown>>;
    expect(servies.length).toBeGreaterThan(0);
    for (const servie of servies) {
      expect(servie).toMatchObject({ isLikedByMe: false, currentUserReactions: [], isBookmarkedByMe: false, isRepostedByMe: false });
    }
    expect(prisma.postReaction.findMany).not.toHaveBeenCalled();
    expect(prisma.postBookmark.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

/**
 * #9569 — ce que chaque publication a RAPPORTÉ au lecteur, servi avec son état.
 *
 * Lu sur la réponse HTTP, comme le reste : c'est ce qui sort du sérialiseur qui
 * dit ce qu'un client reçoit. Le double ne rend une ligne de cumul qu'au
 * lecteur qui la possède — un `where` sans `userId` ne rendrait rien.
 */
describe('scope=hashtag — ce que chaque publication a rapporté au LECTEUR (#9569)', () => {
  const MIENNE = idDe(20);
  const AVEC_GESTES = idDe(21);
  const SANS_RIEN = idDe(22);

  const scenario = () =>
    doublePrisma({
      posts: [publication(MIENNE, { authorId: LECTEUR }), publication(AVEC_GESTES), publication(SANS_RIEN)],
      points: [
        { userId: LECTEUR, postId: AVEC_GESTES, totalPoints: 4 },
        { userId: LECTEUR, postId: MIENNE, totalPoints: 3 },
        { userId: AUTRE_LECTEUR, postId: AVEC_GESTES, totalPoints: 40 },
      ],
      publications: [
        { userId: LECTEUR, operationKey: 'content.post', bucket: `content:${MIENNE}`, points: 99 },
        { userId: AUTEUR, operationKey: 'content.post', bucket: `content:${AVEC_GESTES}`, points: 69 },
      ],
    });

  const lire = async (prisma: Double, lecteur: string) => {
    const app = await monter(prisma);
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=livraison', headers: { 'x-test-user-id': lecteur } });
    await app.close();
    return parId(res.json().data);
  };

  it('sert sur chaque publication ce qu’elle a rapporté au lecteur — ses gestes, et sa publication s’il en est l’auteur', async () => {
    const servies = await lire(scenario(), LECTEUR);

    expect(servies.get(AVEC_GESTES)?.viewerPoints).toBe(4);
    expect(servies.get(MIENNE)?.viewerPoints).toBe(102);
  });

  it('sert zéro, et non l’absence, sur une publication qui n’a rien rapporté', async () => {
    const servies = await lire(scenario(), LECTEUR);

    expect(servies.get(SANS_RIEN)).toHaveProperty('viewerPoints', 0);
  });

  it('un AUTRE lecteur reçoit les siens — jamais ceux du premier, ni le crédit de publication de l’auteur', async () => {
    const servies = await lire(scenario(), AUTRE_LECTEUR);

    expect(servies.get(AVEC_GESTES)?.viewerPoints).toBe(40);
    expect(servies.get(MIENNE)?.viewerPoints).toBe(0);
  });

  it('une page coûte UNE lecture du cumul, bornée au lecteur et aux publications de la page', async () => {
    const prisma = scenario();

    await lire(prisma, LECTEUR);

    expect(prisma.engagementPostPoints.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.engagementPostPoints.findMany.mock.calls[0][0].where).toEqual({
      userId: LECTEUR,
      postId: { in: [MIENNE, AVEC_GESTES, SANS_RIEN] },
    });
    expect(prisma.engagementQuota.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.engagementQuota.findMany.mock.calls[0][0].where.bucket).toEqual({ in: [`content:${MIENNE}`] });
  });
});
