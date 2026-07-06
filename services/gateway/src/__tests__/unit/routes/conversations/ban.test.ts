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
            ? { id: 'part-tgt', role: targetRole, bannedAt: targetBannedAt, displayName: 'Bob' }
            : null
        ),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  withSocket?: boolean;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), withSocket = false } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  if (withSocket) {
    const mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnThis(),
      fetchSockets: jest.fn<any>().mockResolvedValue([{ leave: jest.fn() }]),
    };
    app.decorate('socketIOHandler', {
      getManager: jest.fn(() => ({
        getIO: jest.fn(() => mockIO),
        invalidateParticipantCache: jest.fn(),
      })),
    });
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
    const app = await buildApp({ prisma: makePrisma(), withSocket: true });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`, payload: {} });
    expect(res.statusCode).toBe(200);
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
          .mockResolvedValueOnce({ id: 'part-tgt' }),
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

describe('PATCH unban — success', () => {
  it('returns 200 when admin unbans a participant', async () => {
    const prisma = {
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce({ id: 'part-curr', role: 'admin' })
          .mockResolvedValueOnce({ id: 'part-tgt' }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});
