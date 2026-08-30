/**
 * GET /social/posts?scope={hashtag,sound,nearby} — #4346.
 *
 * Les trois dernières listes de posts (hashtag, proximité, son) rejoignent
 * l'union discriminée de #4149. Contrairement aux huit scopes couverts par
 * `social-posts-scope.test.ts` (qui mocke `PostFeedService` en entier),
 * `hashtag`/`nearby`/`sound` parlent DIRECTEMENT à Prisma (`hashtag.ts` /
 * `nearby.ts` / `sounds.ts`) — d'où un double de CLIENT Prisma plutôt qu'un
 * mock de service.
 *
 * L'app de test monte les QUATRE registrars (feed + hashtag + nearby +
 * sounds) sur la MÊME instance Fastify, exactement comme `routes/posts/
 * index.ts` en production — condition nécessaire pour que le témoin de
 * PARITÉ appelle réellement les DEUX adresses (historique et `scope=…`)
 * contre le MÊME état, et traverse le VRAI sérialiseur (`app.inject()`,
 * jamais un double du handler).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Double CacheStore — sert `PostFeedService` (construit par
//     `registerFeedRoutes`, jamais exercé ici) ET `verifierPlafondDecouverteScope`
//     (nearby.ts), qui lit `getCacheStore().getNativeClient()`. ───────────────

const mockGetNativeClient = jest.fn<any>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => mockGetNativeClient() }),
}));

/** Même double que `social-write-rate-limit.test.ts` (#4147) — un contrat,
 * pas une implémentation : INCR/PEXPIRE/PTTL en mémoire, suffisant pour
 * exercer `checkSharedRateLimit` sans Redis réel. */
function makeFakeRedis() {
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerFeedRoutes } from '../../../../routes/posts/feed';
import { registerHashtagRoutes } from '../../../../routes/posts/hashtag';
import { registerNearbyRoutes } from '../../../../routes/posts/nearby';
import { registerSoundRoutes } from '../../../../routes/posts/sounds';

// ─── Double Prisma minimal — interprète les `where` réellement composés par
//     hashtag.ts / nearby.ts / sounds.ts contre un jeu de posts en mémoire.
//     Ce n'est PAS une réimplémentation du handler (interdit, CLAUDE.md § Tests) :
//     c'est un filtre GÉNÉRIQUE sur des clés Prisma connues (id/authorId/type/
//     visibility/deletedAt in/OR), suffisant pour que le gate d'audience des
//     TROIS loaders (partagé avec leur route historique) soit réellement
//     EXERCÉ par ce témoin plutôt que court-circuité par un mock qui rend
//     toujours la même chose. ───────────────────────────────────────────────

type FakePost = {
  id: string;
  authorId: string;
  visibility: string;
  type: string;
  deletedAt: Date | null;
  content?: string;
  createdAt: Date;
  likeCount?: number;
  viewCount?: number;
};

function matchesWhere(post: FakePost, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, val]) => {
    if (key === 'OR') {
      return (val as Array<Record<string, unknown>>).some((sub) => matchesWhere(post, sub));
    }
    if (key === 'id' || key === 'authorId' || key === 'type') {
      const field = key === 'id' ? post.id : key === 'authorId' ? post.authorId : post.type;
      const v = val as { in?: string[] } | string;
      return typeof v === 'object' && v !== null && 'in' in v ? (v.in ?? []).includes(field) : field === v;
    }
    if (key === 'visibility') return post.visibility === val;
    if (key === 'deletedAt') return post.deletedAt === null;
    // `expiresAt` et le reste : non exercés par ces témoins (aucune fixture
    // n'y est expirée) — traités comme toujours satisfaits plutôt que
    // devinés, pour ne pas prétendre couvrir ce qu'on ne teste pas.
    return true;
  });
}

function makePrismaDouble(opts: {
  posts?: FakePost[];
  hashtagByTag?: Map<string, { id: string }>;
  linksByHashtagId?: Map<string, Array<{ postId: string }>>;
  usagesBySoundId?: Map<string, Array<{ postId: string; createdAt: Date }>>;
  runCommandRawResult?: { cursor: { firstBatch: Array<{ _id: string; distanceMeters: number }> } };
} = {}) {
  const posts = opts.posts ?? [];
  return {
    hashtag: {
      findUnique: jest.fn(async ({ where }: any) => opts.hashtagByTag?.get(where.tag) ?? null),
    },
    postHashtag: {
      findMany: jest.fn(async ({ where }: any) => opts.linksByHashtagId?.get(where.hashtagId) ?? []),
    },
    communityMember: {
      // Aucun scénario de ce fichier n'exige de co-membre de communauté —
      // l'audience PUBLIC + auteur suffit à prouver le gate.
      findMany: jest.fn(async () => []),
    },
    post: {
      findMany: jest.fn(async ({ where }: any) => posts.filter((p) => matchesWhere(p, where))),
    },
    soundUsage: {
      findMany: jest.fn(async ({ where }: any) => opts.usagesBySoundId?.get(where.soundId) ?? []),
    },
    $runCommandRaw: jest.fn(async () => opts.runCommandRawResult ?? { cursor: { firstBatch: [] } }),
  };
}

