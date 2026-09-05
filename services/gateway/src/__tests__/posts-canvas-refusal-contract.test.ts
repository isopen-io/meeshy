/**
 * Le refus `CANVAS_INVALID` de `routes/posts/core.ts` sert une forme d'issue
 * DÉCLARÉE — cinquième site du lot #4487 (#4648).
 *
 * ## Ce qui a été mesuré, et ce qui ne l'était pas
 *
 * L'issue annonçait que `fast-json-stringify` retirait `issues` avant le
 * client. **Mesuré : non.** `POST /posts` et `PUT /posts/:postId` ne
 * déclaraient AUCUN schéma de réponse, or Fastify ne compile de sérialiseur
 * que pour les codes de statut déclarés : sans schéma, `JSON.stringify` sert
 * l'objet entier. Le champ passait — et `storyEffectsUpgradeGate.test.ts` le
 * prouvait déjà, vert, en assertant `body.issues` sur un corps injecté.
 *
 * Le défaut réel est ailleurs, et il est double :
 *
 * 1. **La forme servie n'est pas celle des quatre sites conformes.** Les
 *    routes de consentement et de préférences servent `issuesServies(...)` —
 *    `{ code, path: string[], keys?, message }`, la forme que `zodIssueSchema`
 *    déclare. Ce site-ci servait la `ZodIssue` BRUTE : ses clés internes
 *    (`expected`, `received`, `origin`…) partaient sur le fil, et son `path`
 *    portait des INDEX NUMÉRIQUES (`['scenes', 0, 'id']`) là où le contrat
 *    déclare un tableau de chaînes. Un client qui a appris à lire les issues
 *    d'une famille restait aveugle à l'autre — c'est le symptôme même que
 *    #4487 nomme.
 * 2. **La non-suppression était ACCIDENTELLE.** Elle tenait à l'ABSENCE de
 *    schéma, pas à une déclaration. Le premier lot qui déclare un `400` sur
 *    ces deux routes — geste parfaitement légitime, et la doctrine du dépôt le
 *    réclame — supprimait `issues` ET, à côté, le `mediaIds` du refus
 *    `MEDIA_NOT_CLAIMED`. C'est le piège armé du cycle 84 : on ne laisse pas
 *    une omission de schéma tenir une porte.
 *
 * D'où les deux moitiés de ce fichier : la forme SERVIE (témoins 1 à 4), et ce
 * qui part À CÔTÉ d'elle sous le même schéma désormais déclaré (témoins 5 et
 * 6) — `mediaIds` sur le 400 voisin, `minVersion`/`storeUrl` sur le 426 que ce
 * lot ne déclare pas.
 *
 * Tous les témoins assertent sur le corps SÉRIALISÉ d'une injection Fastify
 * (`res.json()`), jamais sur l'argument passé à `sendBadRequest` — qui a
 * toujours porté la valeur, et qui ne prouve donc rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    republishStory: jest.fn<any>(),
    repostPost: jest.fn<any>(),
  })),
}));

jest.mock('../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE dont
  // la route fait `instanceof`. Une usine qui ne rendrait que `withMutationLog`
  // la laisserait à `undefined`, et `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur un chemin d'erreur sans rapport.
  ...(jest.requireActual('../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — la création tire son plafond d'un compteur PARTAGÉ qui lit Redis
// directement, fail-closed : sans ce double, `getNativeClient()` rend `null`
// en test (aucun REDIS_URL) et CHAQUE création serait refusée 429 avant
// d'atteindre les refus que ce fichier vérifie. Le plafond lui-même a son
// témoin dédié (social-write-rate-limit.test.ts) — ici, juste un Redis
// DISPONIBLE.
jest.mock('../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../routes/posts/core';
import { zodIssueSchema } from '../utils/zod-issue-schema';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const UNCLAIMED_MEDIA_ID = '507f1f77bcf86cd799439033';

/**
 * Un canvas `v:3` dont QUATRE scènes sont vides — chacune manque `id` et
 * `objects`, soit HUIT issues Zod, et chaque `path` porte l'index numérique de
 * sa scène (`['scenes', 2, 'id']`). Les deux propriétés que ce fichier mesure
 * — la borne de service et le type des segments de chemin — exigent l'une et
 * l'autre plus de cinq issues et un chemin qui traverse un tableau ; un canvas
 * à une seule scène ne pourrait faire tomber ni l'un ni l'autre.
 */
const canvasWithFourBrokenScenes = (): Record<string, unknown> => ({
  v: 3,
  scenes: [{}, {}, {}, {}],
});

