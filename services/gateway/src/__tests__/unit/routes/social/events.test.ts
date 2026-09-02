/**
 * `POST /social/events` — le point d'ingestion UNIQUE de la télémétrie de
 * lecture (#4150), et les trois témoins que son critère 7 nomme.
 *
 * ## Ce que ces témoins gardent, et pourquoi chacun rougirait
 *
 * 1. **Le lot mêlé** — un post visible, un post hors audience, un id
 *    inexistant ⇒ `recorded: 1`, `rejected: 2`, statut 200. Le compteur seul ne
 *    suffit PAS : une ACL qui COMPTE sans FILTRER passerait au vert dessus.
 *    Le double Prisma enregistre donc toute écriture, et le témoin exige
 *    l'ABSENCE d'écriture pour les deux ids rejetés — c'est la moitié qui
 *    attrape le défaut réel.
 *
 * 2. **L'oracle d'existence** — un post INEXISTANT et un post HORS AUDIENCE
 *    doivent produire la MÊME réponse, octet pour octet. C'est le témoin qui
 *    rougit si quelqu'un rétablit un 404 « utile » (« le post n'existe pas »
 *    d'un côté, « vous n'y avez pas droit » de l'autre) : la différence, à
 *    elle seule, révèle l'existence du post. La route unitaire d'impression a
 *    porté exactement ce défaut (500 P2025 = « il existe », 200 = « il
 *    n'existe pas »).
 *
 * 3. **La clé de seau anonyme** — elle varie avec `(sessionToken, postId)` et
 *    JAMAIS avec l'adresse. L'ancienne clé (`posts:view:ip:…`) était UN SEUL
 *    seau pour tous les visiteurs d'une même sortie, quel que soit le post :
 *    inefficace comme garde, et déni de service mutuel entre visiteurs
 *    légitimes. Le témoin fait varier chaque composante à son tour — deux
 *    jetons, deux posts, deux adresses — parce qu'un témoin qui n'en varie
 *    qu'une ne distingue pas « la clé contient le jeton » de « la clé est le
 *    jeton ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Doubles de service ───────────────────────────────────────────────────────

const mockRecordView = jest.fn<any>().mockResolvedValue(true);
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);
const mockRecordAnonymousOpen = jest.fn<any>().mockResolvedValue(true);
const mockRecordMediaDownloads = jest.fn<any>().mockResolvedValue({ recorded: 1 });
const mockRecordEngagementBatch = jest.fn<any>().mockResolvedValue(1);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    recordView: (...a: any[]) => mockRecordView(...a),
    getPostById: (...a: any[]) => mockGetPostById(...a),
    recordAnonymousOpen: (...a: any[]) => mockRecordAnonymousOpen(...a),
    recordMediaDownloads: (...a: any[]) => mockRecordMediaDownloads(...a),
    recordEngagementBatch: (...a: any[]) => mockRecordEngagementBatch(...a),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

// Le limiteur RÉEL est exercé par son propre témoin (partie 3 ci-dessous, sur
// la fabrique de clé). Ici il est neutralisé pour que les deux premiers
// témoins portent sur l'ACL, et rien d'autre.
jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

import {
  registerSocialEventRoutes,
  socialEventsRateLimitKey,
  SOCIAL_EVENTS_BATCH_CAP,
} from '../../../../routes/social/events';

// ─── Constantes ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd7994390aa';

/** Existe ET visible — le seul des trois qui doit produire une écriture. */
const VISIBLE_ID = '507f1f77bcf86cd799439022';
/** Existe mais PRIVATE d'un autre auteur — hors audience. */
const HIDDEN_ID = '507f1f77bcf86cd799439033';
/** N'existe pas du tout — aucune ligne en base. */
const MISSING_ID = '507f1f77bcf86cd799439044';

// ─── Double Prisma qui ENREGISTRE ses écritures ───────────────────────────────

type Ecriture = { readonly modele: string; readonly op: string; readonly args: any };

