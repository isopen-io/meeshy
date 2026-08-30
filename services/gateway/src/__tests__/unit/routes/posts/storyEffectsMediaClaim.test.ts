/**
 * Claim des stickers posés (spec O8, plan lot A tâche A7) — sous
 * `CANVAS_V3_WRITE_STRICT`, un objet `sticker`/`media` du canvas v3 dont
 * `payload.mediaId`/`payload.postMediaId` est une chaîne DOIT appartenir à
 * `body.mediaIds` ⇒ sinon 400 MEDIA_NOT_CLAIMED. Le claim de PROPRIÉTÉ reste
 * `claimableMediaWhere` (PostService) — jamais dupliqué ici : la garde ne
 * juge que l'appartenance à la liste claimée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
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
import { unclaimedCanvasMediaIds } from '../../../../services/posts/storyEffectsV3';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const STICKER_MEDIA_ID = '507f1f77bcf86cd799439033';
const CARRIER_MEDIA_ID = '507f1f77bcf86cd799439044';

const canvasWith = (objects: Array<Record<string, unknown>>): Record<string, unknown> => ({
  v: 3,
  scenes: [{ id: 's1', objects }],
});

const stickerObject = (payload: Record<string, unknown>): Record<string, unknown> => ({
  id: 'st1', kind: 'sticker',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg', z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
});

const mediaObject = (payload: Record<string, unknown>): Record<string, unknown> => ({
  id: 'm1', kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content', z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
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

describe('unclaimedCanvasMediaIds (à sec)', () => {
  it('rend les ids sticker/media non claimés, dédupliqués, mediaId ET postMediaId', () => {
    const blob = canvasWith([
      stickerObject({ mediaId: STICKER_MEDIA_ID }),
      mediaObject({ postMediaId: CARRIER_MEDIA_ID }),
      { ...stickerObject({ mediaId: STICKER_MEDIA_ID }), id: 'st2' },
    ]);
    expect(unclaimedCanvasMediaIds(blob, [CARRIER_MEDIA_ID])).toEqual([STICKER_MEDIA_ID]);
  });

  it('ignore les kinds non porteurs de claim et les payloads sans référence chaîne', () => {
    const blob = canvasWith([
      { ...stickerObject({ emoji: '🎉' }), id: 'st3' },
      { ...mediaObject({ postMediaId: 42 }), id: 'm2' },
      {
        id: 'a1', kind: 'audio',
        anchor: { t: 'free', x: 0.5, y: 0.5 },
        plane: 'fg', z: 2,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        payload: { mediaId: STICKER_MEDIA_ID },
      },
    ]);
    expect(unclaimedCanvasMediaIds(blob, [])).toEqual([]);
  });

  it('un blob non-v3 rend [] — la garde ne juge que le canvas v3', () => {
    expect(unclaimedCanvasMediaIds({ textObjects: [] }, [])).toEqual([]);
  });
});

describe('claim des stickers posés (O8) — sous CANVAS_V3_WRITE_STRICT', () => {
  const savedFlag = process.env.CANVAS_V3_WRITE_STRICT;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockCreatePost.mockImplementation(async (data: Record<string, unknown>) => stubCreatedPost(data));
    delete process.env.CANVAS_V3_WRITE_STRICT;
  });

  afterAll(() => {
    if (savedFlag === undefined) delete process.env.CANVAS_V3_WRITE_STRICT;
    else process.env.CANVAS_V3_WRITE_STRICT = savedFlag;
  });

  it('drapeau ON : sticker référençant un média HORS body.mediaIds ⇒ 400 MEDIA_NOT_CLAIMED', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: {
        type: 'STORY',
        storyEffects: canvasWith([stickerObject({ mediaId: STICKER_MEDIA_ID })]),
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('MEDIA_NOT_CLAIMED');
    expect(body.mediaIds).toEqual([STICKER_MEDIA_ID]);
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('drapeau ON : objet media dont payload.postMediaId manque au claim ⇒ 400 MEDIA_NOT_CLAIMED', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: {
        type: 'STORY',
        mediaIds: [STICKER_MEDIA_ID],
        storyEffects: canvasWith([
          stickerObject({ mediaId: STICKER_MEDIA_ID }),
          mediaObject({ postMediaId: CARRIER_MEDIA_ID }),
        ]),
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MEDIA_NOT_CLAIMED');
    expect(res.json().mediaIds).toEqual([CARRIER_MEDIA_ID]);
    await app.close();
  });

  it('drapeau ON : tous les médias du canvas sont dans body.mediaIds ⇒ 201, le claim part au service (claimableMediaWhere)', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: {
        type: 'STORY',
        mediaIds: [STICKER_MEDIA_ID, CARRIER_MEDIA_ID],
        storyEffects: canvasWith([
          stickerObject({ mediaId: STICKER_MEDIA_ID }),
          mediaObject({ postMediaId: CARRIER_MEDIA_ID }),
        ]),
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect(mockCreatePost.mock.calls[0]![0]).toMatchObject({
      mediaIds: [STICKER_MEDIA_ID, CARRIER_MEDIA_ID],
    });
    await app.close();
  });

  it('drapeau ON : sticker sans référence média (emoji) ⇒ 201', async () => {
    process.env.CANVAS_V3_WRITE_STRICT = '1';
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: {
        type: 'STORY',
        storyEffects: canvasWith([stickerObject({ emoji: '🎉' })]),
      },
    });

    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('drapeau OFF (défaut) : le même blob non claimé passe — le merge de A reste inerte', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: {
        type: 'STORY',
        storyEffects: canvasWith([stickerObject({ mediaId: STICKER_MEDIA_ID })]),
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
