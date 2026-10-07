/**
 * Axes d'engagement « commentaire texte » (#5537) et « comment.audio » (#5536)
 * sur POST /posts/:postId/comments — mutuellement exclusifs (le pipeline audio
 * de `comments.ts` décide déjà de la même distinction : média lié dont le MIME
 * commence par `audio/`, ou non).
 *
 * Fichier séparé de `comments.test.ts` : ce dernier est dans `DETTE_HERITEE`
 * (`gateway-test-file-size-budget.test.ts` § règle 3) et interdit d'ajout tant
 * qu'il dépasse son budget — cf. CLAUDE.md § Budget de taille. Le comportement
 * générique du compteur (incrément, notification `BADGE_EARNED` au
 * franchissement d'un palier) est couvert par `EngagementService.test.ts`
 * (#5530) ; ce fichier garde uniquement le CÂBLAGE route → axe.
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

/**
 * L'INVITÉ d'un lien partagé : authentifié par jeton de session, sans compte —
 * `authContext.userId` est son `Participant.id`, et il n'a pas de `registeredUser`.
 */
const GUEST_PARTICIPANT_ID = '507f1f77bcf86cd799439099';
async function guestAuth(req: FastifyRequest): Promise<void> {
  (req as any).authContext = {
    isAuthenticated: true,
    isAnonymous: true,
    type: 'anonymous',
    userId: GUEST_PARTICIPANT_ID,
    participantId: GUEST_PARTICIPANT_ID,
    hasFullAccess: false,
  };
}

async function buildApp(
  auth: (req: FastifyRequest) => Promise<void> = requiredAuth,
  postRows?: Readonly<Record<string, Record<string, unknown>>>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    post: {
      findFirst: postRows
        ? jest.fn(({ where }: any) => Promise.resolve(postRows[where.id] ?? null))
        : jest.fn<any>().mockResolvedValue({ id: POST_ID, ...PUBLIC_ACL }),
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
  registerCommentRoutes(app, prisma, auth);
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
    expect(mockRecordActivity).toHaveBeenCalledWith(USER_ID, 'comment.text', { postId: POST_ID });
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
    expect(mockRecordActivity).not.toHaveBeenCalledWith(USER_ID, 'comment.text', expect.anything());
    await app.close();
  });
});

describe('POST /posts/:postId/comments — axe d\'engagement « comment.audio » (#5536)', () => {
  it('crédite comment.audio quand le média lié est audio', async () => {
    mockAddComment.mockResolvedValue({
      id: 'comment-audio-engagement',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-audio-003', mimeType: 'audio/mpeg', fileUrl: '/uploads/audio2.mp3' }],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-audio-003'] },
    });
    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).toHaveBeenCalledWith(USER_ID, 'comment.audio', { postId: POST_ID });
    await app.close();
  });

  it('ne crédite pas comment.audio pour un commentaire texte seul', async () => {
    mockAddComment.mockResolvedValue({
      id: 'comment-text-only',
      content: 'Just text, no media',
      authorId: USER_ID,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Just text, no media' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).not.toHaveBeenCalledWith(USER_ID, 'comment.audio', expect.anything());
    await app.close();
  });

  it('ne crédite pas comment.audio quand le média lié n\'est pas audio', async () => {
    mockAddComment.mockResolvedValue({
      id: 'comment-image',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-image-001', mimeType: 'image/png', fileUrl: '/uploads/pic.png' }],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-image-001'] },
    });
    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity).not.toHaveBeenCalledWith(USER_ID, 'comment.audio', expect.anything());
    await app.close();
  });
});

/**
 * #9569 — aucun crédit de post ne s'inscrit pour un invité. Le commentaire est
 * le seul geste du fil dont le crédit part de la ROUTE : c'est donc elle qui
 * doit le refuser avant d'écrire quoi que ce soit, et sa clé de participant ne
 * doit jamais atteindre le barème.
 */
describe('POST /posts/:postId/comments — l’invité d’un lien', () => {
  it('est refusé : aucun commentaire écrit, aucun crédit inscrit sous sa clé de participant', async () => {
    mockAddComment.mockResolvedValue({ id: 'comment-guest', content: 'Bonjour', authorId: GUEST_PARTICIPANT_ID, media: [] });
    const app = await buildApp(guestAuth);

    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Bonjour' },
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(mockRecordActivity).not.toHaveBeenCalled();
  });
});

/**
 * #9584 — un commentaire écrit depuis la carte d'une REPUBLICATION SIMPLE
 * atterrit sur le fil de l'original, et crédite les DEUX posts pour de vrai :
 * un crédit sur l'original, un autre sur la republication traversée, chacun
 * passant son barème. La résolution rend la republication traversée.
 */
describe('POST /posts/:postId/comments — par où le commentaire est passé (#9584)', () => {
  const REPOST_ID = '507f1f77bcf86cd799439055';
  const rows = {
    [REPOST_ID]: { id: REPOST_ID, ...PUBLIC_ACL, type: 'POST', isQuote: false, repostOfId: POST_ID, originalRepostOfId: POST_ID, deletedAt: null },
    [POST_ID]: { id: POST_ID, ...PUBLIC_ACL, type: 'POST', isQuote: false, repostOfId: null, originalRepostOfId: null, deletedAt: null },
  };

  it('écrit le commentaire sur l’original, et crédite l’original ET la republication — deux crédits', async () => {
    mockAddComment.mockResolvedValue({ id: 'comment-through-repost', content: 'Bravo', authorId: USER_ID, media: [] });
    const app = await buildApp(requiredAuth, rows);

    const res = await app.inject({ method: 'POST', url: `/posts/${REPOST_ID}/comments`, payload: { content: 'Bravo' } });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(mockAddComment.mock.calls[0]?.[0]).toBe(POST_ID);
    expect(mockRecordActivity.mock.calls).toEqual([
      [USER_ID, 'comment.text', { postId: POST_ID }],
      [USER_ID, 'comment.text', { postId: REPOST_ID }],
    ]);
  });

  it('sur l’original lui-même, un seul crédit', async () => {
    mockAddComment.mockResolvedValue({ id: 'comment-direct', content: 'Bravo', authorId: USER_ID, media: [] });
    const app = await buildApp(requiredAuth, rows);

    await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments`, payload: { content: 'Bravo' } });
    await app.close();

    expect(mockRecordActivity.mock.calls).toEqual([[USER_ID, 'comment.text', { postId: POST_ID }]]);
  });
});
