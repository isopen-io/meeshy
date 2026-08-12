/**
 * Extended tests for preferences.ts — covers the displayTitle fallback branches
 * in getDashboardStats (lines 278-281):
 *   - Direct conversation with no matching participant user → 'Direct Conversation'
 *   - Non-direct conversation with no title and no identifier → 'Conversation <id-slice>'
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getDashboardStats, searchUsers } from '../../../../routes/users/preferences';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799abc001';

const baseConversation = {
  id: CONV_ID,
  identifier: null,
  title: '',
  type: 'group',
  avatar: null,
  updatedAt: new Date('2026-01-01'),
  messages: [],
  participants: [],
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(conversations: any[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    participant: { count: jest.fn<any>().mockResolvedValue(0) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue(conversations) },
    communityMember: { count: jest.fn<any>().mockResolvedValue(0) },
    community: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { count: jest.fn<any>().mockResolvedValue(0) },
    conversationShareLink: { count: jest.fn<any>().mockResolvedValue(0) },
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });

  await getDashboardStats(app);
  await app.ready();
  return app;
}

// ─── Line 278: direct conversation without a matching participant user ─────────

describe('GET /users/me/dashboard-stats — direct conv with no matching participant', () => {
  it('falls back to "Direct Conversation" when no other participant has a user', async () => {
    const conv = {
      ...baseConversation,
      type: 'direct',
      title: '',
      participants: [
        // Current user's own participant — no "other" user found
        { user: { id: USER_ID, username: 'me', displayName: 'Me', avatar: null } },
      ],
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('Direct Conversation');
    await app.close();
  });

  it('falls back to identifier/id-slice when direct conv has no participants (line 281)', async () => {
    // With empty participants, the direct-conv branch is skipped → falls to line 281
    const conv = {
      ...baseConversation,
      type: 'direct',
      title: '',
      participants: [],
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // conv.identifier = null → `Conversation ${CONV_ID.slice(-4)}`
    expect(body.data.recentConversations[0].title).toBe(`Conversation ${CONV_ID.slice(-4)}`);
    await app.close();
  });

  it('falls back to "Direct Conversation" when only participant is the current user (line 278)', async () => {
    // Participant exists but user.id === userId → otherMember is undefined → line 278
    const conv = {
      ...baseConversation,
      type: 'direct',
      title: '',
      participants: [
        { user: null },  // participant with no user at all → otherMember.user is falsy
      ],
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('Direct Conversation');
    await app.close();
  });
});

// ─── Line 281: non-direct conversation with no title and no identifier ─────────

describe('GET /users/me/dashboard-stats — non-direct conv with no title or identifier', () => {
  it('falls back to "Conversation <last-4-chars>" when identifier is null', async () => {
    const conv = {
      ...baseConversation,
      type: 'group',
      title: '',
      identifier: null,
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const expectedTitle = `Conversation ${CONV_ID.slice(-4)}`;
    expect(body.data.recentConversations[0].title).toBe(expectedTitle);
    await app.close();
  });

  it('uses identifier when present in non-direct conv with no title', async () => {
    const conv = {
      ...baseConversation,
      type: 'group',
      title: '',
      identifier: 'my-group-link',
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('my-group-link');
    await app.close();
  });
});

// ─── Lines 274-275: displayTitle username/Conversation fallbacks ───────────────

describe('GET /users/me/dashboard-stats — direct conv displayTitle fallbacks (lines 274-275)', () => {
  it('uses username when otherMember.user has no displayName (line 274)', async () => {
    const OTHER_ID = '507f1f77bcf86cd799abc999';
    const conv = {
      ...baseConversation,
      type: 'direct',
      title: '',
      participants: [
        { user: { id: OTHER_ID, username: 'someuser', displayName: null, avatar: null } },
        { user: { id: USER_ID, username: 'me', displayName: 'Me', avatar: null } },
      ],
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('someuser');
    await app.close();
  });

  it('falls back to "Conversation" when otherMember.user has no displayName or username (line 275)', async () => {
    const OTHER_ID = '507f1f77bcf86cd799abc888';
    const conv = {
      ...baseConversation,
      type: 'direct',
      title: '',
      participants: [
        { user: { id: OTHER_ID, username: null, displayName: null, avatar: null } },
      ],
    };
    const app = await buildApp([conv]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('Conversation');
    await app.close();
  });
});

// ─── Lines 312-325: community _count fallbacks ────────────────────────────────

async function buildAppWithCommunities(
  conversations: any[],
  communities: any[]
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    participant: { count: jest.fn<any>().mockResolvedValue(0) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue(conversations) },
    communityMember: { count: jest.fn<any>().mockResolvedValue(0) },
    community: { findMany: jest.fn<any>().mockResolvedValue(communities) },
    message: { count: jest.fn<any>().mockResolvedValue(0) },
    conversationShareLink: { count: jest.fn<any>().mockResolvedValue(0) },
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await getDashboardStats(app);
  await app.ready();
  return app;
}

describe('GET /users/me/dashboard-stats — community _count fallbacks (lines 312-325)', () => {
  it('uses members.length when _count is undefined (line 312)', async () => {
    const community = {
      id: 'comm-1',
      name: 'No Count Community',
      description: 'Test',
      avatar: null,
      isPrivate: false,
      updatedAt: new Date('2026-01-01'),
      _count: undefined,
      members: [{ user: null }, { user: null }],
    };
    const app = await buildAppWithCommunities([], [community]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // memberCount falls back to members.length (2) when _count is undefined
    expect(body.data.recentCommunities[0].memberCount).toBe(2);
    await app.close();
  });

  it('uses members.length when _count.members is 0 (falsy) and Conversation is absent (line 312-313)', async () => {
    const community = {
      id: 'comm-2',
      name: 'Zero Count Community',
      description: 'Test',
      avatar: null,
      isPrivate: false,
      updatedAt: new Date('2026-01-01'),
      _count: { members: 0 },
      members: [{ user: null }, { user: null }, { user: null }],
    };
    const app = await buildAppWithCommunities([], [community]);
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // memberCount falls back to members.length (3) when _count.members is 0
    expect(body.data.recentCommunities[0].memberCount).toBe(3);
    await app.close();
  });
});

// ─── Lines 322-325: getDashboardStats catch block ─────────────────────────────

describe('GET /users/me/dashboard-stats — catch block (lines 322-325)', () => {
  it('returns 500 when prisma.conversation.findMany throws', async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', {
      participant: { count: jest.fn<any>().mockResolvedValue(0) },
      conversation: { findMany: jest.fn<any>().mockRejectedValue('DB failure string') },
      communityMember: { count: jest.fn<any>().mockResolvedValue(0) },
      community: { findMany: jest.fn<any>().mockResolvedValue([]) },
      message: { count: jest.fn<any>().mockResolvedValue(0) },
      conversationShareLink: { count: jest.fn<any>().mockResolvedValue(0) },
    });
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
    });
    await getDashboardStats(app);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── searchUsers: lines 541+ ───────────────────────────────────────────────────

async function buildSearchApp(opts: {
  userFindMany?: any;
  userCount?: any;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    user: {
      findMany: opts.userFindMany ?? jest.fn<any>().mockResolvedValue([]),
      count:    opts.userCount   ?? jest.fn<any>().mockResolvedValue(0),
    },
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await searchUsers(app);
  await app.ready();
  return app;
}

describe('GET /users/search — searchUsers (line 541+)', () => {
  it('returns 200 with empty results when q is not provided', async () => {
    const app = await buildSearchApp();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=al' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 with paginated users when q matches', async () => {
    const mockUser = {
      id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
      displayName: 'Alice S', email: 'alice@test.com', isOnline: true,
      lastActiveAt: null, systemLanguage: 'en',
    };
    const app = await buildSearchApp({
      userFindMany: jest.fn<any>().mockResolvedValue([mockUser]),
      userCount:    jest.fn<any>().mockResolvedValue(1),
    });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=alice' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 when prisma.user.findMany throws', async () => {
    const app = await buildSearchApp({
      userFindMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
    });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
