/**
 * Plancher `X-App-Version` (spec §C3 rév. 2, R6) — la porte d'en-tête ne juge
 * que les requêtes qui EN PORTENT UN :
 *   - plancher vide (défaut) ⇒ porte DÉSARMÉE, tout passe ;
 *   - plancher armé + en-tête ABSENT ⇒ PASSE (le web est exempt, R6 ; les
 *     vieux binaires sont attrapés par le FORMAT — 426 d'A5 — jamais par
 *     l'absence d'en-tête) ;
 *   - plancher armé + en-tête présent SOUS le plancher ⇒ 426 UPGRADE_REQUIRED,
 *     `minVersion` et `storeUrl` à la racine ;
 *   - plancher armé + en-tête AU plancher (ou au-dessus) ⇒ passe.
 * Portée : les créations à scène (`storyEffects` présent OU `type === 'STORY'`).
 * Bootstrap client : `GET /app/min-version` ⇒ `{ minVersion }`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    updatePost: jest.fn<any>(),
    republishStory: jest.fn<any>(),
    repostPost: jest.fn<any>(),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — POST /posts / from-attachment / repost tirent leur plafond de
// création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE écriture de ce type serait refusée avant
// d'atteindre ce que ce fichier vérifie — détail complet dans
// unit/routes/posts/core.test.ts, premier fichier de la série à le poser.
// `incr` répond toujours « premier appel » : ce fichier ne teste PAS le
// plafond (son témoin dédié vit dans social-write-rate-limit.test.ts) —
// juste un Redis DISPONIBLE.
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/posts/core';
import { appRoutes } from '../../../routes/app';
import { compareAppVersions, isBelowFloor } from '../../../utils/appVersion';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

const v3Blob = (): Record<string, unknown> => ({
  v: 3,
  scenes: [{
    id: 's1',
    objects: [{
      id: 'o1', kind: 'text',
      anchor: { t: 'free', x: 0.5, y: 0.4 },
      plane: 'fg', z: 0,
      transform: { scale: 1, rotation: 0, opacity: 1 },
      payload: { text: 'Bonjour', textStyle: 'bold' },
    }],
  }],
});

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
  app.decorate('socialEvents', {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.register(appRoutes);
  await app.ready();
  return app;
}

const stubCreatedPost = (data: Record<string, unknown>): Record<string, unknown> => ({
  id: POST_ID,
  type: (data.type as string | undefined) ?? 'POST',
  authorId: USER_ID,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  mentions: [],
  storyEffects: data.storyEffects,
});

const createStory = (app: FastifyInstance, headers?: Record<string, string>) =>
  app.inject({
    method: 'POST', url: '/posts',
    headers,
    payload: { type: 'STORY', storyEffects: v3Blob() },
  });

describe('plancher X-App-Version — présence sous plancher = 426, ABSENCE = passe', () => {
  const savedEnv = {
    minVersion: process.env.MIN_APP_VERSION,
    appStore: process.env.APP_STORE_URL,
    playStore: process.env.PLAY_STORE_URL,
    strict: process.env.CANVAS_V3_WRITE_STRICT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockCreatePost.mockImplementation(async (data: Record<string, unknown>) => stubCreatedPost(data));
    delete process.env.MIN_APP_VERSION;
    delete process.env.APP_STORE_URL;
    delete process.env.PLAY_STORE_URL;
    delete process.env.CANVAS_V3_WRITE_STRICT;
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('MIN_APP_VERSION', savedEnv.minVersion);
    restore('APP_STORE_URL', savedEnv.appStore);
    restore('PLAY_STORE_URL', savedEnv.playStore);
    restore('CANVAS_V3_WRITE_STRICT', savedEnv.strict);
  });

  describe('comparaison de versions (à sec)', () => {
    it('compareAppVersions ordonne 1.0.5 sous 1.2.0', () => {
      expect(compareAppVersions('1.0.5', '1.2.0')).toBeLessThan(0);
    });

    it('isBelowFloor : plancher vide = désarmé, en-tête absent = passe, sous-plancher = vrai', () => {
      expect(isBelowFloor('0.0.1', '')).toBe(false);
      expect(isBelowFloor(undefined, '1.2.0')).toBe(false);
      expect(isBelowFloor('1.1.9', '1.2.0')).toBe(true);
      expect(isBelowFloor('1.2.0', '1.2.0')).toBe(false);
    });
  });

  it('plancher DÉSARMÉ (env vide) : même un en-tête antique passe ⇒ 201', async () => {
    const app = await buildApp();
    const res = await createStory(app, { 'x-app-version': '0.0.1' });
    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('plancher 1.2.0 : SANS en-tête ⇒ 201 (le web est exempt, R6)', async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    const app = await buildApp();
    const res = await createStory(app);
    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('plancher 1.2.0 : en-tête 1.1.9 ⇒ 426 UPGRADE_REQUIRED, minVersion et storeUrl à la racine', async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    const app = await buildApp();
    const res = await createStory(app, { 'x-app-version': '1.1.9' });
    expect(res.statusCode).toBe(426);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UPGRADE_REQUIRED');
    expect(body.minVersion).toBe('1.2.0');
    expect(typeof body.storeUrl).toBe('string');
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('plancher 1.2.0 : en-tête 1.2.0 (AU plancher) ⇒ 201', async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    const app = await buildApp();
    const res = await createStory(app, { 'x-app-version': '1.2.0' });
    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('plancher 1.2.0 : un POST SANS scène (ni storyEffects ni STORY) passe même sous plancher', async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: { 'x-app-version': '1.1.9' },
      payload: { type: 'POST', content: 'hello' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('GET /app/min-version rend { minVersion } (bootstrap de la porte cliente)', async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/app/min-version' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ minVersion: '1.2.0' });
    await app.close();
  });
});
