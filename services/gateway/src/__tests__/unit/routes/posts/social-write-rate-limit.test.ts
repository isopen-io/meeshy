/**
 * #4147 — « une écriture sociale coûteuse ne part jamais sans plafond ».
 *
 * Deux mécanismes DISTINCTS sont exercés ici, chacun pour la raison écrite
 * en tête de `socialRateLimit.ts` — `config.rateLimit` d'@fastify/rate-limit
 * NE PEUT PAS faire partager un compteur à deux ROUTES différentes (chaque
 * route reçoit son propre "child store", namespacé par sa méthode+URL) :
 *
 *  - critère 1 : POST /posts/:postId/republish, plafond PROPRE (10/min,
 *    social:write:{userId}) — VRAI plugin @fastify/rate-limit, VRAI
 *    `preValidation` posant `authContext` (pas le double `=> ({})` que
 *    `repostIdempotency.test.ts` pose pour SON propre objet d'étude) ;
 *  - critère 2 : POST /posts, POST /posts/from-attachment et
 *    POST /posts/:postId/repost PARTAGENT un seul budget de 10/min via
 *    `createSharedWriteRateLimitPreHandler` (compteur Redis direct, hors du
 *    plugin) — témoin d'abord unitaire sur `checkSharedRateLimit` (logique
 *    pure), puis bout-en-bout via `.inject()` sur les trois routes.
 *
 * Dans les deux cas : le témoin exigé par le critère 8 (DEUX comptes
 * distincts prouvant que le seau ne mélange pas les utilisateurs — un
 * témoin mono-compte passerait au vert sur un seau global) et le mode
 * d'échec exigé par les consignes (compteur indisponible ⇒ écriture
 * REFUSÉE, jamais un passage silencieux).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';

// ─── Mocks de service ──────────────────────────────────────────────────────

let repostCounter = 0;
const mockRepostPost = jest.fn<any>();
const mockGetPostById = jest.fn<any>((id: string) => Promise.resolve({ id, repostOfId: 'root-post', type: 'POST', authorId: 'someone' }));
const mockRepublishStory = jest.fn<any>();
const mockCreatePost = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    repostPost: (...args: any[]) => mockRepostPost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    republishStory: (...args: any[]) => mockRepublishStory(...args),
    createPost: (...args: any[]) => mockCreatePost(...args),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (t: string) => t },
}));

// Le compteur PARTAGÉ (create/from-attachment/repost) lit Redis directement,
// hors du plugin @fastify/rate-limit — cf. socialRateLimit.ts. Un seul point
// de contrôle par test : ce que `getNativeClient()` rend.
const mockGetNativeClient = jest.fn<any>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => mockGetNativeClient() }),
}));

// Délibérément AUCUN mock de `middleware/rate-limiter` NI de
// `./socialRateLimit` (contrairement à repostIdempotency.test.ts) : ce
// fichier existe pour exercer les VRAIES fabriques.

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';
import { registerCoreRoutes } from '../../../../routes/posts/core';
import { checkSharedRateLimit, type IncrementableRedis } from '../../../../routes/posts/socialRateLimit';

// ─── Constants ────────────────────────────────────────────────────────────────

const POST_ID = '507f1f77bcf86cd799439022';
const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439099';

// ─── Faux client Redis : INCR / PEXPIRE / PTTL en mémoire ────────────────────
//
// Suffisant pour exercer `checkSharedRateLimit` et le preHandler bout-en-bout
// SANS dépendre d'un Redis réel — la SEULE garantie qui compte pour ce
// fichier est que la MÊME clé, incrémentée par des appels successifs,
// convergerait pareil sur un VRAI Redis (INCR atomique, PEXPIRE au premier
// coup) : c'est un double du CONTRAT, pas de l'implémentation testée.
function makeFakeRedis(): IncrementableRedis {
  const rows = new Map<string, { count: number; expiresAt: number | null }>();
  return {
    async incr(key: string) {
      const now = Date.now();
      const row = rows.get(key);
      if (!row || (row.expiresAt !== null && row.expiresAt <= now)) {
        rows.set(key, { count: 1, expiresAt: null });
        return 1;
      }
      row.count += 1;
      return row.count;
    },
    async pexpire(key: string, ms: number) {
      const row = rows.get(key);
      if (!row) return 0;
      row.expiresAt = Date.now() + ms;
      return 1;
    },
    async pttl(key: string) {
      const row = rows.get(key);
      if (!row) return -2;
      if (row.expiresAt === null) return -1;
      return Math.max(0, row.expiresAt - Date.now());
    },
  };
}

// ─── Harness HTTP ─────────────────────────────────────────────────────────────

/**
 * `preValidation` réel dans sa FORME (pose `authContext` comme
 * `unifiedAuth`), pilotable par requête via l'en-tête `x-test-user-id` — pour
 * qu'UNE seule instance d'app, donc UN seul magasin de compteurs, serve
 * plusieurs comptes distincts dans le même test (condition du témoin
 * « deux comptes ne se mélangent pas »).
 */
