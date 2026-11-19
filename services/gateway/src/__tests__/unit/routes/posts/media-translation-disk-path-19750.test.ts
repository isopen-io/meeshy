/**
 * #19750 — la carte `PostMedia.translations` sort SANS `path`, le chemin disque
 * ABSOLU (`/app/uploads/translated/…`) que la persistance garde. Même fuite que
 * #19672 côté message. Le témoin traverse les vraies routes et juge le CORPS
 * servi : média du post, original d'une republication, commentaires en aperçu,
 * liste des commentaires et écho socket de la création.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockGetPostById = jest.fn<any>();
const mockGetComments = jest.fn<any>();
const mockAddComment = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...args: any[]) => mockGetComments(...args),
    getReplies: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    addComment: (...args: any[]) => mockAddComment(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>(), translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn<any>().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn<any>().mockResolvedValue(undefined),
    createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: (...args: any[]) => (args[0] as any).op(),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerCommentRoutes } from '../../../../routes/posts/comments';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const PUBLIC_ACL = { id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
const DISK = '/app/uploads/translated/';

const track = (language: string) => ({
  type: 'audio',
  transcription: `texte ${language}`,
  path: `${DISK}media-1_${language}.mp3`,
  url: `/api/v1/attachments/file/translated/media-1_${language}.mp3`,
  durationMs: 1200,
  format: 'audio/mp3',
});

const voiceMedia = (id: string) => ({
  id,
  fileUrl: `/api/v1/attachments/file/2026/11/u/${id}.m4a`,
  mimeType: 'audio/mp4',
  caption: 'ma voix',
  captionTranslations: { en: { text: 'my voice' } },
  translations: { fr: track('fr'), en: track('en') },
});

const servedTrack = (language: string) => {
  const { path: _disk, ...served } = track(language);
  return served;
};

async function requiredAuth(req: FastifyRequest): Promise<void> {
  (req as any).authContext = {
    isAuthenticated: true,
    isAnonymous: false,
    type: 'user',
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER', emailVerifiedAt: new Date() },
  };
}

function buildPrisma() {
  return {
    user: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(PUBLIC_ACL),
      findUnique: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1', commentCount: 1, type: 'POST', content: 'Post', createdAt: new Date(),
        expiresAt: null, visibility: 'PUBLIC', visibilityUserIds: [],
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post: PUBLIC_ACL }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    postMedia: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    postMention: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  } as any;
}

async function buildApp(broadcast = jest.fn<any>().mockResolvedValue(undefined)): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = buildPrisma();
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', { broadcastCommentAdded: broadcast } as any);
  registerCoreRoutes(app, prisma, requiredAuth);
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

const comment = (id: string) => ({ id, content: 'écoute', authorId: 'u-ana', postId: POST_ID, metadata: null, media: [voiceMedia(`m-${id}`)] });

beforeEach(() => {
  mockGetPostById.mockReset();
  mockGetComments.mockReset();
  mockAddComment.mockReset();
});

describe('#19750 — une piste traduite de média de post sort sans son chemin disque', () => {
  it('GET /posts/:postId — le post, l’original republié et les commentaires en aperçu', async () => {
    mockGetPostById.mockResolvedValue({
      id: POST_ID, authorId: 'author-1', type: 'STORY', content: 'story',
      media: [voiceMedia('m-post')],
      repostOf: { id: 'p-source', type: 'STORY', media: [voiceMedia('m-source')] },
      comments: [comment('c1')],
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(DISK);
    const data = res.json().data;
    expect(data.media[0].translations).toEqual({ fr: servedTrack('fr'), en: servedTrack('en') });
    expect(data.media[0].captionTranslations).toEqual({ en: { text: 'my voice' } });
    expect(data.repostOf.media[0].translations.fr).toEqual(servedTrack('fr'));
    expect(data.comments[0].media[0].translations.en).toEqual(servedTrack('en'));
    await app.close();
  });

  it('GET /posts/:postId/comments et l’écho socket de la création', async () => {
    mockGetComments.mockResolvedValue({ items: [comment('c1')], hasMore: false, nextCursor: null });
    mockAddComment.mockResolvedValue(comment('c2'));
    const broadcast = jest.fn<any>().mockResolvedValue(undefined);
    const app = await buildApp(broadcast);

    const list = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    const created = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments`, payload: { content: 'écoute' } });

    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(DISK);
    expect(list.json().data[0].media[0].translations.fr).toEqual(servedTrack('fr'));
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(DISK);
    expect(JSON.stringify(broadcast.mock.calls[0]?.[0])).not.toContain(DISK);
    await app.close();
  });

  it('une carte d’une autre forme traverse inchangée', async () => {
    mockGetPostById.mockResolvedValue({
      id: POST_ID, authorId: 'author-1', type: 'POST', content: 'post',
      media: [{ id: 'm1', translations: null }, { id: 'm2', translations: 'legacy' }, { id: 'm3' }],
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.media).toEqual([{ id: 'm1', translations: null }, { id: 'm2', translations: 'legacy' }, { id: 'm3' }]);
    await app.close();
  });
});
