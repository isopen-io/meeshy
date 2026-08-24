/**
 * Unit tests for conversations ban/unban routes (ban.ts)
 * Tests PATCH /conversations/:id/participants/:userId/ban,
 * PATCH /conversations/:id/participants/:userId/unban.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockInvalidateParticipantLookup = jest.fn();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: (...args: any[]) => mockInvalidateParticipantLookup(...args),
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerBanRoutes } from '../../../../routes/conversations/ban';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, userId: null };
    }
  };
}

function makePrisma(opts: {
  currentRole?: string;
  targetRole?: string;
  targetBannedAt?: Date | null;
  currentExists?: boolean;
  targetExists?: boolean;
} = {}) {
  const {
    currentRole = 'admin',
    targetRole = 'member',
    targetBannedAt = null,
    currentExists = true,
    targetExists = true,
  } = opts;

  return {
    participant: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce(
          currentExists
            ? { id: 'part-curr', role: currentRole }
            : null
        )
        .mockResolvedValueOnce(
          targetExists
            ? { id: 'part-tgt', userId: TARGET_ID, role: targetRole, bannedAt: targetBannedAt, displayName: 'Bob' }
            : null
        ),
      update: jest.fn<any>().mockResolvedValue({}),
      // Membres actifs APRÈS l'écriture : ils nomment les rooms personnelles de
      // la diffusion et portent l'effectif absolu du payload.
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'part-curr', userId: 'user-curr' },
        { id: 'part-anon', userId: null },
      ]),
    },
  };
}

/**
 * Records the socket side effects of a membership transition IN ORDER.
 *
 * Ordering matters both ways and is the whole contract: ban must broadcast
 * BEFORE evicting the target's sockets (else the banned user never learns they
 * were banned), and unban must re-join them BEFORE broadcasting (else the
 * unbanned user — evicted at ban time — never learns they were unbanned).
 * A mock that only counts calls cannot express that, which is why the previous
 * `withSocket` mock (assert-nothing, `mockReturnThis`) let the missing re-join
 * survive.
 */
function makeSocketRecorder() {
  const order: string[] = [];
  const emits: { room: string; rooms: string[]; event: string; payload: any }[] = [];
  const leftRooms: string[] = [];

  // `.to()` CHAÎNE, comme le vrai : `emitToConversationParticipants` écrit
  // `io.to(fil).to(perso1).to(perso2).emit(...)` pour ne livrer qu'une copie par
  // socket. `room` retenu ci-dessous reste la PREMIÈRE room de la chaîne (le
  // fil), et `rooms` porte la chaîne entière.
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: any) => {
      order.push(`emit:${event}`);
      emits.push({ room: rooms[0], rooms, event, payload });
    },
  });

  const io = {
    to: (room: string) => chain([room]),
    in: (_room: string) => ({
      fetchSockets: async () => [
        {
          leave: (room: string) => {
            order.push(`leave:${room}`);
            leftRooms.push(room);
          },
        },
      ],
    }),
  };

  const joinUserToConversationRoom = jest.fn<any>(async (_userId: string, conversationId: string) => {
    order.push(`join:conversation:${conversationId}`);
  });

  const manager = {
    getIO: () => io,
    invalidateParticipantCache: jest.fn(),
    joinUserToConversationRoom,
  };

  return { order, emits, leftRooms, joinUserToConversationRoom, manager };
}

