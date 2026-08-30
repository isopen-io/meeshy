/**
 * Unit tests for admin/anonymous-users.ts
 * Tests GET /anonymous-users
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../validation/helpers.js', () => ({ validateQuery: () => async () => {} }));
jest.mock('../../../validation/admin-schemas.js', () => ({ AnonymousUsersQuerySchema: {} }));
jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn().mockReturnValue({ offset: 0, limit: 20 }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { anonymousUsersAdminRoutes } from '../../../routes/admin/anonymous-users';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      ...overrides.participant,
    },
    ...overrides,
  };
}

async function buildApp(role = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });

  app.decorate('prisma', makePrisma() as any);

  await app.register(anonymousUsersAdminRoutes);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /anonymous-users — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(anonymousUsersAdminRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authenticate hook rejects', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /anonymous-users — USER role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /anonymous-users — ANALYST role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ANALYST'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has ANALYST role', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /anonymous-users — MODERATOR role allowed', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user has MODERATOR role', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — ADMIN with search param', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ADMIN'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when search query param is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users?search=alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — ADMIN with status=active', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ADMIN'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when status=active filter is applied', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users?status=active' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — ADMIN with status=inactive', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ADMIN'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when status=inactive filter is applied', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users?status=inactive' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// #4157 — `sessionTokenHash` (le hash comparé par
// `middleware/auth.ts:createAnonymousUserContext` pour authentifier CETTE
// session anonyme) et `anonymousSession` (embarqué, SANS `select` — porte une
// SECONDE copie de ce hash, l'IP, l'empreinte d'appareil, et le profil PII
// complet : email, date de naissance) voyageaient dans cette liste sans
// AUCUN gate, servis à MODERATOR/AUDIT (`canViewUsers`, aucun des deux n'a
// `canViewSensitiveData`). Un témoin de PROJECTION assert sur la REQUÊTE
// envoyée à Prisma, pas sur le rendu — un `select` qui les redéclarerait
// romprait ce témoin AVANT même qu'une ligne n'atteigne le sérialiseur.
describe('GET /anonymous-users — secrets retirés du select (#4157)', () => {
  let app: FastifyInstance;
  let findManyMock: jest.Mock;

  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    findManyMock = jest.fn<any>().mockResolvedValue([]);
    a.decorate('authenticate', async (req: any) => {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'BIGBOSS' },
      };
    });
    a.decorate('prisma', makePrisma({
      participant: { findMany: findManyMock, count: jest.fn<any>().mockResolvedValue(0) },
    }) as any);
    await a.register(anonymousUsersAdminRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('ne demande NI sessionTokenHash NI anonymousSession à Prisma, même pour BIGBOSS', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(200);

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const { select } = findManyMock.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(select).not.toHaveProperty('sessionTokenHash');
    expect(select).not.toHaveProperty('anonymousSession');
    // Le retrait ne doit pas emporter le reste de la projection.
    expect(select).toHaveProperty('displayName', true);
    expect(select).toHaveProperty('conversationId', true);
  });
});

// Directive produit 2026-08-25 : « les utilisateurs avec le rôle ADMIN et
// supérieur peuvent constamment avoir l'état de présence » — MODERATOR/AUDIT
// passent `requireAdmin` ici mais n'ont plus canViewPresence.
describe('GET /anonymous-users — presence gate (isOnline/lastActiveAt)', () => {
  const participant = {
    id: 'p1',
    displayName: 'Anon',
    avatar: null,
    language: 'fr',
    isActive: true,
    isOnline: true,
    lastActiveAt: new Date('2026-08-20T10:00:00.000Z'),
    joinedAt: new Date('2026-08-01'),
    leftAt: null,
  };

  async function buildAppWithParticipant(role: string): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async (req: any) => {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role },
      };
    });
    app.decorate('prisma', makePrisma({
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([participant]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    }) as any);
    await app.register(anonymousUsersAdminRoutes);
    await app.ready();
    return app;
  }

  it('masks isOnline/lastActiveAt for MODERATOR (canViewUsers but no canViewPresence)', async () => {
    const app = await buildAppWithParticipant('MODERATOR');
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(200);
    const [anon] = res.json().data.anonymousUsers;
    expect(anon.isOnline).toBe(false);
    expect(anon.lastActiveAt).toBeNull();
    expect(anon.id).toBe('p1');
    await app.close();
  });

  it('masks isOnline/lastActiveAt for AUDIT', async () => {
    const app = await buildAppWithParticipant('AUDIT');
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    const [anon] = res.json().data.anonymousUsers;
    expect(anon.isOnline).toBe(false);
    expect(anon.lastActiveAt).toBeNull();
    await app.close();
  });

  it('serves the real isOnline/lastActiveAt for ADMIN', async () => {
    const app = await buildAppWithParticipant('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    const [anon] = res.json().data.anonymousUsers;
    expect(anon.isOnline).toBe(true);
    expect(anon.lastActiveAt).toBe('2026-08-20T10:00:00.000Z');
    await app.close();
  });

  it('serves the real isOnline/lastActiveAt for BIGBOSS', async () => {
    const app = await buildAppWithParticipant('BIGBOSS');
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    const [anon] = res.json().data.anonymousUsers;
    expect(anon.isOnline).toBe(true);
    await app.close();
  });
});

describe('GET /anonymous-users — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (req: any) => {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'ADMIN' },
      };
    });
    a.decorate('prisma', makePrisma({
      participant: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        count: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    }) as any);
    await a.register(anonymousUsersAdminRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(500);
  });
});
