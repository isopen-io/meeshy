/**
 * #10945 — l'auteur d'un COMMENTAIRE porte son contour équipé, sur la liste,
 * les réponses, la création et l'écho socket : lu dans la jointure de
 * l'auteur (`postAuthorSelect`), résolu en `profileDecor` à la sortie
 * (`hoistCommentCarriers`). La colonne brute ne part jamais.
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
const PUBLIC_ACL = { id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };


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
    user: { findFirst: jest.fn<any>().mockResolvedValue(null) },
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



import { postAuthorSelect } from '../../../../services/posts/postIncludes';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };
const author = (equippedAvatarRing: string | null) => ({ id: 'u-ana', username: 'ana', displayName: 'Ana', avatar: null, equippedAvatarRing });
const comment = (equippedAvatarRing: string | null) => ({ id: 'c1', content: 'bravo', authorId: 'u-ana', postId: POST_ID, metadata: null, media: [], author: author(equippedAvatarRing) });

beforeEach(() => {
  mockAddComment.mockReset();
  mockGetComments.mockReset();
});

describe('#10945 — le contour de l’auteur d’un commentaire', () => {
  it('la jointure de l’auteur lit la colonne du contour', () => {
    expect(postAuthorSelect).toMatchObject({ equippedAvatarRing: true });
  });

  it('la liste sert author.profileDecor, jamais la colonne', async () => {
    mockGetComments.mockResolvedValue({ items: [comment('contours-essentiels/filet'), { ...comment(null), id: 'c2' }], hasMore: false, nextCursor: null });
    const app = await buildApp(buildPrisma());
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    const items = res.json().data as Array<{ author: Record<string, unknown> }>;
    expect(items[0]?.author.profileDecor).toEqual({ avatarRing: RING });
    expect(items[1]?.author).not.toHaveProperty('profileDecor');
    expect(res.body).not.toContain('equippedAvatarRing');
    await app.close();
  });

  it('la création et son écho socket servent le contour', async () => {
    mockAddComment.mockResolvedValue(comment('contours-essentiels/filet'));
    const broadcast = jest.fn<any>().mockResolvedValue(undefined);
    const app = await buildApp(buildPrisma(), broadcast);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments`, payload: { content: 'bravo' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.author.profileDecor).toEqual({ avatarRing: RING });
    expect(res.body).not.toContain('equippedAvatarRing');
    const pushed = (broadcast.mock.calls[0]?.[0] as { comment: unknown }).comment;
    expect((pushed as { author: Record<string, unknown> }).author.profileDecor).toEqual({ avatarRing: RING });
    expect(JSON.stringify(pushed)).not.toContain('equippedAvatarRing');
    await app.close();
  });
});
