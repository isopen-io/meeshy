/**
 * Unit tests for links management routes (management.ts)
 * Tests PUT /links/:conversationShareLinkId, PATCH /links/:linkId.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((t: string) => t),
  },
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerManagementRoutes } from '../../../../routes/links/management';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';
const LINK_DB_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';

const mockShareLink = {
  id: LINK_DB_ID,
  linkId: LINK_ID,
  createdBy: USER_ID,
  name: 'My Link',
  description: null,
  isActive: true,
  maxUses: null,
  expiresAt: null,
  conversation: {
    participants: [{ userId: USER_ID, isActive: true, role: 'member' }],
  },
};

const mockUpdatedLink = { ...mockShareLink, name: 'Updated Link' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(mockShareLink),
      findFirst: jest.fn<any>().mockResolvedValue(mockShareLink),
      update: jest.fn<any>().mockResolvedValue(mockUpdatedLink),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'registered' | 'anonymous' | 'unauthenticated';
  role?: string;
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'registered', role = 'USER', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role },
        hasFullAccess: true,
      };
    } else {
      (req as any)._testAuthContext = null;
    }
  });

  await registerManagementRoutes(app);
  await app.ready();
  return { app, prisma };
}

// ─── PUT /links/:conversationShareLinkId — auth ───────────────────────────────

describe('PUT /links/:id — not registered user', () => {
  it('returns 403 when auth context has no registeredUser', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── PUT /links/:conversationShareLinkId — not found ─────────────────────────

describe('PUT /links/:id — link not found', () => {
  it('returns 404 when link does not exist', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── PUT /links/:conversationShareLinkId — forbidden ─────────────────────────

describe('PUT /links/:id — not creator and not admin', () => {
  it('returns 403 when user is neither creator nor conversation admin', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue({
      ...mockShareLink,
      createdBy: OTHER_USER_ID,
      conversation: { participants: [] },
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── PUT /links/:conversationShareLinkId — success as creator ─────────────────

describe('PUT /links/:id — success as link creator', () => {
  it('returns 200 when user is the link creator', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated', isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── PUT /links/:conversationShareLinkId — success as conversation admin ──────

describe('PUT /links/:id — success as conversation admin', () => {
  it('returns 200 when user is a conversation admin', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue({
      ...mockShareLink,
      createdBy: OTHER_USER_ID,
      conversation: { participants: [{ userId: USER_ID, isActive: true, role: 'admin' }] },
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── PUT /links/:conversationShareLinkId — success as conversation creator ────

describe('PUT /links/:id — success as conversation creator', () => {
  it('returns 200 when user has creator role in conversation', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue({
      ...mockShareLink,
      createdBy: OTHER_USER_ID,
      conversation: { participants: [{ userId: USER_ID, isActive: true, role: 'creator' }] },
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── PUT /links/:conversationShareLinkId — DB error ──────────────────────────

describe('PUT /links/:id — DB error', () => {
  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.update = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — not registered user ───────────────────────────────

describe('PATCH /links/:linkId — not registered user', () => {
  it('returns 403 when auth context has no registeredUser', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — not found ────────────────────────────────────────

describe('PATCH /links/:linkId — link not found', () => {
  it('returns 404 when link does not exist', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — forbidden ────────────────────────────────────────

describe('PATCH /links/:linkId — not creator and not admin', () => {
  it('returns 403 when user is neither creator nor conversation moderator', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst = jest.fn<any>().mockResolvedValue({
      ...mockShareLink,
      createdBy: OTHER_USER_ID,
      conversation: { participants: [{ userId: USER_ID, isActive: true, role: 'member' }] },
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — success as creator ───────────────────────────────

describe('PATCH /links/:linkId — success as link creator', () => {
  it('returns 200 when user is the link creator', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { name: 'Updated', isActive: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — success as MODERATOR ─────────────────────────────

describe('PATCH /links/:linkId — success as MODERATOR', () => {
  it('returns 200 when user has MODERATOR role in conversation', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst = jest.fn<any>().mockResolvedValue({
      ...mockShareLink,
      createdBy: OTHER_USER_ID,
      conversation: { participants: [{ userId: USER_ID, isActive: true, role: 'MODERATOR' }] },
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — DB error ─────────────────────────────────────────

describe('PATCH /links/:linkId — DB error', () => {
  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.update = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── PUT /links/:id — Zod validation error (line 153) ────────────────────────
// maxUses: 1.5 passes AJV (type: number, minimum: 1) but fails Zod (.int())

describe('PUT /links/:id — Zod validation error', () => {
  it('returns 400 when body fails Zod validation (non-integer maxUses)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/links/${LINK_DB_ID}`,
      payload: { maxUses: 1.5 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── PATCH /links/:linkId — Zod validation error (line 301) ──────────────────
// maxUses: 1.5 passes AJV (type: number, minimum: 1) but fails Zod (.int())

describe('PATCH /links/:linkId — Zod validation error', () => {
  it('returns 400 when body fails Zod validation (non-integer maxUses)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: `/links/${LINK_ID}`,
      payload: { maxUses: 1.5 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
