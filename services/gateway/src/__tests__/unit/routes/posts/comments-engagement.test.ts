/**
 * Axe d'engagement « commentaire texte » (#5537) sur POST /posts/:postId/comments.
 *
 * Fichier séparé de comments.test.ts, qui porte déjà une dette de taille gelée
 * (`gateway-test-file-size-budget.test.ts` § règle 3) — y ajouter est interdit,
 * il faut extraire. Ce fichier ne couvre QUE le branchement `comment.text` /
 * `comment.audio`, avec son propre harnais minimal (même patron que
 * `comments-like-delete.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAddComment = jest.fn<any>();

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: jest.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    getReplies: jest.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    addComment: (...args: any[]) => mockAddComment(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));

const mockRecordActivity = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (...args: any[]) => mockRecordActivity(...args),
  })),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn<any>().mockResolvedValue(undefined),
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCommentRoutes } from '../../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const PUBLIC_ACL = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };

// Doit être ASYNC (ou renvoyer une Promise) : Fastify traite un hook à un
// seul argument comme une forme promise-based et attend indéfiniment sa
// résolution — une fonction synchrone qui ne renvoie rien y fait pendre
// `app.inject()` pour de bon (jamais de rejet, jamais de résolution).
async function requiredAuth(req: FastifyRequest): Promise<void> {
  (req as any).authContext = {
    isAuthenticated: true,
    isAnonymous: false,
    type: 'user',
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(PUBLIC_ACL),
      findUnique: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1',
        commentCount: 1,
        type: 'POST',
        content: 'Post content',
        createdAt: new Date(),
        expiresAt: null,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post: PUBLIC_ACL }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
  app.decorate('prisma', prisma);
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockRecordActivity.mockClear();
  mockAddComment.mockReset();
});

describe('POST /posts/:postId/comments — axe d\'engagement « comment.text » (#5537)', () => {
  it('crédite comment.text pour un commentaire sans pièce jointe audio', async () => {
    mockAddComment.mockResolvedValue({
      id: 'comment-004',
      content: 'Nice post!',
      authorId: USER_ID,
      media: [],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Nice post!' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).toHaveBeenCalledWith(USER_ID, 'comment.text');
    await app.close();
  });

  it('ne crédite PAS comment.text pour un commentaire à pièce jointe audio', async () => {
    mockAddComment.mockResolvedValue({
      id: 'comment-005',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-audio-002', mimeType: 'audio/mpeg', fileUrl: '/uploads/audio.mp3' }],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-audio-002'] },
    });
    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).not.toHaveBeenCalled();
    await app.close();
  });
});
