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
      ...(overrides.conversation ?? {}),
    },
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

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
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
});

describe('DELETE /conversations/:id/delete-for-me — creator with moderator successor', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            })
            .mockResolvedValueOnce({
              id: SUCCESSOR_ID,
              userId: SUCCESSOR_USER_ID,
              role: 'moderator',
              isActive: true,
            }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 when creator transfers to moderator', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('promotes moderator to creator role', async () => {
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

describe('DELETE /conversations/:id/delete-for-me — creator with no moderator but oldest member', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            })
            .mockResolvedValueOnce(null) // no moderator
            .mockResolvedValueOnce({
              id: SUCCESSOR_ID,
              userId: SUCCESSOR_USER_ID,
              role: 'member',
              isActive: true,
            }),
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
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({
              id: PARTICIPANT_ID,
              userId: USER_ID,
              conversationId: CONV_ID,
              role: 'creator',
              isActive: true,
            })
            .mockResolvedValueOnce(null)  // no moderator
            .mockResolvedValueOnce(null), // no other active member
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
        data: { isActive: false },
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
