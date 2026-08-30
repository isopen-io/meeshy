/**
 * `UserConversationPreferences` is a per-USER row whose whole point is to be
 * the same on every device that user is signed in on. `clear-history` writes
 * `clearHistoryBefore` there and owes this file's contract in full — bump
 * `version` (every client drops `incoming.version <= local`) AND broadcast
 * the snapshot (a bump nobody receives changes nothing).
 *
 * `delete-for-me` and `restore-for-me` used to be the other two writers of
 * this table (`deletedForUserAt`) — until #4332 found that the column they
 * wrote was read by NOTHING a real client ever triggers: the corbeille
 * (`restore-for-me`, `GET .../deleted-conversations`) reads
 * `Participant.deletedForMe`, and the only route that ever wrote
 * `deletedForUserAt` had no caller on any of the three clients. Both routes
 * now read/write `Participant.deletedForMe` instead — the column the
 * CANONICAL delete route (`routes/conversations/delete-for-me.ts`) already
 * writes — and this file's remaining delete-for-me/restore-for-me tests pin
 * THAT contract: delete-for-me still tells the user's other devices via
 * `CONVERSATION_DELETED` (a plain event, not a versioned preferences
 * snapshot); restore-for-me does not yet broadcast anything — a documented
 * gap (closing it needs a new event name in
 * `packages/shared/types/socketio-events.ts`, a carrefour file outside this
 * lot's territory), not a silent regression.
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

  // #4332 — Participant VIVANT, comme les préférences ci-dessous : delete-for-me
  // écrit `deletedForMe`/`isActive` sur cette ligne, restore-for-me la relit
  // PUIS la réécrit. Une réponse figée masquerait la panne exacte que ce lot
  // corrige — la corbeille ne reflétant jamais ce que le delete vient d'écrire.
  let participantRow = {
    id: 'part-1',
    userId: USER_ID,
    conversationId: CONV_ID,
    isActive: true,
    role: 'member',
    deletedForMe: null as Date | null,
    conversation: { isActive: true },
  };

  return {
    rows,
    participant: {
      findFirst: jest.fn(async () => ({ ...participantRow })),
      update: jest.fn(async ({ data }: any) => {
        participantRow = { ...participantRow, ...data };
        return { ...participantRow };
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
  // #4332 — `performConversationDeleteForMe` (désormais appelée par
  // delete-for-me) appelle `endConversationMembership` (`io.in(room).fetchSockets()`)
  // en plus de son propre `io.to(room).emit(...)` : `to`/`in` doivent donc être
  // CHAÎNABLES (`return fakeIO`), comme le double éprouvé de
  // `conversations/delete-for-me.test.ts` (`makeMockIO`). `broadcastToUser`
  // (utilisé par `writeConversationPreferences` pour clear-history), lui,
  // tolère aussi `getManager().io` / `.io` — voir `utils/socket-broadcast.ts` —
  // mais `getIO` doit ici être une MÉTHODE, pas une propriété, sans quoi la
  // branche socket du delete est sautée silencieusement (`if (io)` ne rentre
  // jamais) et personne n'apprend la clôture.
  const fakeIO: {
    to: (room: string) => typeof fakeIO;
    in: (room: string) => typeof fakeIO;
    emit: (event: string, payload: unknown) => void;
    fetchSockets: () => Promise<Array<{ leave: () => void }>>;
  } = {
    to: (room: string) => {
      rooms.push(room);
      return fakeIO;
    },
    in: (room: string) => {
      rooms.push(room);
      return fakeIO;
    },
    emit: (event: string, payload: unknown) => {
      emits.push({ event, payload });
    },
    fetchSockets: async () => [],
  };

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as unknown);
  app.decorate('socketIOHandler', {
    getManager: () => ({
      getIO: () => fakeIO,
      invalidateParticipantCache: () => {},
      endLiveLocationForDepartedMember: () => {},
      endCallParticipationForDepartedMember: async () => {},
    }),
  } as any);
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

  it('delete-for-me tells the user other devices the conversation is gone (#4332 — via CONVERSATION_DELETED, not a preferences snapshot)', async () => {
    const res = await deleteForMe();
    expect(res.statusCode).toBe(200);

    expect(env.rooms).toContain(ROOMS.user(USER_ID));
    // #4332 — delete-for-me n'écrit plus `UserConversationPreferences` : la
    // colonne que la corbeille lit (`Participant.deletedForMe`) est portée
    // par ce même événement, celui qu'iOS `ConversationStore.applyConversationDeleted`
    // consomme réellement — pas par `USER_PREFERENCES_UPDATED`, qu'aucun
    // appelant réel n'a jamais déclenché pour ce geste.
    const deletedEmission = env.emits.find((e) => e.event === SERVER_EVENTS.CONVERSATION_DELETED);
    expect(deletedEmission).toBeDefined();
    expect(deletedEmission?.payload).toEqual({ userId: USER_ID, conversationId: CONV_ID });
    expect(prefEmissions()).toHaveLength(0);
  });

  it('restore-for-me tells the user other devices the conversation is back (#4344 — via CONVERSATION_RESTORED, the exact mirror of CONVERSATION_DELETED)', async () => {
    const deleteRes = await deleteForMe();
    expect(deleteRes.statusCode).toBe(200);

    const res = await restoreForMe();
    expect(res.statusCode).toBe(200);

    // #4332 avait corrigé la LECTURE/ÉCRITURE (`Participant.deletedForMe`) et
    // LAISSÉ la diffusion, faute d'un événement nommé dans le fichier-carrefour
    // `packages/shared/types/socketio-events.ts`. Ce témoin FIGEAIT cette
    // absence — `expect(env.emits.length).toBe(emitsAfterDelete)` — en disant
    // sur place pourquoi : « pour qu'elle reste un suivi VISIBLE, jamais une
    // régression supposée résolue en silence ».
    //
    // #4344 déclare `CONVERSATION_RESTORED` et le diffuse. Le piège a donc
    // fonctionné comme prévu : il est tombé le jour où le trou s'est refermé,
    // et il a obligé ce lot à le constater plutôt qu'à croire à une
    // régression. Il bascule ici du NÉGATIF au POSITIF, et devient le miroir
    // exact du témoin `delete-for-me` ci-dessus — même room, même forme de
    // charge, sens inverse.
    expect(env.rooms).toContain(ROOMS.user(USER_ID));

    const restoredEmission = env.emits.find((e) => e.event === SERVER_EVENTS.CONVERSATION_RESTORED);
    expect(restoredEmission).toBeDefined();
    expect(restoredEmission?.payload).toEqual({ userId: USER_ID, conversationId: CONV_ID });

    // La restauration ne passe PAS par un instantané de préférences, pour la
    // raison exacte qui vaut à la suppression (cf. témoin précédent) : la
    // colonne que la corbeille lit est `Participant.deletedForMe`, et c'est
    // l'événement nommé qui la porte — jamais `USER_PREFERENCES_UPDATED`.
    expect(prefEmissions()).toHaveLength(0);
  });

  it('clear-history broadcasts the cutoff the other devices must hide behind', async () => {
    const beforeDate = '2026-08-01T10:00:00.000Z';
    const res = await clearHistory(beforeDate);
    expect(res.statusCode).toBe(200);

    const [emission] = prefEmissions();
    expect(emission).toBeDefined();
    expect(emission.preferences?.clearHistoryBefore).toBe(beforeDate);
  });

  it('keeps versions strictly increasing across preference writers even when deletion routes run in between (#4332)', async () => {
    await put({ isPinned: true });
    await deleteForMe();
    await restoreForMe();
    await clearHistory('2026-08-01T10:00:00.000Z');
    await put({ isMuted: true });

    // #4332 — delete-for-me/restore-for-me ne touchent plus
    // `UserConversationPreferences` : seuls les DEUX `put` et le
    // `clear-history` émettent sur ce canal désormais (3, pas 5). Ce que ce
    // témoin garde : leur passage NE PERTURBE PAS la séquence de version des
    // écrivains qui restent sur cette table.
    const versions = prefEmissions().map((e) => e.version);
    expect(versions).toHaveLength(3);
    versions.forEach((version, index) => {
      if (index > 0) expect(version).toBeGreaterThan(versions[index - 1]);
    });
  });

  it('a plain preference write after delete-for-me never touches deletedForUserAt — the two tables are unrelated now (#4332)', async () => {
    await deleteForMe();
    await put({ isPinned: true });

    // #4332 retire delete-for-me/restore-for-me de ce mécanisme : la ligne
    // `UserConversationPreferences` de ce couple (user, conversation) n'a
    // donc jamais existé avant ce `put`, et `deletedForUserAt` y reste à son
    // défaut `null` — la corbeille vit désormais entièrement sur
    // `Participant.deletedForMe`, une table différente.
    const [pinned] = prefEmissions();
    expect(pinned.preferences?.isPinned).toBe(true);
    expect(pinned.preferences?.deletedForUserAt).toBeNull();
  });

  it('emits nothing when the caller is not a member', async () => {
    prisma.participant.findFirst.mockResolvedValueOnce(null as never);
    const res = await deleteForMe();

    // #4332 — l'alias délègue à `performConversationDeleteForMe`, qui répond
    // 404 (comme la route canonique) plutôt que le 403 qu'il posait seul.
    expect(res.statusCode).toBe(404);
    expect(prefEmissions()).toHaveLength(0);
  });

  it('emits nothing when restoring a conversation that was never deleted', async () => {
    const res = await restoreForMe();

    expect(res.statusCode).toBe(400);
    expect(prefEmissions()).toHaveLength(0);
  });
});
