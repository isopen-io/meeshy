/**
 * `UserConversationPreferences` is a per-USER row whose whole point is to be
 * the same on every device that user is signed in on. Three of its writers
 * live outside `conversation-preferences.ts` — delete-for-me, restore-for-me
 * and clear-history — and they write the two fields
 * (`deletedForUserAt`, `clearHistoryBefore`) that the broadcast payload type
 * `ConversationPreferencesPayload` already declares and that the iOS
 * `ConversationStoreSocketBridge` already maps onto `userState`.
 *
 * These tests pin the contract those three writers must honour, which has two
 * halves that only work together:
 *   - bump `version`, because every client drops `incoming.version <= local`;
 *   - broadcast the snapshot, because a bump nobody receives changes nothing.
 *
 * The live store below applies its writes, so the version a route emits is the
 * one the PREVIOUS request actually left behind — monotonicity is a property
 * of a sequence and cannot be observed against frozen `jest.fn()` resolutions.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

jest.mock('../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (!request.headers['authorization']) {
          await reply.code(401).send({ success: false, error: 'Unauthorized' });
          return;
        }
        (request as unknown as Record<string, unknown>).authContext = {
          type: 'registered',
          userId: USER_ID,
          hasFullAccess: true,
        };
      }
  ),
  UnifiedAuthRequest: {},
}));

import userDeletionsRoutes from '../routes/user-deletions';
import conversationPreferencesRoutes from '../routes/conversation-preferences';

type EmitCall = { event: string; payload: unknown };

type PrefRow = Record<string, unknown> & { version: number };

/**
 * Minimal in-memory `userConversationPreferences` store that APPLIES writes,
 * including the `{ increment: n }` form Prisma uses for the version counter.
 * `participant.findFirst` always answers "member" — membership is covered by
 * `user-deletions-routes.test.ts` and is not what these tests are about.
 */
const buildLivePrisma = () => {
  const rows = new Map<string, PrefRow>();
  const key = (where: any) => `${where.userId_conversationId.userId}:${where.userId_conversationId.conversationId}`;
  const notFound = () => Object.assign(new Error('Record to update not found'), { code: 'P2025' });
  const applyVersion = (current: number, incoming: unknown): number =>
    typeof incoming === 'object' && incoming !== null && 'increment' in (incoming as object)
      ? current + ((incoming as { increment: number }).increment ?? 0)
      : typeof incoming === 'number'
        ? incoming
        : current;

  const BLANK = {
    isPinned: false,
    isMuted: false,
    mentionsOnly: false,
    isArchived: false,
    tags: [] as string[],
    categoryId: null,
    orderInCategory: null,
    customName: null,
    reaction: null,
    deletedForUserAt: null,
    clearHistoryBefore: null,
  };

  return {
    rows,
    participant: {
      findFirst: jest.fn(async () => ({ id: 'part-1', userId: USER_ID, conversationId: CONV_ID, isActive: true })),
    },
    userConversationPreferences: {
      findUnique: jest.fn(async ({ where }: any) => rows.get(key(where)) ?? null),
      findMany: jest.fn(async () => [...rows.values()]),
      count: jest.fn(async () => rows.size),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        const { version: createVersion, ...createRest } = create ?? {};
        const { version: updateVersion, ...updateRest } = update ?? {};
        const next = existing
          ? { ...existing, ...updateRest, version: applyVersion(existing.version, updateVersion) }
          : { id: `pref-${k}`, category: null, ...BLANK, ...createRest, version: applyVersion(0, createVersion) };
        rows.set(k, next as PrefRow);
        return next;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        if (!existing) throw notFound();
        const { version: dataVersion, ...rest } = data ?? {};
        const next = { ...existing, ...rest, version: applyVersion(existing.version, dataVersion) };
        rows.set(k, next as PrefRow);
        return next;
      }),
      updateMany: jest.fn(async () => ({ count: rows.size })),
    },
  };
};

const buildApp = async (prisma: ReturnType<typeof buildLivePrisma>) => {
  const emits: EmitCall[] = [];
  const rooms: string[] = [];
  const fakeIO = {
    to: (room: string) => {
      rooms.push(room);
      return { emit: (event: string, payload: unknown) => { emits.push({ event, payload }); } };
    },
  };

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as unknown);
  app.decorate('socketIOHandler', { getManager: () => ({ io: fakeIO }) } as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
      userId: USER_ID,
    };
  });

  await app.register(userDeletionsRoutes);
  await app.register(conversationPreferencesRoutes);
  await app.ready();
  return { app, emits, rooms };
};

