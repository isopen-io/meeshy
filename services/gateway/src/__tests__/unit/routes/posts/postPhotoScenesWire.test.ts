/**
 * #13612 — le document de scènes d'un post de PHOTOS (une scène par photo, `layout` dans ce seul document), tel
 * qu'iOS le publie et qu'Android le publie désormais à l'identique (`post-photo-scenes-*`, produits par le composeur
 * iOS ; `PostPhotoScenesIosFixtureTest` côté Android). La régression visée : les photos d'un post disparaissent chez
 * un lecteur.
 *   - créé sous l'écriture stricte : accepté, et le document atteint le service tel quel ;
 *   - relu SANS `X-Canvas-Caps` (ancien client) : règle 5, `storyEffects` OMIS, les médias du post intacts ;
 *   - relu avec `X-Canvas-Caps: 3` : le document intact, chaque scène désignant une pièce du post ;
 *   - un document qui désigne encore un id provisoire (`cmid_…`) absent de `mediaIds` est refusé, jamais publié.
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

// #4147 — POST /posts / from-attachment / repost tirent leur plafond de
// création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE écriture de ce type serait refusée avant
// d'atteindre ce que ce fichier vérifie — détail complet dans core.test.ts,
// premier fichier de la série à le poser. `incr` répond toujours « premier
// appel » : ce fichier ne teste PAS le plafond (son témoin dédié vit dans
// social-write-rate-limit.test.ts) — juste un Redis DISPONIBLE.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

const FIXTURES = join(__dirname, '../../../../../../../packages/shared/fixtures/canvas-v3');
const loadFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Record<string, unknown>;

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
      registeredUser: { emailVerifiedAt: new Date(), id: USER_ID, role: 'USER', username: 'alice' },
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

const MEDIA_IDS = ['64b000000000000000000001', '64b000000000000000000002', '64b000000000000000000003'];

const postMedia = MEDIA_IDS.map((id, index) => ({
  id,
  mimeType: 'image/jpeg',
  fileUrl: `https://gate.meeshy.me/api/v1/attachments/file/${id}.jpg`,
  order: index,
}));

const servedPost = (storyEffects: unknown): Record<string, unknown> => ({
  id: POST_ID,
  type: 'POST',
  authorId: USER_ID,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  mentions: [],
  media: postMedia,
  storyEffects,
});

const designated = (document: Record<string, unknown>): string[] =>
  (document.scenes as Array<{ objects: Array<{ plane: string; payload: { postMediaId?: string } }> }>)
    .map((scene) => scene.objects.find((object) => object.plane === 'content')?.payload.postMediaId ?? '');

describe('un post de photos en document de scènes — écrit, puis lu par un ancien et un nouveau client', () => {
  const savedFlag = process.env.CANVAS_V3_WRITE_STRICT;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockCreatePost.mockImplementation(async (data: Record<string, unknown>) => servedPost(data.storyEffects));
    process.env.CANVAS_V3_WRITE_STRICT = '1';
  });

  afterAll(() => {
    if (savedFlag === undefined) delete process.env.CANVAS_V3_WRITE_STRICT;
    else process.env.CANVAS_V3_WRITE_STRICT = savedFlag;
  });

  it.each([
    ['post-photo-scenes-2', 2],
    ['post-photo-scenes-3-hero', 3],
  ])('%s : créé sous écriture stricte, le document atteint le service tel quel', async (name, count) => {
    const document = loadFixture(name);
    const app = await buildApp();

    const created = await app.inject({
      method: 'POST', url: '/posts',
      headers: CAPS_HEADER,
      payload: { type: 'POST', content: 'deux vues', mediaIds: MEDIA_IDS.slice(0, count), storyEffects: document },
    });

    expect(created.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect((mockCreatePost.mock.calls[0]![0] as { storyEffects: unknown }).storyEffects).toEqual(document);
    await app.close();
  });

  it('relu SANS X-Canvas-Caps : storyEffects omis, les photos du post intactes (règle 5)', async () => {
    mockGetPostById.mockResolvedValue(servedPost(loadFixture('post-photo-scenes-3-hero')));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).not.toHaveProperty('storyEffects');
    expect(data.media.map((m: { id: string }) => m.id)).toEqual(MEDIA_IDS);
    await app.close();
  });

  it('relu avec X-Canvas-Caps 3 : le document intact, chaque scène désigne une pièce du post, dans l\'ordre', async () => {
    const document = loadFixture('post-photo-scenes-3-hero');
    mockGetPostById.mockResolvedValue(servedPost(document));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}`, headers: CAPS_HEADER });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.storyEffects).toEqual(document);
    expect(designated(data.storyEffects)).toEqual(data.media.map((m: { id: string }) => m.id));
    await app.close();
  });

  it('un document qui désigne encore un id provisoire absent de mediaIds est refusé, rien n\'est publié', async () => {
    const document = loadFixture('post-photo-scenes-2');
    const pending = JSON.parse(JSON.stringify(document).replaceAll(MEDIA_IDS[1]!, 'cmid_22222222-2222-2222-2222-222222222222'));
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: CAPS_HEADER,
      payload: { type: 'POST', mediaIds: [MEDIA_IDS[0]], storyEffects: pending },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MEDIA_NOT_CLAIMED');
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });
});