/**
 * Le double n'est pas un simple `mockResolvedValue` : il tient le JOURNAL des
 * écritures, parce que le critère 7 exige de prouver l'ABSENCE d'écriture pour
 * les ids rejetés — pas seulement un compteur juste.
 *
 * `post.findMany` répond comme la base : la LIGNE existe pour `VISIBLE_ID` et
 * `HIDDEN_ID`, elle est absente pour `MISSING_ID`. C'est ensuite l'audience
 * (`canUserConsumePost`, PRIVATE ⇒ refus sans requête supplémentaire) qui
 * écarte `HIDDEN_ID`. Les deux ids sortent donc de l'ensemble par des chemins
 * DIFFÉRENTS — c'est exactement ce qui rend le témoin 2 significatif.
 */
function makePrisma() {
  const ecritures: Ecriture[] = [];
  const journalise = (modele: string, op: string, resultat: unknown) =>
    jest.fn<any>().mockImplementation((args: any) => {
      ecritures.push({ modele, op, args });
      return Promise.resolve(resultat);
    });

  const prisma = {
    ecritures,
    post: {
      findMany: jest.fn<any>().mockImplementation(({ where, select }: any) => {
        // Passe de résolution des racines de repost : aucun repost ici.
        if (where?.repostOfId !== undefined) return Promise.resolve([]);
        const demandes: string[] = where?.id?.in ?? [];
        const lignes = demandes
          .filter((id) => id === VISIBLE_ID || id === HIDDEN_ID)
          .map((id) => ({
            id,
            authorId: AUTHOR_ID,
            visibility: id === VISIBLE_ID ? 'PUBLIC' : 'PRIVATE',
            visibilityUserIds: [] as string[],
            expiresAt: null,
          }));
        // Le filtre ANONYME ne demande que l'id, et la base ne rend alors que
        // ce qui est PUBLIC : `HIDDEN_ID` n'en sort pas.
        if (select && Object.keys(select).length === 1 && select.id === true) {
          return Promise.resolve(lignes.filter((l) => l.visibility === 'PUBLIC').map((l) => ({ id: l.id })));
        }
        return Promise.resolve(lignes);
      }),
      update: journalise('post', 'update', { repostOfId: null, originalRepostOfId: null }),
      updateMany: journalise('post', 'updateMany', { count: 1 }),
    },
    postImpression: {
      create: journalise('postImpression', 'create', {}),
      createMany: journalise('postImpression', 'createMany', { count: 1 }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postMention: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
  return prisma;
}

// ─── Échafaudage ──────────────────────────────────────────────────────────────

async function buildApp(opts: { authenticated?: boolean; prisma?: any } = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', {
    markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
  });
  app.decorate('socialEvents', {
    broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
  });
  // `createUnifiedAuthMiddleware` est remplacé par une COUTURE — ces suites
  // exercent l'ACL d'AUDIENCE, pas la résolution du jeton. C'est pourquoi le
  // registrar prend son middleware en paramètre : la porte est OPTIONNELLEMENT
  // authentifiée, et ses deux acteurs doivent s'exercer sans fabriquer de JWT.
  const optionalAuth = async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } }
      : null;
  };

  registerSocialEventRoutes(app, prisma as any, optionalAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordView.mockResolvedValue(true);
  mockGetPostById.mockResolvedValue(null);
  mockRecordAnonymousOpen.mockResolvedValue(true);
  mockRecordMediaDownloads.mockResolvedValue({ recorded: 1 });
  mockRecordEngagementBatch.mockResolvedValue(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// TÉMOIN 1 — le lot mêlé : compteurs JUSTES et aucune écriture pour les rejetés
// ─────────────────────────────────────────────────────────────────────────────

describe('critère 7.1 — un lot mêlé compte juste ET n’écrit rien pour les rejetés', () => {
  it('rend { recorded: 1, rejected: 2 } en 200 sur visible + hors-audience + inexistant', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: [
          { type: 'impression', postId: VISIBLE_ID, source: 'feed' },
          { type: 'impression', postId: HIDDEN_ID, source: 'feed' },
          { type: 'impression', postId: MISSING_ID, source: 'feed' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual({ recorded: 1, rejected: 2 });
    await app.close();
  });

  it('n’écrit AUCUNE ligne portant l’id hors audience ou l’id inexistant', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });

    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: [
          { type: 'impression', postId: VISIBLE_ID, source: 'feed' },
          { type: 'impression', postId: HIDDEN_ID, source: 'feed' },
          { type: 'impression', postId: MISSING_ID, source: 'feed' },
        ],
      },
    });

    // Le journal complet, sérialisé : un id rejeté ne doit apparaître dans
    // AUCUN argument d'AUCUNE écriture — ni dans un `data`, ni dans un `where`,
    // ni au fond d'un `in`. Chercher la CHAÎNE plutôt qu'un champ nommé est ce
    // qui rend ce témoin robuste à la forme de la requête écrite.
    const journal = JSON.stringify(prisma.ecritures);
    expect(prisma.ecritures.length).toBeGreaterThan(0);
    expect(journal).toContain(VISIBLE_ID);
    expect(journal).not.toContain(HIDDEN_ID);
    expect(journal).not.toContain(MISSING_ID);
    await app.close();
  });

  it('n’écrit RIEN du tout quand aucun id du lot ne survit à l’audience', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: [
          { type: 'impression', postId: HIDDEN_ID, source: 'feed' },
          { type: 'view', postId: MISSING_ID },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual({ recorded: 0, rejected: 2 });
    expect(prisma.ecritures).toEqual([]);
    // L'effet de la vue ne part pas non plus : `recordView` n'est jamais
    // appelé sur un id que l'audience vient d'écarter.
    expect(mockRecordView).not.toHaveBeenCalled();
    await app.close();
  });

  it('réduit les ids en UNE passe — jamais une lecture d’audience par événement', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });

    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: [
          { type: 'impression', postId: VISIBLE_ID, source: 'feed' },
          { type: 'impression', postId: VISIBLE_ID, source: 'detail' },
          { type: 'view', postId: HIDDEN_ID },
          { type: 'view', postId: MISSING_ID },
        ],
      },
    });

    // La passe d'audience se reconnaît à sa TRANCHE ACL (`visibility`), pas au
    // seul `where.id.in` : la résolution des racines de repost porte le même
    // `in` et pose une AUTRE question (`repostOfId`), sur les seuls ids DÉJÀ
    // admis. Les compter ensemble ferait rougir ce témoin sur une requête
    // légitime — et, pire, le rendrait vert si quelqu'un remplaçait la passe
    // d'audience par N lectures unitaires portant chacune son `in` d'un id.
    const passesAudience = prisma.post.findMany.mock.calls.filter(
      ([args]: any[]) => args?.select?.visibility === true,
    );
    expect(passesAudience).toHaveLength(1);
    expect([...(passesAudience[0] as any)[0].where.id.in].sort()).toEqual(
      [VISIBLE_ID, HIDDEN_ID, MISSING_ID].sort(),
    );
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TÉMOIN 2 — l'oracle d'existence est FERMÉ
// ─────────────────────────────────────────────────────────────────────────────

