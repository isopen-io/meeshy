/**
 * Route-level emission tests for conversation preference endpoints.
 *
 * Phase 0 state: these are RED. The routes don't emit yet. Phase 1
 * will add the `broadcastToUser` calls and turn them GREEN.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import conversationPreferencesRoutes from '../routes/conversation-preferences';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_CONV_ID = '507f1f77bcf86cd799439abc';

type EmitCall = { event: string; payload: unknown };

const buildPrismaMock = () => ({
  participant: {
    findFirst: jest.fn(async ({ where }: any) => ({ id: `participant-${where?.conversationId}` })),
    findMany: jest.fn(async ({ where }: any) =>
      ((where?.conversationId?.in ?? []) as string[]).map((conversationId) => ({ conversationId }))
    ),
  },
  userConversationCategory: {
    findFirst: jest.fn(async ({ where }: any) => ({ id: where?.id })),
  },
  userConversationPreferences: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    upsert: jest.fn<any>(),
    delete: jest.fn<any>(),
  },
});

const buildApp = async (prisma: ReturnType<typeof buildPrismaMock>) => {
  const emits: EmitCall[] = [];
  const rooms: string[] = [];
  const fakeIO = {
    to: (room: string) => {
      rooms.push(room);
      return {
        emit: (event: string, payload: unknown) => {
          emits.push({ event, payload });
        },
      };
    },
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('socketIOHandler', { getManager: () => ({ io: fakeIO }) } as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: TEST_USER_ID, role: 'USER' },
      userId: TEST_USER_ID,
    };
  });

  await app.register(conversationPreferencesRoutes);
  await app.ready();
  return { app, emits, rooms };
};

describe('conversation-preferences routes — socket emissions (Phase 1 contract)', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('PUT /user-preferences/conversations/:id increments version and emits USER_PREFERENCES_UPDATED', async () => {
    const upsertedRow = {
      id: 'pref-1',
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      isPinned: true,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      clearHistoryBefore: null,
      version: 4,
      createdAt: new Date('2026-05-22T00:00:00Z'),
      updatedAt: new Date('2026-05-22T00:01:00Z'),
      category: null,
    };
    prisma.userConversationPreferences.upsert.mockResolvedValue(upsertedRow);

    const res = await env.app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${TEST_CONV_ID}`,
      payload: { isPinned: true },
    });

    expect(res.statusCode).toBe(200);

    // Prisma upsert was called with version increment on update, and with
    // an explicit version: 1 on create (so the first emitted version is >= 1,
    // preventing clients from confusing a fresh row with the schema default 0).
    const upsertCall = prisma.userConversationPreferences.upsert.mock.calls[0]?.[0] as any;
    expect(upsertCall?.update?.version).toEqual({ increment: 1 });
    expect(upsertCall?.create?.version).toBe(1);

    // Socket emission to user room with full payload + version
    expect(env.rooms).toContain(ROOMS.user(TEST_USER_ID));
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      version: 4,
      reset: false,
      preferences: expect.objectContaining({
        isPinned: true,
        isMuted: false,
        mentionsOnly: false,
        isArchived: false,
      }),
    });
  });

  it('DELETE /user-preferences/conversations/:id emits USER_PREFERENCES_UPDATED with reset:true and version > local', async () => {
    // A row that has already been edited a few times. Driven through the live
    // store: a frozen `delete` mock would let the route emit any version at
    // all, including one that never exceeds what the row held.
    const livePrisma = buildLivePrisma();
    livePrisma.rows.set(`${TEST_USER_ID}:${TEST_CONV_ID}`, { version: 7 });
    const liveEnv = await buildApp(livePrisma as unknown as ReturnType<typeof buildPrismaMock>);

    const res = await liveEnv.app.inject({
      method: 'DELETE',
      url: `/user-preferences/conversations/${TEST_CONV_ID}`,
    });

    expect(res.statusCode).toBe(200);

    const emission = liveEnv.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      reset: true,
      // Must be strictly greater than the previous row version so clients
      // applying `incoming.version <= local -> drop` don't silently discard
      // the reset on every multi-device tab/app.
      version: 8,
      preferences: null,
    });
    await liveEnv.app.close();
  });

  it('DELETE on a never-customized row emits version >= 1 (schema default 0 + 1)', async () => {
    const livePrisma = buildLivePrisma();
    livePrisma.rows.set(`${TEST_USER_ID}:${TEST_CONV_ID}`, { version: 0 });
    const liveEnv = await buildApp(livePrisma as unknown as ReturnType<typeof buildPrismaMock>);

    const res = await liveEnv.app.inject({
      method: 'DELETE',
      url: `/user-preferences/conversations/${TEST_CONV_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const emission = liveEnv.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission?.payload).toMatchObject({ reset: true, version: 1, preferences: null });
    await liveEnv.app.close();
  });

  it('POST /user-preferences/reorder emits USER_PREFERENCES_REORDERED with updates', async () => {
    prisma.userConversationPreferences.upsert.mockImplementation((async ({ create }: any) => create) as any);

    const updates = [
      { conversationId: TEST_CONV_ID, orderInCategory: 0 },
      { conversationId: '507f1f77bcf86cd799439def', orderInCategory: 1 },
    ];

    const res = await env.app.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      payload: { updates },
    });

    expect(res.statusCode).toBe(200);

    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_REORDERED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      updates,
    });
  });
});

/**
 * The `version` carried by every `USER_PREFERENCES_UPDATED` broadcast is
 * declared **monotonic** by the schema itself (`UserConversationPreferences.
 * version`: "clients drop incoming payloads whose version is <= their local
 * snapshot"). Monotonicity is a property of a *sequence* of requests, so it
 * cannot be observed against frozen `jest.fn()` resolutions — those replay
 * whatever version the test author hardcoded, which is exactly the version
 * the assertion then checks. The live store below applies its writes, so the
 * version each route emits is the one the previous request actually left
 * behind.
 */
