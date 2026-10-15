/**
 * #10477 — sur une VRAIE requête REST (app.inject, VRAI middleware) : franchir
 * l'authentification adopte une session prouvée par un lien, sauf sur la route
 * qui déclare `config.adoptsSession: false` (la déconnexion, qui est le refus).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify, { type FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';

jest.mock('../../../services/CacheStore', () => {
  const store = new Map<string, string>();
  const mockStore = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    keys: jest.fn(async () => []),
    isAvailable: jest.fn(() => false),
  };
  return { getCacheStore: jest.fn(() => mockStore), __mockStoreMap: store };
});

const JWT_SECRET = 'test-secret-proven-session-adoption-10477';
const USER_ID = '507f1f77bcf86cd799439011';
const SID = '507f1f77bcf86cd799439031';

type SessionRow = { isValid: boolean; expiresAt: Date; adoptedExpiresAt: Date | null };

function provenSession(): SessionRow {
  return {
    isValid: true,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    adoptedExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

function user() {
  return {
    id: USER_ID, username: 'bob', email: 'bob@example.com', firstName: 'Bob', lastName: 'B',
    displayName: 'Bob', bio: null, avatar: null, banner: null, phoneNumber: null, role: 'USER',
    systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null, isOnline: true,
    lastActiveAt: new Date(), isActive: true, emailVerifiedAt: new Date(), emailReleasedAt: null,
    createdAt: new Date(), updatedAt: new Date(), deviceLocale: null, profileCompletionRate: null,
  };
}

async function buildApp(row: SessionRow) {
  const updateMany = jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    Object.assign(row, args.data);
    return { count: 1 };
  });
  const prisma = {
    user: { findUnique: jest.fn(async (_args: unknown) => user()) },
    userSession: {
      findFirst: jest.fn(async (_args: unknown) => ({ ...row })),
      update: jest.fn(async (_args: unknown) => ({})),
      updateMany,
    },
    participant: { findFirst: jest.fn(async (_args: unknown) => null) },
  };
  const app: FastifyInstance = Fastify({ logger: false });
  const authenticate = createUnifiedAuthMiddleware(prisma as never, { requireAuth: true });
  app.get('/probe', { preValidation: [authenticate] }, async () => ({ ok: true }));
  app.post('/logout', { config: { adoptsSession: false }, preValidation: [authenticate] }, async () => ({ ok: true }));
  await app.ready();
  return { app, updateMany };
}

const adoptions = (updateMany: { mock: { calls: Array<[{ data: Record<string, unknown> }]> } }) =>
  updateMany.mock.calls.filter(([args]) => 'adoptedExpiresAt' in args.data);

const bearer = () => ({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, username: 'bob', role: 'USER', sid: SID }, JWT_SECRET, { expiresIn: '1h' })}` });

describe('la porte REST adopte une session prouvée — sauf sur la route qui la refuse (#10477)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore') as { __mockStoreMap: Map<string, string> };
    __mockStoreMap.clear();
  });

  it('un appel authentifié adopte : la session prend l’échéance qu’elle attendait', async () => {
    const row = provenSession();
    const attendue = row.adoptedExpiresAt;
    const { app, updateMany } = await buildApp(row);

    const res = await app.inject({ method: 'GET', url: '/probe', headers: bearer() });

    expect(res.statusCode).toBe(200);
    expect(adoptions(updateMany)).toHaveLength(1);
    expect(row).toMatchObject({ expiresAt: attendue, adoptedExpiresAt: null });
    await app.close();
  });

  it('la déconnexion passe la porte SANS adopter : la session reste courte', async () => {
    const row = provenSession();
    const courte = row.expiresAt;
    const { app, updateMany } = await buildApp(row);

    const res = await app.inject({ method: 'POST', url: '/logout', headers: bearer() });

    expect(res.statusCode).toBe(200);
    expect(adoptions(updateMany)).toHaveLength(0);
    expect(row.expiresAt).toBe(courte);
    await app.close();
  });
});
