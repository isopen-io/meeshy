/**
 * Audit adversarial #19298 — la base, les instantanés de participants et ce
 * qui part aux partenaires CONVERGENT-ils vers la même valeur ?
 *
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

import { updateUserProfile } from '../../../../routes/users/profile';
import { MutationLogService } from '../../../../services/MutationLogService';

const USER_ID = '507f1f77bcf86cd799439011';

const storedRow = () => ({
  id: USER_ID,
  username: 'alice',
  displayName: 'Alice Cooper',
  firstName: 'Alice',
  lastName: 'Cooper',
  email: 'alice@example.com',
  phoneNumber: null,
  avatar: null,
  banner: null,
  bio: '',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  profileAccentColor: null,
  updatedAt: new Date('2026-11-17T09:30:00.000Z'),
  password: 'hash',
});

/** Une base EN MÉMOIRE : `findUnique` lit l'état courant, `update` l'écrit, les instantanés de participants vivent à côté. */
function statefulPrisma(opts: { gateUpdate?: (data: Record<string, unknown>) => Promise<void>; snapshotFailures?: number } = {}) {
  const db = { user: storedRow() as Record<string, unknown>, snapshot: 'Alice Cooper', tick: 0 };
  let snapshotFailures = opts.snapshotFailures ?? 0;
  const mutationLogRows = new Map<string, { resultId: string | null; kind: string; createdAt: Date }>();
  let failNextConclusion = false;
  const prisma = {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
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
      updateMany: jest.fn<any>(async ({ where, data }: { where: { displayName: { not: string } }; data: { displayName: string } }) => {
        if (snapshotFailures > 0) {
          snapshotFailures -= 1;
          throw new Error('mongo: transient write conflict');
        }
        if (db.snapshot === where.displayName.not) return { count: 0 };
        db.snapshot = data.displayName;
        return { count: 3 };
      }),
    },
    mutationLog: {
      findUnique: jest.fn<any>(async ({ where }: any) => {
        const row = mutationLogRows.get(where.userId_clientMutationId.clientMutationId);
        return row ? { ...row } : null;
      }),
      create: jest.fn<any>(async ({ data }: any) => {
        if (mutationLogRows.has(data.clientMutationId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        mutationLogRows.set(data.clientMutationId, { resultId: null, kind: data.kind, createdAt: new Date() });
        return {};
      }),
      update: jest.fn<any>(async ({ where, data }: any) => {
        const key = where.userId_clientMutationId.clientMutationId;
        if (data.resultId !== undefined && failNextConclusion) {
          failNextConclusion = false;
          throw new Error('mongo: primary stepped down');
        }
        mutationLogRows.set(key, { ...(mutationLogRows.get(key) as any), ...data });
        return {};
      }),
      delete: jest.fn<any>(async ({ where }: any) => {
        mutationLogRows.delete(where.userId_clientMutationId.clientMutationId);
        return {};
      }),
    },
  };
  return {
    prisma,
    db,
    failConclusionOnce: () => { failNextConclusion = true; },
    ageReservations: () => {
      for (const [k, v] of mutationLogRows) mutationLogRows.set(k, { ...v, createdAt: new Date(Date.now() - 10 * 60 * 1000) });
    },
  };
}

async function build(prisma: unknown) {
  const broadcasts: Array<Record<string, unknown>> = [];
  const emitUserUpdated = jest.fn<any>(async (params: { changes: Record<string, unknown> }) => {
    broadcasts.push(params.changes);
  });
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('mutationLogService', new MutationLogService(prisma as any) as any);
  app.decorateRequest('clientMutationId', undefined);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any).clientMutationId = req.headers['x-client-mutation-id'];
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } };
  });
  app.decorate('notificationService', { emitUserUpdated } as any);
  app.decorate('socketIOHandler', { getManager: () => ({ refreshUserTypingIdentity: jest.fn(), refreshUserResolvedLanguages: jest.fn() }) } as any);
  await updateUserProfile(app as unknown as FastifyInstance);
  await app.ready();
  return { app, broadcasts, emitUserUpdated };
}

/** Le corps de l'iOS publié : les trois noms tels qu'il les tient, plus la bio. */
const publishedIosBody = (names: { firstName: string; lastName: string; displayName: string }, bio: string) => ({ ...names, bio });

describe('Audit #19298 — convergence base ↔ instantanés ↔ partenaires', () => {
  it('A. deux appareils : un renommage et une bio iOS publiée qui se croisent — instantané et diffusion suivent la base', async () => {
    let releaseIos: () => void = () => {};
    const iosGate = new Promise<void>((resolve) => { releaseIos = resolve; });
    let iosReachedWrite: () => void = () => {};
    const iosWaiting = new Promise<void>((resolve) => { iosReachedWrite = resolve; });
    const { prisma, db } = statefulPrisma({
      gateUpdate: async (data) => {
        if (data.bio === undefined) return;
        iosReachedWrite();
        await iosGate;
      },
    });
    const { app, broadcasts } = await build(prisma);

    const iosSave = app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: publishedIosBody({ firstName: 'Alice', lastName: 'Cooper', displayName: 'Alice Cooper' }, 'Nouvelle bio'),
    });
    await iosWaiting;
    const rename = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Bobby Jones' } });
    expect(rename.statusCode).toBe(200);
    releaseIos();
    expect((await iosSave).statusCode).toBe(200);

    expect(db.user.displayName).toBe('Alice Cooper');
    expect(db.snapshot).toBe(db.user.displayName);
    expect(broadcasts.at(-1)).toMatchObject({ displayName: db.user.displayName });
    await app.close();
  });

  it('B. un renommage dont la réécriture des instantanés a échoué une fois est réparé par l’enregistrement suivant', async () => {
    const { prisma, db } = statefulPrisma({ snapshotFailures: 1 });
    const { app } = await build(prisma);

    const rename = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Bobby Jones' } });
    expect(rename.statusCode).toBe(200);
    const bioSave = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: publishedIosBody({ firstName: 'Alice', lastName: 'Cooper', displayName: 'Bobby Jones' }, 'Nouvelle bio'),
    });
    expect(bioSave.statusCode).toBe(200);

    expect(db.user.displayName).toBe('Bobby Jones');
    expect(db.snapshot).toBe('Bobby Jones');
    await app.close();
  });

  it('C. le journal de mutation échoue APRÈS l’écriture : la reprise (même cmid, réservation reprise) diffuse le nouveau nom', async () => {
    const { prisma, db, failConclusionOnce, ageReservations } = statefulPrisma();
    const { app, broadcasts } = await build(prisma);
    const headers = { 'x-client-mutation-id': '0123456789abcdef0123456789abcdef' };

    failConclusionOnce();
    const first = await app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { displayName: 'Bobby Jones' } });
    expect(first.statusCode).toBe(500);
    expect(db.user.displayName).toBe('Bobby Jones');

    ageReservations();
    const retry = await app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { displayName: 'Bobby Jones' } });
    expect(retry.statusCode).toBe(200);

    expect(broadcasts).toEqual(expect.arrayContaining([expect.objectContaining({ displayName: 'Bobby Jones' })]));
    expect(db.snapshot).toBe('Bobby Jones');
    await app.close();
  });
});
