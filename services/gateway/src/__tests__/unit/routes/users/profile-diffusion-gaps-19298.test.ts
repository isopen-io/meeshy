/**
 * #19298 — constats reproductibles.
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserProfile, updateUserAvatar } from '../../../../routes/users/profile';
import { MutationLogService } from '../../../../services/MutationLogService';

const USER_ID = '507f1f77bcf86cd799439011';
const A0 = `2026/11/${USER_ID}/avatar_0.webp`;
const A1 = `2026/11/${USER_ID}/avatar_1.webp`;

const storedRow = () => ({
  id: USER_ID, username: 'alice', displayName: 'Alice Cooper', firstName: 'Alice', lastName: 'Cooper',
  email: 'alice@example.com', phoneNumber: null, avatar: A0, banner: null, bio: '', role: 'USER',
  systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
  profileAccentColor: '#4ECDC4', updatedAt: new Date('2026-11-17T09:30:00.000Z'), password: 'hash',
});

function statefulPrisma(opts: { gateUpdate?: (data: Record<string, unknown>) => Promise<void> } = {}) {
  const db = { user: storedRow() as Record<string, unknown>, snapshot: 'Alice Cooper', tick: 0 };
  const rows = new Map<string, { resultId: string | null; kind: string; createdAt: Date }>();
  let failNextConclusion = false;
  const prisma = {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'att-own' }) },
    user: {
      findUnique: jest.fn<any>(async () => ({ ...db.user })),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>(async ({ data }: { data: Record<string, unknown> }) => {
        if (opts.gateUpdate) await opts.gateUpdate(data);
        db.tick += 1;
        db.user = { ...db.user, ...data, updatedAt: new Date(Date.parse('2026-11-17T09:30:00.000Z') + db.tick * 1000) };
        return { ...db.user };
      }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    participant: {
      updateMany: jest.fn<any>(async ({ where, data }: any) => {
        if (db.snapshot === where.displayName.not) return { count: 0 };
        db.snapshot = data.displayName;
        return { count: 3 };
      }),
    },
    mutationLog: {
      findUnique: jest.fn<any>(async ({ where }: any) => {
        const row = rows.get(where.userId_clientMutationId.clientMutationId);
        return row ? { ...row } : null;
      }),
      create: jest.fn<any>(async ({ data }: any) => {
        if (rows.has(data.clientMutationId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        rows.set(data.clientMutationId, { resultId: null, kind: data.kind, createdAt: new Date() });
        return {};
      }),
      update: jest.fn<any>(async ({ where, data }: any) => {
        const key = where.userId_clientMutationId.clientMutationId;
        if (data.resultId !== undefined && failNextConclusion) { failNextConclusion = false; throw new Error('mongo: primary stepped down'); }
        rows.set(key, { ...(rows.get(key) as any), ...data });
        return {};
      }),
      delete: jest.fn<any>(async ({ where }: any) => { rows.delete(where.userId_clientMutationId.clientMutationId); return {}; }),
    },
  };
  return {
    prisma, db,
    failConclusionOnce: () => { failNextConclusion = true; },
    ageReservations: () => { for (const [k, v] of rows) rows.set(k, { ...v, createdAt: new Date(Date.now() - 10 * 60 * 1000) }); },
  };
}

async function build(prisma: unknown, route: (app: FastifyInstance) => Promise<void>) {
  const partners: Array<Record<string, unknown>> = [];
  const emitUserUpdated = jest.fn<any>(async (p: { changes: Record<string, unknown> }) => { partners.push(p.changes); });
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('mutationLogService', new MutationLogService(prisma as any) as any);
  app.decorateRequest('clientMutationId', undefined);
  app.addHook('onRequest', async (req: FastifyRequest) => { (req as any).clientMutationId = req.headers['x-client-mutation-id']; });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } };
  });
  app.decorate('notificationService', { emitUserUpdated } as any);
  app.decorate('socketIOHandler', { getManager: () => ({ refreshUserTypingIdentity: jest.fn(), refreshUserResolvedLanguages: jest.fn() }) } as any);
  await route(app as unknown as FastifyInstance);
  await app.ready();
  return { app, partners };
}

describe('Audit #19298 — ce que la règle « a changé » laisse dériver', () => {
  it('G1. accent : journal de mutation en échec après l’écriture, reprise sur réservation abandonnée — les partenaires reçoivent-ils le nouvel accent ?', async () => {
    const { prisma, db, failConclusionOnce, ageReservations } = statefulPrisma();
    const { app, partners } = await build(prisma, updateUserProfile);
    const headers = { 'x-client-mutation-id': '0123456789abcdef0123456789abcdef' };
    failConclusionOnce();
    const first = await app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { profileAccentColor: '#FF6B6B' } });
    expect(first.statusCode).toBe(500);
    expect(db.user.profileAccentColor).toBe('#FF6B6B');
    ageReservations();
    const retry = await app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { profileAccentColor: '#FF6B6B' } });
    expect(retry.statusCode).toBe(200);
    expect(partners).toEqual(expect.arrayContaining([expect.objectContaining({ profileAccentColor: '#FF6B6B' })]));
    await app.close();
  });

  it('G2. prénom changé sous un nom affiché (nom composé inchangé), même reprise : les partenaires reçoivent-ils le nouveau prénom ?', async () => {
    const { prisma, db, failConclusionOnce, ageReservations } = statefulPrisma();
    const { app, partners } = await build(prisma, updateUserProfile);
    const headers = { 'x-client-mutation-id': 'fedcba9876543210fedcba9876543210' };
    failConclusionOnce();
    const first = await app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { firstName: 'Alicia' } });
    expect(first.statusCode).toBe(500);
    expect(db.user.firstName).toBe('Alicia');
    ageReservations();
    const retry = await app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { firstName: 'Alicia' } });
    expect(retry.statusCode).toBe(200);
    expect(partners).toEqual(expect.arrayContaining([expect.objectContaining({ firstName: 'Alicia' })]));
    await app.close();
  });

  it('G3. avatar : deux écritures croisées (lecture préalable périmée) — la dernière valeur diffusée suit-elle la base ?', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let reached: () => void = () => {};
    const waiting = new Promise<void>((r) => { reached = r; });
    const { prisma, db } = statefulPrisma({
      gateUpdate: async (data) => { if (data.avatar !== A0) return; reached(); await gate; },
    });
    const { app, partners } = await build(prisma, updateUserAvatar);
    const stale = app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: A0 } });
    await waiting;
    const change = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: A1 } });
    expect(change.statusCode).toBe(200);
    release();
    expect((await stale).statusCode).toBe(200);
    expect(db.user.avatar).toBe(A0);
    expect(partners.at(-1)).toMatchObject({ avatar: db.user.avatar });
    await app.close();
  });
});
