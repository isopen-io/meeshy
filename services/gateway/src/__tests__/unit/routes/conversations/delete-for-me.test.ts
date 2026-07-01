/**
 * Unit tests for conversations delete-for-me route (delete-for-me.ts)
 * Tests DELETE /conversations/:id/delete-for-me.
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
    PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
    CONVERSATION_DELETED: 'conversation:deleted',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerDeleteForMeRoutes } from '../../../../routes/conversations/delete-for-me';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const SUCCESSOR_ID = '507f1f77bcf86cd799439044';

const mockParticipant = {
  id: PART_ID,
  conversationId: CONV_ID,
  userId: USER_ID,
  role: 'member',
  isActive: true,
};

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

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParticipant),
      update: jest.fn<any>().mockResolvedValue({ ...mockParticipant, isActive: false }),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
    },
    ...overrides,
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

  registerDeleteForMeRoutes(app, prisma as any, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

// ─── DELETE /conversations/:id/delete-for-me ──────────────────────────────────

describe('DELETE /conversations/:id/delete-for-me — not a participant', () => {
  it('returns 404 when user is not in the conversation', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — success as regular member', () => {
  it('returns 200 when member soft-deletes the conversation', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBeDefined();
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with successor (moderator)', () => {
  it('returns 200 and transfers ownership to moderator successor', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const successor = { id: SUCCESSOR_ID, userId: 'other-user', role: 'moderator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce(creatorParticipant)  // caller's participant
          .mockResolvedValueOnce(successor)           // moderator successor
        ,
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with no other members', () => {
  it('returns 200 and deactivates the conversation', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce(creatorParticipant) // caller's participant
          .mockResolvedValueOnce(null)               // no moderator
          .mockResolvedValueOnce(null),              // no other member
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — success with socket events', () => {
  it('returns 200 and emits socket events for deletion', async () => {
    const app = await buildApp({ withSocket: true });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — participant lookup cache invalidation', () => {
  it('invalidates the cached participant lookup for the deleting user', async () => {
    mockInvalidateParticipantLookup.mockClear();
    const app = await buildApp();
    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith(PART_ID, 'conv-resolved-id');
    await app.close();
  });
});
