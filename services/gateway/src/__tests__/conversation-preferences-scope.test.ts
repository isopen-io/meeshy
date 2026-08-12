/**
 * `PUT /user-preferences/conversations/:conversationId` — write scope.
 *
 * The row this route upserts is keyed `(userId, conversationId)` and carries a
 * foreign key, `categoryId`, into `UserConversationCategory` — a per-USER,
 * private table. Both ids come from the caller. Neither was checked.
 *
 * Three of the four writers of `UserConversationPreferences` verify membership
 * with the same predicate before writing (`user-deletions.ts`, all three
 * routes: `{ conversationId, userId, isActive: true }`), and all six category
 * routes in `me/preferences/categories.ts` scope every read and write to
 * `{ id, userId }` under an explicit comment. This PUT did neither, which let
 * an authenticated caller:
 *
 *  - mint preference rows against conversations they are not in, and make the
 *    server broadcast `USER_PREFERENCES_UPDATED` for them; and
 *  - attach ANOTHER user's private category to their own row, after which the
 *    200 body — and every later GET, which also `include`s the relation —
 *    hands back that category's name, colour and icon. Category names are
 *    user-authored labels; this is a cross-tenant read.
 *
 * These tests assert through the public API (the response and a follow-up GET),
 * never through the store mock, so they describe what a caller can observe.
 */

import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import conversationPreferencesRoutes from '../routes/conversation-preferences';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';

const JOINED_CONV_ID = '507f1f77bcf86cd799439abc';
const FOREIGN_CONV_ID = '507f1f77bcf86cd7994390ff';

const OWN_CATEGORY_ID = '507f1f77bcf86cd799439c01';
const FOREIGN_CATEGORY_ID = '507f1f77bcf86cd799439c02';
const FOREIGN_CATEGORY_NAME = 'Divorce lawyer';

type EmitCall = { event: string; payload: unknown };

/**
 * Store that applies its writes, holds the participant rows the write scope is
 * derived from, and resolves `include: { category: true }` out of a category
 * table owned per user — the join that carries the disclosure.
 */
