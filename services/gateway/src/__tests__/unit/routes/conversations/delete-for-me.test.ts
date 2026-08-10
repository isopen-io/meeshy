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
      // Default: not a genuinely-empty direct DM (matches the default 'group'
      // scenarios in this file — the `count` query filters `type: 'direct'`
      // itself, so a non-direct conversation would also resolve to 0 here).
      count: jest.fn<any>().mockResolvedValue(0),
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

describe('DELETE /conversations/:id/delete-for-me — creator, empty direct DM', () => {
  it('returns 200 and closes the conversation instead of transferring ownership', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
        // Present-and-null (a genuinely empty post-migration DM) — the `count`
        // guard matches this state, unlike an absent field (see regression
        // test below).
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { id: 'conv-resolved-id', type: 'direct', firstMessageSentAt: null },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    expect(prisma.participant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'creator' } })
    );
    await app.close();
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
  it('treats an absent (legacy, pre-migration) firstMessageSentAt as NOT empty and transfers ownership', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const successor = { id: SUCCESSOR_ID, userId: 'other-user', role: 'moderator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce(creatorParticipant) // caller's participant
          .mockResolvedValueOnce(successor),          // moderator successor
        update: jest.fn<any>().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({}),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUCCESSOR_ID }, data: { role: 'creator' } })
    );
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
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