describe('critère 7.2 — un post inexistant et un post hors audience sont indistinguables', () => {
  const envoyer = async (postId: string) => {
    const app = await buildApp({ prisma: makePrisma() });
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'impression', postId, source: 'feed' }] },
    });
    await app.close();
    return res;
  };

  it('rend le MÊME statut et le MÊME corps dans les deux cas', async () => {
    const horsAudience = await envoyer(HIDDEN_ID);
    const inexistant = await envoyer(MISSING_ID);

    expect(horsAudience.statusCode).toBe(inexistant.statusCode);
    expect(horsAudience.payload).toBe(inexistant.payload);
    // Et ce corps commun ne dit rien de plus que le décompte : pas de 404
    // « utile », pas de code d'erreur qui nommerait l'un des deux cas.
    expect(JSON.parse(inexistant.payload).data).toEqual({ recorded: 0, rejected: 1 });
  });

  it('ne sort JAMAIS en 500 sur un id inconnu — l’ancien P2025 est le même oracle', async () => {
    const res = await envoyer(MISSING_ID);
    expect(res.statusCode).toBe(200);
  });

  it('traite un id MALFORMÉ comme les deux autres — quatrième membre de la famille', async () => {
    const app = await buildApp({ prisma: makePrisma() });
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'impression', postId: 'pas-un-objectid', source: 'feed' }] },
    });
    // Un identifiant qui n'est pas un ObjectId est refusé par le SCHÉMA, avant
    // toute lecture : il ne peut désigner aucun document, et le laisser
    // atteindre Mongo ferait lever P2023 — un 500 qui, lui aussi, distingue.
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TÉMOIN 3 — la clé de seau anonyme
// ─────────────────────────────────────────────────────────────────────────────

