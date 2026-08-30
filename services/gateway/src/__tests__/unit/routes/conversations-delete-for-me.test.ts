/**
 * Unit tests for conversations/delete-for-me.ts
 * Tests DELETE /conversations/:id/delete-for-me
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (must be hoisted before imports) ──────────────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue(null),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
    CONVERSATION_DELETED: 'conversation:deleted',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerDeleteForMeRoutes } from '../../../routes/conversations/delete-for-me';
import { resolveConversationId } from '../../../utils/conversation-id-cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const SUCCESSOR_ID = '507f1f77bcf86cd799439044';
const SUCCESSOR_USER_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSocketIO() {
  const mockLeave = jest.fn<any>();
  const mockEmit = jest.fn<any>();
  const mockFetchSockets = jest.fn<any>().mockResolvedValue([{ leave: mockLeave }]);
  const mockIo = {
    to: jest.fn<any>().mockReturnValue({ emit: mockEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: mockFetchSockets }),
    _emit: mockEmit,
    _leave: mockLeave,
  };
  const mockManager = {
    getIO: jest.fn<any>().mockReturnValue(mockIo),
    invalidateParticipantCache: jest.fn<any>(),
    endLiveLocationForDepartedMember: jest.fn<any>(),
  };
  return { mockIo, mockManager, mockFetchSockets, mockEmit, mockLeave };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      ...(overrides.participant ?? {}),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      // Default: not a genuinely-empty direct DM — the `count` guard query
      // filters `type: 'direct'` itself, so a 'group' conversation resolves
      // to 0 here regardless.
      count: jest.fn<any>().mockResolvedValue(0),
      ...(overrides.conversation ?? {}),
    },
    // La clôture (ou la promotion du successeur) et le masquage de l'appelant
    // committent ensemble (cycle 69).
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
    ...(overrides.$transaction ? { $transaction: overrides.$transaction } : {}),
  };
}

async function buildApp({
  prismaOverrides = {} as Record<string, any>,
  socketIOHandler = null as any,
} = {}): Promise<{
  app: FastifyInstance;
  prisma: ReturnType<typeof makePrisma>;
  socket: ReturnType<typeof makeSocketIO>;
}> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma(prismaOverrides);
  const socket = makeSocketIO();

  app.decorate('socketIOHandler', socketIOHandler !== null
    ? socketIOHandler
    : { getManager: () => socket.mockManager });

  const requiredAuth = async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerDeleteForMeRoutes(app, prisma as any, null, requiredAuth);
  await app.ready();
  return { app, prisma, socket };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DELETE /conversations/:id/delete-for-me — participant not found', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 404 when user is not a participant', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /conversations/:id/delete-for-me — regular member', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'member',
            isActive: true,
          }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 for a regular member', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls participant.update with deletedForMe and isActive=false', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARTICIPANT_ID },
        data: expect.objectContaining({ isActive: false }),
      })
    );
  });

  it("éteint le partage de position de l'appelant — le fil VIT sans lui, et il n'a plus le pouvoir de l'arrêter", () => {
    // Supprimer le fil pour soi met fin à l'appartenance sans fermer le fil :
    // `location:live-stop` la résout avant tout (`isActive: true`) et tombe donc
    // en silence, tandis que les membres restants gardent l'épingle en room.
    expect(socket.mockManager.endLiveLocationForDepartedMember).toHaveBeenCalledWith(
      CONV_ID,
      USER_ID
    );
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with a successor', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            }),
          findMany: jest.fn<any>().mockResolvedValue([
            { joinedAt: new Date('2026-01-01T00:00:00.000Z'),
              id: SUCCESSOR_ID,
              userId: SUCCESSOR_USER_ID,
              role: 'moderator',
              isActive: true,
            },
          ]),update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 when creator transfers to the elected successor', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('promotes the elected successor to creator role', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SUCCESSOR_ID },
        data: { role: 'creator' },
      })
    );
  });

  it('emits PARTICIPANT_ROLE_UPDATED socket event', async () => {
    expect(socket.mockEmit).toHaveBeenCalledWith(
      'participant:role-updated',
      expect.objectContaining({ userId: SUCCESSOR_USER_ID, newRole: 'creator' })
    );
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator, empty direct DM', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, userId: USER_ID, conversationId: CONV_ID,
            role: 'creator', isActive: true,
          }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
        conversation: {
          update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
          // Present-and-null (a genuinely empty post-migration DM) — the
          // `count` guard matches this state, unlike an absent field (see
          // regression test below).
          count: jest.fn<any>().mockResolvedValue(1),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 and closes the conversation instead of transferring ownership', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { id: CONV_ID, type: 'direct', firstMessageSentAt: null },
    });
    // La clôture porte son horodatage : `loadConversationTombstones` interroge
    // `closedAt > since`, donc une fermeture qui n'écrit que `isActive: false`
    // n'est portée par aucun delta de rattrapage.
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, closedAt: expect.any(Date), closedBy: USER_ID },
      })
    );
    expect(prisma.participant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'creator' } })
    );
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator, legacy direct DM with firstMessageSentAt ABSENT', () => {
  // Regression — Prisma-Mongo absent-vs-null (corrigé en revue pré-merge,
  // 2026-08-10). The Prisma JS client returns `null` for `firstMessageSentAt`
  // both when the field is present-and-null AND when it is ABSENT (every
  // pre-migration `direct` conversation, never backfilled) — the two states
  // are indistinguishable once passed through a `select` + JS negation. The
  // fix queries the DB directly for the present-and-null state via `count`,
  // which — on a real Mongo connector — never matches an absent field. We
  // simulate that real behaviour here by resolving `count` to 0: a legacy DM
  // MUST take the ownership-transfer path, never the close-conversation path.
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            }),
          findMany: jest.fn<any>().mockResolvedValue([
            { joinedAt: new Date('2026-01-01T00:00:00.000Z'),
              id: SUCCESSOR_ID,
              userId: SUCCESSOR_USER_ID,
              role: 'moderator',
              isActive: true,
            },
          ]),update: jest.fn<any>().mockResolvedValue({}),
        },
        conversation: {
          update: jest.fn<any>().mockResolvedValue({}),
          count: jest.fn<any>().mockResolvedValue(0),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('treats an absent (legacy, pre-migration) firstMessageSentAt as NOT empty and transfers ownership', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUCCESSOR_ID }, data: { role: 'creator' } })
    );
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with no admin but an oldest member', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            }),
          findMany: jest.fn<any>().mockResolvedValue([
            {
              id: SUCCESSOR_ID,
              userId: SUCCESSOR_USER_ID,
              role: 'member',
              isActive: true,
              joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ]),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 when creator transfers to oldest member', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('promotes oldest member to creator role', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SUCCESSOR_ID },
        data: { role: 'creator' },
      })
    );
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with no other members', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            }),
          findMany: jest.fn<any>().mockResolvedValue([]), // plus aucun membre actif
          update: jest.fn<any>().mockResolvedValue({}),
        },
        conversation: {
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 when creator is last member', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('deactivates the conversation', async () => {
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONV_ID },
        data: { isActive: false, closedAt: expect.any(Date), closedBy: USER_ID },
      })
    );
  });
});

describe('DELETE /conversations/:id/delete-for-me — DB error on findFirst', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockRejectedValue(new Error('DB connection error')),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 500 when DB throws on findFirst', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(500);
  });
});
