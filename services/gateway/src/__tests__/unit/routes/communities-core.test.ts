/**
 * Unit tests for communities/core.ts
 * Tests:
 *   GET  /communities/check-identifier/:identifier — identifier availability
 *   GET  /communities                               — list user communities
 *   GET  /communities/:id                           — get community by id/identifier
 *   POST /communities                               — create community
 *   GET  /communities/:id/conversations             — list community conversations
 *   POST /communities/:id/conversations/:conversationId — add conversation to community
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

// `@meeshy/shared/types/api-schemas` n'est PAS mocké, délibérément. Un double
// de schéma désarme fast-json-stringify — la couche EXACTE où vivent les
// défauts de charge utile que ces routes ont portés (cf. CLAUDE.md § « un
// témoin s'importe par le chemin de la PRODUCTION »). Le stub omettait de
// surcroît `userMinimalSchema`, que `core.ts` emploie pour le `user` d'un
// participant : `{ ...undefined }` le réduisait à une déclaration vide, et
// toute assertion sur ce `user` passait pour la mauvaise raison.

jest.mock('../../../routes/communities/types', () => ({
  CreateCommunitySchema: {
    parse: (data: any) => ({ isPrivate: true, ...data }),
    safeParse: (data: any) => ({ success: true, data: { isPrivate: true, ...data } }),
  },
  UpdateCommunitySchema: { parse: (data: any) => data },
  CommunityRole: { ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' },
  generateIdentifier: jest.fn<any>().mockReturnValue('mshy_test-community'),
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 }),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/communities/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const COMMUNITY_ID = 'comm-aabbcc001122';
const CONVERSATION_ID = 'conv-112233445566';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCommunity = {
  id: COMMUNITY_ID,
  name: 'Test Community',
  identifier: 'mshy_test-community',
  description: 'A test community',
  avatar: null,
  isPrivate: true,
  createdBy: USER_ID,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members: [{ userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true } }],
  _count: { members: 1, Conversation: 0 },
};

const mockConversation = {
  id: CONVERSATION_ID,
  communityId: COMMUNITY_ID,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  // `admin` et non `member` : rattacher une conversation à une communauté exige
  // depuis #4191 un droit sur la CONVERSATION elle-même — ce que le Swagger de
  // la route promettait déjà (« admin/creator of BOTH »).
  participants: [{ userId: USER_ID, role: 'admin', isActive: true, user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true } }],
  _count: { messages: 0, participants: 1 },
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    community: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(mockCommunity),
      findMany: jest.fn<any>().mockResolvedValue([mockCommunity]),
      count: jest.fn<any>().mockResolvedValue(1),
      create: jest.fn<any>().mockResolvedValue(mockCommunity),
      update: jest.fn<any>().mockResolvedValue(mockCommunity),
      ...overrides.community,
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([mockConversation]),
      // #4165 : `GET /communities/:id/conversations` borne désormais la liste
      // et compte le VRAI total séparément (`.count()`), en plus du `.findMany`
      // déjà mocké — sans ce double, l'appel réel lève et la route répond 500.
      count: jest.fn<any>().mockResolvedValue(1),
      findFirst: jest.fn<any>().mockResolvedValue(mockConversation),
      update: jest.fn<any>().mockResolvedValue({ ...mockConversation, communityId: COMMUNITY_ID }),
      ...overrides.conversation,
    },
    ...overrides,
  };
}

// ─── App builders ─────────────────────────────────────────────────────────────

async function buildApp(role = 'USER', prismaOverrides: any = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);
  await app.register(registerCoreRoutes);
  await app.ready();
  return app;
}

async function buildUnauthenticatedApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (_req: any, reply: any) => {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  });
  app.decorate('prisma', makePrisma() as any);
  await app.register(registerCoreRoutes);
  await app.ready();
  return app;
}

async function buildNoRegisteredUserApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = { isAuthenticated: false };
  });
  app.decorate('prisma', makePrisma() as any);
  await app.register(registerCoreRoutes);
  await app.ready();
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /communities/check-identifier/:identifier
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /communities/check-identifier/:identifier — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_test' });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/check-identifier/:identifier — available', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with available=true when identifier is free', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_free' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities/check-identifier/:identifier — taken', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findUnique: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID }) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with available=false when identifier is taken', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_taken' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities/check-identifier/:identifier — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findUnique: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/check-identifier/mshy_test' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /communities
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /communities — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /communities — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with community list', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities — empty result', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /communities/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /communities/:id — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /communities/:id — not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id — private, user not member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          ...mockCommunity,
          createdBy: OTHER_USER_ID,
          isPrivate: true,
          members: [],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for private community the user is not part of', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id — success (creator)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 for the community creator', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// #19868 — le détail dit au lecteur NON membre qu'il a déjà une demande en attente
describe('GET /communities/:id — demande d\'entrée du lecteur (#19868)', () => {
  const validating = { ...mockCommunity, createdBy: OTHER_USER_ID, isPrivate: false, requiresJoinApproval: true, members: [] };

  async function detailWith(community: unknown, pending: unknown) {
    const findJoinRequest = jest.fn<any>().mockResolvedValue(pending);
    const app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(community) },
      communityJoinRequest: { findFirst: findJoinRequest },
    });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    await app.close();
    return { res, findJoinRequest };
  }

  it('sert « pending » au non-membre qui a une demande en attente, lue sur SA demande seulement', async () => {
    const { res, findJoinRequest } = await detailWith(validating, { id: 'req-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentUserJoinRequest).toBe('pending');
    expect(res.json().data.requiresJoinApproval).toBe(true);
    expect(findJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({ where: { communityId: COMMUNITY_ID, userId: USER_ID, status: 'pending', createdAt: { gte: expect.any(Date) } } }),
    );
  });

  it('ne sert ni l\'identifiant de la demande ni rien d\'autre qu\'un état', async () => {
    const { res } = await detailWith(validating, { id: 'req-1', userId: USER_ID, country: 'FR' });
    expect(JSON.stringify(res.json().data)).not.toContain('req-1');
    expect(JSON.stringify(res.json().data)).not.toContain('"FR"');
  });

  it('sert null quand le lecteur n\'a aucune demande en attente', async () => {
    const { res } = await detailWith(validating, null);
    expect(res.json().data.currentUserJoinRequest).toBeNull();
  });

  it('ne lit aucune demande pour une communauté à entrée directe', async () => {
    const { res, findJoinRequest } = await detailWith({ ...validating, requiresJoinApproval: false }, { id: 'req-1' });
    expect(res.json().data.currentUserJoinRequest).toBeNull();
    expect(findJoinRequest).not.toHaveBeenCalled();
  });

  it('ne lit aucune demande pour un lecteur déjà membre', async () => {
    const member = { ...validating, members: [{ userId: USER_ID, role: 'member' }] };
    const { res, findJoinRequest } = await detailWith(member, { id: 'req-1' });
    expect(res.json().data.currentUserRole).toBe('member');
    expect(res.json().data.currentUserJoinRequest).toBeNull();
    expect(findJoinRequest).not.toHaveBeenCalled();
  });

  it('une lecture de demande qui lève ne fait pas tomber le détail (null)', async () => {
    const app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(validating) },
      communityJoinRequest: { findFirst: jest.fn<any>().mockRejectedValue(new Error('mongo')) },
    });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentUserJoinRequest).toBeNull();
  });
});

describe('GET /communities/:id — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /communities
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /communities — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /communities — identifier conflict', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'other-community' }),
        findFirst: jest.fn<any>().mockResolvedValue(mockCommunity),
        findMany: jest.fn<any>().mockResolvedValue([mockCommunity]),
        count: jest.fn<any>().mockResolvedValue(1),
        create: jest.fn<any>().mockResolvedValue(mockCommunity),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when identifier is already taken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 201 on successful creation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /communities — DB error on create', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        findFirst: jest.fn<any>().mockResolvedValue(mockCommunity),
        findMany: jest.fn<any>().mockResolvedValue([mockCommunity]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/communities',
      payload: { name: 'New Community' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /communities/:id/conversations
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /communities/:id/conversations — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id/conversations — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /communities/:id/conversations — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id/conversations — private, user not member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          isPrivate: true,
          members: [],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /communities/:id/conversations — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with conversations list', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /communities/:id/conversations — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}/conversations` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /communities/:id/conversations/:conversationId
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /communities/:id/conversations/:conversationId — not authenticated (middleware)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/conversations/:conversationId — not authenticated (handler guard)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildNoRegisteredUserApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /communities/:id/conversations/:conversationId — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community not found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/conversations/:conversationId — caller is not admin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: OTHER_USER_ID,
          members: [{ userId: USER_ID, role: 'member' }],
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not admin or creator', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/conversations/:conversationId — conversation not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: USER_ID,
          members: [{ userId: USER_ID, role: 'admin' }],
        }),
      },
      conversation: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue(mockConversation),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when conversation not found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /communities/:id/conversations/:conversationId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMMUNITY_ID,
          createdBy: USER_ID,
          members: [{ userId: USER_ID, role: 'admin' }],
        }),
        findUnique: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>().mockResolvedValue([mockCommunity]),
        count: jest.fn<any>().mockResolvedValue(1),
        create: jest.fn<any>().mockResolvedValue(mockCommunity),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when conversation is successfully linked', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /communities/:id/conversations/:conversationId — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMMUNITY_ID}/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// #19879 — le détail dit au lecteur refusé QUAND il pourra redemander
describe('GET /communities/:id — date de la prochaine demande après un refus (#19879)', () => {
  const validating = { ...mockCommunity, createdBy: OTHER_USER_ID, isPrivate: false, requiresJoinApproval: true, members: [] };
  const decidedAt = new Date(Date.now() - 2 * 24 * 3_600_000);

  async function detailWith(community: unknown, rows: { pending: unknown; rejected: unknown }) {
    const findJoinRequest = jest.fn<any>(async ({ where }: any) => (where.status === 'rejected' ? rows.rejected : rows.pending));
    const app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(community) },
      communityJoinRequest: { findFirst: findJoinRequest },
    });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    await app.close();
    return { res, findJoinRequest };
  }

  it('sert la fin du délai de sept jours au non-membre refusé récemment, lue sur SA demande seulement', async () => {
    const { res, findJoinRequest } = await detailWith(validating, { pending: null, rejected: { decidedAt } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentUserJoinRequest).toBeNull();
    expect(res.json().data.currentUserJoinRetryAt).toBe(new Date(decidedAt.getTime() + 7 * 24 * 3_600_000).toISOString());
    const lookup = findJoinRequest.mock.calls.find((c: any) => c[0].where.status === 'rejected')?.[0] as any;
    expect(lookup.where).toEqual({ communityId: COMMUNITY_ID, userId: USER_ID, status: 'rejected', decidedAt: { gte: expect.any(Date) } });
  });

  it('ne sert ni qui a refusé, ni l\'identifiant de la demande', async () => {
    const { res } = await detailWith(validating, { pending: null, rejected: { id: 'req-9', decidedAt, decidedBy: 'steward-7' } });
    const served = JSON.stringify(res.json().data);
    expect(served).not.toContain('req-9');
    expect(served).not.toContain('steward-7');
  });

  it('sert null sans refus récent, et quand une demande est en attente', async () => {
    expect((await detailWith(validating, { pending: null, rejected: null })).res.json().data.currentUserJoinRetryAt).toBeNull();
    const withPending = await detailWith(validating, { pending: { id: 'req-1' }, rejected: { decidedAt } });
    expect(withPending.res.json().data.currentUserJoinRequest).toBe('pending');
    expect(withPending.res.json().data.currentUserJoinRetryAt).toBeNull();
  });

  it('ne lit aucun refus pour un membre ni pour une communauté à entrée directe', async () => {
    const member = await detailWith({ ...validating, members: [{ userId: USER_ID, role: 'member' }] }, { pending: null, rejected: { decidedAt } });
    expect(member.res.json().data.currentUserJoinRetryAt).toBeNull();
    expect(member.findJoinRequest).not.toHaveBeenCalled();
    const open = await detailWith({ ...validating, requiresJoinApproval: false }, { pending: null, rejected: { decidedAt } });
    expect(open.res.json().data.currentUserJoinRetryAt).toBeNull();
    expect(open.findJoinRequest).not.toHaveBeenCalled();
  });

  it('une lecture qui lève ne fait pas tomber le détail (null)', async () => {
    const app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(validating) },
      communityJoinRequest: { findFirst: jest.fn<any>(async ({ where }: any) => { if (where.status === 'rejected') throw new Error('mongo'); return null; }) },
    });
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY_ID}` });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentUserJoinRetryAt).toBeNull();
  });
});