describe('critère 7.3 — la clé anonyme varie avec (sessionToken, postId), jamais avec l’IP', () => {
  const requete = (opts: { sessionToken?: string; postId?: string; ip?: string; userId?: string }) =>
    ({
      ip: opts.ip ?? '203.0.113.7',
      headers: opts.sessionToken ? { 'x-session-token': opts.sessionToken } : {},
      body: opts.postId ? { events: [{ type: 'view', postId: opts.postId }] } : undefined,
      authContext: opts.userId ? { userId: opts.userId, registeredUser: { id: opts.userId } } : undefined,
    }) as unknown as FastifyRequest;

  it('change quand le JETON change, à post et adresse constants', () => {
    const a = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-a', postId: VISIBLE_ID }));
    const b = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-b', postId: VISIBLE_ID }));
    expect(a).not.toBe(b);
  });

  it('change quand le POST change, à jeton et adresse constants', () => {
    const a = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-a', postId: VISIBLE_ID }));
    const b = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-a', postId: HIDDEN_ID }));
    expect(a).not.toBe(b);
  });

  it('ne change PAS quand seule l’adresse change — la clé n’en dépend pas', () => {
    const a = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-a', postId: VISIBLE_ID, ip: '203.0.113.7' }));
    const b = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-a', postId: VISIBLE_ID, ip: '198.51.100.9' }));
    expect(a).toBe(b);
    expect(a).not.toContain('203.0.113.7');
    expect(a).not.toContain('198.51.100.9');
  });

  it('porte le jeton ET le post — un seul seau pour la plateforme est exclu', () => {
    const cle = socialEventsRateLimitKey(requete({ sessionToken: 'jeton-a', postId: VISIBLE_ID }));
    expect(cle).toBe(`social:events:jeton-a:${VISIBLE_ID}`);
  });

  it('compte un appelant AUTHENTIFIÉ sur son compte, jamais sur son adresse', () => {
    const a = socialEventsRateLimitKey(requete({ userId: USER_ID, postId: VISIBLE_ID, ip: '203.0.113.7' }));
    const b = socialEventsRateLimitKey(requete({ userId: USER_ID, postId: HIDDEN_ID, ip: '198.51.100.9' }));
    expect(a).toBe(`social:events:${USER_ID}`);
    // Le seau d'un compte ne se scinde PAS par post : 30/min couvre le lot
    // entier, quel que soit ce qu'il observe.
    expect(a).toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le contrat de la porte : schéma typé, borne du lot, borne de `durationMs`
// ─────────────────────────────────────────────────────────────────────────────

describe('critère 1 — le lot est typé, borné, et sans `any`', () => {
  it('refuse un `type` inconnu — l’union discriminée n’a pas de branche « autre »', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'scroll', postId: VISIBLE_ID }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuse un `durationMs` hors borne — la borne est à la FRONTIÈRE', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID, durationMs: 999_999_999 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(mockRecordView).not.toHaveBeenCalled();
    await app.close();
  });

  it(`refuse un lot de plus de ${SOCIAL_EVENTS_BATCH_CAP} événements`, async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: Array.from({ length: SOCIAL_EVENTS_BATCH_CAP + 1 }, () => ({
          type: 'impression',
          postId: VISIBLE_ID,
          source: 'feed',
        })),
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('accepte un lot VIDE — « rien observé » est un succès à zéro', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual({ recorded: 0, rejected: 0 });
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Critère 3 — les effets de bord restent attachés à leur TYPE
// ─────────────────────────────────────────────────────────────────────────────

describe('critère 3 — un `view` garde ses deux effets de bord', () => {
  it('marque les notifications du post comme lues à la PREMIÈRE occurrence', async () => {
    const app = await buildApp();
    mockRecordView.mockResolvedValue(true);

    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });

    expect((app as any).notificationService.markPostNotificationsAsRead)
      .toHaveBeenCalledWith(USER_ID, VISIBLE_ID);
    await app.close();
  });

  it('ne les remarque PAS quand la vue n’est pas nouvelle', async () => {
    const app = await buildApp();
    mockRecordView.mockResolvedValue(false);

    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });

    expect((app as any).notificationService.markPostNotificationsAsRead).not.toHaveBeenCalled();
    await app.close();
  });

  it('diffuse `story:viewed` à l’auteur quand le post est une STORY', async () => {
    const app = await buildApp();
    mockGetPostById.mockResolvedValue({
      id: VISIBLE_ID, type: 'STORY', authorId: AUTHOR_ID, viewCount: 7,
    });

    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });

    expect((app as any).socialEvents.broadcastStoryViewed).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: VISIBLE_ID, viewerId: USER_ID, viewCount: 7 }),
      AUTHOR_ID,
    );
    await app.close();
  });

  it('ne diffuse RIEN quand le lecteur est l’auteur de la story', async () => {
    const app = await buildApp();
    mockGetPostById.mockResolvedValue({
      id: VISIBLE_ID, type: 'STORY', authorId: USER_ID, viewCount: 7,
    });

    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });

    expect((app as any).socialEvents.broadcastStoryViewed).not.toHaveBeenCalled();
    await app.close();
  });

  it('un échec de la diffusion ne fait pas échouer la requête — la vue est déjà écrite', async () => {
    const app = await buildApp();
    mockGetPostById.mockRejectedValue(new Error('lecture lourde en panne'));

    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual({ recorded: 1, rejected: 0 });
    await app.close();
  });
});

