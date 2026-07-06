/**
 * Unit tests for conversations/ban.ts
 * Tests PATCH /conversations/:id/participants/:userId/ban
 *       PATCH /conversations/:id/participants/:userId/unban
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue(null),
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

import { registerBanRoutes } from '../../../routes/conversations/ban';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = 'conv-aabbcc';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSocketIO() {
  const mockFetchSockets = jest.fn<any>().mockResolvedValue([{ leave: jest.fn() }]);
  const mockIo = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn().mockReturnValue({ fetchSockets: mockFetchSockets }),
  };
  const mockManager = {
    getIO: jest.fn().mockReturnValue(mockIo),
    invalidateParticipantCache: jest.fn(),
  };
  return { mockIo, mockManager, mockFetchSockets };
}

function makePrisma(overrides: any = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      ...overrides.participant,
    },
    ...overrides,
  };
}

async function buildApp({
  prismaOverrides = {} as any,
  withSocket = true,
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma>; socket: ReturnType<typeof makeSocketIO> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma(prismaOverrides);
  const socket = makeSocketIO();

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  });

  app.decorate('socketIOHandler', withSocket ? {
    getManager: () => socket.mockManager,
  } : null as any);

  const requiredAuth = async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerBanRoutes(app, prisma as any, null, requiredAuth);
  await app.ready();
  return { app, prisma, socket };
}

// ─── PATCH /conversations/:id/participants/:userId/ban ────────────────────────

describe('PATCH /conversations/:id/participants/:userId/ban — caller not in conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when caller is not a member', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — target not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when target participant is not found', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — already banned', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce({ id: 'part-target', role: 'member', bannedAt: new Date(), displayName: 'Bob' }),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when target is already banned', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — insufficient role', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'member' })       // caller is member (level 10)
            .mockResolvedValueOnce({ id: 'part-target', role: 'admin', bannedAt: null, displayName: 'Bob' }), // target is admin (level 30)
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller has equal or lower role than target', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /conversations/:id/participants/:userId/ban — success', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;
  beforeAll(async () => {
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce({ id: 'part-target', role: 'member', bannedAt: null, displayName: 'Bob' }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin bans a member', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/ban` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls prisma.participant.update with bannedAt and isActive=false', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it('emits CONVERSATION_PARTICIPANT_BANNED socket event', async () => {
    expect(socket.mockIo.emit).toHaveBeenCalledWith(
      'conversation:participant-banned',
      expect.objectContaining({ userId: TARGET_USER_ID }),
    );
  });
});

// ─── PATCH /conversations/:id/participants/:userId/unban ──────────────────────

describe('PATCH /conversations/:id/participants/:userId/unban — caller not in conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when caller is not a member', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/unban — caller is member (insufficient role)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'member' }),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller is not admin or creator', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /conversations/:id/participants/:userId/unban — banned participant not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce(null),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when no banned participant is found', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /conversations/:id/participants/:userId/unban — success', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  let socket: ReturnType<typeof makeSocketIO>;
  beforeAll(async () => {
    ({ app, prisma, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: 'part-caller', role: 'admin' })
            .mockResolvedValueOnce({ id: 'part-target' }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when admin unbans a participant', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_USER_ID}/unban` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('restores participant with bannedAt=null and isActive=true', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bannedAt: null, isActive: true }),
      }),
    );
  });

  it('emits CONVERSATION_PARTICIPANT_UNBANNED socket event', async () => {
    expect(socket.mockIo.emit).toHaveBeenCalledWith(
      'conversation:participant-unbanned',
      expect.objectContaining({ userId: TARGET_USER_ID }),
    );
  });
});
