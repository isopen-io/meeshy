/**
 * Unit tests for getDashboardStats route (preferences.ts)
 * Tests GET /users/me/dashboard-stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getDashboardStats } from '../../../../routes/users/preferences';
import { CONVERSATION_LAST_MESSAGE_PREVIEW_QUERY } from '../../../../routes/users/dashboardRecentPreview';
import { withoutCaptureNotices } from '../../../../services/messaging/captureNoticeVisibility';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockConversation = {
  id: 'conv-1',
  identifier: 'conv-identifier',
  title: 'Test Chat',
  type: 'group',
  avatar: null,
  updatedAt: new Date('2026-01-01'),
  messages: [{ id: 'msg-1', content: 'Hello', createdAt: new Date('2026-01-01'), sender: { userId: USER_ID, displayName: 'Alice', user: { username: 'alice' } } }],
  participants: [{ user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } }],
};

const mockCommunity = {
  id: 'comm-1',
  name: 'Test Community',
  description: 'A community',
  avatar: null,
  isPrivate: false,
  updatedAt: new Date('2026-01-01'),
  _count: { members: 5, Conversation: 2 },
  members: [{ user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } }],
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(
  auth: 'authenticated' | 'unauthenticated' = 'authenticated',
  prismaOverrides: Record<string, any> = {}
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const prisma = {
    conversation: {
      findMany: jest.fn().mockResolvedValue([mockConversation]),
    },
    communityMember: {
      count: jest.fn().mockResolvedValue(2),
    },
    community: {
      findMany: jest.fn().mockResolvedValue([mockCommunity]),
    },
    message: {
      count: jest.fn().mockResolvedValue(42),
      // #16590 — la reprise CIBLÉE du dernier message visible, quand l'aperçu
      // de la requête est masqué pour ce lecteur. Aucun repli par défaut.
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // #16590 — les surfaces que la résolution d'aperçu par lecteur LIT.
    // Le double les RÉGLE au cas nominal (rien de masqué, aucun plancher) :
    // un double partiel ne se signale qu'au moment où le module GRANDIT, et
    // c'est exactement ce qui vient d'arriver ici.
    participant: {
      count: jest.fn().mockResolvedValue(3),
      // La participation du LECTEUR dans la conversation de la page : sans
      // elle, l'aperçu est retiré — l'absence ne vaut pas autorisation.
      findMany: jest.fn().mockResolvedValue([
        { id: 'p-reader', conversationId: 'conv-1', role: 'member', joinedAt: new Date('2025-01-01'), shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' } },
      ]),
    },
    userConversationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userMessageDeletion: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversationShareLink: {
      count: jest.fn().mockResolvedValue(5),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ...prismaOverrides,
  };

  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await getDashboardStats(app);
  await app.ready();
  return app;
}

// ─── GET /users/me/dashboard-stats ───────────────────────────────────────────

describe('GET /users/me/dashboard-stats (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('unauthenticated'); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /users/me/dashboard-stats (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with dashboard stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.stats).toBeDefined();
    expect(typeof body.data.stats.totalConversations).toBe('number');
    expect(Array.isArray(body.data.recentConversations)).toBe(true);
    expect(Array.isArray(body.data.recentCommunities)).toBe(true);
  });

  it('returns correct stats values', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    const body = res.json();
    expect(body.data.stats.totalConversations).toBe(3);
    expect(body.data.stats.totalCommunities).toBe(2);
    expect(body.data.stats.totalLinks).toBe(5);
    expect(body.data.recentConversations).toHaveLength(1);
    expect(body.data.recentCommunities).toHaveLength(1);
  });
});

describe('GET /users/me/dashboard-stats (direct conversation without title)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const directConv = {
      ...mockConversation,
      title: '',
      type: 'direct',
      participants: [
        { user: { id: 'other-user', username: 'bob', displayName: 'Bob', avatar: null } },
        { user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } },
      ],
    };
    app = await buildApp('authenticated', {
      conversation: { findMany: jest.fn().mockResolvedValue([directConv]) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and resolves title from other participant', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('Bob');
  });
});

describe('GET /users/me/dashboard-stats (direct conversation avatar resolution)', () => {
  it('falls back to the other participant avatar when the conversation avatar is blank', async () => {
    const directConv = {
      ...mockConversation,
      type: 'direct',
      avatar: '   ',
      participants: [
        { user: { id: 'other-user', username: 'bob', displayName: 'Bob', avatar: 'https://cdn.meeshy.test/bob.png' } },
        { user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } },
      ],
    };
    const app = await buildApp('authenticated', {
      conversation: { findMany: jest.fn().mockResolvedValue([directConv]) },
    });
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recentConversations[0].avatar).toBe('https://cdn.meeshy.test/bob.png');
    await app.close();
  });

  it('never leaks a blank string as the resolved avatar', async () => {
    const groupConv = { ...mockConversation, type: 'group', avatar: '' };
    const app = await buildApp('authenticated', {
      conversation: { findMany: jest.fn().mockResolvedValue([groupConv]) },
    });
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.json().data.recentConversations[0].avatar).toBeNull();
    await app.close();
  });
});

describe('GET /users/me/dashboard-stats (conversation without messages)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const convNoMessages = { ...mockConversation, messages: [] };
    app = await buildApp('authenticated', {
      conversation: { findMany: jest.fn().mockResolvedValue([convNoMessages]) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with null lastMessage when no messages', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].lastMessage).toBeNull();
  });
});

describe('GET /users/me/dashboard-stats (last-message preview excludes soft-deleted)', () => {
  /**
   * #16590 — la sélection d'aperçu est désormais PRISE au bloc partagé de la
   * ligne de liste : le `where` y porte `deletedAt: null` ET l'exclusion des
   * avis de capture (#9630), et la projection y porte le bloc de protection.
   * Les trois se lisent depuis leur SOURCE, jamais retapées — une copie dans
   * le témoin dériverait comme la copie dans la route a dérivé.
   */
  it('lit l’aperçu par le bloc PARTAGÉ de la ligne de liste — where, ordre et projection', async () => {
    const findMany = jest.fn().mockResolvedValue([mockConversation]);
    const app = await buildApp('authenticated', {
      conversation: { findMany },
    });
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);

    const queryArg = (findMany.mock.calls[0] as any[])[0];
    expect(queryArg.select.messages).toBe(CONVERSATION_LAST_MESSAGE_PREVIEW_QUERY);
    expect(queryArg.select.messages.where).toEqual(withoutCaptureNotices({ deletedAt: null }));
    // Et le bloc de protection est bien dans ce que la route LIT : sans lui,
    // aucun client ne peut masquer une vue unique, un flouté ou un éphémère.
    for (const cle of ['isViewOnce', 'isBlurred', 'effectFlags', 'expiresAt', 'ephemeralDuration', 'translations', 'originalLanguage']) {
      expect((queryArg.select.messages.select as Record<string, unknown>)[cle]).toBe(true);
    }
    await app.close();
  });
});

describe('GET /users/me/dashboard-stats (DB error)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('authenticated', {
      participant: { count: jest.fn().mockRejectedValue(new Error('DB error')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on database error', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(500);
  });
});