describe('critère 3 — `download` et `dwell` gardent leur effet propre', () => {
  it('un `download` admis appelle `recordMediaDownloads` avec ses médias', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: [{ type: 'download', postId: VISIBLE_ID, mediaIds: ['m1', 'm2'], surface: 'detail' }],
      },
    });
    expect(mockRecordMediaDownloads).toHaveBeenCalledWith(
      VISIBLE_ID, USER_ID, { mediaIds: ['m1', 'm2'], surface: 'detail' },
    );
    await app.close();
  });

  it('un `download` sur un post hors audience n’appelle RIEN', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: {
        events: [{ type: 'download', postId: HIDDEN_ID, mediaIds: ['m1'], surface: 'detail' }],
      },
    });
    expect(mockRecordMediaDownloads).not.toHaveBeenCalled();
    await app.close();
  });

  it('un `dwell` admis part en UN appel de lot, jamais un par session', async () => {
    const app = await buildApp();
    const session = {
      type: 'dwell',
      sessionId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      postId: VISIBLE_ID,
      contentType: 'POST',
      surface: 'feed',
      startedAt: new Date().toISOString(),
      dwellMs: 1200,
    };
    await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { authorization: 'Bearer jeton' },
      payload: { events: [session, { ...session, sessionId: '3f2504e0-4f89-11d3-9a0c-0305e82c3302' }] },
    });
    expect(mockRecordEngagementBatch).toHaveBeenCalledTimes(1);
    expect((mockRecordEngagementBatch.mock.calls[0] as any)[0]).toHaveLength(2);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La variante ANONYME — même route, sans jeton porteur
// ─────────────────────────────────────────────────────────────────────────────

describe('critère 4 — la variante anonyme est la MÊME route', () => {
  it('accepte un `view` sans jeton porteur, avec un X-Session-Token', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { 'x-session-token': 'jeton-visiteur' },
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockRecordAnonymousOpen).toHaveBeenCalledWith(VISIBLE_ID, 'jeton-visiteur');
    await app.close();
  });

  it('un anonyme ne voit QUE le public — un post hors audience est rejeté sans écriture', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { 'x-session-token': 'jeton-visiteur' },
      payload: { events: [{ type: 'view', postId: HIDDEN_ID }] },
    });
    expect(JSON.parse(res.payload).data).toEqual({ recorded: 0, rejected: 1 });
    expect(mockRecordAnonymousOpen).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un anonyme SANS jeton de session — il n’a alors aucune identité de seau', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      payload: { events: [{ type: 'view', postId: VISIBLE_ID }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuse à un anonyme les types qu’il ne peut pas produire', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST',
      url: '/social/events',
      headers: { 'x-session-token': 'jeton-visiteur' },
      payload: {
        events: [{ type: 'download', postId: VISIBLE_ID, mediaIds: ['m1'], surface: 'detail' }],
      },
    });
    expect(res.statusCode).toBe(403);
    expect(mockRecordMediaDownloads).not.toHaveBeenCalled();
    await app.close();
  });
});
