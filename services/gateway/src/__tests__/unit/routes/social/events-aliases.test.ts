/**
 * Les SIX adresses historiques de télémétrie de lecture restent montées,
 * DÉLÈGUENT au point d'ingestion, et le DISENT au client (#4150, critère 6).
 *
 * ## Pourquoi ce fichier existe en plus du cliquet d'alias
 *
 * `security/deprecated-alias-headers-guard.test.ts` garde trois propriétés de
 * SOURCE (qui se déclare alias, qui importe le mécanisme, quel successeur la
 * chaîne émise désigne). Aucune ne prouve qu'un en-tête SORT : une garde de
 * source atteste qu'il est ÉCRIT. Ce fichier fait des requêtes RÉELLES, par
 * `app.inject()`, contre une instance Fastify montée avec les vraies routes.
 *
 * ## Et pourquoi la DÉLÉGATION est testée, pas seulement les en-têtes
 *
 * Le critère 6 exige « aucune ré-implémentation parallèle ». Un alias qui
 * annonce son sursis tout en gardant sa propre copie de la règle satisferait
 * les trois en-têtes et raterait l'essentiel : c'est la copie, pas l'adresse,
 * qui a produit six qualités de service différentes pour trois sémantiques.
 * Le témoin l'attrape par l'AUDIENCE — un post hors audience doit être refusé
 * par les six, ce qu'aucune ne faisait avant de déléguer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockRecordView = jest.fn<any>().mockResolvedValue(true);
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);
const mockRecordAnonymousOpen = jest.fn<any>().mockResolvedValue(true);
const mockRecordMediaDownloads = jest.fn<any>().mockResolvedValue({ recorded: 2 });
const mockRecordEngagementBatch = jest.fn<any>().mockResolvedValue(1);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    recordView: (...a: any[]) => mockRecordView(...a),
    getPostById: (...a: any[]) => mockGetPostById(...a),
    recordAnonymousOpen: (...a: any[]) => mockRecordAnonymousOpen(...a),
    recordMediaDownloads: (...a: any[]) => mockRecordMediaDownloads(...a),
    recordEngagementBatch: (...a: any[]) => mockRecordEngagementBatch(...a),
    likePost: jest.fn<any>(), unlikePost: jest.fn<any>(), bookmarkPost: jest.fn<any>(),
    unbookmarkPost: jest.fn<any>(), sharePost: jest.fn<any>(), shareWithTrackingLink: jest.fn<any>(),
    getPostShareLink: jest.fn<any>(), pinPost: jest.fn<any>(), unpinPost: jest.fn<any>(),
    getPostViews: jest.fn<any>(), getPostInteractions: jest.fn<any>(), repostPost: jest.fn<any>(),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }),
  }),
}));

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';
import { SOCIAL_EVENTS_SUCCESSEUR, socialEventsDeprecation } from '../../../../routes/social/deprecation';
import { enTetesDeDepreciation } from '../../../../utils/deprecation';

const USER_ID = '507f1f77bcf86cd799439011';
const VISIBLE_ID = '507f1f77bcf86cd799439022';
/** Existe, mais PRIVATE d'un autre auteur — hors audience pour les six. */
const HIDDEN_ID = '507f1f77bcf86cd799439033';

