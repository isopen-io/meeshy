/**
 * Les gestes de l'administration sur une publication, depuis la liste de la
 * plateforme (#10392) : hors ligne, remise en ligne, audience choisie.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

import { adminPostGestureRoutes } from '../post-gestures';

const AUTHOR = '507f1f77bcf86cd799439031';
const ACTOR = '507f1f77bcf86cd799439032';
const P1 = '507f1f77bcf86cd799439011';
const P2 = '507f1f77bcf86cd799439012';
const OWN = '507f1f77bcf86cd799439014';
const GONE = '507f1f77bcf86cd799439015';
const UPDATED = new Date('2026-10-12T10:00:00.000Z');

const postFindMany = jest.fn<any>();
const postUpdateMany = jest.fn<any>();
const auditCreateMany = jest.fn<any>();
const userFindMany = jest.fn<any>();
const transaction = jest.fn<any>((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

const prisma = {
  post: { findMany: postFindMany, updateMany: postUpdateMany },
  adminAuditLog: { createMany: auditCreateMany },
  user: { findMany: userFindMany },
  notification: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
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
  await app.register(adminPostGestureRoutes, { prefix: '/admin' });
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
  moderationHiddenById: null,
  moderationPriorVisibility: null,
  repostOfId: null,
  originalRepostOfId: null,
  expiresAt: null,
  ...over,
});

const viewRow = (over: Record<string, unknown> = {}) => ({
  id: P1,
  visibility: 'PUBLIC',
  moderationHiddenAt: null,
  moderationPriorVisibility: null,
  deletedAt: null,
  expiresAt: null,
  updatedAt: UPDATED,
  ...over,
});

/** Première lecture : les lignes à modérer ; dernière : les vues rendues. */
const reads = (rows: readonly unknown[], views: readonly unknown[]) => {
  postFindMany.mockImplementation(async (args: any) => ('updatedAt' in (args.select ?? {}) ? views : rows));
};

