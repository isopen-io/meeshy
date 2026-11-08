import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerCommentSettingsRoutes } from '../commentSettings';

/**
 * #16541 — l'auteur d'une publication (post, reel, story, statut), ou un
 * modérateur de plateforme qui le DOMINE, ferme ou rouvre ses commentaires.
 *
 * La garde est fail-closed : l'auteur passe ; un tiers passe seulement s'il a
 * `canModerateContent` (MODERATOR, ADMIN, BIGBOSS) ET un rang supérieur à
 * l'auteur — la règle unique du retrait par un tiers (`admitThirdPartyRemoval`).
 * Un refus n'écrit rien et ne diffuse rien.
 */

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439012';

type Role = 'USER' | 'MODERATOR' | 'AUDIT' | 'ANALYST' | 'ADMIN' | 'BIGBOSS';

function auth(userId: string, role: Role) {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', isAuthenticated: true, registeredUser: { id: userId, username: 'tester', role },
      userId, hasFullAccess: true,
    };
  };
}

function anonymousAuth() {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'anonymous', isAuthenticated: true, anonymousUser: { id: 'participant-1' },
      userId: 'participant-1', hasFullAccess: false,
    };
  };
}

type PostRow = { id: string; authorId: string; type: string; commentsDisabled: boolean; visibility: string; visibilityUserIds: string[]; metadata?: Record<string, unknown> | null };

function fixture(options: { post?: Partial<PostRow> | null; authorRole?: Role } = {}) {
  let row: PostRow | null = options.post === null
    ? null
    : { id: POST_ID, authorId: AUTHOR_ID, type: 'POST', commentsDisabled: false, visibility: 'PUBLIC', visibilityUserIds: [], ...options.post };
  const prisma = {
    post: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>().mockImplementation(async () => row),
      updateMany: jest.fn<(args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>>()
        .mockImplementation(async (args) => {
          if (!row) return { count: 0 };
          row = { ...row, ...(args.data as Partial<PostRow>) };
          return { count: 1 };
        }),
    },
    user: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ role: options.authorRole ?? 'USER' }),
    },
    adminAuditLog: {
      create: jest.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>().mockResolvedValue({}),
    },
  };
  const social = {
    broadcastPostUpdated: jest.fn<(post: unknown, authorId: string) => Promise<void>>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<(post: unknown, authorId: string, options?: unknown) => Promise<void>>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<(post: unknown, authorId: string) => Promise<void>>().mockResolvedValue(undefined),
  };
  return { prisma, social };
}

async function buildApp(f: ReturnType<typeof fixture>, preValidation: (request: unknown) => Promise<void>) {
  const app = Fastify();
  app.decorate('socialEvents', f.social);
  registerCommentSettingsRoutes(app, f.prisma as unknown as import('@meeshy/shared/prisma/client').PrismaClient, preValidation);
  await app.ready();
  return app;
}

