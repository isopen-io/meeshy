/**
 * Bannir puis débannir quelqu'un QUI ÉTAIT DÉJÀ PARTI le faisait rentrer.
 *
 * `PATCH …/ban` cherche sa cible sans filtrer `isActive` — délibérément : on
 * bannit un ancien membre précisément pour qu'il ne revienne pas par un lien de
 * partage (`resolveConversationEntry` refuse sur `bannedAt`). Mais il écrivait
 * ensuite `{ isActive: false, leftAt: now }` sans condition, écrasant la date
 * d'un départ vieux de plusieurs mois ; et `PATCH …/unban` écrivait
 * `{ isActive: true, leftAt: null }` tout aussi inconditionnellement.
 *
 * Composées, les deux moitiés font du débannissement une QUATRIÈME porte
 * d'entrée dans la conversation — la seule qui n'obéisse pas à
 * `resolveConversationEntry`, qui n'accorde ni rang ni permissions neufs, et
 * qui rebranche de force les sockets de quelqu'un qui était parti de lui-même.
 *
 * Le double Prisma de ce fichier DISCRIMINE sur le `where` ET projette sur le
 * `select` : un double qui rend la même ligne complète quel que soit l'appel
 * laisserait passer exactement le défaut mesuré ici, puisque la route ne
 * pourrait pas lire les champs qu'elle a oublié de demander.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue('conv-resolved-id'),
}));

const mockInvalidateParticipantLookup = jest.fn();
jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: (...args: unknown[]) => mockInvalidateParticipantLookup(...args),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_PARTICIPANT_BANNED: 'conversation:participant-banned',
    CONVERSATION_PARTICIPANT_UNBANNED: 'conversation:participant-unbanned',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

import { registerBanRoutes } from '../../../../routes/conversations/ban';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CALLER_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const RESOLVED_CONV_ID = 'conv-resolved-id';

const LEFT_LONG_AGO = new Date('2026-01-04T09:30:00.000Z');
const BANNED_AT = new Date('2026-06-15T18:00:00.000Z');

type ParticipantRow = {
  id: string;
  // Le `select` de production demande `userId` et `shareLinkId` depuis que la
  // cible se résout sous les DEUX colonnes (un visiteur sans compte n'a que son
  // `Participant.id`). Un double qui ne les porte pas ferait passer pour un
  // anonyme un membre qui n'en est pas un.
  userId?: string | null;
  shareLinkId?: string | null;
  role?: string;
  displayName?: string;
  isActive?: boolean;
  leftAt?: Date | null;
  bannedAt?: Date | null;
};

/**
 * Rend la ligne demandée par le `where`, PROJETÉE sur le `select`.
 *
 * La projection est ce qui donne sa valeur au harnais : elle rend un champ
 * indisponible à la route tant que la route ne l'a pas demandé, exactement
 * comme Prisma. Sans elle, « la route lit `leftAt` » serait vrai dans le test
 * et faux en production.
 */
function makeDiscriminatingPrisma(rows: { caller: ParticipantRow | null; target: ParticipantRow | null }) {
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];

  const project = (row: ParticipantRow | null, select?: Record<string, boolean>) => {
    if (!row) return null;
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.keys(select)
        .filter((key) => select[key])
        .map((key) => [key, (row as Record<string, unknown>)[key]])
    );
  };

  return {
    updates,
    participant: {
      findFirst: jest.fn<any>(async (args: any) => {
        const where = args?.where ?? {};
        if (where.userId === CALLER_ID) return project(rows.caller, args?.select);
        if (where.userId !== TARGET_ID) return null;
        // `unban` ne cherche que parmi les bannis.
        if (where.bannedAt?.not === null && rows.target?.bannedAt == null) return null;
        return project(rows.target, args?.select);
      }),
      update: jest.fn<any>(async (args: any) => {
        updates.push({ where: args.where, data: args.data });
        return {};
      }),
      // Membres actifs APRÈS l'écriture : ils nomment les rooms personnelles de
      // la diffusion et portent l'effectif absolu du payload. La cible n'y
      // figure que si l'appartenance lui a été rendue.
      findMany: jest.fn<any>(async () => [{ id: 'part-caller', userId: CALLER_ID }]),
    },
  };
}

function makeSocketRecorder() {
  const emits: { room: string; rooms: string[]; event: string; payload: any }[] = [];
  const joinUserToConversationRoom = jest.fn<any>(async () => undefined);

  // `.to()` CHAÎNE : `emitToConversationParticipants` écrit
  // `io.to(fil).to(perso…).emit(...)` pour ne livrer qu'une copie par socket.
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: any) => emits.push({ room: rooms[0], rooms, event, payload }),
  });

  const io = {
    to: (room: string) => chain([room]),
    in: (_room: string) => ({ fetchSockets: async () => [{ leave: () => undefined }] }),
  };

  return {
    emits,
    joinUserToConversationRoom,
    manager: {
      getIO: () => io,
      invalidateParticipantCache: jest.fn(),
      joinUserToConversationRoom,
    },
  };
}

