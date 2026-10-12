/**
 * Les publications d'un membre, vues et modérées depuis sa fiche (#10315).
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerUserPublicationRoutes } from '../user-publications';

const AUTHOR = '507f1f77bcf86cd799439031';
const ACTOR = '507f1f77bcf86cd799439032';
const P1 = '507f1f77bcf86cd799439011';
const P2 = '507f1f77bcf86cd799439012';
const FOREIGN = '507f1f77bcf86cd799439013';

const postFindMany = jest.fn<any>();
const postCount = jest.fn<any>();
const postUpdateMany = jest.fn<any>();
const auditCreateMany = jest.fn<any>();
const userFindUnique = jest.fn<any>();
const notificationFindMany = jest.fn<any>().mockResolvedValue([]);
const transaction = jest.fn<any>((ops: Promise<unknown>[]) => Promise.all(ops));

const prisma = {
  post: { findMany: postFindMany, count: postCount, updateMany: postUpdateMany },
  adminAuditLog: { createMany: auditCreateMany },
  user: { findUnique: userFindUnique },
  notification: { findMany: notificationFindMany, deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  $transaction: transaction,
} as any;

const socialEvents = {
  broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
};

async function buildApp(role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', socialEvents as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, userId: ACTOR, registeredUser: { id: ACTOR, role } };
  });
  registerUserPublicationRoutes(app);
  await app.ready();
  return app;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: P1,
  authorId: AUTHOR,
  type: 'POST',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  moderationHiddenAt: null,
  moderationPriorVisibility: null,
  ...over,
});

const moderate = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/admin/users/${AUTHOR}/publications/moderation`, payload });

beforeEach(() => {
  jest.clearAllMocks();
  userFindUnique.mockResolvedValue({ role: 'USER' });
  postUpdateMany.mockResolvedValue({ count: 1 });
  auditCreateMany.mockResolvedValue({ count: 1 });
});

describe('GET /admin/users/:userId/publications', () => {
  it("sert ses publications avec vignette, type, audience et état — de l'auteur seulement", async () => {
    postFindMany.mockResolvedValue([
      {
        id: P1,
        type: 'REEL',
        visibility: 'PRIVATE',
        content: 'Bonjour',
        createdAt: new Date('2026-10-10T10:00:00Z'),
        expiresAt: null,
        deletedAt: null,
        moderationHiddenAt: new Date('2026-10-11T10:00:00Z'),
        moderationPriorVisibility: 'PUBLIC',
        media: [{ mimeType: 'video/mp4', fileUrl: '/f/v.mp4', thumbnailUrl: '/f/v.jpg' }],
        _count: { media: 2 },
      },
    ]);
    postCount.mockResolvedValue(1);
    const app = await buildApp('MODERATOR');

    const res = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications?limit=10` });

    expect(res.statusCode).toBe(200);
    expect(postFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { authorId: AUTHOR }, take: 10, orderBy: { createdAt: 'desc' } });
    const body = res.json();
    expect(body.data).toEqual([
      {
        id: P1,
        type: 'REEL',
        visibility: 'PRIVATE',
        state: 'offline',
        contentPreview: 'Bonjour',
        createdAt: '2026-10-10T10:00:00.000Z',
        expiresAt: null,
        deletedAt: null,
        moderationHiddenAt: '2026-10-11T10:00:00.000Z',
        moderationPriorVisibility: 'PUBLIC',
        mediaCount: 2,
        thumbnail: { url: '/f/v.jpg', mimeType: 'video/mp4' },
      },
    ]);
    expect(body.pagination).toEqual({ total: 1, limit: 10, offset: 0, hasMore: false });
    await app.close();
  });

  it("refuse un rang sans droit de modération (AUDIT)", async () => {
    const app = await buildApp('AUDIT');
    const res = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications` });
    expect(res.statusCode).toBe(403);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /admin/users/:userId/publications/moderation', () => {
  it("met hors ligne : audience forcée en PRIVATE, retrait daté, audience retenue, journal par publication avec l'état d'avant", async () => {
    postFindMany.mockResolvedValue([row({ id: P1, visibility: 'FRIENDS' }), row({ id: P2, type: 'STORY', visibility: 'PRIVATE' })]);
    const app = await buildApp('ADMIN');

    const res = await moderate(app, { action: 'take-offline', postIds: [P1, P2, FOREIGN], reason: 'Contenu signalé' });

    expect(res.statusCode).toBe(200);
    expect(postFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: { in: [P1, P2, FOREIGN] }, authorId: AUTHOR } });
    const writes = postUpdateMany.mock.calls.map((call) => call[0] as any);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ where: { id: P1, authorId: AUTHOR }, data: { visibility: 'PRIVATE', moderationPriorVisibility: 'FRIENDS' } });
    expect(writes[0].data.moderationHiddenAt).toBeInstanceOf(Date);
    expect(writes[1].data).toMatchObject({ visibility: 'PRIVATE', moderationPriorVisibility: null });

    const audit = (auditCreateMany.mock.calls[0]?.[0] as any).data;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ userId: AUTHOR, adminId: ACTOR, action: 'MODERATE_POST', entity: 'Post', entityId: P1 });
    expect(JSON.parse(audit[0].changes).visibility).toEqual({ before: 'FRIENDS', after: 'PRIVATE' });
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ action: 'take-offline', reason: 'Contenu signalé' });
    expect(transaction).toHaveBeenCalledTimes(1);

    expect(socialEvents.broadcastPostDeleted).toHaveBeenCalledWith(P1, AUTHOR);
    expect(socialEvents.broadcastStoryDeleted).not.toHaveBeenCalled();

    expect(res.json().data).toMatchObject({ action: 'take-offline', updated: 2, unchanged: 0, skipped: 1 });
    expect(res.json().data.results[2]).toEqual({ postId: FOREIGN, outcome: 'skipped', visibility: null, moderationHiddenAt: null });
    await app.close();
  });

  it("remet en ligne avec l'audience que l'auteur avait choisie, sans rien annoncer comme retiré", async () => {
    postFindMany.mockResolvedValue([row({ visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationPriorVisibility: 'COMMUNITY' })]);
    const app = await buildApp('ADMIN');

    const res = await moderate(app, { action: 'restore', postIds: [P1], reason: 'Erreur de modération' });

    expect(res.statusCode).toBe(200);
    expect((postUpdateMany.mock.calls[0]?.[0] as any).data).toEqual({ visibility: 'COMMUNITY', moderationHiddenAt: null, moderationPriorVisibility: null });
    expect(socialEvents.broadcastPostDeleted).not.toHaveBeenCalled();
    expect(res.json().data.results[0]).toEqual({ postId: P1, outcome: 'updated', visibility: 'COMMUNITY', moderationHiddenAt: null });
    await app.close();
  });

  it("n'écrit ni ne journalise rien quand le geste est déjà fait", async () => {
    postFindMany.mockResolvedValue([row({ visibility: 'PRIVATE' })]);
    const app = await buildApp('ADMIN');

    const res = await moderate(app, { action: 'make-private', postIds: [P1], reason: 'Doublon' });

    expect(res.statusCode).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
    expect(res.json().data).toMatchObject({ updated: 0, unchanged: 1, skipped: 0 });
    await app.close();
  });

  it('exige un motif hors du rang souverain', async () => {
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1] });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('laisse le rang souverain agir sans motif', async () => {
    postFindMany.mockResolvedValue([row()]);
    const app = await buildApp('BIGBOSS');
    const res = await moderate(app, { action: 'make-private', postIds: [P1] });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse((auditCreateMany.mock.calls[0]?.[0] as any).data[0].metadata).reason).toBeNull();
    await app.close();
  });

  it('borne le lot', async () => {
    const app = await buildApp('ADMIN');
    const ids = Array.from({ length: 51 }, (_, i) => `507f1f77bcf86cd7994${String(i).padStart(5, '0')}`);
    const res = await moderate(app, { action: 'make-private', postIds: ids, reason: 'Spam massif' });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse un modérateur sur les publications d'un rang supérieur — sans rien écrire", async () => {
    userFindUnique.mockResolvedValue({ role: 'ADMIN' });
    const app = await buildApp('MODERATOR');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(403);
    expect(postFindMany).not.toHaveBeenCalled();
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('admet un modérateur sur un membre ordinaire', async () => {
    postFindMany.mockResolvedValue([row()]);
    const app = await buildApp('MODERATOR');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("refuse un rang sans droit de modération, même sur un membre ordinaire", async () => {
    const app = await buildApp('ANALYST');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(403);
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });
});
