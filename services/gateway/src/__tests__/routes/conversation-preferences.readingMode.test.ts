/**
 * `readingMode` on `UserConversationPreferences` — LWS-3 / G-121.
 *
 * `readingMode` is the reading-mode PREFERENCE the user chose (`ReadingModePreference`,
 * `packages/shared/types/reading-modes.ts`: `auto|focal|script|resume|riviere`), stored
 * as a typed column on `UserConversationPreferences` (never a key/value entry — E9),
 * versioned and broadcast exactly like `isPinned`/`customName`/`reaction`.
 *
 * NOTE — ancrage divergent (à re-prouver, jamais à supposer, §0 workshop) : la
 * consigne de tâche cite l'énumération `auto|bubbles|focal|script|river`. Le
 * contrat gelé §3.1 (`tasks/lentille-implementation-contract.md:541`, mot pour
 * mot dans `packages/shared/types/reading-modes.ts` — `ReadingModePreferenceSchema`)
 * définit `ReadingModePreference` comme `auto|focal|script|resume|riviere` :
 * `'bubbles'` et `'summary'` (alias `'river'`/`'riviere'`) appartiennent à
 * `ConversationReadingMode` (le mode RENDU), pas à la préférence STOCKÉE. Ce
 * fichier suit le contrat gelé et réutilise son schéma Zod plutôt que de
 * dupliquer une énumération divergente en dur.
 *
 * AMENDEMENT S1 (REV-4bis/B2, 2026-08-17) — l'énumération porte désormais un
 * SIXIÈME mot, `bulles` (justification complète dans
 * `packages/shared/types/reading-modes.ts`). Ce fichier n'a rien eu à changer
 * pour l'absorber, et c'est précisément le point : ses cas paramétrés itèrent
 * `ReadingModePreferenceSchema.options`, jamais une copie littérale — la
 * discipline que la NOTE ci-dessus impose est ce qui rend l'amendement
 * couvert par construction. La route accepte `bulles` comme tout autre
 * membre ; côté loi, l'orchestrateur le rabat sur `focal`/`clamped-unavailable`
 * drapeau-on, `'bubbles'` n'appartenant à aucun catalogue hors branche
 * drapeau-éteint.
 *
 * @see tasks/lentille-implementation-contract.md LWS-3 (§"Préférence de mode de lecture")
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import conversationPreferencesRoutes from '../../routes/conversation-preferences';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { ReadingModePreferenceSchema } from '@meeshy/shared/types/reading-modes';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

type EmitCall = { event: string; payload: unknown };

/**
 * Live upsert store — a frozen `jest.fn()` resolution can't prove
 * "persists AND increments version" across two requests, since it would
 * simply replay whatever version the test hardcoded regardless of what the
 * route actually wrote. Mirrors `buildLivePrisma` in
 * `conversation-preferences-broadcast.test.ts`.
 */
const buildLivePrisma = () => {
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
      findFirst: jest.fn(async ({ where }: any) => ({ id: `participant-${where?.conversationId}` })),
      findMany: jest.fn(async () => []),
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
  app.decorate('socketIOHandler', { getManager: () => ({ io: fakeIO }) } as unknown);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
    };
  });
  await app.register(conversationPreferencesRoutes);
  await app.ready();
  return { app, emits, rooms };
};

const put = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'PUT', url: `/user-preferences/conversations/${CONV_ID}`, payload });

describe('PUT /user-preferences/conversations/:conversationId — readingMode', () => {
  let prisma: ReturnType<typeof buildLivePrisma>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildLivePrisma();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('persists readingMode and increments version', async () => {
    const first = await put(env.app, { readingMode: 'focal' });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.data.readingMode).toBe('focal');
    expect(firstBody.data.version).toBe(1);

    const second = await put(env.app, { readingMode: 'script' });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.data.readingMode).toBe('script');
    // The monotonic counter every client arbitrates on — a second write that
    // does not exceed the first would be a change no other device ever sees.
    expect(secondBody.data.version).toBe(2);
  });

  it('rejects a readingMode outside the enum with 400, before touching the db', async () => {
    const res = await put(env.app, { readingMode: 'not-a-mode' });
    expect(res.statusCode).toBe(400);
    expect(prisma.userConversationPreferences.upsert).not.toHaveBeenCalled();
    // The row must not exist afterwards — a rejected write is not a partial one.
    expect(prisma.rows.size).toBe(0);
  });

  it.each(ReadingModePreferenceSchema.options)('accepts the enum member %s', async (mode) => {
    const res = await put(env.app, { readingMode: mode });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.readingMode).toBe(mode);
  });

  it('a partial patch of another field never erases an existing readingMode', async () => {
    await put(env.app, { readingMode: 'focal' });

    const res = await put(env.app, { isPinned: true });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isPinned).toBe(true);
    // The field the guard protects: `readingMode` is untouched by a body that
    // never mentions it.
    expect(body.data.readingMode).toBe('focal');

    // And the upsert call itself never carried the field — the route must
    // filter it the same way it filters every other optional field, not rely
    // on Prisma silently ignoring an `undefined` value it never sent.
    const lastUpsertCall = (prisma.userConversationPreferences.upsert as jest.Mock).mock.calls.at(-1)?.[0] as {
      update?: Record<string, unknown>;
    };
    expect(lastUpsertCall?.update).toBeDefined();
    expect('readingMode' in (lastUpsertCall!.update as Record<string, unknown>)).toBe(false);
  });

  it('a request omitting readingMode entirely leaves it at its default on first write', async () => {
    const res = await put(env.app, { isMuted: true });
    expect(res.statusCode).toBe(200);
    // No stored row existed yet, so Prisma's own column default ("auto")
    // applies. The route echoes back whatever the (mocked, defaultless) store
    // returns for an absent key, which is `undefined` here — the guard under
    // test is that the route never wrote a competing value, not the DB default
    // itself (that belongs to G-120's schema test).
    const lastUpsertCall = (prisma.userConversationPreferences.upsert as jest.Mock).mock.calls.at(-1)?.[0] as {
      update?: Record<string, unknown>;
      create?: Record<string, unknown>;
    };
    expect('readingMode' in (lastUpsertCall!.update as Record<string, unknown>)).toBe(false);
    expect('readingMode' in (lastUpsertCall!.create as Record<string, unknown>)).toBe(false);
  });

  it('broadcasts readingMode to the user in the USER_PREFERENCES_UPDATED payload', async () => {
    const res = await put(env.app, { readingMode: 'script' });
    expect(res.statusCode).toBe(200);

    expect(env.rooms).toContain(ROOMS.user(USER_ID));
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: USER_ID,
      conversationId: CONV_ID,
      reset: false,
      preferences: expect.objectContaining({ readingMode: 'script' }),
    });
  });
});
