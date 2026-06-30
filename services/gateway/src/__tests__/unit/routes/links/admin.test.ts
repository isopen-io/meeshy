/**
 * Unit tests for links/admin routes
 * Tests GET /links/my-links, PATCH /links/:linkId/toggle,
 * PATCH /links/:linkId/extend, DELETE /links/:linkId.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx) => ctx?.type === 'registered',
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

jest.mock('../../routes/links/types', () => ({
  shareLinkSchema: { type: 'object', additionalProperties: true },
  createLinkSchema: {},
}), { virtual: true });

jest.mock('../../../../routes/links/types', () => ({
  shareLinkSchema: { type: 'object', additionalProperties: true },
  createLinkSchema: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerAdminRoutes } from '../../../../routes/links/admin';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const LINK_ID = 'mshy_67890abcdef_a1b2c3';
const LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: {
    id: USER_ID,
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    avatar: null,
    role: 'USER',
  },
};

const mockLink = {
  id: LINK_DB_ID,
  linkId: LINK_ID,
  identifier: 'test-link',
  conversationId: CONV_ID,
  createdBy: USER_ID,
  isActive: true,
  expiresAt: null,
  maxUses: null,
  currentUses: 5,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 2,
  currentUniqueSessions: 5,
  allowedLanguages: [],
  conversation: {
    id: CONV_ID,
    title: 'Test Conv',
    description: null,
    type: 'group',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [{ userId: USER_ID, role: 'MEMBER', isActive: true }],
  },
  creator: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', avatar: null },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(prismaOverrides: Record<string, any> = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req) => {
    (req as any).authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ ...mockLink }]),
      findFirst: jest.fn().mockResolvedValue({ ...mockLink }),
      update: jest.fn().mockResolvedValue({ ...mockLink }),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...prismaOverrides,
  });
  await registerAdminRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /links/my-links ──────────────────────────────────────────────────────

describe('GET /links/my-links', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    mockAuthMiddleware.mockImplementationOnce(async (req, reply) => {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
    });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with paginated links', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 with empty list when no links exist', async () => {
    (app as any).prisma.conversationShareLink.count.mockResolvedValueOnce(0);
    (app as any).prisma.conversationShareLink.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on service error', async () => {
    (app as any).prisma.conversationShareLink.count.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PATCH /links/:linkId/toggle ─────────────────────────────────────────────

describe('PATCH /links/:linkId/toggle', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/toggle',
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not creator or admin', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockLink,
      createdBy: 'other-user',
      conversation: { ...mockLink.conversation, participants: [] },
    });
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/toggle',
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful toggle', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/toggle',
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on service error', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/toggle',
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PATCH /links/:linkId/extend ─────────────────────────────────────────────

describe('PATCH /links/:linkId/extend', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/extend',
      payload: { expiresAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not creator or admin', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockLink,
      createdBy: 'other-user',
      conversation: { ...mockLink.conversation, participants: [] },
    });
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/extend',
      payload: { expiresAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful extend', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/extend',
      payload: { expiresAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on service error', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'PATCH', url: '/links/' + LINK_ID + '/extend',
      payload: { expiresAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /links/:linkId ────────────────────────────────────────────────────

describe('DELETE /links/:linkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/links/' + LINK_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not creator or admin', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockLink,
      createdBy: 'other-user',
      conversation: { ...mockLink.conversation, participants: [] },
    });
    const res = await app.inject({ method: 'DELETE', url: '/links/' + LINK_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful delete', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/links/' + LINK_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on service error', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'DELETE', url: '/links/' + LINK_ID });
    expect(res.statusCode).toBe(500);
  });
});
