/**
 * Unit tests for communities/settings.ts
 * Tests PUT /communities/:id, DELETE /communities/:id
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communitySchema: { type: 'object', properties: { id: { type: 'string' } } },
  updateCommunityRequestSchema: { type: 'object', properties: {} },
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

jest.mock('../../../routes/communities/types', () => ({
  UpdateCommunitySchema: { parse: (data: any) => data },
  generateIdentifier: jest.fn<any>().mockReturnValue('new-identifier'),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerSettingsRoutes } from '../../../routes/communities/settings';
import { generateIdentifier } from '../../../routes/communities/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const COMMUNITY_ID = 'comm-aabbcc';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'old-identifier' }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, name: 'Updated', creator: {}, _count: { members: 0, Conversation: 0 } }),
      delete: jest.fn<any>().mockResolvedValue({}),
      ...overrides.community,
    },
    ...overrides,
  };
}

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

  await app.register(registerSettingsRoutes);
  await app.ready();
  return app;
}

// ─── PUT /communities/:id ─────────────────────────────────────────────────────

describe('PUT /communities/:id — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      (reply as any).status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(registerSettingsRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Test' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /communities/:id — handler 401 when no registeredUser', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (req: any) => {
      (req as any).authContext = { isAuthenticated: false };
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(registerSettingsRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /communities/:id — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community does not exist', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Test' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /communities/:id — not the creator', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: OTHER_USER_ID, identifier: 'old' }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not the creator', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Test' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('PUT /communities/:id — identifier conflict', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'old' }),
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'other-community' }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when new identifier is already taken', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Test', identifier: 'taken' } });
    expect(res.statusCode).toBe(409);
  });
});

describe('PUT /communities/:id — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful update', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Updated Name' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('PUT /communities/:id — description only (no name)', () => {
  let app: FastifyInstance;
  const mockUpdate = jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, name: 'old', creator: {}, _count: { members: 0, Conversation: 0 } });
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'old-identifier' }),
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: mockUpdate,
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and sanitizes description when name is omitted', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { description: 'A new description' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: undefined, description: 'A new description' }) })
    );
  });
});

describe('PUT /communities/:id — identifier change without conflict, no name', () => {
  let app: FastifyInstance;
  const mockUpdate = jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, name: 'old', creator: {}, _count: { members: 0, Conversation: 0 } });
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: USER_ID, identifier: 'old-identifier' }),
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: mockUpdate,
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200, falling back to an empty name when generating the identifier', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { identifier: 'new-id' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ identifier: 'new-identifier' }) })
    );
    expect(generateIdentifier).toHaveBeenCalledWith('', 'new-id');
  });
});

describe('PUT /communities/:id — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Test' } });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /communities/:id ──────────────────────────────────────────────────

describe('DELETE /communities/:id — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      (reply as any).status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(registerSettingsRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /communities/:id — handler 401 when no registeredUser', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (req: any) => {
      (req as any).authContext = { isAuthenticated: false };
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(registerSettingsRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authContext has no registeredUser', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /communities/:id — community not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when community does not exist', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /communities/:id — not the creator', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: COMMUNITY_ID, createdBy: OTHER_USER_ID }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not the creator', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /communities/:id — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful delete', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /communities/:id — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('USER', {
      community: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
