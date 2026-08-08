/**
 * `POST /user-preferences/reorder` — persistence contract.
 *
 * The route answers 200 and broadcasts `USER_PREFERENCES_REORDERED` to every
 * device of the user. Both clients (iOS `ConversationStore.reorderConversations`,
 * web `UserPreferencesService.reorderInCategory`) apply the new order
 * optimistically and treat that 200 as the commit. So the route owes exactly
 * one invariant: **what it broadcasts is what it persisted**.
 *
 * It used to owe neither half. `updateMany` matches zero documents when the
 * user has never customized the conversation, so the write silently did
 * nothing while the response and the broadcast claimed success — every device
 * showed an order the server did not hold, until an unrelated refetch snapped
 * it back. And nothing scoped the write to conversations the user is actually
 * in.
 *
 * These tests drive the route through a store that applies its writes. Against
 * the frozen `updateMany: jest.fn(async () => ({ count: n }))` the existing
 * suites used, "the row was written" and "nothing was written" produce the
 * same assertions — the defect was structurally unobservable.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import conversationPreferencesRoutes from '../routes/conversation-preferences';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const USER_ID = '507f1f77bcf86cd799439011';
const JOINED_CONV_ID = '507f1f77bcf86cd799439abc';
const OTHER_JOINED_CONV_ID = '507f1f77bcf86cd799439abd';
const FOREIGN_CONV_ID = '507f1f77bcf86cd7994390ff';

type EmitCall = { event: string; payload: unknown };

/**
 * Store that applies its writes, plus the participant table the route reads to
 * scope the batch. `joined` holds the conversations `USER_ID` is an active
 * participant of.
 */
const buildLivePrisma = (joined: string[] = [JOINED_CONV_ID, OTHER_JOINED_CONV_ID]) => {
  const rows = new Map<string, Record<string, unknown>>();
  const key = (where: any) => `${where.userId_conversationId.userId}:${where.userId_conversationId.conversationId}`;
  const applyVersion = (current: number, incoming: unknown): number =>
    typeof incoming === 'object' && incoming !== null && 'increment' in (incoming as object)
      ? current + ((incoming as { increment: number }).increment ?? 0)
      : typeof incoming === 'number'
        ? incoming
        : current;

  return {
    rows,
    participant: {
      findMany: jest.fn(async ({ where }: any) => {
        const wanted: string[] = where?.conversationId?.in ?? [];
        return wanted
          .filter((id) => joined.includes(id) && where.userId === USER_ID)
          .map((conversationId) => ({ conversationId }));
      }),
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
        if (!existing) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
        const { version: dataVersion, ...rest } = data ?? {};
        const next = { ...existing, ...rest, version: applyVersion(existing.version as number, dataVersion) };
        rows.set(k, next);
        return next;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        if (!existing) throw Object.assign(new Error('Record to delete not found'), { code: 'P2025' });
        rows.delete(k);
        return existing;
      }),
    },
  };
};

const buildApp = async (prisma: ReturnType<typeof buildLivePrisma>) => {
  const emits: EmitCall[] = [];
  const fakeIO = {
    to: () => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ event, payload });
      },
    }),
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('socketIOHandler', { getManager: () => ({ io: fakeIO }) } as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
      userId: USER_ID,
    };
  });

  await app.register(conversationPreferencesRoutes);
  await app.ready();
  return { app, emits };
};