async function buildApp(prisma: any, socket: ReturnType<typeof makeSocketRecorder>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: CALLER_ID,
      registeredUser: { id: CALLER_ID, role: 'USER' },
    };
  };
  app.decorate('socketIOHandler', { getManager: jest.fn(() => socket.manager) });
  registerBanRoutes(app, prisma as any, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

const ADMIN_CALLER: ParticipantRow = { id: 'part-caller', role: 'admin' };

// ─── Bannir quelqu'un qui est déjà parti ──────────────────────────────────────

describe('PATCH ban — la cible avait déjà quitté la conversation', () => {
  it("n'écrase pas la date de son départ", async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, role: 'member', displayName: 'Bob', isActive: false, leftAt: LEFT_LONG_AGO, bannedAt: null },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban` });

    expect(res.statusCode).toBe(200);
    expect(prisma.updates).toHaveLength(1);
    expect(Object.keys(prisma.updates[0].data)).toEqual(['bannedAt']);
    await app.close();
  });

  it('annonce que le bannissement ne retire aucune appartenance', async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, role: 'member', displayName: 'Bob', isActive: false, leftAt: LEFT_LONG_AGO, bannedAt: null },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban` });

    // Sans ce champ, tout client qui décrémente son compteur de membres sur
    // `participant-banned` le décrémente pour quelqu'un qui n'y était plus.
    expect(socket.emits[0].event).toBe('conversation:participant-banned');
    expect(socket.emits[0].payload.membershipEnded).toBe(false);
    await app.close();
  });
});

describe('PATCH ban — la cible est un membre actif', () => {
  it('la sort de la conversation et le dit', async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, role: 'member', displayName: 'Bob', isActive: true, leftAt: null, bannedAt: null },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban` });

    expect(prisma.updates[0].data).toEqual(
      expect.objectContaining({ isActive: false, leftAt: expect.any(Date), bannedAt: expect.any(Date) })
    );
    expect(prisma.updates[0].data.leftAt).toEqual(prisma.updates[0].data.bannedAt);
    expect(socket.emits[0].payload.membershipEnded).toBe(true);
    await app.close();
  });
});

// ─── Débannir ─────────────────────────────────────────────────────────────────

describe("PATCH unban — la personne était partie AVANT d'être bannie", () => {
  it('lève le bannissement sans la réintégrer', async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, isActive: false, leftAt: LEFT_LONG_AGO, bannedAt: BANNED_AT },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban` });

    expect(res.statusCode).toBe(200);
    expect(prisma.updates).toHaveLength(1);
    expect(prisma.updates[0].data).toEqual({ bannedAt: null });
    await app.close();
  });

  it('ne rebranche pas ses sockets sur une conversation quittée', async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, isActive: false, leftAt: LEFT_LONG_AGO, bannedAt: BANNED_AT },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban` });

    expect(socket.joinUserToConversationRoom).not.toHaveBeenCalled();
    await app.close();
  });

  it('annonce que rien n\'a été réintégré', async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, isActive: false, leftAt: LEFT_LONG_AGO, bannedAt: BANNED_AT },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban` });

    expect(socket.emits.map((e) => e.event)).toEqual(['conversation:participant-unbanned']);
    expect(socket.emits[0].payload.membershipRestored).toBe(false);
    await app.close();
  });
});

describe('PATCH unban — la mémoire courte du chemin d\'envoi', () => {
  it("oublie la ligne mise en cache, comme le bannissement le fait", async () => {
    // `participant-lookup-cache` mémorise `isActive` pendant 30 s pour éviter
    // une lecture par message envoyé. Le bannissement l'invalide ; le
    // débannissement ne le faisait pas : pendant une demi-minute, la personne
    // réintégrée restait `isActive: false` pour le chemin d'envoi, et chacun de
    // ses messages était refusé sans qu'aucune ligne en base ne le justifie.
    mockInvalidateParticipantLookup.mockClear();
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, isActive: false, leftAt: BANNED_AT, bannedAt: BANNED_AT },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban` });

    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith('part-tgt', RESOLVED_CONV_ID);
    await app.close();
  });
});

describe("PATCH unban — le bannissement avait mis fin à l'appartenance", () => {
  it('la rend, et rebranche les sockets', async () => {
    const prisma = makeDiscriminatingPrisma({
      caller: ADMIN_CALLER,
      target: { id: 'part-tgt', userId: TARGET_ID, isActive: false, leftAt: BANNED_AT, bannedAt: BANNED_AT },
    });
    const socket = makeSocketRecorder();
    const app = await buildApp(prisma, socket);

    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban` });

    expect(prisma.updates[0].data).toEqual({ bannedAt: null, isActive: true, leftAt: null });
    expect(socket.joinUserToConversationRoom).toHaveBeenCalledWith(TARGET_ID, RESOLVED_CONV_ID);
    expect(socket.emits[0].payload.membershipRestored).toBe(true);
    await app.close();
  });
});
