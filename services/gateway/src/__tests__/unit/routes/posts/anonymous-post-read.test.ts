/**
 * #9149 — `GET /posts/:postId` SANS COMPTE.
 *
 * Un lien partagé s'ouvre chez un visiteur qui n'a pas de compte : la route
 * le laisse entrer (`optionalAuth`), mais ne lui sert une publication que si la
 * garde anonyme l'autorise — sinon le MÊME 404 qu'une publication inexistante.
 * Un lecteur connecté ne passe pas par cette garde : l'ACL de `getPostById`
 * reste la sienne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockGetPostById = jest.fn<(postId: string, viewerId?: string) => Promise<Record<string, unknown> | null>>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    getPostById: (postId: string, viewerId?: string) => mockGetPostById(postId, viewerId),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn(), translateOnDemand: jest.fn() } },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn(),
  MentionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }) }),
}));

import { registerCoreRoutes } from '../../../../routes/posts/core';

const POST_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439011';

type AclRow = Record<string, unknown> | null;

const publicRow = (): AclRow => ({
  visibility: 'PUBLIC',
  deletedAt: null,
  expiresAt: null,
  repostOfId: null,
  author: { isActive: true, deletedAt: null, deactivatedAt: null },
  repostOf: null,
});

const servedPost = () => ({
  id: POST_ID,
  type: 'REEL',
  visibility: 'PUBLIC',
  content: 'Bonjour',
  author: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
});

async function buildApp(opts: { readonly authenticated: boolean; readonly aclRow: AclRow }): Promise<{ app: FastifyInstance; findFirst: jest.Mock }> {
  const app = Fastify({ logger: false });
  const findFirst = jest.fn<(arg: unknown) => Promise<AclRow>>().mockResolvedValue(opts.aclRow);
  const prisma = { post: { findFirst } } as unknown as Parameters<typeof registerCoreRoutes>[1];
  const requiredAuth = async (_req: FastifyRequest, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.status(401).send({ success: false, error: 'Authentication required' });
  const optionalAuth = async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = opts.authenticated
      ? { isAuthenticated: true, type: 'jwt', registeredUser: { id: USER_ID, role: 'USER', emailVerifiedAt: new Date() } }
      : { isAuthenticated: false, type: 'anonymous', registeredUser: undefined };
  };
  app.decorate('notificationService', {} as never);
  registerCoreRoutes(app, prisma, requiredAuth, optionalAuth);
  await app.ready();
  return { app, findFirst: findFirst as unknown as jest.Mock };
}

beforeEach(() => {
  mockGetPostById.mockReset();
  mockGetPostById.mockResolvedValue(servedPost());
});

describe('GET /posts/:postId — visiteur sans compte', () => {
  it('sert une publication publique, lue SANS identité de lecteur', async () => {
    const { app } = await buildApp({ authenticated: false, aclRow: publicRow() });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(POST_ID);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, undefined);
    await app.close();
  });

  it('refuse une publication réservée aux amis par le même 404 qu’une inexistante, sans la lire', async () => {
    const { app } = await buildApp({ authenticated: false, aclRow: { ...publicRow(), visibility: 'FRIENDS' } });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, code: 'POST_NOT_FOUND' });
    expect(mockGetPostById).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse une story expirée', async () => {
    const { app } = await buildApp({ authenticated: false, aclRow: { ...publicRow(), expiresAt: new Date('2000-01-01T00:00:00.000Z') } });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse une publication introuvable', async () => {
    const { app } = await buildApp({ authenticated: false, aclRow: null });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /posts/:postId — lecteur connecté', () => {
  it('ne passe pas par la garde anonyme : l’ACL de getPostById reste la sienne', async () => {
    const { app, findFirst } = await buildApp({ authenticated: true, aclRow: null });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(findFirst).not.toHaveBeenCalled();
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
    await app.close();
  });
});

describe('GET /posts/:postId — sans optionalAuth câblé', () => {
  it('reste fermée (requiredAuth par défaut) : un appelant qui ne fournit pas la porte optionnelle ne l’ouvre pas', async () => {
    const app = Fastify({ logger: false });
    const prisma = { post: { findFirst: jest.fn() } } as unknown as Parameters<typeof registerCoreRoutes>[1];
    const requiredAuth = async (_req: FastifyRequest, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
      reply.status(401).send({ success: false, error: 'Authentication required' });
    app.decorate('notificationService', {} as never);
    registerCoreRoutes(app, prisma, requiredAuth);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