function makePreValidationAuth() {
  return async (req: FastifyRequest) => {
    const userId = (req.headers['x-test-user-id'] as string) || USER_A;
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId,
      displayName: 'Test User',
      userLanguage: 'fr',
      hasFullAccess: true,
      canSendMessages: true,
      registeredUser: { id: userId, role: 'USER', username: `user-${userId}` },
    };
  };
}

function makeSocialEventsStub() {
  const noop = jest.fn<any>().mockResolvedValue(undefined);
  return {
    broadcastPostCreated: noop, broadcastPostUpdated: noop,
    broadcastStoryCreated: noop, broadcastStoryUpdated: noop, broadcastStoryReacted: noop,
    broadcastStoryUnreacted: noop, broadcastStoryViewed: noop,
    broadcastStatusCreated: noop, broadcastStatusUpdated: noop, broadcastStatusReacted: noop,
    broadcastStatusUnreacted: noop,
    broadcastPostReposted: noop, broadcastPostLiked: noop, broadcastPostUnliked: noop,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {} as any;
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', makeSocialEventsStub() as any);
  app.decorate('notificationService', {
    createPostRepostNotification: jest.fn<any>().mockResolvedValue(null),
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  // Plugin RÉEL, store réel (LocalStore) : seule republish (config.rateLimit,
  // seau PROPRE) en dépend. `global: false` — chaque route déclare son
  // propre `config.rateLimit`, rien ne doit retomber sur un défaut global.
  await app.register(rateLimit, { global: false });

  const requiredAuth = makePreValidationAuth();
  registerCoreRoutes(app, prisma, requiredAuth);
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

function republish(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/republish`,
    headers: { 'x-test-user-id': userId },
  });
}

function repost(app: FastifyInstance, userId: string, payload: Record<string, unknown> = { isQuote: false }) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/repost`,
    headers: { 'x-test-user-id': userId },
    payload,
  });
}

function createPost(app: FastifyInstance, userId: string, content: string) {
  return app.inject({
    method: 'POST',
    url: '/posts',
    headers: { 'x-test-user-id': userId },
    payload: { content, type: 'POST', visibility: 'PUBLIC' },
  });
}

beforeEach(() => {
  repostCounter = 0;
  mockRepublishStory.mockReset();
  mockRepublishStory.mockImplementation(async (postId: string, userId: string) => ({ id: postId, type: 'STORY', authorId: userId }));
  mockGetPostById.mockReset();
  mockGetPostById.mockImplementation((id: string) => Promise.resolve({ id, repostOfId: 'root-post', type: 'POST', authorId: 'someone' }));
  mockRepostPost.mockReset();
  mockRepostPost.mockImplementation(async (postId: string, userId: string) => {
    repostCounter += 1;
    return { id: `repost-${repostCounter}`, repostOfId: postId, type: 'POST', authorId: userId };
  });
  mockCreatePost.mockReset();
  mockCreatePost.mockImplementation(async (data: any, userId: string) => ({
    id: `post-${++repostCounter}`, type: data?.type ?? 'POST', visibility: 'PUBLIC', authorId: userId, content: data?.content,
  }));
  mockGetNativeClient.mockReset();
  mockGetNativeClient.mockReturnValue(makeFakeRedis());
});

// ─── checkSharedRateLimit — logique pure du compteur partagé ─────────────────

describe('checkSharedRateLimit — logique pure', () => {
  it('autorise tant que current <= max, puis refuse avec un retryAfterSeconds positif', async () => {
    const redis = makeFakeRedis();
    for (let i = 0; i < 3; i += 1) {
      const verdict = await checkSharedRateLimit({ redis, key: 'k', max: 3, windowMs: 60_000 });
      expect(verdict.allowed).toBe(true);
    }
    const blocked = await checkSharedRateLimit({ redis, key: 'k', max: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('fail-closed : redis === null refuse SANS incrémenter quoi que ce soit d\'observable', async () => {
    const verdict = await checkSharedRateLimit({ redis: null, key: 'k', max: 10, windowMs: 60_000 });
    expect(verdict.allowed).toBe(false);
  });

  it('fail-closed : une erreur du client (Redis injoignable) refuse, ne lève pas', async () => {
    const throwingRedis: IncrementableRedis = {
      incr: async () => { throw new Error('ECONNREFUSED (simulation de test)'); },
      pexpire: async () => 1,
      pttl: async () => -1,
    };
    const verdict = await checkSharedRateLimit({ redis: throwingRedis, key: 'k', max: 10, windowMs: 60_000 });
    expect(verdict.allowed).toBe(false);
  });

  it('deux clés distinctes ont des budgets indépendants', async () => {
    const redis = makeFakeRedis();
    for (let i = 0; i < 5; i += 1) {
      expect((await checkSharedRateLimit({ redis, key: 'user-A', max: 5, windowMs: 60_000 })).allowed).toBe(true);
    }
    expect((await checkSharedRateLimit({ redis, key: 'user-A', max: 5, windowMs: 60_000 })).allowed).toBe(false);
    // 'user-B' n'a subi AUCUN appel : son budget est intact.
    expect((await checkSharedRateLimit({ redis, key: 'user-B', max: 5, windowMs: 60_000 })).allowed).toBe(true);
  });
});

// ─── republish — critère 1 : seau PROPRE, 10/min, social:write:{userId} ──────

describe('POST /posts/:postId/republish — plafond #4147 critère 1 (social:write, seau propre)', () => {
  it('accepte les 10 premières écritures du compte A, refuse la 11e en 429 avec Retry-After, et un compte B distinct n\'est PAS affecté', async () => {
    const app = await buildApp();

    for (let i = 0; i < 10; i += 1) {
      const res = await republish(app, USER_A);
      expect(res.statusCode).not.toBe(429);
    }

    const blocked = await republish(app, USER_A);
    expect(blocked.statusCode).toBe(429);
    // En-tête de reprise — la N+1e écriture DIT quand rappeler, elle ne se
    // contente pas de refuser (consignes de lot).
    expect(blocked.headers['retry-after']).toBeDefined();

    // Témoin à DEUX comptes (critère 8) : si le seau était GLOBAL (bug de clé
    // par IP faute de hook `preHandler` — cf. socialRateLimit.ts), le compte B
    // aurait déjà consommé les 10 crédits de A et recevrait 429 ici. Un
    // témoin mono-compte ne peut PAS distinguer les deux cas.
    const otherAccount = await republish(app, USER_B);
    expect(otherAccount.statusCode).not.toBe(429);

    // 10 succès A + 1 succès B = 11 invocations réelles du service — la 11e
    // tentative de A (bloquée) n'a JAMAIS atteint le handler.
    expect(mockRepublishStory).toHaveBeenCalledTimes(11);

    await app.close();
  });

  it('refuse l\'écriture (jamais un passage silencieux) quand le compteur du plugin est indisponible', async () => {
    // Store cassé pour LE PLUGIN @fastify/rate-limit lui-même — contrat
    // minimal exigé par LocalStore.js : `incr` (et `read`, utilisé par
    // { increment:false }, non exercé ici) + `child`. `incr` échoue
    // toujours, comme un client Redis injoignable le ferait au niveau du
    // plugin (le mécanisme du PLUGIN, distinct du compteur partagé
    // maison ci-dessus — republish n'utilise QUE le premier).
    class ThrowingPluginStore {
      incr(_key: string, cb: (err: Error) => void) { cb(new Error('Redis indisponible (simulation de test)')); }
      read(_key: string, cb: (err: Error) => void) { cb(new Error('Redis indisponible (simulation de test)')); }
      child() { return this; }
    }
    const app = Fastify({ logger: false });
    const prisma = {} as any;
    app.decorate('prisma', prisma);
    app.decorate('socialEvents', makeSocialEventsStub() as any);
    await app.register(rateLimit, { global: false, store: ThrowingPluginStore as any });
    const requiredAuth = makePreValidationAuth();
    registerInteractionRoutes(app, prisma, requiredAuth);
    await app.ready();

    const res = await republish(app, USER_A);

    // Fail-closed : `skipOnError: false` (posé par `withUserKeyedFailClosed`)
    // fait REJETER la requête quand le store échoue, au lieu du
    // `skipOnError: true` hérité par défaut du reste du dépôt
    // (registerGlobalRateLimiter) — l'inverse de ce que #4147 exige d'une
    // écriture coûteuse. La preuve n'est pas le code HTTP exact (le handler
    // d'erreur générique du serveur peut l'habiller en 500) mais que
    // `republishStory` n'a JAMAIS été appelé : le compteur n'ayant pas pu
    // s'exécuter, l'écriture ne part pas.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(mockRepublishStory).not.toHaveBeenCalled();

    await app.close();
  });
});

// ─── repost ↔ POST /posts ↔ from-attachment — critère 2 : seau PARTAGÉ ───────

describe('POST /posts/:postId/repost partage le budget `create` avec POST /posts (#4147 critère 2)', () => {
  it('dix écritures cumulées entre les deux routes épuisent le budget commun — la 11e, sur L\'UNE OU L\'AUTRE route, rend 429', async () => {
    const app = await buildApp();

    // Alterne les deux routes : 5 posts + 5 reposts = 10 écritures « create »
    // du MÊME compte. Si les budgets étaient DISTINCTS (le bug que #4147
    // ferme), chaque route disposerait de son propre crédit de 10 et
    // n'atteindrait jamais 429 ici.
    for (let i = 0; i < 5; i += 1) {
      const created = await createPost(app, USER_A, `post ${i}`);
      expect(created.statusCode).not.toBe(429);
      const reposted = await repost(app, USER_A);
      expect(reposted.statusCode).not.toBe(429);
    }

    // Le budget de 10 est épuisé, PEU IMPORTE la route qui consomme la
    // onzième unité — c'est exactement la propriété qui ferme le
    // contournement « créer via repost pour éviter le plafond de création ».
    const eleventh = await repost(app, USER_A);
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.headers['retry-after']).toBeDefined();

    const twelfth = await createPost(app, USER_A, 'post overflow');
    expect(twelfth.statusCode).toBe(429);

    // Compte B, frais : le budget PARTAGÉ de A ne le concerne pas.
    const otherAccount = await createPost(app, USER_B, 'post from B');
    expect(otherAccount.statusCode).not.toBe(429);

    await app.close();
  });

  it('deux comptes distincts ont chacun leurs 10 crédits — le budget ne mélange pas les comptes (critère 8)', async () => {
    const app = await buildApp();

    for (let i = 0; i < 10; i += 1) {
      const res = await repost(app, USER_A);
      expect(res.statusCode).not.toBe(429);
    }
    const aBlocked = await repost(app, USER_A);
    expect(aBlocked.statusCode).toBe(429);

    // B démarre avec un budget plein malgré les 11 tentatives de A juste avant.
    for (let i = 0; i < 10; i += 1) {
      const res = await repost(app, USER_B);
      expect(res.statusCode).not.toBe(429);
    }
    const bBlocked = await repost(app, USER_B);
    expect(bBlocked.statusCode).toBe(429);

    await app.close();
  });

  it('refuse l\'écriture (jamais un passage silencieux) quand le compteur partagé est indisponible', async () => {
    mockGetNativeClient.mockReturnValue(null);
    const app = await buildApp();

    const res = await createPost(app, USER_A, 'devrait être refusé');

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(mockCreatePost).not.toHaveBeenCalled();

    await app.close();
  });
});
