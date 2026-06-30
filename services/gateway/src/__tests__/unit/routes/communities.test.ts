/**
 * Unit tests for community routes (communities.ts)
 * Covers key paths for all 16 endpoints: CRUD, members, join/leave, conversations.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: any, limit: any) => ({
    offset: Number(offset) || 0,
    limit: Number(limit) || 20,
  })),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communitySchema: { type: 'object', additionalProperties: true },
  communityMinimalSchema: { type: 'object', additionalProperties: true },
  communityMemberSchema: { type: 'object', additionalProperties: true },
  createCommunityRequestSchema: { type: 'object', additionalProperties: true },
  updateCommunityRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { communityRoutes } from '../../../routes/communities';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const OTHER_USER_ID = 'user-other456';
const COMM_ID = '507f1f77bcf86cd799439011';
const MEMBER_ID = '507f1f77bcf86cd799439022';

const mockAuthContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null, role: 'USER',
  },
};

// Community returned by findFirst with members embedded (filtered to current user)
const mockCommunityWithAdminMember = {
  id: COMM_ID,
  name: 'Test Community',
  identifier: 'mshy_test',
  description: null,
  avatar: null,
  isPrivate: false,
  createdBy: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null },
  // members filtered by userId, only role returned
  members: [{ role: 'admin', userId: USER_ID }],
  _count: { members: 1, Conversation: 0 },
};

const mockMember = {
  id: MEMBER_ID,
  communityId: COMM_ID,
  userId: OTHER_USER_ID,
  role: 'member',
  createdAt: new Date(),
  user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    req.authContext = mockAuthContext;
  });

  app.decorate('prisma', {
    community: {
      findFirst: jest.fn().mockResolvedValue(mockCommunityWithAdminMember),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([mockCommunityWithAdminMember]),
      create: jest.fn().mockResolvedValue(mockCommunityWithAdminMember),
      update: jest.fn().mockResolvedValue(mockCommunityWithAdminMember),
      delete: jest.fn().mockResolvedValue(mockCommunityWithAdminMember),
      count: jest.fn().mockResolvedValue(1),
    },
    communityMember: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([mockMember]),
      create: jest.fn().mockResolvedValue(mockMember),
      update: jest.fn().mockResolvedValue(mockMember),
      delete: jest.fn().mockResolvedValue(mockMember),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: OTHER_USER_ID, username: 'bob' }),
      findUnique: jest.fn().mockResolvedValue({ id: OTHER_USER_ID, username: 'bob' }),
    },
  });

  await communityRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /communities/check-identifier/:identifier ────────────────────────────

describe('GET /communities/check-identifier/:identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with available=false when identifier taken', async () => {
    (app as any).prisma.community.findUnique.mockResolvedValueOnce(mockCommunityWithAdminMember);
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(false);
  });

  it('returns 200 with available=true when identifier free', async () => {
    (app as any).prisma.community.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_new' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(true);
  });
});

// ─── GET /communities ─────────────────────────────────────────────────────────

describe('GET /communities', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with community list', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.community.findMany.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /communities/search ──────────────────────────────────────────────────

describe('GET /communities/search', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with search results', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /communities/mine ────────────────────────────────────────────────────

describe('GET /communities/mine', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with user communities', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /communities/:id ─────────────────────────────────────────────────────

describe('GET /communities/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID });
    expect(res.statusCode).toBe(404);
    (app as any).prisma.community.findFirst.mockResolvedValue(mockCommunityWithAdminMember);
  });

  it('returns 403 when private community and user not a member', async () => {
    (app as any).prisma.community.findFirst
      .mockResolvedValueOnce({
        ...mockCommunityWithAdminMember,
        isPrivate: true,
        createdBy: OTHER_USER_ID,
        members: [],
      })
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for public community', async () => {
    (app as any).prisma.community.findFirst
      .mockResolvedValueOnce({ ...mockCommunityWithAdminMember, isPrivate: false, createdBy: OTHER_USER_ID, members: [] })
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /communities ────────────────────────────────────────────────────────

describe('POST /communities', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 409 when identifier already exists', async () => {
    (app as any).prisma.community.findUnique.mockResolvedValueOnce(mockCommunityWithAdminMember);
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'Test Community' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 201 on successful creation', async () => {
    (app as any).prisma.community.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.community.findUnique.mockResolvedValueOnce(null);
    (app as any).prisma.community.create.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: 'Community' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /communities/:id/members ─────────────────────────────────────────────

describe('GET /communities/:id/members', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID + '/members' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member of private community', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce({
      ...mockCommunityWithAdminMember,
      isPrivate: true,
      createdBy: OTHER_USER_ID,
      members: [],
    });
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID + '/members' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with members list', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID + '/members' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /communities/:id/members ────────────────────────────────────────────

describe('POST /communities/:id/members', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/communities/' + COMM_ID + '/members',
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not admin', async () => {
    // community.members[0].role is 'member', not 'admin'
    (app as any).prisma.community.findFirst.mockResolvedValueOnce({
      ...mockCommunityWithAdminMember,
      members: [{ role: 'member' }],
    });
    const res = await app.inject({
      method: 'POST', url: '/communities/' + COMM_ID + '/members',
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful member add', async () => {
    // Default community mock has admin member
    // communityMember.findFirst returns null (user not yet a member)
    (app as any).prisma.communityMember.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/communities/' + COMM_ID + '/members',
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── PATCH /communities/:id/members/:memberId/role ────────────────────────────

describe('PATCH /communities/:id/members/:memberId/role', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PATCH', url: '/communities/' + COMM_ID + '/members/' + MEMBER_ID + '/role',
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful role update', async () => {
    // Default: community.members[0].role = 'admin', so user is admin
    const res = await app.inject({
      method: 'PATCH', url: '/communities/' + COMM_ID + '/members/' + MEMBER_ID + '/role',
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── DELETE /communities/:id/members/:memberId ────────────────────────────────

describe('DELETE /communities/:id/members/:memberId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/communities/' + COMM_ID + '/members/' + MEMBER_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful member removal', async () => {
    // Default: community.members[0].role = 'admin'
    const res = await app.inject({ method: 'DELETE', url: '/communities/' + COMM_ID + '/members/' + MEMBER_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── PUT /communities/:id ─────────────────────────────────────────────────────

describe('PUT /communities/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PUT', url: '/communities/' + COMM_ID,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce({
      ...mockCommunityWithAdminMember,
      createdBy: OTHER_USER_ID,
    });
    const res = await app.inject({
      method: 'PUT', url: '/communities/' + COMM_ID,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful update', async () => {
    // Default: createdBy = USER_ID, so auth passes
    (app as any).prisma.community.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PUT', url: '/communities/' + COMM_ID,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── DELETE /communities/:id ──────────────────────────────────────────────────

describe('DELETE /communities/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/communities/' + COMM_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce({
      ...mockCommunityWithAdminMember,
      createdBy: OTHER_USER_ID,
    });
    const res = await app.inject({ method: 'DELETE', url: '/communities/' + COMM_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful deletion', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/communities/' + COMM_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /communities/:id/conversations ───────────────────────────────────────

describe('GET /communities/:id/conversations', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID + '/conversations' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with conversations list', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/' + COMM_ID + '/conversations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /communities/:id/join ───────────────────────────────────────────────

describe('POST /communities/:id/join', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/communities/' + COMM_ID + '/join' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 or 409 on join', async () => {
    const res = await app.inject({ method: 'POST', url: '/communities/' + COMM_ID + '/join' });
    expect([200, 409]).toContain(res.statusCode);
  });
});

// ─── POST /communities/:id/leave ──────────────────────────────────────────────

describe('POST /communities/:id/leave', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/communities/' + COMM_ID + '/leave' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful leave', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce({ id: COMM_ID, createdBy: OTHER_USER_ID });
    const res = await app.inject({ method: 'POST', url: '/communities/' + COMM_ID + '/leave' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 403 when community creator tries to leave', async () => {
    // Default mock has createdBy: USER_ID
    const res = await app.inject({ method: 'POST', url: '/communities/' + COMM_ID + '/leave' });
    expect(res.statusCode).toBe(403);
  });
});

// ─── POST /communities/:id/invite ─────────────────────────────────────────────

describe('POST /communities/:id/invite', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    (app as any).prisma.community.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/communities/' + COMM_ID + '/invite',
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful invite', async () => {
    // community.members[0] = { role: 'admin' } (from default mock)
    // user.findFirst returns the user
    // communityMember.findFirst returns null (not yet a member)
    (app as any).prisma.communityMember.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/communities/' + COMM_ID + '/invite',
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