const one = (app: FastifyInstance, postId: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/admin/posts/${postId}/gestures`, payload });

beforeEach(() => {
  jest.clearAllMocks();
  userFindMany.mockImplementation(async (args: any) => [{ id: AUTHOR, role: 'USER' }].filter((u) => args.where.id.in.includes(u.id)));
  postUpdateMany.mockResolvedValue({ count: 1 });
  auditCreateMany.mockResolvedValue({ count: 1 });
});

describe('POST /admin/posts/:postId/gestures', () => {
  it('met hors ligne en un geste et rend la vue de la publication', async () => {
    reads([row()], [viewRow({ visibility: 'PRIVATE', moderationHiddenAt: UPDATED, moderationPriorVisibility: 'PUBLIC' })]);
    const app = await buildApp('ADMIN');

    const res = await one(app, P1, { gesture: 'take-offline', reason: 'Contenu signalé' });

    expect(res.statusCode).toBe(200);
    const write = postUpdateMany.mock.calls[0]?.[0] as any;
    expect(write.where).toMatchObject({ id: P1, authorId: AUTHOR, visibility: 'PUBLIC' });
    expect(write.data).toMatchObject({ visibility: 'PRIVATE', moderationHiddenById: ACTOR, moderationPriorVisibility: 'PUBLIC' });
    const audit = (auditCreateMany.mock.calls[0]?.[0] as any).data[0];
    expect(audit).toMatchObject({ action: 'MODERATE_POST', entity: 'Post', entityId: P1, userId: AUTHOR, adminId: ACTOR });
    expect(JSON.parse(audit.metadata)).toMatchObject({ gesture: 'take-offline', from: 'published', to: 'offline', reason: 'Contenu signalé' });
    expect(socialEvents.broadcastPostDeleted).toHaveBeenCalledWith(P1, AUTHOR);
    expect(res.json().data).toEqual({
      id: P1,
      state: 'offline',
      visibility: 'PRIVATE',
      moderationHiddenAt: UPDATED.toISOString(),
      moderationPriorVisibility: 'PUBLIC',
      updatedAt: UPDATED.toISOString(),
    });
    await app.close();
  });

  it("publie un brouillon privé en PUBLIC : l'audience choisie est écrite et journalisée", async () => {
    reads([row({ visibility: 'PRIVATE' })], [viewRow()]);
    const app = await buildApp('BIGBOSS');

    const res = await one(app, P1, { gesture: 'set-visibility', visibility: 'PUBLIC' });

    expect(res.statusCode).toBe(200);
    expect((postUpdateMany.mock.calls[0]?.[0] as any).data).toEqual({ visibility: 'PUBLIC', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: null });
    expect(JSON.parse((auditCreateMany.mock.calls[0]?.[0] as any).data[0].metadata)).toMatchObject({ gesture: 'set-visibility', from: 'private', to: 'published', visibility: 'PUBLIC' });
    expect(socialEvents.broadcastPostDeleted).not.toHaveBeenCalled();
    expect(res.json().data.state).toBe('published');
    await app.close();
  });

  it("remet en ligne avec l'audience de l'auteur", async () => {
    reads([row({ visibility: 'PRIVATE', moderationHiddenAt: UPDATED, moderationHiddenById: ACTOR, moderationPriorVisibility: 'FRIENDS' })], [viewRow({ visibility: 'FRIENDS' })]);
    const app = await buildApp('ADMIN');
    const res = await one(app, P1, { gesture: 'restore', reason: 'Erreur de modération' });
    expect(res.statusCode).toBe(200);
    expect((postUpdateMany.mock.calls[0]?.[0] as any).data).toMatchObject({ visibility: 'FRIENDS', moderationHiddenAt: null });
    await app.close();
  });

  it("n'écrit rien quand le geste est déjà fait, et rend la vue", async () => {
    reads([row({ visibility: 'PUBLIC' })], [viewRow()]);
    const app = await buildApp('BIGBOSS');
    const res = await one(app, P1, { gesture: 'set-visibility', visibility: 'PUBLIC' });
    expect(res.statusCode).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
    expect(res.json().data.state).toBe('published');
    await app.close();
  });

  it('exige un motif hors du rang souverain', async () => {
    const app = await buildApp('ADMIN');
    const res = await one(app, P1, { gesture: 'take-offline' });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un geste inconnu, une audience à liste (EXCEPT) et un identifiant invalide', async () => {
    const app = await buildApp('BIGBOSS');
    expect((await one(app, P1, { gesture: 'delete' })).statusCode).toBe(400);
    expect((await one(app, P1, { gesture: 'set-visibility', visibility: 'EXCEPT' })).statusCode).toBe(400);
    expect((await one(app, 'nope', { gesture: 'take-offline' })).statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse sa propre publication (SELF_MODERATION)', async () => {
    reads([row({ id: OWN, authorId: ACTOR })], []);
    const app = await buildApp('ADMIN');
    const res = await one(app, OWN, { gesture: 'take-offline', reason: 'moi-même' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SELF_MODERATION');
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse un modérateur sur la publication d'un administrateur", async () => {
    reads([row()], []);
    userFindMany.mockResolvedValue([{ id: AUTHOR, role: 'ADMIN' }]);
    const app = await buildApp('MODERATOR');
    const res = await one(app, P1, { gesture: 'take-offline', reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("ne lève pas le retrait d'un rang supérieur (MODERATION_OUTRANKED)", async () => {
    const BOSS = '507f1f77bcf86cd799439040';
    reads([row({ visibility: 'PRIVATE', moderationHiddenAt: UPDATED, moderationHiddenById: BOSS, moderationPriorVisibility: 'PUBLIC' })], []);
    userFindMany.mockImplementation(async (args: any) =>
      [
        { id: AUTHOR, role: 'USER' },
        { id: BOSS, role: 'BIGBOSS' },
      ].filter((u) => args.where.id.in.includes(u.id)),
    );
    const app = await buildApp('MODERATOR');
    const res = await one(app, P1, { gesture: 'restore', reason: 'Erreur de modération' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('MODERATION_OUTRANKED');
    await app.close();
  });

  it('rend 404 pour une publication absente ou supprimée', async () => {
    reads([], []);
    const app = await buildApp('BIGBOSS');
    const res = await one(app, GONE, { gesture: 'take-offline' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("rend 409 quand la publication a changé entre la lecture et l'écriture", async () => {
    reads([row()], [viewRow()]);
    postUpdateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp('BIGBOSS');
    const res = await one(app, P1, { gesture: 'take-offline' });
    expect(res.statusCode).toBe(409);
    expect(auditCreateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un rang sans droit de modération (ANALYST)', async () => {
    const app = await buildApp('ANALYST');
    const res = await one(app, P1, { gesture: 'take-offline', reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(403);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /admin/posts/gestures — le lot', () => {
  it('rend un verdict par publication : appliquée, inchangée, refusée avec sa raison', async () => {
    reads(
      [row({ id: P1 }), row({ id: P2, visibility: 'PRIVATE', moderationHiddenAt: UPDATED, moderationHiddenById: ACTOR }), row({ id: OWN, authorId: ACTOR })],
      [viewRow({ id: P1, visibility: 'PRIVATE', moderationHiddenAt: UPDATED }), viewRow({ id: P2, visibility: 'PRIVATE', moderationHiddenAt: UPDATED })],
    );
    const app = await buildApp('ADMIN');

    const res = await app.inject({ method: 'POST', url: '/admin/posts/gestures', payload: { gesture: 'take-offline', postIds: [P1, P2, OWN, GONE], reason: 'Spam massif' } });

    expect(res.statusCode).toBe(200);
    const results = res.json().data.results;
    expect(results.map((r: any) => [r.postId, r.outcome, r.code ?? null])).toEqual([
      [P1, 'applied', null],
      [P2, 'unchanged', null],
      [OWN, 'refused', 'SELF_MODERATION'],
      [GONE, 'refused', 'NOT_FOUND'],
    ]);
    expect(results[0].view).toMatchObject({ id: P1, state: 'offline' });
    expect(postUpdateMany.mock.calls.map((call) => (call[0] as any).where.id)).toEqual([P1]);
    await app.close();
  });

  it('borne le lot à 50', async () => {
    const app = await buildApp('BIGBOSS');
    const ids = Array.from({ length: 51 }, (_, i) => `507f1f77bcf86cd7994${String(i).padStart(5, '0')}`);
    const res = await app.inject({ method: 'POST', url: '/admin/posts/gestures', payload: { gesture: 'take-offline', postIds: ids } });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});