// ─── Fixtures partagées ────────────────────────────────────────────────────

const VIEWER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const NOW = new Date('2026-08-30T00:00:00.000Z');

const PUBLIC_POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const FRIENDS_POST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'; // hors audience du viewer
const OWN_POST_ID = 'cccccccccccccccccccccccc'; // FRIENDS mais auteur = viewer

function makeFixturePosts(): FakePost[] {
  return [
    { id: PUBLIC_POST_ID, authorId: OTHER_USER_ID, visibility: 'PUBLIC', type: 'POST', deletedAt: null, content: 'public', createdAt: NOW, likeCount: 0, viewCount: 0 },
    { id: FRIENDS_POST_ID, authorId: OTHER_USER_ID, visibility: 'FRIENDS', type: 'POST', deletedAt: null, content: 'friends-only', createdAt: NOW, likeCount: 0, viewCount: 0 },
    { id: OWN_POST_ID, authorId: VIEWER_ID, visibility: 'FRIENDS', type: 'POST', deletedAt: null, content: 'mine', createdAt: NOW, likeCount: 0, viewCount: 0 },
  ];
}

// ─── Harnais HTTP — monte les QUATRE registrars, comme routes/posts/index.ts ──

function makePreValidationAuth(opts: { authenticated: boolean; defaultUserId: string }) {
  return async (req: FastifyRequest) => {
    if (!opts.authenticated) {
      (req as any).authContext = null;
      return;
    }
    const userId = (req.headers['x-test-user-id'] as string) || opts.defaultUserId;
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      userId,
      registeredUser: { id: userId, role: 'USER' },
    };
  };
}

async function buildApp(
  prismaOpts: Parameters<typeof makePrismaDouble>[0] = {},
  authOpts: { authenticated?: boolean; defaultUserId?: string } = {},
): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrismaDouble> }> {
  const { authenticated = true, defaultUserId = VIEWER_ID } = authOpts;
  const app = Fastify({ logger: false });
  const prisma = makePrismaDouble(prismaOpts);
  const auth = makePreValidationAuth({ authenticated, defaultUserId });

  registerFeedRoutes(app, prisma as any, auth, auth);
  registerHashtagRoutes(app, prisma as any, auth);
  registerNearbyRoutes(app, prisma as any, auth);
  registerSoundRoutes(app, prisma as any, auth);
  await app.ready();
  return { app, prisma };
}

beforeEach(() => {
  mockGetNativeClient.mockReset();
  mockGetNativeClient.mockReturnValue(makeFakeRedis());
});

// ─── Auth requise sur les trois — comme les six autres (#4346) ───────────────

