/**
 * Unit tests for communities members routes (members.ts)
 * Tests GET/POST/PATCH/DELETE /communities/:id/members.
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

const mockResolvePrefsOnly = jest.fn<any>();

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolvePrefsOnly: (...args: any[]) => mockResolvePrefsOnly(...args),
  }),
}));

beforeEach(() => {
  mockResolvePrefsOnly.mockReset().mockResolvedValue(new Map());
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { communityRoutes } from '../../../../routes/communities/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'usr-member-test-001';
const OTHER_USER_ID = 'usr-member-test-002';
const COMMUNITY_ID = 'comm-member-001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    community: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({ id: 'mem-1', userId: OTHER_USER_ID, role: 'member', user: { id: OTHER_USER_ID } }),
      update: jest.fn<any>().mockResolvedValue({ id: 'mem-1', userId: OTHER_USER_ID, role: 'admin', user: {} }),
      delete: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
      findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
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

// Community mock helpers — members query is filtered by { userId: currentUser }
function communityWithUserAsAdmin() {
  return {
    id: COMMUNITY_ID, createdBy: USER_ID,
    members: [{ role: 'admin' }], // filtered result: only current user's membership
  };
}

function communityWithUserAsMember() {
  return {
    id: COMMUNITY_ID, createdBy: 'other-creator',
    members: [{ role: 'member' }],
  };
}

function publicCommunityWithUserAsMember() {
  return {
    id: COMMUNITY_ID, createdBy: 'other-creator', isPrivate: false,
    members: [{ userId: USER_ID }],
  };
}

function privateCommunityNoAccess() {
  return {
    id: COMMUNITY_ID, createdBy: 'other-creator', isPrivate: true,
    members: [],
  };
}

// ─── GET /communities/:id/members ─────────────────────────────────────────────

describe('GET /communities/:id/members — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /communities/:id/members — community not found', () => {
  it('returns 404', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /communities/:id/members — private community, no access', () => {
  it('returns 403', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(privateCommunityNoAccess());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /communities/:id/members — success', () => {
  it('returns 200 with member list', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(publicCommunityWithUserAsMember());
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      { id: 'mem-1', userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'alice' } }
    ]);
    prisma.communityMember.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /communities/:id/members — presence visibility gating ───────────────

describe('GET /communities/:id/members — presence visibility gating', () => {
  it('returns a member unchanged when it has no user object', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(publicCommunityWithUserAsMember());
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      { id: 'mem-nouser', userId: 'ghost-user', role: 'member' }
    ]);
    prisma.communityMember.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].id).toBe('mem-nouser');
    expect(res.json().data[0].user).toBeUndefined();
    await app.close();
  });

  it('returns a member unchanged when no presence entry exists for its user', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(publicCommunityWithUserAsMember());
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      { id: 'mem-novis', userId: 'user-novis', role: 'member', user: { id: 'user-novis', username: 'novis', isOnline: true } }
    ]);
    prisma.communityMember.count = jest.fn<any>().mockResolvedValue(1);
    // Default beforeEach already resolves an empty Map (no entry for 'user-novis').
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].user.isOnline).toBe(true);
    await app.close();
  });

  it('hides isOnline when the member has disabled showOnlineStatus', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(publicCommunityWithUserAsMember());
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      { id: 'mem-hidden', userId: 'user-hidden', role: 'member', user: { id: 'user-hidden', username: 'hidden', isOnline: true } }
    ]);
    prisma.communityMember.count = jest.fn<any>().mockResolvedValue(1);
    mockResolvePrefsOnly.mockResolvedValue(new Map([['user-hidden', { showOnline: false, showLastSeenTimestamp: true }]]));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].user.isOnline).toBe(false);
    await app.close();
  });

  it('keeps isOnline visible when the member allows showOnlineStatus', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(publicCommunityWithUserAsMember());
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      { id: 'mem-visible', userId: 'user-visible', role: 'member', user: { id: 'user-visible', username: 'visible', isOnline: true } }
    ]);
    prisma.communityMember.count = jest.fn<any>().mockResolvedValue(1);
    mockResolvePrefsOnly.mockResolvedValue(new Map([['user-visible', { showOnline: true, showLastSeenTimestamp: true }]]));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].user.isOnline).toBe(true);
    await app.close();
  });
});

// ─── POST /communities/:id/members ────────────────────────────────────────────

describe('POST /communities/:id/members — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /communities/:id/members — community not found', () => {
  it('returns 404', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /communities/:id/members — not admin', () => {
  it('returns 403 when user is a regular member', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsMember());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /communities/:id/members — user not found', () => {
  it('returns 404 when target user does not exist', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsAdmin());
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /communities/:id/members — already a member (returns existing)', () => {
  it('returns 200 with existing member record', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsAdmin());
    prisma.communityMember.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'mem-1', userId: OTHER_USER_ID, role: 'member'
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /communities/:id/members — success (new member)', () => {
  it('returns 200 when admin adds new member', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsAdmin());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMMUNITY_ID}/members`,
      payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── PATCH /communities/:id/members/:memberId/role ────────────────────────────

describe('PATCH /communities/:id/members/:memberId/role — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMMUNITY_ID}/members/mem-1/role`,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /communities/:id/members/:memberId/role — community not found', () => {
  it('returns 404', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMMUNITY_ID}/members/mem-1/role`,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /communities/:id/members/:memberId/role — not admin', () => {
  it('returns 403', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsMember());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMMUNITY_ID}/members/mem-1/role`,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PATCH /communities/:id/members/:memberId/role — success', () => {
  it('returns 200 when admin updates member role', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsAdmin());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/communities/${COMMUNITY_ID}/members/mem-1/role`,
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── DELETE /communities/:id/members/:memberId ────────────────────────────────

describe('DELETE /communities/:id/members/:memberId — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${OTHER_USER_ID}`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /communities/:id/members/:memberId — community not found', () => {
  it('returns 404', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${OTHER_USER_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /communities/:id/members/:memberId — not admin', () => {
  it('returns 403', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsMember());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${OTHER_USER_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DELETE /communities/:id/members/:memberId — success (admin removes member)', () => {
  it('returns 200', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue(communityWithUserAsAdmin());
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMMUNITY_ID}/members/${OTHER_USER_ID}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
