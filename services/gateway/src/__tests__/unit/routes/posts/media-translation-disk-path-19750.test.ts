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
const mockUpdateComment = jest.fn<any>();

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
    updateComment: (...args: any[]) => mockUpdateComment(...args),
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

async function buildApp(
  broadcast = jest.fn<any>().mockResolvedValue(undefined),
  broadcastUpdated = jest.fn<any>().mockResolvedValue(undefined),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = buildPrisma();
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', { broadcastCommentAdded: broadcast, broadcastCommentUpdated: broadcastUpdated } as any);
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
  mockUpdateComment.mockReset();
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

  it('QA — GET /posts/:postId/comments : le média CITÉ (quotedMedia) sort aussi sans son chemin disque', async () => {
    const citing = {
      id: 'c-q', content: 'regarde', authorId: 'u-ana', postId: POST_ID, media: [],
      metadata: { quotedPostMedia: { postMediaId: 'm-cited', kind: 'audio' } },
    };
    mockGetComments.mockResolvedValue({ items: [citing], hasMore: false, nextCursor: null });
    const app = await buildApp();
    const prisma = (app as any).prisma;
    prisma.postMedia.findMany.mockResolvedValue([{ ...voiceMedia('m-cited'), postId: POST_ID }]);

    const list = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(list.statusCode).toBe(200);
    expect(list.json().data[0].quotedMedia.id).toBe('m-cited');
    expect(list.body).not.toContain(DISK);
    await app.close();
  });

  it('POST et PATCH d’un commentaire qui cite : la réponse et l’écho socket servent le média cité sans chemin disque', async () => {
    const citing = {
      id: 'c-q', content: 'regarde', authorId: USER_ID, postId: POST_ID, media: [],
      metadata: { quotedPostMedia: { postMediaId: 'm-cited', kind: 'audio' } },
    };
    mockAddComment.mockResolvedValue(citing);
    mockUpdateComment.mockResolvedValue({ ...citing, content: 'regarde bien' });
    const added = jest.fn<any>().mockResolvedValue(undefined);
    const updated = jest.fn<any>().mockResolvedValue(undefined);
    const app = await buildApp(added, updated);
    (app as any).prisma.postMedia.findMany.mockResolvedValue([{ ...voiceMedia('m-cited'), postId: POST_ID }]);

    const created = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments`, payload: { content: 'regarde' } });
    const edited = await app.inject({ method: 'PATCH', url: `/posts/${POST_ID}/comments/c-q`, payload: { content: 'regarde bien' } });

    expect(created.statusCode).toBe(201);
    expect(edited.statusCode).toBe(200);
    expect(created.json().data.quotedMedia.translations.fr).toEqual(servedTrack('fr'));
    expect(edited.json().data.quotedMedia.translations.en).toEqual(servedTrack('en'));
    expect(created.body).not.toContain(DISK);
    expect(edited.body).not.toContain(DISK);
    const echoes = [added.mock.calls[0]?.[0], updated.mock.calls[0]?.[0]] as Array<{ comment: { quotedMedia?: unknown } }>;
    expect(echoes.map((echo) => echo?.comment.quotedMedia)).toEqual([expect.anything(), expect.anything()]);
    expect(JSON.stringify(echoes)).not.toContain(DISK);
    await app.close();
  });
});