const SESSION_ID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function makePrisma() {
  const ecritures: unknown[] = [];
  const journalise = (op: string, res: unknown) =>
    jest.fn<any>().mockImplementation((args: any) => {
      ecritures.push({ op, args });
      return Promise.resolve(res);
    });
  return {
    ecritures,
    post: {
      // Le double HONORE la clause `visibility` du `where` — il ne se contente
      // pas de filtrer par id. Sans cela il ACCEPTERAIT ce que Mongo refuse : la
      // passe anonyme borne sa lecture à `{ visibility: PUBLIC }`, et un double
      // qui l'ignore rend un post PRIVATE à un visiteur, donc atteste une fuite
      // là où la production n'en a pas — ou l'inverse.
      findMany: jest.fn<any>().mockImplementation(({ where }: any) => {
        if (where?.repostOfId !== undefined) return Promise.resolve([]);
        const lignes = ((where?.id?.in ?? []) as string[])
          .filter((id) => id === VISIBLE_ID || id === HIDDEN_ID)
          .map((id) => ({
            id, authorId: 'author-1',
            visibility: id === VISIBLE_ID ? 'PUBLIC' : 'PRIVATE',
            visibilityUserIds: [] as string[], expiresAt: null,
          }));
        return Promise.resolve(where?.visibility === undefined
          ? lignes
          : lignes.filter((l) => l.visibility === where.visibility));
      }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: journalise('post.update', {}),
      updateMany: journalise('post.updateMany', { count: 1 }),
    },
    postImpression: {
      create: journalise('postImpression.create', {}),
      createMany: journalise('postImpression.createMany', { count: 1 }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postMention: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', {
    markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
    createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
  });
  app.decorate('socialEvents', { broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined) });

  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };
  registerInteractionRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

/** Les six portes, avec la requête minimale que chacune accepte. */
const SIX_PORTES = [
  { nom: 'view', url: (id: string) => `/posts/${id}/view`, payload: () => ({ duration: 1200 }) },
  { nom: 'impression', url: (id: string) => `/posts/${id}/impression`, payload: () => ({ source: 'feed' }) },
  { nom: 'impressions/batch', url: () => '/posts/impressions/batch', payload: (id: string) => ({ postIds: [id], source: 'feed' }) },
  {
    nom: 'engagement/batch', url: () => '/posts/engagement/batch',
    payload: (id: string) => ({
      sessions: [{
        sessionId: SESSION_ID_A, postId: id, contentType: 'POST',
        surface: 'feed', startedAt: new Date().toISOString(), dwellMs: 900,
      }],
    }),
  },
  { nom: 'downloads', url: (id: string) => `/posts/${id}/downloads`, payload: () => ({ mediaIds: ['m1', 'm2'], surface: 'detail' }) },
  { nom: 'anonymous-view', url: (id: string) => `/posts/${id}/anonymous-view`, payload: () => ({}) },
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordView.mockResolvedValue(true);
  mockGetPostById.mockResolvedValue(null);
  mockRecordAnonymousOpen.mockResolvedValue(true);
  mockRecordMediaDownloads.mockResolvedValue({ recorded: 2 });
  mockRecordEngagementBatch.mockResolvedValue(1);
});

describe('critère 6 — les six adresses restent MONTÉES', () => {
  it.each(SIX_PORTES.map((p) => [p.nom, p] as const))(
    'POST …/%s répond autre chose qu’un 404 de route',
    async (_nom, porte) => {
      const app = await buildApp(makePrisma());
      const res = await app.inject({
        method: 'POST', url: porte.url(VISIBLE_ID), payload: porte.payload(VISIBLE_ID),
        headers: { 'x-session-token': 'jeton-visiteur' },
      });
      // Une route ABSENTE rend le 404 de Fastify, dont le corps porte
      // `error: 'Not Found'` — un 404 MÉTIER (post introuvable) n'a pas cette
      // forme. Distinguer les deux est tout l'objet de ce témoin : sans quoi
      // il resterait vert le jour où quelqu'un démonte une des six.
      expect(res.json()).not.toMatchObject({ error: 'Not Found' });
      await app.close();
    },
  );
});

