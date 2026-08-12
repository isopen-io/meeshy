/**
 * Unit tests for communities settings routes (settings.ts)
 * Tests PUT /communities/:id and DELETE /communities/:id.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((text: string) => text),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { communityRoutes } from '../../../../routes/communities/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'usr-settings-test-001';
const COMMUNITY_ID = 'comm-settings-001';

const mockUpdatedCommunity = {
  id: COMMUNITY_ID, name: 'Updated', identifier: 'mshy_updated',
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  _count: { members: 1, Conversation: 0 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    community: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue(mockUpdatedCommunity),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await app.register(communityRoutes);
  await app.ready();
  return { app, prisma };
}

// ─── PUT /communities/:id ─────────────────────────────────────────────────────

describe('PUT /communities/:id — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMMUNITY_ID}`,
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PUT /communities/:id — community not found', () => {
  it('returns 404', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMMUNITY_ID}`,
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PUT /communities/:id — not the creator', () => {
  it('returns 403', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: 'other-creator', identifier: 'mshy_test',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMMUNITY_ID}`,
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PUT /communities/:id — identifier conflict', () => {
  it('returns 409 when new identifier already taken', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'mshy_old',
    });
    prisma.community.findUnique = jest.fn<any>().mockResolvedValue({ id: 'other-comm' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMMUNITY_ID}`,
      payload: { name: 'Test', identifier: 'taken' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('PUT /communities/:id — success', () => {
  it('returns 200 with updated community', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'mshy_test',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMMUNITY_ID}`,
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('updates identifier when new one provided (same identifier skips conflict check)', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'mshy_myname',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/communities/${COMMUNITY_ID}`,
      payload: { name: 'MyName', identifier: 'myname' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── DELETE /communities/:id ──────────────────────────────────────────────────

describe('DELETE /communities/:id — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /communities/:id — community not found', () => {
  it('returns 404', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /communities/:id — not the creator', () => {
  it('returns 403', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: 'other-creator',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DELETE /communities/:id — success', () => {
  it('returns 200 on successful deletion', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID,
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('DELETE /communities/:id — DB error', () => {
  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID,
    });
    prisma.community.delete = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