describe('scope=hashtag/sound/nearby — auth requise, comme les six alias qui ne sont pas author/community', () => {
  it('401 sans authentification, sur les trois adresses', async () => {
    const { app } = await buildApp(
      { posts: makeFixturePosts(), hashtagByTag: new Map([['music', { id: 'h1' }]]) },
      { authenticated: false },
    );
    for (const url of [
      '/social/posts?scope=hashtag&tag=music',
      `/social/posts?scope=sound&soundId=${PUBLIC_POST_ID}`,
      '/social/posts?scope=nearby&lat=48.85&lng=2.35&radiusKm=5',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
    await app.close();
  });
});

// ─── scope=hashtag ────────────────────────────────────────────────────────

describe('scope=hashtag — #4346', () => {
  it("l'identifiant tag absent ou vide rend 400 (comme authorId/communityId)", async () => {
    const { app } = await buildApp();
    const sansTag = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag' });
    expect(sansTag.statusCode).toBe(400);
    const tagVide = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=' });
    expect(tagVide.statusCode).toBe(400);
    await app.close();
  });

  it('rend une réponse IDENTIQUE, clé à clé, à GET /posts/hashtag/:tag — y compris le gate d\'audience (le post FRIENDS d\'un tiers est exclu, le PUBLIC et le sien propre entrent)', async () => {
    const { app } = await buildApp({
      posts: makeFixturePosts(),
      hashtagByTag: new Map([['music', { id: 'h1' }]]),
      linksByHashtagId: new Map([
        ['h1', [{ postId: PUBLIC_POST_ID }, { postId: FRIENDS_POST_ID }, { postId: OWN_POST_ID }]],
      ]),
    });

    const historique = await app.inject({ method: 'GET', url: '/posts/hashtag/music' });
    const scope = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=music' });

    expect(historique.statusCode).toBe(200);
    expect(scope.statusCode).toBe(200);
    expect(scope.json()).toEqual(historique.json());

    // Le gate d'audience a bien opéré : deux posts sur trois, le FRIENDS
    // d'autrui absent — sinon la comparaison ci-dessus ne prouverait rien.
    const ids = historique.json().data.map((p: any) => p.id);
    expect(ids.sort()).toEqual([OWN_POST_ID, PUBLIC_POST_ID].sort());
    expect(ids).not.toContain(FRIENDS_POST_ID);

    await app.close();
  });

  it('un tag INCONNU et un tag existant dont l\'unique post est HORS AUDIENCE rendent exactement la même page vide — aucun oracle d\'existence (#4146)', async () => {
    const { app } = await buildApp({
      posts: makeFixturePosts(),
      hashtagByTag: new Map([['friends-only-tag', { id: 'h2' }]]),
      linksByHashtagId: new Map([['h2', [{ postId: FRIENDS_POST_ID }]]]),
    });

    const inconnu = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=does-not-exist' });
    const horsAudience = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtag&tag=friends-only-tag' });

    expect(inconnu.statusCode).toBe(200);
    expect(horsAudience.statusCode).toBe(200);
    expect(inconnu.json()).toEqual(horsAudience.json());
    expect(inconnu.json().data).toEqual([]);
    expect(inconnu.json().pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null });

    await app.close();
  });
});

// ─── scope=sound ──────────────────────────────────────────────────────────

describe('scope=sound — #4346', () => {
  const SOUND_ID = 'dddddddddddddddddddddddd';
  const UNUSED_SOUND_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';

  it("l'identifiant soundId absent ou vide rend 400", async () => {
    const { app } = await buildApp();
    const sansId = await app.inject({ method: 'GET', url: '/social/posts?scope=sound' });
    expect(sansId.statusCode).toBe(400);
    const idVide = await app.inject({ method: 'GET', url: '/social/posts?scope=sound&soundId=' });
    expect(idVide.statusCode).toBe(400);
    await app.close();
  });

  it("un soundId MALFORMÉ (pas un ObjectId) rend 400 sur les DEUX adresses — même garde partagée, jamais recopiée", async () => {
    const { app } = await buildApp();
    const historique = await app.inject({ method: 'GET', url: '/sounds/not-an-object-id/posts' });
    const scope = await app.inject({ method: 'GET', url: '/social/posts?scope=sound&soundId=not-an-object-id' });
    expect(historique.statusCode).toBe(400);
    expect(scope.statusCode).toBe(400);
    await app.close();
  });

  it('rend une réponse IDENTIQUE, clé à clé, à GET /sounds/:id/posts — le post FRIENDS d\'un tiers est exclu, le PUBLIC entre (le sien propre AUSSI, faute de visibilité PUBLIC — sans exception auteur sur cette route)', async () => {
    const { app } = await buildApp({
      posts: makeFixturePosts(),
      usagesBySoundId: new Map([
        [SOUND_ID, [
          { postId: PUBLIC_POST_ID, createdAt: NOW },
          { postId: FRIENDS_POST_ID, createdAt: NOW },
          { postId: OWN_POST_ID, createdAt: NOW },
        ]],
      ]),
    });

    const historique = await app.inject({ method: 'GET', url: `/sounds/${SOUND_ID}/posts` });
    const scope = await app.inject({ method: 'GET', url: `/social/posts?scope=sound&soundId=${SOUND_ID}` });

    expect(historique.statusCode).toBe(200);
    expect(scope.statusCode).toBe(200);
    expect(scope.json()).toEqual(historique.json());

    const ids = historique.json().data.map((p: any) => p.id);
    expect(ids).toEqual([PUBLIC_POST_ID]);

    await app.close();
  });

  it('un soundId INCONNU et un soundId existant sans usage PUBLIC rendent exactement la même page vide — aucun oracle d\'existence (#4146)', async () => {
    const { app } = await buildApp({
      posts: makeFixturePosts(),
      usagesBySoundId: new Map([[UNUSED_SOUND_ID, [{ postId: FRIENDS_POST_ID, createdAt: NOW }]]]),
    });

    const totalementInconnu = 'ffffffffffffffffffffffff';
    const inconnu = await app.inject({ method: 'GET', url: `/social/posts?scope=sound&soundId=${totalementInconnu}` });
    const horsAudience = await app.inject({ method: 'GET', url: `/social/posts?scope=sound&soundId=${UNUSED_SOUND_ID}` });

    expect(inconnu.statusCode).toBe(200);
    expect(horsAudience.statusCode).toBe(200);
    expect(inconnu.json()).toEqual(horsAudience.json());
    expect(inconnu.json().data).toEqual([]);
    expect(inconnu.json().pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null });

    await app.close();
  });
});

