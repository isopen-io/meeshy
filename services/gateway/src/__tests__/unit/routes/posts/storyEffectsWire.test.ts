/**
 * Le blob `storyEffects` quitte le serveur en v3 — DERRIÈRE `CANVAS_V3_READ`.
 *
 * Entre le déploiement du lot A et celui du lot F, le web ne lit que les
 * familles legacy : servir v3 pendant cette fenêtre viderait les stories web.
 * Le drapeau (env, défaut OFF) rend le lockstep VRAI : A merge INERTE en
 * lecture, l'activation est un acte de déploiement.
 *
 * Le point d'étranglement est `withMentions` — la conversion doit couvrir la
 * racine ET le `repostOf` imbriqué, y compris le chemin « pas de références
 * chargées » qui sort TÔT de `withNestedRepostMentions` et laisserait sinon un
 * `repostOf.storyEffects` v1 sur le fil.
 *
 * Toutes les requêtes portent `x-canvas-caps: 3` (rév. 7/F2) : sans caps, la
 * table O17 sert v1 tel quel — ces tests exercent la CONVERSION, pas la
 * négociation, qui a les siens en A4b.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: jest.fn<any>(),
    updatePost: jest.fn<any>(),
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

describe('storyEffects sur le fil — conversion v1→v3 derrière CANVAS_V3_READ', () => {
  const savedFlag = process.env.CANVAS_V3_READ;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    delete process.env.CANVAS_V3_READ;
  });

  afterAll(() => {
    if (savedFlag === undefined) {
      delete process.env.CANVAS_V3_READ;
    } else {
      process.env.CANVAS_V3_READ = savedFlag;
    }
  });

  it('drapeau ON : une story v1 en base sort en v3 sur la route de détail', async () => {
    process.env.CANVAS_V3_READ = '1';
    mockGetPostById.mockResolvedValue({
      id: POST_ID, type: 'STORY', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], mentions: [], storyEffects: loadV1Blob(),
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}`, headers: CAPS_HEADER });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects.v).toBe(3);
    await app.close();
  });

  it('drapeau ON : un blob déjà v3 ressort inchangé', async () => {
    process.env.CANVAS_V3_READ = '1';
    const v3 = loadV3Blob();
    mockGetPostById.mockResolvedValue({
      id: POST_ID, type: 'STORY', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], mentions: [], storyEffects: v3,
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}`, headers: CAPS_HEADER });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects).toEqual(v3);
    await app.close();
  });

  it('drapeau ON : le repost d\'une story v1 SANS références chargées sort en v3 (chemin early-return)', async () => {
    process.env.CANVAS_V3_READ = '1';
    mockGetPostById.mockResolvedValue({
      id: 'repost-1', type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], mentions: [],
      repostOf: { id: POST_ID, type: 'STORY', storyEffects: loadV1Blob() },
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/posts/repost-1', headers: CAPS_HEADER });

    expect(res.statusCode).toBe(200);
    const nested = res.json().data.repostOf;
    expect(nested).not.toHaveProperty('postMentions');
    expect(nested).not.toHaveProperty('mentions');
    expect(nested.storyEffects.v).toBe(3);
    await app.close();
  });

  it('drapeau OFF (défaut) : le blob v1 ressort TEL QUEL — A est inerte pour l\'archive', async () => {
    const v1 = loadV1Blob();
    mockGetPostById.mockResolvedValue({
      id: POST_ID, type: 'STORY', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], mentions: [], storyEffects: v1,
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}`, headers: CAPS_HEADER });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects).toEqual(v1);
    await app.close();
  });
});