const buildLivePrisma = () => {
  const rows = new Map<string, Record<string, unknown>>();
  const categories = new Map<string, { id: string; userId: string; name: string; color: string | null; icon: string | null }>([
    [OWN_CATEGORY_ID, { id: OWN_CATEGORY_ID, userId: USER_ID, name: 'Work', color: '#112233', icon: 'briefcase' }],
    [FOREIGN_CATEGORY_ID, { id: FOREIGN_CATEGORY_ID, userId: OTHER_USER_ID, name: FOREIGN_CATEGORY_NAME, color: '#445566', icon: 'scale' }],
  ]);
  const joined = [JOINED_CONV_ID];

  const key = (where: any) => `${where.userId_conversationId.userId}:${where.userId_conversationId.conversationId}`;
  const applyVersion = (current: number, incoming: unknown): number =>
    typeof incoming === 'object' && incoming !== null && 'increment' in (incoming as object)
      ? current + ((incoming as { increment: number }).increment ?? 0)
      : typeof incoming === 'number'
        ? incoming
        : current;
  const withCategory = (row: Record<string, unknown>) => ({
    ...row,
    category: row.categoryId ? categories.get(row.categoryId as string) ?? null : null,
  });

  return {
    rows,
    participant: {
      findFirst: jest.fn(async ({ where }: any) =>
        where?.userId === USER_ID && where?.isActive === true && joined.includes(where?.conversationId)
          ? { id: `participant-${where.conversationId}` }
          : null
      ),
      findMany: jest.fn(async ({ where }: any) => {
        const wanted: string[] = where?.conversationId?.in ?? [];
        return wanted
          .filter((id) => joined.includes(id) && where.userId === USER_ID)
          .map((conversationId) => ({ conversationId }));
      }),
    },
    userConversationCategory: {
      findFirst: jest.fn(async ({ where }: any) => {
        const found = categories.get(where?.id);
        return found && found.userId === where?.userId ? { id: found.id } : null;
      }),
    },
    userConversationPreferences: {
      findUnique: jest.fn(async ({ where }: any) => {
        const row = rows.get(key(where));
        return row ? withCategory(row) : null;
      }),
      findMany: jest.fn(async () => [...rows.values()].map(withCategory)),
      count: jest.fn(async () => rows.size),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        const { version: createVersion, ...createRest } = create ?? {};
        const { version: updateVersion, ...updateRest } = update ?? {};
        const next = existing
          ? { ...existing, ...updateRest, version: applyVersion(existing.version as number, updateVersion) }
          : { id: `pref-${k}`, ...createRest, version: applyVersion(0, createVersion) };
        rows.set(k, next);
        return withCategory(next);
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

describe('PUT /user-preferences/conversations/:conversationId — write scope', () => {
  let prisma: ReturnType<typeof buildLivePrisma>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildLivePrisma();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  const put = (conversationId: string, payload: Record<string, unknown>) =>
    env.app.inject({ method: 'PUT', url: `/user-preferences/conversations/${conversationId}`, payload });

  const readPreferences = async (conversationId: string) => {
    const res = await env.app.inject({
      method: 'GET',
      url: `/user-preferences/conversations/${conversationId}`,
    });
    return res.json().data as Record<string, unknown>;
  };

  const updatedPayloads = () =>
    env.emits.filter((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);

  describe('the conversation must be one the caller is in', () => {
    it('writes and broadcasts for a conversation the caller participates in', async () => {
      // Non-regression lock for the nominal path: the scope check must not
      // narrow what a legitimate client can already do.
      const res = await put(JOINED_CONV_ID, { isPinned: true });

      expect(res.statusCode).toBe(200);
      expect(await readPreferences(JOINED_CONV_ID)).toMatchObject({ isPinned: true, isDefault: false });
      expect(updatedPayloads()).toHaveLength(1);
    });

    it('refuses a conversation the caller does not participate in', async () => {
      const res = await put(FOREIGN_CONV_ID, { isPinned: true });

      expect(res.statusCode).toBe(403);
    });

    it('mints no row for a conversation the caller does not participate in', async () => {
      await put(FOREIGN_CONV_ID, { isPinned: true, customName: 'planted' });

      expect(await readPreferences(FOREIGN_CONV_ID)).toMatchObject({ isDefault: true, customName: null });
    });

    it('broadcasts nothing for a conversation the caller does not participate in', async () => {
      await put(FOREIGN_CONV_ID, { isPinned: true });

      expect(updatedPayloads()).toHaveLength(0);
    });
  });

  describe("the category must be one the caller owns", () => {
    it('attaches a category the caller owns', async () => {
      const res = await put(JOINED_CONV_ID, { categoryId: OWN_CATEGORY_ID });

      expect(res.statusCode).toBe(200);
      expect(await readPreferences(JOINED_CONV_ID)).toMatchObject({ categoryId: OWN_CATEGORY_ID });
    });

    it("refuses a category belonging to another user", async () => {
      const res = await put(JOINED_CONV_ID, { categoryId: FOREIGN_CATEGORY_ID });

      expect(res.statusCode).toBe(404);
    });

    it("never discloses another user's category through the response body", async () => {
      const res = await put(JOINED_CONV_ID, { categoryId: FOREIGN_CATEGORY_ID });

      expect(res.body).not.toContain(FOREIGN_CATEGORY_NAME);
    });

    it("does not attach another user's category, so later reads cannot leak it either", async () => {
      await put(JOINED_CONV_ID, { categoryId: FOREIGN_CATEGORY_ID });

      const stored = await readPreferences(JOINED_CONV_ID);
      expect(stored.categoryId ?? null).toBeNull();
      expect(stored.category ?? null).toBeNull();
    });

    it('still allows uncategorizing with an explicit null', async () => {
      await put(JOINED_CONV_ID, { categoryId: OWN_CATEGORY_ID });

      const res = await put(JOINED_CONV_ID, { categoryId: null });

      expect(res.statusCode).toBe(200);
      expect(await readPreferences(JOINED_CONV_ID)).toMatchObject({ categoryId: null });
    });

    it('does not look a category up when the write does not carry one', async () => {
      await put(JOINED_CONV_ID, { isMuted: true });

      expect(prisma.userConversationCategory.findFirst.mock.calls).toHaveLength(0);
    });
  });
});

describe('POST /user-preferences/reorder — batch bound', () => {
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

  const batchOf = (size: number) =>
    Array.from({ length: size }, (_, i) => ({ conversationId: JOINED_CONV_ID, orderInCategory: i }));

  it('accepts a batch at the bound', async () => {
    const res = await reorder(batchOf(200));

    expect(res.statusCode).toBe(200);
  });

  it('rejects a batch past the bound before touching the store', async () => {
    const res = await reorder(batchOf(201));

    expect(res.statusCode).toBe(400);
    expect(prisma.participant.findMany.mock.calls).toHaveLength(0);
    expect(prisma.userConversationPreferences.upsert.mock.calls).toHaveLength(0);
  });
});
