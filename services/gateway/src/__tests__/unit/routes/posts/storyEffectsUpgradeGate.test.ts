/**
 * Écriture stricte de `storyEffects` — DERRIÈRE `CANVAS_V3_WRITE_STRICT` (O15).
 *
 * Au merge du lot A, AUCUN écrivain n'émet v3 (parc iOS complet, composer web,
 * Android) : un 426 inconditionnel serait une panne totale de création de
 * story. Drapeau OFF (défaut) ⇒ le blob v1 passe TEL QUEL. Drapeau armé, deux
 * refus DISTINCTS (spec §C3 rév. 2) :
 *   - blob SANS `v:3` (client du passé) ⇒ 426 UPGRADE_REQUIRED, `minVersion`
 *     et `storeUrl` À LA RACINE (`storeUrl` résolu par `X-App-Platform` —
 *     `android` ⇒ Play Store, sinon App Store) ;
 *   - blob AVEC `v:3` mais invalide (client neuf cassé) ⇒ 400 CANVAS_INVALID
 *     avec `issues` — l'inviter à se mettre à jour serait un mensonge.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    republishStory: jest.fn<any>(),
    repostPost: jest.fn<any>(),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

const FIXTURES = join(__dirname, '../../../../../../../packages/shared/fixtures/canvas-v3');
const loadV1Blob = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, 'v1-legacy-full.json'), 'utf8')) as Record<string, unknown>;
const loadV3Blob = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, 'minimal-text.json'), 'utf8')) as Record<string, unknown>;

const loadBrokenV3Blob = (): Record<string, unknown> => {
  const blob = loadV3Blob() as {
    scenes: Array<{ objects: Array<Record<string, unknown>> }>;
  } & Record<string, unknown>;
  blob.scenes[0]!.objects[0]!.kind = 'hashtag';
  return blob;
};

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
  await app.ready();
  return app;
}

const CAPS_HEADER = { 'x-canvas-caps': '3' };

const stubCreatedPost = (data: Record<string, unknown>): Record<string, unknown> => ({
  id: POST_ID,
  type: (data.type as string | undefined) ?? 'POST',
  authorId: USER_ID,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  mentions: [],
  storyEffects: data.storyEffects,
});

describe('écriture stricte storyEffects — 426 passé / 400 cassé, sous CANVAS_V3_WRITE_STRICT', () => {
  const savedEnv = {
    flag: process.env.CANVAS_V3_WRITE_STRICT,
    minVersion: process.env.MIN_APP_VERSION,
    appStore: process.env.APP_STORE_URL,
    playStore: process.env.PLAY_STORE_URL,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockCreatePost.mockImplementation(async (data: Record<string, unknown>) => stubCreatedPost(data));
    mockUpdatePost.mockImplementation(async (_id: string, _uid: string, data: Record<string, unknown>) =>
      stubCreatedPost({ ...data, type: 'STORY' }));
    delete process.env.CANVAS_V3_WRITE_STRICT;
    delete process.env.MIN_APP_VERSION;
    delete process.env.APP_STORE_URL;
    delete process.env.PLAY_STORE_URL;
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('CANVAS_V3_WRITE_STRICT', savedEnv.flag);
    restore('MIN_APP_VERSION', savedEnv.minVersion);
    restore('APP_STORE_URL', savedEnv.appStore);
    restore('PLAY_STORE_URL', savedEnv.playStore);
  });

  it('drapeau ON : un blob v1-shaped en création ⇒ 426 UPGRADE_REQUIRED, minVersion et storeUrl À LA RACINE', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    process.env.MIN_APP_VERSION = '1.2.0';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: loadV1Blob() },
    });

    expect(res.statusCode).toBe(426);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UPGRADE_REQUIRED');
    expect(body.minVersion).toBe('1.2.0');
    expect(typeof body.storeUrl).toBe('string');
    expect(body.storeUrl).toContain('apps.apple.com');
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('drapeau ON : X-App-Platform android ⇒ le storeUrl du 426 pointe le Play Store', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: { 'x-app-platform': 'android' },
      payload: { type: 'STORY', storyEffects: loadV1Blob() },
    });

    expect(res.statusCode).toBe(426);
    expect(res.json().storeUrl).toContain('play.google.com');
    await app.close();
  });

  it('drapeau ON : v:3 avec kind réservé ⇒ 400 CANVAS_INVALID, issues portant KIND_RESERVED', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: loadBrokenV3Blob() },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('CANVAS_INVALID');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(JSON.stringify(body.issues)).toContain('KIND_RESERVED');
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('drapeau ON : v3 valide ⇒ 201, puis GET rend le blob tel quel', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const v3 = loadV3Blob();
    const app = await buildApp();

    const created = await app.inject({
      method: 'POST', url: '/posts',
      headers: CAPS_HEADER,
      payload: { type: 'STORY', storyEffects: v3 },
    });
    expect(created.statusCode).toBe(201);

    mockGetPostById.mockResolvedValue(stubCreatedPost({ type: 'STORY', storyEffects: v3 }));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}`, headers: CAPS_HEADER });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects).toEqual(v3);
    await app.close();
  });

  it('drapeau ON : les MÊMES gardes tiennent sur PUT /posts/:postId (426 puis 400)', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const past = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { storyEffects: loadV1Blob() },
    });
    expect(past.statusCode).toBe(426);
    expect(past.json().code).toBe('UPGRADE_REQUIRED');

    const broken = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { storyEffects: loadBrokenV3Blob() },
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().code).toBe('CANVAS_INVALID');
    expect(mockUpdatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('drapeau OFF (défaut) : le blob v1-shaped passe TEL QUEL en création — le merge est INERTE', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', storyEffects: loadV1Blob() },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