const patch = (app: Awaited<ReturnType<typeof buildApp>>, body: unknown) =>
  app.inject({ method: 'PATCH', url: `/posts/${POST_ID}/comment-settings`, payload: body as Record<string, unknown> });

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('PATCH /posts/:postId/comment-settings — l’auteur', () => {
  it('test_commentSettings_authorDisables_writesTheColumnAndServesIt', async () => {
    const f = fixture();
    const res = await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ postId: POST_ID, commentsDisabled: true });
    const call = f.prisma.post.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ commentsDisabled: true });
    expect(call.where['id']).toBe(POST_ID);
  });

  it('test_commentSettings_authorReopens_writesFalse', async () => {
    const f = fixture({ post: { commentsDisabled: true } });
    const res = await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: false });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.commentsDisabled).toBe(false);
    expect(f.prisma.post.updateMany.mock.calls[0][0].data).toEqual({ commentsDisabled: false });
  });

  it('test_commentSettings_author_writesNoModerationAudit', async () => {
    const f = fixture();
    await patch(await buildApp(f, auth(AUTHOR_ID, 'ADMIN')), { commentsDisabled: true });
    await flush();
    expect(f.prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /posts/:postId/comment-settings — un tiers', () => {
  it.each<Role>(['MODERATOR', 'ADMIN', 'BIGBOSS'])('test_commentSettings_%s_outrankingTheAuthor_isAllowedAndAudited', async (role) => {
    const f = fixture({ authorRole: 'USER' });
    const res = await patch(await buildApp(f, auth('moderation-1', role)), { commentsDisabled: true });

    expect(res.statusCode).toBe(200);
    expect(f.prisma.post.updateMany).toHaveBeenCalledTimes(1);
    await flush();
    const audit = f.prisma.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ adminId: 'moderation-1', userId: AUTHOR_ID, action: 'DISABLE_COMMENTS', entity: 'Post', entityId: POST_ID });
  });

  it('test_commentSettings_moderatorReopening_auditsEnableComments', async () => {
    const f = fixture({ post: { commentsDisabled: true } });
    await patch(await buildApp(f, auth('moderation-1', 'MODERATOR')), { commentsDisabled: false });
    await flush();
    expect(f.prisma.adminAuditLog.create.mock.calls[0][0].data['action']).toBe('ENABLE_COMMENTS');
  });

  it.each<Role>(['USER', 'AUDIT', 'ANALYST'])('test_commentSettings_another%s_isRefusedAndWritesNothing', async (role) => {
    const f = fixture();
    const res = await patch(await buildApp(f, auth('intrus-1', role)), { commentsDisabled: true });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
    expect(f.prisma.post.updateMany).not.toHaveBeenCalled();
    await flush();
    expect(f.social.broadcastPostUpdated).not.toHaveBeenCalled();
  });

  it('test_commentSettings_moderatorOverAnAdminAuthor_isRefused', async () => {
    const f = fixture({ authorRole: 'ADMIN' });
    const res = await patch(await buildApp(f, auth('moderation-1', 'MODERATOR')), { commentsDisabled: true });

    expect(res.statusCode).toBe(403);
    expect(f.prisma.post.updateMany).not.toHaveBeenCalled();
  });

  it('test_commentSettings_anonymousViewer_isUnauthorized', async () => {
    const f = fixture();
    const res = await patch(await buildApp(f, anonymousAuth()), { commentsDisabled: true });
    expect(res.statusCode).toBe(401);
    expect(f.prisma.post.updateMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /posts/:postId/comment-settings — saisie et existence', () => {
  it.each([[{}], [{ commentsDisabled: 'yes' }], [{ commentsDisabled: true, extra: 1 }]])(
    'test_commentSettings_invalidBody_%j_isRefusedWith400',
    async (body) => {
      const f = fixture();
      const res = await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), body);
      expect(res.statusCode).toBe(400);
      expect(f.prisma.post.updateMany).not.toHaveBeenCalled();
    },
  );

  it('test_commentSettings_unknownPost_is404', async () => {
    const f = fixture({ post: null });
    const res = await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
  });

  it('test_commentSettings_postDeletedBetweenReadAndWrite_is404', async () => {
    const f = fixture();
    f.prisma.post.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /posts/:postId/comment-settings — diffusion', () => {
  it.each([
    ['POST', 'broadcastPostUpdated'],
    ['REEL', 'broadcastPostUpdated'],
    ['STORY', 'broadcastStoryUpdated'],
    ['STATUS', 'broadcastStatusUpdated'],
  ] as const)('test_commentSettings_%s_isBroadcastBy_%s_withTheNewState', async (type, method) => {
    const f = fixture({ post: { type } });
    await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });
    await flush();

    const broadcast = f.social[method];
    expect(broadcast).toHaveBeenCalledTimes(1);
    const [served, authorId] = broadcast.mock.calls[0] as [Record<string, unknown>, string];
    expect(served['commentsDisabled']).toBe(true);
    expect(authorId).toBe(AUTHOR_ID);
  });

  it('test_commentSettings_storyBroadcast_keepsEngagement', async () => {
    const f = fixture({ post: { type: 'STORY' } });
    await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });
    await flush();
    expect(f.social.broadcastStoryUpdated.mock.calls[0][2]).toEqual({ engagementReset: false });
  });

  it('test_commentSettings_broadcastFailure_doesNotFailTheWrite', async () => {
    const f = fixture();
    f.social.broadcastPostUpdated.mockRejectedValueOnce(new Error('socket down'));
    const res = await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });
    await flush();
    expect(res.statusCode).toBe(200);
  });
});

describe('PUT /posts/:postId — l’auteur ferme les commentaires depuis l’édition', () => {
  it('test_updatePostSchema_keepsCommentsDisabled_insteadOfStrippingIt', async () => {
    const { UpdatePostSchema } = await import('../types');
    expect(UpdatePostSchema.parse({ commentsDisabled: true })).toEqual({ commentsDisabled: true });
    expect(UpdatePostSchema.parse({ content: 'x' })).not.toHaveProperty('commentsDisabled');
    expect(UpdatePostSchema.safeParse({ commentsDisabled: 'oui' }).success).toBe(false);
  });
});

describe('PATCH /posts/:postId/comment-settings — audit adversarial (#16541)', () => {
  it('test_commentSettings_broadcast_hoistsLocationAndTrackingLinks_likeTheEditRoute', async () => {
    const location = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null, category: null };
    const trackingLinks = [{ token: 'abc', url: 'https://meeshy.me' }];
    const f = fixture({ post: { metadata: { location, trackingLinks } } });
    await patch(await buildApp(f, auth(AUTHOR_ID, 'USER')), { commentsDisabled: true });
    await flush();

    const [served] = f.social.broadcastPostUpdated.mock.calls[0] as [Record<string, unknown>, string];
    expect(served['location']).toEqual(location);
    expect(served['trackingLinks']).toEqual(trackingLinks);
  });

  it('test_commentSettings_unchangedValue_answers200_withoutWritingNorBroadcasting', async () => {
    const f = fixture({ post: { commentsDisabled: true } });
    const res = await patch(await buildApp(f, auth('moderation-1', 'MODERATOR')), { commentsDisabled: true });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ postId: POST_ID, commentsDisabled: true });
    expect(f.prisma.post.updateMany).not.toHaveBeenCalled();
    expect(f.social.broadcastPostUpdated).not.toHaveBeenCalled();
    expect(f.prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('test_commentSettings_unchangedValue_isStillRefusedToAnOutsider', async () => {
    const f = fixture({ post: { commentsDisabled: true } });
    const res = await patch(await buildApp(f, auth('intrus-1', 'USER')), { commentsDisabled: true });
    expect(res.statusCode).toBe(403);
  });
});
