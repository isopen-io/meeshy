/**
 * #19298 — le REJEU de PATCH /users/me relit la ligne désignée
 * par le resultId d'un AUTRE geste journalisé sous le même cmid.
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn(async () => undefined) })),
}));
jest.mock('../../../../services/nowPlaying/nowPlayingDeps', () => ({ captureNowPlayingBefore: jest.fn(async () => new Map()), refreshNowPlayingAfter: jest.fn(async () => undefined) }));
jest.mock('../../../../services/battery/batteryDeps', () => ({ captureBatteryBefore: jest.fn(async () => new Map()), refreshBatteryAfter: jest.fn(async () => undefined) }));
jest.mock('../../../../services/sharedLocation/sharedLocationDeps', () => ({ captureSharedLocationBefore: jest.fn(async () => new Map()), refreshSharedLocationAfter: jest.fn(async () => undefined) }));
jest.mock('../../../../services/together/togetherDeps', () => ({ rejudgeTogetherAfter: jest.fn(async () => undefined) }));
jest.mock('../../../../socketio/relationEvents', () => ({ relationIoOf: jest.fn(() => null) }));
jest.mock('../../../../services/relations/autoAcquaintance', () => ({ cancelAutoAcquaintanceOnBlock: jest.fn() }));
jest.mock('../../../../services/relations/ritualShareWithdrawal', () => ({ withdrawRitualSharesBetween: jest.fn(async () => undefined) }));
jest.mock('../../../../routes/bring', () => ({ stopBringsAfterUserBlock: jest.fn() }));
jest.mock('../../../../services/talkie/talkieCut', () => ({ cutTalkiesOnBlock: jest.fn(async () => undefined), talkieCutDepsOf: jest.fn(() => ({})) }));
jest.mock('../../../../utils/rate-limiter.js', () => ({ createCustomRateLimiter: jest.fn(() => ({ middleware: () => async () => undefined })) }));

import { updateUserProfile } from '../../../../routes/users/profile';
import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';
import { MutationLogService } from '../../../../services/MutationLogService';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';

const MALLORY = '507f1f77bcf86cd799439011';
const VICTIM = '507f1f77bcf86cd799439099';
const CMID = 'cmid_550e8400-e29b-41d4-a716-446655440000';

const row = (id: string, o: Record<string, unknown>) => ({
  id, bio: '', avatar: null, banner: null, role: 'USER', isActive: true, systemLanguage: 'fr', regionalLanguage: null,
  customDestinationLanguage: null, deviceLocale: null, profileAccentColor: null, blockedUserIds: [] as string[],
  updatedAt: new Date('2026-11-17T09:30:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), password: 'hash', ...o,
});

function world() {
  const users: Record<string, Record<string, unknown>> = {
    [MALLORY]: row(MALLORY, { username: 'mallory', displayName: 'Mallory', firstName: 'Mal', lastName: 'Lory', email: 'mallory@example.com', phoneNumber: null }),
    [VICTIM]: row(VICTIM, { username: 'victime', displayName: 'Victor Hugo', firstName: 'Victor', lastName: 'Hugo', email: 'victor.prive@example.com', phoneNumber: '+33612345678', lastLoginIp: '203.0.113.7', lastLoginLocation: 'Lyon, France', timezone: 'Europe/Paris' }),
  };
  const log = new Map<string, { resultId: string | null; kind: string; createdAt: Date }>();
  const snapshotWrites: Array<{ userId: string; displayName: string }> = [];
  const prisma = {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    userVoiceModel: { updateMany: jest.fn<any>(async () => ({ count: 0 })) },
    user: {
      findUnique: jest.fn<any>(async ({ where }: any) => (users[where.id] ? { ...users[where.id] } : null)),
      findFirst: jest.fn<any>(async () => null),
      findMany: jest.fn<any>(async () => []),
      update: jest.fn<any>(async ({ where, data }: any) => {
        const next = { ...users[where.id] } as Record<string, unknown>;
        for (const [k, v] of Object.entries(data)) {
          next[k] = v && typeof v === 'object' && 'push' in (v as object) ? [...(next[k] as string[]), (v as { push: string }).push] : v;
        }
        users[where.id] = next;
        return { ...next };
      }),
      updateMany: jest.fn<any>(async () => ({ count: 1 })),
    },
    participant: {
      updateMany: jest.fn<any>(async ({ where, data }: any) => { snapshotWrites.push({ userId: where.userId, displayName: data.displayName }); return { count: 4 }; }),
    },
    mutationLog: {
      findUnique: jest.fn<any>(async ({ where }: any) => {
        const k = `${where.userId_clientMutationId.userId}:${where.userId_clientMutationId.clientMutationId}`;
        return log.has(k) ? { ...log.get(k)! } : null;
      }),
      create: jest.fn<any>(async ({ data }: any) => {
        const k = `${data.userId}:${data.clientMutationId}`;
        if (log.has(k)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        log.set(k, { resultId: null, kind: data.kind, createdAt: new Date() });
        return {};
      }),
      update: jest.fn<any>(async ({ where, data }: any) => {
        const k = `${where.userId_clientMutationId.userId}:${where.userId_clientMutationId.clientMutationId}`;
        log.set(k, { ...log.get(k)!, ...data });
        return {};
      }),
      delete: jest.fn<any>(async ({ where }: any) => { log.delete(`${where.userId_clientMutationId.userId}:${where.userId_clientMutationId.clientMutationId}`); return {}; }),
    },
  };
  return { prisma, users, snapshotWrites };
}

describe('Audit #19298 — rejeu d’un cmid emprunté à un blocage', () => {
  it('PATCH /users/me rejoué sous le cmid d’un PUT /blocks/:victime ne sert jamais la fiche d’un autre compte et ne diffuse jamais son identité comme la mienne', async () => {
    const { prisma, snapshotWrites } = world();
    const partnerBroadcasts: Array<{ userId: string; changes: Record<string, unknown> }> = [];
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma as any);
    app.decorate('mutationLogService', new MutationLogService(prisma as any) as any);
    registerClientMutationIdHook(app as unknown as FastifyInstance);
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as any).authContext = { isAuthenticated: true, userId: MALLORY, registeredUser: { id: MALLORY, role: 'USER', username: 'mallory' } };
    });
    app.decorate('notificationService', {
      emitUserUpdated: jest.fn<any>(async (p: any) => { partnerBroadcasts.push(p); }),
      retractNotificationsFromActor: jest.fn<any>(async () => undefined),
    } as any);
    app.decorate('socketIOHandler', { getManager: () => ({ refreshUserTypingIdentity: jest.fn(), refreshUserResolvedLanguages: jest.fn() }) } as any);
    await directoryBlocksRoutes(app as unknown as FastifyInstance);
    await updateUserProfile(app as unknown as FastifyInstance);
    await app.ready();

    const block = await app.inject({ method: 'PUT', url: `/blocks/${VICTIM}`, headers: { 'x-client-mutation-id': CMID } });
    expect(block.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'PATCH', url: '/users/me', headers: { 'x-client-mutation-id': CMID },
      payload: { displayName: 'Mallory' },
    });
    expect(replay.statusCode).toBe(200);
    const served = replay.json().data.user;
    expect(served.id).toBe(MALLORY);
    expect(served.email).not.toBe('victor.prive@example.com');
    expect(served.phoneNumber).not.toBe('+33612345678');
    expect(partnerBroadcasts.every((b) => b.changes.username !== 'victime')).toBe(true);
    expect(snapshotWrites.every((w) => w.displayName !== 'Victor Hugo')).toBe(true);
    await app.close();
  });
});
