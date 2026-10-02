/**
 * #9080 — UN COMMENTAIRE PEUT PORTER UN STICKER, dans la MÊME forme que le
 * sticker d'un message : le descripteur `sticker` (`MessageSticker`, validé
 * par `parseMessageSticker`) et, à côté, l'image rendue en média joint
 * (`attachmentIds`). Le descripteur se range dans `metadata.sticker` et se
 * sert HISSÉ à la racine — REST (création, liste, réponses) et socket.
 *
 * Fichier séparé de `comments.test.ts` (`DETTE_HERITEE`, interdit d'ajout).
 * Les témoins passent par `app.inject` : route réelle, schéma Zod réel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockAddComment = jest.fn<any>();
const mockGetComments = jest.fn<any>();

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...args: any[]) => mockGetComments(...args),
    getReplies: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    addComment: (...args: any[]) => mockAddComment(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
  })),
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


import { registerCommentRoutes } from '../../../../routes/posts/comments';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const STICKER_MEDIA_ID = '507f1f77bcf86cd799439055';
const PUBLIC_ACL = { id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };

const MEE = { templateId: 'mee.mee-coucou', slots: { line1: 'Salut' }, animation: 'wobble' } as const;

async function requiredAuth(req: FastifyRequest): Promise<void> {
  (req as any).authContext = {
    isAuthenticated: true,
    isAnonymous: false,
    type: 'user',
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
  };
}

function buildPrisma() {
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(PUBLIC_ACL),
      findUnique: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1', commentCount: 1, type: 'POST', content: 'Post content',
        createdAt: new Date(), expiresAt: null, visibility: 'PUBLIC', visibilityUserIds: [],
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post: PUBLIC_ACL }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    postMedia: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as any;
}

async function buildApp(prisma: any, broadcast = jest.fn<any>().mockResolvedValue(undefined)): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', { broadcastCommentAdded: broadcast } as any);
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

const optionsOf = (call: readonly unknown[]): Record<string, unknown> =>
  call.find((a): a is Record<string, unknown> => a !== null && typeof a === 'object' && 'mediaIds' in a) ?? {};

beforeEach(() => {
  mockAddComment.mockReset();
  mockGetComments.mockReset();
  mockAddComment.mockResolvedValue({
    id: 'comment-9080', content: '', authorId: USER_ID, postId: POST_ID,
    metadata: { sticker: MEE },
    media: [{ id: STICKER_MEDIA_ID, mimeType: 'image/png', fileUrl: 'https://x/s.png' }],
  });
});

describe('#9080 — créer un commentaire-sticker', () => {
  it('un sticker SEUL (image jointe, aucun texte) est admis, et le service reçoit le descripteur ET le média', async () => {
    const app = await buildApp(buildPrisma());
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { sticker: MEE, attachmentIds: [STICKER_MEDIA_ID] },
    });
    expect(res.statusCode).toBe(201);
    const options = optionsOf(mockAddComment.mock.calls[0]);
    expect(options.sticker).toEqual(MEE);
    expect(options.mediaIds).toEqual([STICKER_MEDIA_ID]);
    await app.close();
  });

  it('un sticker à gabarit SANS image ni texte est admis — même loi que le message (#7954)', async () => {
    const app = await buildApp(buildPrisma());
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { sticker: { emoji: '🔥' } },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('un sticker INVALIDE ne rend pas le corps non vide : seul, il est REFUSÉ et rien n’est écrit', async () => {
    const app = await buildApp(buildPrisma());
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { sticker: { animation: 'moonwalk', templateId: 'mee.mee-coucou' } },
    });
    expect(res.statusCode).toBe(400);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('la réponse REST et l’écho socket servent le sticker HISSÉ à la racine', async () => {
    const broadcast = jest.fn<any>().mockResolvedValue(undefined);
    const app = await buildApp(buildPrisma(), broadcast);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'pour toi', sticker: MEE, attachmentIds: [STICKER_MEDIA_ID] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.sticker).toEqual(MEE);
    const echo = broadcast.mock.calls[0][0] as { comment: { sticker?: unknown } };
    expect(echo.comment.sticker).toEqual(MEE);
    await app.close();
  });

  it('une RÉPONSE à un commentaire porte son sticker par le même chemin', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { parentId: '507f1f77bcf86cd799439033', sticker: MEE, attachmentIds: [STICKER_MEDIA_ID] },
    });
    expect(res.statusCode).toBe(201);
    const options = optionsOf(mockAddComment.mock.calls[0]);
    expect(options.parentId).toBe('507f1f77bcf86cd799439033');
    expect(options.sticker).toEqual(MEE);
    await app.close();
  });
});

describe('#9080 — lire un commentaire-sticker', () => {
  it('la liste sert le sticker HISSÉ, revalidé : un descripteur stocké hors borne n’est pas servi', async () => {
    mockGetComments.mockResolvedValue({
      items: [
        { id: 'c-1', content: '', postId: POST_ID, metadata: { sticker: MEE }, author: { id: USER_ID } },
        { id: 'c-2', content: 'x', postId: POST_ID, metadata: { sticker: { emoji: '🔥', animation: 'moonwalk' } }, author: { id: USER_ID } },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const app = await buildApp(buildPrisma());
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    const [premier, second] = res.json().data;
    expect(premier.sticker).toEqual(MEE);
    expect(second.sticker).toBeUndefined();
    await app.close();
  });
});
