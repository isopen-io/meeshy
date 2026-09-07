/**
 * Axe d'engagement « stories » (#5534, sous-issue de #3695) — la publication
 * d'une STORY crédite `content.story` via `EngagementService.recordActivity`.
 *
 * Câblé au même site que le corps partagé de publication (#4151,
 * `runPublicationEffects`, `routes/posts/publication.ts`) : `POST /posts` et
 * `POST /posts/from-attachment` sont les deux portes créatrices, et la
 * crédite doit partir des DEUX — `publication-single-core.test.ts` prouve déjà
 * que les deux portes partagent le même noyau, ce fichier garde uniquement le
 * CÂBLAGE de l'axe.
 *
 * Fichier séparé de `core.test.ts` (`DETTE_HERITEE`, plafonné à 1654 lignes —
 * cf. CLAUDE.md § Budget de taille) et de `publication-single-core.test.ts`
 * (déjà focalisé sur la parité des trois portes, #4151) : celui-ci garde
 * uniquement l'axe `content.story`.
 *
 * **Le type qui décide est le type ÉCRIT, pas le type DEMANDÉ** — même
 * discriminant que l'éventail d'amis (`publication.ts`, commentaire de
 * `runPublicationEffects` : « la diffusion suit l'intention, l'éventail
 * d'amis suit ce qui est en base »). `PostService.createPost` peut dégrader
 * un type non qualifiant (#PostService, 2026-08-02) ; un `type: 'STORY'`
 * DEMANDÉ mais ÉCRIT comme `'POST'` ne doit PAS créditer `content.story`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockDuplicate = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: jest.fn<any>().mockResolvedValue(null),
    republishStory: jest.fn<any>().mockResolvedValue(null),
    deletePost: jest.fn<any>().mockResolvedValue(null),
    updatePost: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({
    duplicate: (...args: any[]) => mockDuplicate(...args),
  })),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
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

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — plafond de création, fail-closed sur Redis. `incr` répond toujours
// « premier appel » : sans ce double, chaque écriture serait refusée avant
// d'atteindre le corps de publication que ce fichier vérifie.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));

const mockRecordActivity = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (...args: any[]) => mockRecordActivity(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439047';

const PUBLISHED_ROW = {
  id: '507f1f77bcf86cd799439033',
  authorId: USER_ID,
  type: 'POST',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  content: 'Bonjour tout le monde',
  originalLanguage: 'fr',
  createdAt: '2026-09-07T10:00:00.000Z',
} as const;

const storyRow = () => ({ ...PUBLISHED_ROW, id: `${PUBLISHED_ROW.id}-STORY`, type: 'STORY', visibility: 'FRIENDS' });

const ATTACHMENT_ROW = {
  id: ATTACHMENT_ID,
  messageId: '507f1f77bcf86cd799439041',
  mimeType: 'image/jpeg',
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/u1/photo.jpg',
  thumbnailUrl: null,
  originalName: 'photo.jpg',
  width: 1200,
  height: 900,
  duration: null,
  codec: null,
  thumbHash: 'abc',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  message: {
    conversationId: 'conv-1',
    conversation: { identifier: 'conv-1' },
    messageType: 'image',
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  },
};

const DUPLICATED = {
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/u2/copie.jpg',
  filePath: '2026/09/u2/copie.jpg',
  fileName: 'copie.jpg',
  fileSize: 4242,
  mimeType: 'image/jpeg',
};

// ─── Harness ──────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const prisma = {
    messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue(ATTACHMENT_ROW) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'pm-1' }) },
    postMention: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;

  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  } as any);
  app.decorate('socialEvents', {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'bob' },
    };
  };

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockCreatePost.mockReset().mockResolvedValue(PUBLISHED_ROW);
  mockDuplicate.mockReset().mockResolvedValue(DUPLICATED);
  mockCanAccessConversation.mockReset().mockResolvedValue(true);
  mockRecordActivity.mockClear();
});

describe('POST /posts — axe d\'engagement « content.story » (#5534)', () => {
  it('crédite content.story quand la ligne ÉCRITE est une STORY', async () => {
    mockCreatePost.mockResolvedValue(storyRow());
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', content: 'Bonjour tout le monde' },
    });
    await settle();

    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).toHaveBeenCalledWith(USER_ID, 'content.story');

    await app.close();
  });

  it('ne crédite PAS content.story pour un POST ordinaire', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Bonjour tout le monde' },
    });
    await settle();

    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).not.toHaveBeenCalledWith(USER_ID, 'content.story');

    await app.close();
  });

  it('suit le type ÉCRIT, pas le type DEMANDÉ — une STORY dégradée en POST ne crédite pas', async () => {
    // `PostService.createPost` peut dégrader un REEL non qualifiant en POST ;
    // même discipline testée ici côté STORY, sur la foi du doc-comment de
    // `runPublicationEffects` : « la diffusion suit l'intention, l'éventail
    // d'amis suit ce qui est en base » — l'axe d'engagement suit la base.
    mockCreatePost.mockResolvedValue(PUBLISHED_ROW); // écrit comme POST
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', content: 'Bonjour tout le monde' },
    });
    await settle();

    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).not.toHaveBeenCalledWith(USER_ID, 'content.story');

    await app.close();
  });
});

describe('POST /posts/from-attachment — axe d\'engagement « content.story » (#5534)', () => {
  it('crédite content.story quand la pièce jointe est publiée en STORY', async () => {
    mockCreatePost.mockResolvedValue(storyRow());
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID, target: 'STORY' },
    });
    await settle();

    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).toHaveBeenCalledWith(USER_ID, 'content.story');

    await app.close();
  });

  it('ne crédite pas content.story pour une pièce jointe publiée en POST', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID },
    });
    await settle();

    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).not.toHaveBeenCalledWith(USER_ID, 'content.story');

    await app.close();
  });
});