describe('POST /user-preferences/reorder — what it broadcasts is what it persisted', () => {
  let prisma: ReturnType<typeof buildLivePrisma>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildLivePrisma();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  const reorder = (updates: Array<{ conversationId: string; orderInCategory: number }>) =>
    env.app.inject({ method: 'POST', url: '/user-preferences/reorder', payload: { updates } });

  const readPreferences = async (conversationId: string) => {
    const res = await env.app.inject({
      method: 'GET',
      url: `/user-preferences/conversations/${conversationId}`,
    });
    return res.json().data as Record<string, unknown>;
  };

  const put = (conversationId: string, payload: Record<string, unknown>) =>
    env.app.inject({ method: 'PUT', url: `/user-preferences/conversations/${conversationId}`, payload });

  const reorderedPayload = () =>
    env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_REORDERED)?.payload as
      | { userId: string; updates: Array<{ conversationId: string; orderInCategory: number }> }
      | undefined;

  it('persists the order of a conversation that has no preferences row yet', async () => {
    const res = await reorder([{ conversationId: JOINED_CONV_ID, orderInCategory: 3 }]);
    expect(res.statusCode).toBe(200);

    const stored = await readPreferences(JOINED_CONV_ID);
    expect(stored.orderInCategory).toBe(3);
    expect(stored.isDefault).toBe(false);
  });

  it('reorders an existing row without disturbing its other preferences', async () => {
    await put(JOINED_CONV_ID, { isPinned: true, isMuted: true });

    await reorder([{ conversationId: JOINED_CONV_ID, orderInCategory: 7 }]);

    const stored = await readPreferences(JOINED_CONV_ID);
    expect(stored.orderInCategory).toBe(7);
    expect(stored.isPinned).toBe(true);
    expect(stored.isMuted).toBe(true);
  });

  it('applies the last position when the same conversation appears twice in one batch', async () => {
    await reorder([
      { conversationId: JOINED_CONV_ID, orderInCategory: 1 },
      { conversationId: JOINED_CONV_ID, orderInCategory: 4 },
    ]);

    expect(await readPreferences(JOINED_CONV_ID)).toMatchObject({ orderInCategory: 4 });
    // One row, one write — concurrent upserts on the same unique key race.
    expect(prisma.userConversationPreferences.upsert.mock.calls).toHaveLength(1);
  });

  it('writes nothing for a conversation the user does not participate in', async () => {
    await reorder([{ conversationId: FOREIGN_CONV_ID, orderInCategory: 2 }]);

    const stored = await readPreferences(FOREIGN_CONV_ID);
    expect(stored.isDefault).toBe(true);
    expect(stored.orderInCategory).toBeNull();
  });

  it('broadcasts only the updates it actually wrote', async () => {
    await reorder([
      { conversationId: JOINED_CONV_ID, orderInCategory: 0 },
      { conversationId: FOREIGN_CONV_ID, orderInCategory: 1 },
      { conversationId: OTHER_JOINED_CONV_ID, orderInCategory: 2 },
    ]);

    expect(reorderedPayload()).toEqual({
      userId: USER_ID,
      updates: [
        { conversationId: JOINED_CONV_ID, orderInCategory: 0 },
        { conversationId: OTHER_JOINED_CONV_ID, orderInCategory: 2 },
      ],
    });
  });

  it('stays silent when the whole batch is unwritable', async () => {
    const res = await reorder([{ conversationId: FOREIGN_CONV_ID, orderInCategory: 1 }]);

    expect(res.statusCode).toBe(200);
    expect(reorderedPayload()).toBeUndefined();
  });

  it('stays silent on an empty batch', async () => {
    const res = await reorder([]);

    expect(res.statusCode).toBe(200);
    expect(reorderedPayload()).toBeUndefined();
    expect(prisma.participant.findMany.mock.calls).toHaveLength(0);
  });

  it('does not advance the version counter, which carries no reorder broadcast', async () => {
    // Order is deliberately outside the versioned path: `USER_PREFERENCES_REORDERED`
    // carries no version and iOS `applyRemoteReorder` applies it ungated. Bumping
    // `version` here would advance a counter no broadcast delivers — the exact
    // half-contract `conversationPreferencesSync` exists to prevent.
    await put(JOINED_CONV_ID, { isPinned: true });
    await reorder([{ conversationId: JOINED_CONV_ID, orderInCategory: 5 }]);
    await put(JOINED_CONV_ID, { isMuted: true });

    const versions = env.emits
      .filter((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED)
      .map((e) => (e.payload as { version: number }).version);
    expect(versions).toEqual([1, 2]);
  });

  it('returns 500 when the store fails', async () => {
    prisma.userConversationPreferences.upsert.mockRejectedValueOnce(new Error('db crash') as never);

    const res = await reorder([{ conversationId: JOINED_CONV_ID, orderInCategory: 1 }]);

    expect(res.statusCode).toBe(500);
    expect(reorderedPayload()).toBeUndefined();
  });
});