describe('critère 6 — les trois en-têtes SORTENT réellement, sur les six', () => {
  const attendus = enTetesDeDepreciation(socialEventsDeprecation());

  it.each(SIX_PORTES.map((p) => [p.nom, p] as const))(
    'POST …/%s annonce Deprecation, Sunset et le successeur',
    async (_nom, porte) => {
      const app = await buildApp(makePrisma());
      const res = await app.inject({
        method: 'POST', url: porte.url(VISIBLE_ID), payload: porte.payload(VISIBLE_ID),
        headers: { 'x-session-token': 'jeton-visiteur' },
      });

      expect(res.headers.deprecation).toBe(attendus.Deprecation);
      expect(res.headers.sunset).toBe(attendus.Sunset);
      expect(res.headers.link).toContain('rel="successor-version"');
      // Le successeur est SUIVABLE : un chemin absolu, versionné, sans gabarit.
      expect(res.headers.link).toContain(`<${SOCIAL_EVENTS_SUCCESSEUR}>`);
      expect(res.headers.link).not.toMatch(/:[a-zA-Z]/);
      await app.close();
    },
  );

  it('l’annonce part AUSSI sur un refus — c’est l’appelant refusé qui doit migrer', async () => {
    const app = await buildApp(makePrisma());
    // Corps invalide ⇒ 400. Le hook est `onRequest`, donc il court AVANT la
    // validation : une adresse en sursis s'annonce quel que soit le verdict.
    const res = await app.inject({
      method: 'POST', url: `/posts/${VISIBLE_ID}/downloads`, payload: { mediaIds: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers.deprecation).toBe(attendus.Deprecation);
    expect(res.headers.link).toContain('rel="successor-version"');
    await app.close();
  });
});

describe('critère 6 — les six DÉLÈGUENT : aucune n’écrit sur un post hors audience', () => {
  it.each(SIX_PORTES.map((p) => [p.nom, p] as const))(
    'POST …/%s n’écrit RIEN pour un post hors audience',
    async (_nom, porte) => {
      const prisma = makePrisma();
      const app = await buildApp(prisma);
      await app.inject({
        method: 'POST', url: porte.url(HIDDEN_ID), payload: porte.payload(HIDDEN_ID),
        headers: { 'x-session-token': 'jeton-visiteur' },
      });

      // Aucune écriture, et aucun effet de service : c'est la propriété que
      // AUCUNE des six ne tenait avant de déléguer — l'impression ne consultait
      // pas `Post.visibility`, et `recordEngagementBatch` ne regardait que
      // `deletedAt`.
      expect(prisma.ecritures).toEqual([]);
      expect(mockRecordView).not.toHaveBeenCalled();
      expect(mockRecordAnonymousOpen).not.toHaveBeenCalled();
      expect(mockRecordMediaDownloads).not.toHaveBeenCalled();
      expect(mockRecordEngagementBatch).not.toHaveBeenCalled();
      await app.close();
    },
  );
});

describe('critère 6 — chaque alias sert encore SA forme de réponse historique', () => {
  it('`/view` rend { viewed: true }', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'POST', url: `/posts/${VISIBLE_ID}/view`, payload: {} });
    expect(res.json().data).toEqual({ viewed: true });
    await app.close();
  });

  it('`/impression` rend { recorded: true }, et 404 hors audience', async () => {
    const app = await buildApp(makePrisma());
    const ok = await app.inject({ method: 'POST', url: `/posts/${VISIBLE_ID}/impression`, payload: { source: 'feed' } });
    const ko = await app.inject({ method: 'POST', url: `/posts/${HIDDEN_ID}/impression`, payload: { source: 'feed' } });
    expect(ok.json().data).toEqual({ recorded: true });
    expect(ko.statusCode).toBe(404);
    await app.close();
  });

  it('`/impressions/batch` rend un COMPTE d’ids écrits', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [VISIBLE_ID, HIDDEN_ID], source: 'feed' },
    });
    // Deux demandés, un admis : `recorded` compte ce qui a été ÉCRIT.
    expect(res.json().data).toEqual({ recorded: 1 });
    await app.close();
  });

  it('`/downloads` rend un compte de MÉDIAS, pas d’événements', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'POST', url: `/posts/${VISIBLE_ID}/downloads`,
      payload: { mediaIds: ['m1', 'm2'], surface: 'detail' },
    });
    // UN événement de téléchargement, DEUX médias — c'est le second nombre que
    // ses clients lisent, et les confondre changerait la réponse sous eux.
    expect(res.json().data).toEqual({ recorded: 2 });
    await app.close();
  });

  it('`/anonymous-view` rend { counted: bool }', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'POST', url: `/posts/${VISIBLE_ID}/anonymous-view`,
      headers: { 'x-session-token': 'jeton-visiteur' },
    });
    expect(res.json().data).toEqual({ counted: true });
    await app.close();
  });

  it('`/anonymous-view` reste un no-op pour un client INSCRIT — pas de double comptage', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'POST', url: `/posts/${VISIBLE_ID}/anonymous-view`,
      headers: { authorization: 'Bearer jeton', 'x-session-token': 'jeton-visiteur' },
    });
    expect(res.json().data).toEqual({ counted: false });
    expect(mockRecordAnonymousOpen).not.toHaveBeenCalled();
    await app.close();
  });

  it('`/engagement/batch` rend un COMPTE de sessions', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: {
        sessions: [{
          sessionId: SESSION_ID_A, postId: VISIBLE_ID, contentType: 'POST',
          surface: 'feed', startedAt: new Date().toISOString(), dwellMs: 900,
        }],
      },
    });
    expect(res.json().data).toEqual({ recorded: 1 });
    expect(mockRecordEngagementBatch).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
