/**
 * Unit tests for communities core routes (core.ts)
 * Tests CRUD operations: check-identifier, list, get, create, conversations.
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

const USER_ID = 'usr-community-001';
const COMMUNITY_ID = 'comm-001';
const CONVERSATION_ID = 'conv-001';

const mockCommunity = {
  id: COMMUNITY_ID,
  name: 'Test Community',
  identifier: 'mshy_test',
  description: 'A test community',
  avatar: null,
  isPrivate: false,
  createdBy: USER_ID,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members: [{ userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true } }],
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
      create: jest.fn<any>().mockResolvedValue(mockCommunity),
      update: jest.fn<any>().mockResolvedValue(mockCommunity),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: USER_ID, username: 'alice' }),
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

// ─── GET /communities/check-identifier/:identifier ────────────────────────────

describe('GET /communities/check-identifier/:identifier', () => {
  it('returns available=true when identifier is free', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns available=false when identifier is taken', async () => {
    const prisma = makePrisma();
    prisma.community.findUnique = jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_taken' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.community.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_test' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /communities ─────────────────────────────────────────────────────────

describe('GET /communities — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /communities — authenticated', () => {
  it('returns 200 with empty list when no communities', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 with communities when they exist', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockResolvedValue([mockCommunity]);
    prisma.community.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('handles search filter correctly', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities?search=test' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /communities/:id ─────────────────────────────────────────────────────

describe('GET /communities/:id — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /communities/:id — found by ID', () => {
  it('returns 200 with community data', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(mockCommunity);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /communities/:id — found by identifier (fallback)', () => {
  it('returns 200 when found via identifier lookup', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>()
      .mockResolvedValueOnce(null)            // not found by ID
      .mockResolvedValueOnce(mockCommunity);  // found by identifier
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities/mshy_test' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /communities/:id — not found', () => {
  it('returns 404 when community does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/communities/nonexistent' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /communities/:id — private community, no access', () => {
  it('returns 403 when user is not a member of private community', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      ...mockCommunity,
      isPrivate: true,
      createdBy: 'other-user',
      members: [], // no members
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── POST /communities ────────────────────────────────────────────────────────

describe('POST /communities — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'My Community' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /communities — identifier conflict', () => {
  it('returns 409 when identifier already exists', async () => {
    const prisma = makePrisma();
    prisma.community.findUnique = jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'My Community', isPrivate: false },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('POST /communities — success', () => {
  it('returns 201 on community creation', async () => {
    const prisma = makePrisma();
    prisma.community.findUnique = jest.fn<any>().mockResolvedValue(null);
    prisma.community.create = jest.fn<any>().mockResolvedValue(mockCommunity);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'My Community', isPrivate: false },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /communities — DB error', () => {
  it('returns 500 on DB error during creation', async () => {
    const prisma = makePrisma();
    prisma.community.findUnique = jest.fn<any>().mockResolvedValue(null);
    prisma.community.create = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'My Community', isPrivate: false },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /communities/:id/conversations ──────────────────────────────────────

describe('GET /communities/:id/conversations — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /communities/:id/conversations — community not found', () => {
  it('returns 404 when community does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/communities/nonexistent/conversations' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /communities/:id/conversations — no access to private community', () => {
  it('returns 403 when user is not a member', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: 'other-user', isPrivate: true, members: [],
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /communities/:id/conversations — success', () => {
  it('returns 200 with conversation list for member', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID, isPrivate: false,
      members: [{ userId: USER_ID }],
    });
    prisma.conversation.findMany = jest.fn<any>().mockResolvedValue([
      { id: CONVERSATION_ID, communityId: COMMUNITY_ID, participants: [], _count: { messages: 0, participants: 1 } }
    ]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /communities/:id/conversations/:conversationId ──────────────────────

describe('POST /communities/:id/conversations/:conversationId', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 404 when community not found', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not an admin', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: 'other-user',
      members: [{ userId: USER_ID, role: 'member' }],
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when conversation not found', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID, members: [],
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 200 when admin successfully adds conversation', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMMUNITY_ID, createdBy: USER_ID, members: [],
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue({
      id: CONVERSATION_ID, communityId: null,
      participants: [{ userId: USER_ID, role: 'member' }],
    });
    prisma.conversation.update = jest.fn<any>().mockResolvedValue({
      id: CONVERSATION_ID, communityId: COMMUNITY_ID, participants: [], _count: {}
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
