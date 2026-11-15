/**
 * `DELETE /admin/posts/:postId` — le retrait définitif depuis la console prévient
 * l'auteur par `content_removed` (#11158), motif compris s'il y en a un.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const notifier = { createNotification: jest.fn<any>().mockResolvedValue({ id: 'n1' }) };
jest.mock('../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => notifier,
  setSharedNotificationService: jest.fn(),
}));
jest.mock('../../../services/posts/postRemovalEffects', () => ({
  applyPostRemovalEffects: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../socketio/announceCitedPostWithdrawal', () => ({
  announceCitedPostWithdrawal: jest.fn<any>().mockResolvedValue(undefined),
}));

import { adminPostRoutes } from '../posts';

const ACTOR = '507f1f77bcf86cd799439032';
const AUTHOR = '507f1f77bcf86cd799439031';
const POST = '507f1f77bcf86cd799439011';

const postFindUnique = jest.fn<any>();
const postUpdate = jest.fn<any>();
const prisma = {
  post: { findUnique: postFindUnique, update: postUpdate },
  user: { findUnique: jest.fn<any>().mockResolvedValue({ systemLanguage: 'fr' }) },
} as any;

async function buildApp(role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, userId: ACTOR, registeredUser: { id: ACTOR, role, username: 'admin' } };
  });
  await app.register(adminPostRoutes);
  await app.ready();
  return app;
}

const remove = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'DELETE', url: `/posts/${POST}`, headers: { 'content-type': 'application/json' }, payload });

const flush = () => new Promise((resolve) => setImmediate(resolve));
const notified = () => notifier.createNotification.mock.calls.map(([call]) => call as { userId: string; type: string; content: string; metadata: Record<string, unknown> });

const postRow = (over: Record<string, unknown> = {}) => ({
  id: POST, deletedAt: null, expiresAt: null, authorId: AUTHOR, type: 'STORY', visibility: 'PUBLIC', visibilityUserIds: [], ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  postUpdate.mockResolvedValue({});
});

describe('DELETE /admin/posts/:postId — l’auteur est prévenu', () => {
  it('content_removed à l’auteur seul, typé par la publication, avec le motif', async () => {
    postFindUnique.mockResolvedValue(postRow());
    const app = await buildApp('ADMIN');
    expect((await remove(app, { reason: 'Contenu signalé' })).statusCode).toBe(200);
    await flush();
    expect(notified()).toEqual([
      expect.objectContaining({ userId: AUTHOR, type: 'content_removed', content: 'Motif : Contenu signalé', metadata: { contentType: 'story', contentId: POST, postId: POST, reason: 'Contenu signalé' } }),
    ]);
    await app.close();
  });

  it('le rang souverain sans motif : la notification part, sans ligne motif', async () => {
    postFindUnique.mockResolvedValue(postRow({ type: 'POST' }));
    const app = await buildApp('BIGBOSS');
    expect((await remove(app, {})).statusCode).toBe(200);
    await flush();
    const [call] = notified();
    expect(call).toMatchObject({ userId: AUTHOR, content: '' });
    expect(call?.metadata).toEqual({ contentType: 'post', contentId: POST, postId: POST });
    await app.close();
  });

  it('personne n’est prévenu quand l’administrateur retire sa propre publication, ni sur un refus', async () => {
    postFindUnique.mockResolvedValue(postRow({ authorId: ACTOR }));
    const app = await buildApp('ADMIN');
    expect((await remove(app, { reason: 'Doublon' })).statusCode).toBe(200);
    postFindUnique.mockResolvedValue(postRow({ deletedAt: new Date() }));
    expect((await remove(app, { reason: 'Doublon' })).statusCode).toBe(400);
    await flush();
    expect(notified()).toEqual([]);
    await app.close();
  });
});