const buildLivePrisma = () => {
  const rows = new Map<string, Record<string, unknown>>();
  const key = (where: any) => `${where.userId_conversationId.userId}:${where.userId_conversationId.conversationId}`;
  const notFound = () => Object.assign(new Error('Record to update not found'), { code: 'P2025' });
  const applyVersion = (current: number, incoming: unknown): number =>
    typeof incoming === 'object' && incoming !== null && 'increment' in (incoming as object)
      ? current + ((incoming as { increment: number }).increment ?? 0)
      : typeof incoming === 'number'
        ? incoming
        : current;

  return {
    rows,
    participant: {
      findFirst: jest.fn(async ({ where }: any) => ({ id: `participant-${where?.conversationId}` })),
      findMany: jest.fn(async ({ where }: any) =>
        ((where?.conversationId?.in ?? []) as string[]).map((conversationId) => ({ conversationId }))
      ),
    },
    userConversationCategory: {
      findFirst: jest.fn(async ({ where }: any) => ({ id: where?.id })),
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
          ? { ...existing, ...updateRest, version: applyVersion(existing.version as number, updateVersion) }
          : { id: `pref-${k}`, category: null, ...createRest, version: applyVersion(0, createVersion) };
        rows.set(k, next);
        return next;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        if (!existing) throw notFound();
        const { version: dataVersion, ...rest } = data ?? {};
        const next = { ...existing, ...rest, version: applyVersion(existing.version as number, dataVersion) };
        rows.set(k, next);
        return next;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        if (!existing) throw notFound();
        rows.delete(k);
        return existing;
      }),
    },
  };
};

describe('conversation-preferences routes — version monotonicity across a reset', () => {
  let prisma: ReturnType<typeof buildLivePrisma>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  const versionsOf = (emits: EmitCall[]) =>
    emits
      .filter((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED)
      .map((e) => (e.payload as { version: number }).version);

  beforeEach(async () => {
    prisma = buildLivePrisma();
    env = await buildApp(prisma as unknown as ReturnType<typeof buildPrismaMock>);
  });

  afterEach(async () => {
    await env.app.close();
  });

  const put = (payload: Record<string, unknown>) =>
    env.app.inject({ method: 'PUT', url: `/user-preferences/conversations/${TEST_CONV_ID}`, payload });
  const reset = () =>
    env.app.inject({ method: 'DELETE', url: `/user-preferences/conversations/${TEST_CONV_ID}` });

  it('keeps broadcast versions strictly increasing when a preference is set again after a reset', async () => {
    await put({ isPinned: true });
    await put({ isMuted: true });
    await reset();
    await put({ isPinned: true });

    const versions = versionsOf(env.emits);
    expect(versions).toHaveLength(4);
    // Every device applies `incoming.version <= local -> drop`. A version that
    // does not exceed the reset's version is a change no other device ever sees.
    versions.forEach((version, index) => {
      if (index > 0) expect(version).toBeGreaterThan(versions[index - 1]);
    });
  });

  it('leaves the pin state of a re-pin after reset visible to other devices', async () => {
    await put({ isPinned: true });
    await reset();
    await put({ isPinned: true });

    const [firstPin, resetEvent, rePin] = env.emits
      .filter((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED)
      .map((e) => e.payload as { version: number; reset: boolean });

    expect(firstPin.reset).toBe(false);
    expect(resetEvent.reset).toBe(true);
    expect(rePin.version).toBeGreaterThan(resetEvent.version);
  });

  it('restores every preference field to its default on reset', async () => {
    await put({ isPinned: true, isMuted: true, mentionsOnly: true, isArchived: true, tags: ['work'], customName: 'Team' });
    await reset();

    const row = [...prisma.rows.values()][0];
    expect(row).toMatchObject({
      isPinned: false,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      clearHistoryBefore: null,
    });
  });

  it('still answers 404 when resetting a conversation that has no stored preferences', async () => {
    const res = await reset();
    expect(res.statusCode).toBe(404);
    expect(versionsOf(env.emits)).toHaveLength(0);
  });
});