type SocketRecorder = ReturnType<typeof makeSocketRecorder>;

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  socket?: SocketRecorder;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), socket } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  if (socket) {
    app.decorate('socketIOHandler', { getManager: jest.fn(() => socket.manager) });
  } else {
    app.decorate('socketIOHandler', null as any);
  }

  registerBanRoutes(app, prisma as any, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

// ─── PATCH /conversations/:id/participants/:userId/ban ────────────────────────

describe('PATCH ban — current user not in conversation', () => {
  it('returns 404 when caller is not a participant', async () => {
    const app = await buildApp({ prisma: makePrisma({ currentExists: false }) });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH ban — target not found', () => {
  it('returns 404 when target participant does not exist', async () => {
    const app = await buildApp({ prisma: makePrisma({ targetExists: false }) });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH ban — already banned', () => {
  it('returns 400 when target is already banned', async () => {
    const app = await buildApp({ prisma: makePrisma({ targetBannedAt: new Date() }) });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH ban — insufficient rank', () => {
  it('returns 403 when caller rank is not higher than target', async () => {
    const app = await buildApp({ prisma: makePrisma({ currentRole: 'member', targetRole: 'member' }) });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PATCH ban — success', () => {
  it('returns 200 when admin bans a member', async () => {
    const app = await buildApp({ prisma: makePrisma({ currentRole: 'admin', targetRole: 'member' }) });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH ban — success with socket events', () => {
  it('returns 200 and emits ban event', async () => {
    const socket = makeSocketRecorder();
    const app = await buildApp({ prisma: makePrisma(), socket });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(socket.emits.map(e => e.event)).toContain('conversation:participant-banned');
    await app.close();
  });

  it('evicts the banned user sockets from the conversation room AFTER broadcasting', async () => {
    const socket = makeSocketRecorder();
    const app = await buildApp({ prisma: makePrisma(), socket });
    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });

    expect(socket.leftRooms).toEqual(['conversation:conv-resolved-id']);
    expect(socket.order).toEqual([
      'emit:conversation:participant-banned',
      'leave:conversation:conv-resolved-id',
    ]);
    await app.close();
  });
});

describe('PATCH ban — participant lookup cache invalidation', () => {
  it('invalidates the cached participant lookup for the banned target', async () => {
    mockInvalidateParticipantLookup.mockClear();
    const app = await buildApp({ prisma: makePrisma() });
    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith('part-tgt', 'conv-resolved-id');
    await app.close();
  });
});

// ─── PATCH /conversations/:id/participants/:userId/unban ──────────────────────

describe('PATCH unban — current user not in conversation', () => {
  it('returns 404 when caller is not a participant', async () => {
    const prisma = {
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH unban — insufficient rank', () => {
  it('returns 403 when caller is not admin or creator', async () => {
    const prisma = {
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce({ id: 'part-curr', role: 'member' })
          .mockResolvedValueOnce({ id: 'part-tgt', userId: TARGET_ID , bannedAt: new Date('2026-08-01T00:00:00.000Z') }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PATCH unban — target not banned', () => {
  it('returns 404 when target has no bannedAt', async () => {
    const prisma = {
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce({ id: 'part-curr', role: 'admin' })
          .mockResolvedValueOnce(null), // no banned participant found
        update: jest.fn<any>().mockResolvedValue({}),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

function makeUnbanPrisma() {
  return {
    participant: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce({ id: 'part-curr', role: 'admin' })
        .mockResolvedValueOnce({ id: 'part-tgt', userId: TARGET_ID , bannedAt: new Date('2026-08-01T00:00:00.000Z') }),
      update: jest.fn<any>().mockResolvedValue({}),
      // Membres actifs APRÈS la levée : la cible réintégrée en fait partie,
      // c'est ce qui lui vaut d'être adressée sur sa room personnelle.
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'part-curr', userId: 'user-curr' },
        { id: 'part-tgt', userId: TARGET_ID },
      ]),
    },
  };
}

describe('PATCH unban — success', () => {
  it('returns 200 when admin unbans a participant', async () => {
    const app = await buildApp({ prisma: makeUnbanPrisma() });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH unban — restores live room membership', () => {
  it('re-joins the unbanned user connected sockets to the conversation room', async () => {
    const socket = makeSocketRecorder();
    const app = await buildApp({ prisma: makeUnbanPrisma(), socket });
    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });

    // The exact inverse of the ban eviction. Without it the unbanned user stays
    // outside `conversation:<id>` until a reconnect: no live message:new, and —
    // because the delivery queue skips anyone `connectedUsers` reports online —
    // no offline replay either, so messages sent meanwhile are lost to them.
    expect(socket.joinUserToConversationRoom).toHaveBeenCalledWith(TARGET_ID, 'conv-resolved-id');
    await app.close();
  });

  it('re-joins BEFORE broadcasting so the unbanned user receives their own unban event', async () => {
    const socket = makeSocketRecorder();
    const app = await buildApp({ prisma: makeUnbanPrisma(), socket });
    await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });

    // `conversation:participant-unbanned` is broadcast to the conversation room
    // only — the one room the ban evicted the target from. Emitting before the
    // re-join means the person being unbanned is the single participant who
    // never hears about it.
    expect(socket.order).toEqual([
      'join:conversation:conv-resolved-id',
      'emit:conversation:participant-unbanned',
    ]);
    await app.close();
  });

  it('still broadcasts the unban when the room re-join fails', async () => {
    const socket = makeSocketRecorder();
    socket.joinUserToConversationRoom.mockRejectedValueOnce(new Error('adapter down'));
    const app = await buildApp({ prisma: makeUnbanPrisma(), socket });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(socket.emits.map(e => e.event)).toEqual(['conversation:participant-unbanned']);
    await app.close();
  });
});