describe('user-deletions routes — multi-device preference broadcast', () => {
  let prisma: ReturnType<typeof buildLivePrisma>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  const prefEmissions = () =>
    env.emits
      .filter((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED)
      .map((e) => e.payload as { version: number; reset: boolean; preferences: Record<string, unknown> | null });

  const deleteForMe = () =>
    env.app.inject({ method: 'DELETE', url: `/api/conversations/${CONV_ID}/delete-for-me`, headers: AUTH });
  const restoreForMe = () =>
    env.app.inject({ method: 'POST', url: `/api/conversations/${CONV_ID}/restore-for-me`, headers: AUTH });
  const clearHistory = (beforeDate: string) =>
    env.app.inject({ method: 'POST', url: `/api/conversations/${CONV_ID}/clear-history`, headers: AUTH, payload: { beforeDate } });
  const put = (payload: Record<string, unknown>) =>
    env.app.inject({ method: 'PUT', url: `/user-preferences/conversations/${CONV_ID}`, payload });

  beforeEach(async () => {
    prisma = buildLivePrisma();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('delete-for-me tells the user other devices the conversation is gone', async () => {
    const res = await deleteForMe();
    expect(res.statusCode).toBe(200);

    expect(env.rooms).toContain(ROOMS.user(USER_ID));
    const [emission] = prefEmissions();
    expect(emission).toBeDefined();
    expect(emission.reset).toBe(false);
    expect(emission.preferences?.deletedForUserAt).toEqual(expect.any(String));
  });

  it('restore-for-me carries a version above the delete it undoes', async () => {
    await deleteForMe();
    const res = await restoreForMe();
    expect(res.statusCode).toBe(200);

    const [deleted, restored] = prefEmissions();
    expect(restored).toBeDefined();
    expect(restored.preferences?.deletedForUserAt).toBeNull();
    // Every device applies `incoming.version <= local -> drop`: a restore that
    // does not exceed its own delete is a conversation that never comes back.
    expect(restored.version).toBeGreaterThan(deleted.version);
  });

  it('clear-history broadcasts the cutoff the other devices must hide behind', async () => {
    const beforeDate = '2026-08-01T10:00:00.000Z';
    const res = await clearHistory(beforeDate);
    expect(res.statusCode).toBe(200);

    const [emission] = prefEmissions();
    expect(emission).toBeDefined();
    expect(emission.preferences?.clearHistoryBefore).toBe(beforeDate);
  });

  it('keeps versions strictly increasing when deletion writers interleave with preference writers', async () => {
    await put({ isPinned: true });
    await deleteForMe();
    await restoreForMe();
    await clearHistory('2026-08-01T10:00:00.000Z');
    await put({ isMuted: true });

    const versions = prefEmissions().map((e) => e.version);
    expect(versions).toHaveLength(5);
    versions.forEach((version, index) => {
      if (index > 0) expect(version).toBeGreaterThan(versions[index - 1]);
    });
  });

  it('leaves the deletion visible to a device that only ever sees broadcasts', async () => {
    await deleteForMe();
    await put({ isPinned: true });

    // The pin's snapshot must still carry the deletion: a device that applies
    // only the latest broadcast must not resurrect a conversation the user
    // deleted on another device.
    const [, pinned] = prefEmissions();
    expect(pinned.preferences?.isPinned).toBe(true);
    expect(pinned.preferences?.deletedForUserAt).toEqual(expect.any(String));
  });

  it('emits nothing when the caller is not a member', async () => {
    prisma.participant.findFirst.mockResolvedValueOnce(null as never);
    const res = await deleteForMe();

    expect(res.statusCode).toBe(403);
    expect(prefEmissions()).toHaveLength(0);
  });

  it('emits nothing when restoring a conversation that was never deleted', async () => {
    const res = await restoreForMe();

    expect(res.statusCode).toBe(400);
    expect(prefEmissions()).toHaveLength(0);
  });
});