// ─── scope=nearby ─────────────────────────────────────────────────────────

describe('scope=nearby — #4346', () => {
  it('lat/lng/radiusKm absents rendent 400 (paramètres requis, pas d\'identifiant)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=nearby' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rend une réponse IDENTIQUE, clé à clé, à GET /posts/nearby — y compris le gate d\'audience en DÉFENSE EN PROFONDEUR (un id FRIENDS remonté par $geoNear est filtré à la relecture Prisma)', async () => {
    const { app } = await buildApp({
      posts: makeFixturePosts(),
      runCommandRawResult: {
        cursor: {
          firstBatch: [
            { _id: PUBLIC_POST_ID, distanceMeters: 120 },
            { _id: FRIENDS_POST_ID, distanceMeters: 480 },
          ],
        },
      },
    });

    const historique = await app.inject({ method: 'GET', url: '/posts/nearby?lat=48.85&lng=2.35&radiusKm=5' });
    const scope = await app.inject({ method: 'GET', url: '/social/posts?scope=nearby&lat=48.85&lng=2.35&radiusKm=5' });

    expect(historique.statusCode).toBe(200);
    expect(scope.statusCode).toBe(200);
    expect(scope.json()).toEqual(historique.json());

    const ids = historique.json().data.map((p: any) => p.id);
    expect(ids).toEqual([PUBLIC_POST_ID]);
    expect(historique.json().data[0].distanceMeters).toBe(120);

    await app.close();
  });
});

describe('scope=nearby — #4346 plafond de débit indépendant (piège 1, #4147)', () => {
  it('accepte les 30 premiers appels, refuse le 31e en 429 avec Retry-After, et ne touche JAMAIS Mongo au 31e', async () => {
    const { app, prisma } = await buildApp({ runCommandRawResult: { cursor: { firstBatch: [] } } });
    const call = () =>
      app.inject({ method: 'GET', url: '/social/posts?scope=nearby&lat=48.85&lng=2.35&radiusKm=5' });

    for (let i = 0; i < 30; i += 1) {
      const res = await call();
      expect(res.statusCode).not.toBe(429);
    }
    expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(30);

    const blocked = await call();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    // Bloqué AVANT toute lecture Mongo — pas un 31e appel qui échoue après coup.
    expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(30);

    await app.close();
  });

  it('deux comptes distincts ont chacun leur propre budget — le seau ne les mélange pas', async () => {
    const { app } = await buildApp({ runCommandRawResult: { cursor: { firstBatch: [] } } });
    const call = (userId: string) =>
      app.inject({
        method: 'GET',
        url: '/social/posts?scope=nearby&lat=48.85&lng=2.35&radiusKm=5',
        headers: { 'x-test-user-id': userId },
      });

    for (let i = 0; i < 30; i += 1) {
      expect((await call(VIEWER_ID)).statusCode).not.toBe(429);
    }
    expect((await call(VIEWER_ID)).statusCode).toBe(429);

    // Le compte B, frais, n'est pas affecté par le budget épuisé de A.
    expect((await call(OTHER_USER_ID)).statusCode).not.toBe(429);

    await app.close();
  });

  it("épuiser le budget de scope=nearby ne bloque PAS GET /posts/nearby (deux adresses, deux compteurs indépendants — décision assumée, cf. commentaire de nearby.ts)", async () => {
    const { app } = await buildApp({ runCommandRawResult: { cursor: { firstBatch: [] } } });
    const callScope = () =>
      app.inject({ method: 'GET', url: '/social/posts?scope=nearby&lat=48.85&lng=2.35&radiusKm=5' });

    for (let i = 0; i < 31; i += 1) await callScope();
    expect((await callScope()).statusCode).toBe(429);

    const historique = await app.inject({ method: 'GET', url: '/posts/nearby?lat=48.85&lng=2.35&radiusKm=5' });
    expect(historique.statusCode).not.toBe(429);

    await app.close();
  });
});

// ─── Régression : agrandir l'union ne l'a pas rendue permissive ─────────────

describe('scope inconnu — #4346 ne relâche pas la garde de #4149', () => {
  it('une valeur proche mais différente des onze scopes connus rend toujours 400', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=hashtags' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});