/** Un canvas v3 VALIDE dont le sticker réclame un média hors de `mediaIds`. */
const canvasClaimingUnknownMedia = (): Record<string, unknown> => ({
  v: 3,
  scenes: [{
    id: 's1',
    objects: [{
      id: 'st1', kind: 'sticker',
      anchor: { t: 'free', x: 0.5, y: 0.5 },
      plane: 'fg', z: 1,
      transform: { scale: 1, rotation: 0, opacity: 1 },
      payload: { postMediaId: UNCLAIMED_MEDIA_ID },
    }],
  }],
});

/** Un blob SANS `v:3` — le client du passé, refusé en 426. */
const legacyCanvas = (): Record<string, unknown> => ({ background: '#000000' });

const DECLARED_ISSUE_KEYS = Object.keys(zodIssueSchema.properties);

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    postMention: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  } as any;
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };

  app.decorate('notificationService', null as any);
  app.decorate('socialEvents', null as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

describe('refus CANVAS_INVALID — la forme SERVIE est celle que le schéma déclare (#4648)', () => {
  const savedEnv = {
    flag: process.env.CANVAS_V3_WRITE_STRICT,
    minVersion: process.env.MIN_APP_VERSION,
    appStore: process.env.APP_STORE_URL,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockCreatePost.mockResolvedValue({ id: POST_ID, type: 'STORY', visibility: 'PUBLIC' });
    mockUpdatePost.mockResolvedValue({ id: POST_ID, type: 'STORY', visibility: 'PUBLIC' });
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    delete process.env.MIN_APP_VERSION;
    delete process.env.APP_STORE_URL;
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('CANVAS_V3_WRITE_STRICT', savedEnv.flag);
    restore('MIN_APP_VERSION', savedEnv.minVersion);
    restore('APP_STORE_URL', savedEnv.appStore);
  });

  it('POST /posts : le corps SÉRIALISÉ porte des issues', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: canvasWithFourBrokenScenes() },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('CANVAS_INVALID');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it("POST /posts : chaque segment de `path` est une CHAÎNE — le contrat ne déclare pas d'index numérique", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: canvasWithFourBrokenScenes() },
    });

    const issues = res.json().issues as Array<{ path: unknown[] }>;
    const segmentsNonChaine = issues
      .flatMap((issue) => issue.path ?? [])
      .filter((segment) => typeof segment !== 'string');

    expect(segmentsNonChaine).toEqual([]);
  });

  it('POST /posts : une issue servie ne porte QUE les clés de `zodIssueSchema`', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: canvasWithFourBrokenScenes() },
    });

    const issues = res.json().issues as Array<Record<string, unknown>>;
    const clesHorsContrat = [
      ...new Set(issues.flatMap((issue) => Object.keys(issue))),
    ].filter((cle) => !DECLARED_ISSUE_KEYS.includes(cle));

    expect(clesHorsContrat).toEqual([]);
  });

  it('POST /posts : le service reste BORNÉ à cinq issues, même quand Zod en rend huit', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: canvasWithFourBrokenScenes() },
    });

    expect((res.json().issues as unknown[]).length).toBe(5);
  });

  it('PUT /posts/:postId : le MÊME refus sert la MÊME forme', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { storyEffects: canvasWithFourBrokenScenes() },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('CANVAS_INVALID');
    const issues = body.issues as Array<Record<string, unknown>>;
    expect(issues.length).toBe(5);
    expect(issues.flatMap((i) => i.path as unknown[]).every((s) => typeof s === 'string')).toBe(true);
    expect(mockUpdatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('le 400 VOISIN garde son `mediaIds` — déclarer un schéma partiel tronquerait ce qui marchait', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: canvasClaimingUnknownMedia(), mediaIds: [] },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('MEDIA_NOT_CLAIMED');
    expect(body.mediaIds).toEqual([UNCLAIMED_MEDIA_ID]);
    await app.close();
  });

  it('le 426 voisin garde `minVersion` et `storeUrl` — ce lot ne déclare pas ce code de statut', async () => {
    process.env.MIN_APP_VERSION = '2.0.0';
    process.env.APP_STORE_URL = 'https://apps.apple.com/app/meeshy';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: legacyCanvas() },
    });

    expect(res.statusCode).toBe(426);
    const body = res.json();
    expect(body.minVersion).toBe('2.0.0');
    expect(body.storeUrl).toBe('https://apps.apple.com/app/meeshy');
    await app.close();
  });
});
