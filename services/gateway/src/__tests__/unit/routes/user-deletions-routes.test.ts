/**
 * Route tests — user-deletions routes
 *
 * Covers all 7 routes via Fastify inject:
 *   DELETE /api/conversations/:conversationId/delete-for-me
 *   POST   /api/conversations/:conversationId/restore-for-me
 *   POST   /api/conversations/:conversationId/clear-history
 *   DELETE /api/messages/:messageId/delete-for-me
 *   POST   /api/messages/:messageId/restore-for-me
 *   DELETE /api/messages/bulk/delete-for-me
 *   GET    /api/user/deleted-conversations
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const token = request.headers['authorization'];
        if (!token) {
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

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import userDeletionsRoutes from '../../../routes/user-deletions';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AUTH = { authorization: 'Bearer token' };

// ─── Prisma factories ─────────────────────────────────────────────────────────

type PrismaParticipant = { id: string; userId: string; conversationId: string; isActive: boolean };
type PrismaConvPref = {
  id: string;
  userId: string;
  conversationId: string;
  deletedForUserAt: Date | null;
  clearHistoryBefore: Date | null;
  conversation?: {
    id: string;
    identifier: string;
    title: string | null;
    type: string;
    avatar: string | null;
    lastMessageAt: Date | null;
  };
};
type PrismaMessage = {
  id: string;
  conversationId: string;
  content: string;
  conversation: { participants: PrismaParticipant[] };
};
type PrismaMessageDeletion = { userId: string; messageId: string; deletedAt: Date };

const ACTIVE_PARTICIPANT: PrismaParticipant = {
  id: 'part-1',
  userId: USER_ID,
  conversationId: CONV_ID,
  isActive: true,
};

const MESSAGE: PrismaMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  content: 'hello',
  conversation: { participants: [ACTIVE_PARTICIPANT] },
};

const DELETED_PREF: PrismaConvPref = {
  id: 'pref-1',
  userId: USER_ID,
  conversationId: CONV_ID,
  deletedForUserAt: new Date('2024-01-01'),
  clearHistoryBefore: null,
  conversation: {
    id: CONV_ID,
    identifier: 'conv-123',
    title: 'Test Conv',
    type: 'direct',
    avatar: null,
    lastMessageAt: new Date('2024-01-15'),
  },
};

const NOT_DELETED_PREF: PrismaConvPref = {
  ...DELETED_PREF,
  deletedForUserAt: null,
};

type PrismaOpts = {
  participantFindFirst?: PrismaParticipant | null | Error;
  convPrefFindUnique?: PrismaConvPref | null | Error;
  convPrefUpsert?: PrismaConvPref | Error;
  convPrefUpdate?: PrismaConvPref | Error;
  messageFindUnique?: PrismaMessage | null | Error;
  msgDeletionFindUnique?: PrismaMessageDeletion | null | Error;
  msgDeletionUpsert?: PrismaMessageDeletion | Error;
  msgDeletionDelete?: object | Error;
  msgFindMany?: Array<{ id: string }> | Error;
  convPrefFindMany?: PrismaConvPref[] | Error;
};

// Use explicit key presence check so null is a valid mock return value
// (null ?? default would silently substitute the default, breaking "not found" tests)
function opt<T>(val: T | undefined, fallback: T): T {
  return val === undefined ? fallback : val;
}

function resolve<T>(v: T | Error): jest.Mock {
  return v instanceof Error ? jest.fn().mockRejectedValue(v) : jest.fn().mockResolvedValue(v);
}

function makePrisma(opts: PrismaOpts = {}) {
  const DEFAULT_MSG_DELETION = { userId: USER_ID, messageId: MSG_ID, deletedAt: new Date() };

  return {
    participant: {
      findFirst: resolve(opt(opts.participantFindFirst, ACTIVE_PARTICIPANT)),
    },
    userConversationPreferences: {
      findUnique: resolve(opt(opts.convPrefFindUnique, DELETED_PREF)),
      upsert: resolve(opt(opts.convPrefUpsert, DELETED_PREF)),
      update: resolve(opt(opts.convPrefUpdate, NOT_DELETED_PREF)),
      findMany: resolve(opt(opts.convPrefFindMany, [DELETED_PREF])),
    },
    message: {
      findUnique: resolve(opt(opts.messageFindUnique, MESSAGE)),
      findMany: resolve(opt(opts.msgFindMany, [{ id: MSG_ID }])),
    },
    userMessageDeletion: {
      findUnique: resolve(opt(opts.msgDeletionFindUnique, DEFAULT_MSG_DELETION)),
      upsert: resolve(opt(opts.msgDeletionUpsert, DEFAULT_MSG_DELETION)),
      delete: resolve(opt(opts.msgDeletionDelete, {})),
    },
    '$transaction': jest.fn().mockResolvedValue(undefined),
  };
}

async function buildApp(opts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(opts) as unknown);
  await app.register(userDeletionsRoutes);
  await app.ready();
  return app;
}

// ─── DELETE /api/conversations/:conversationId/delete-for-me ─────────────────

describe('DELETE /api/conversations/:conversationId/delete-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when member deletes their conversation', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Conversation deleted from your view');
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user is not a member', async () => {
    const appNotMember = await buildApp({ participantFindFirst: null });
    const res = await appNotMember.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    await appNotMember.close();
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ participantFindFirst: new Error('db crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 when upsert fails after membership check', async () => {
    const appErr = await buildApp({ convPrefUpsert: new Error('upsert failed') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── POST /api/conversations/:conversationId/restore-for-me ──────────────────

describe('POST /api/conversations/:conversationId/restore-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when restoring a deleted conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Conversation restored');
  });

  it('returns 400 when no preferences record exists', async () => {
    const appNoPref = await buildApp({ convPrefFindUnique: null });
    const res = await appNoPref.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appNoPref.close();
  });

  it('returns 400 when preferences exist but conversation is not deleted', async () => {
    const appNotDeleted = await buildApp({ convPrefFindUnique: NOT_DELETED_PREF });
    const res = await appNotDeleted.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appNotDeleted.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during findUnique', async () => {
    const appErr = await buildApp({ convPrefFindUnique: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on database error during update', async () => {
    const appErr = await buildApp({ convPrefUpdate: new Error('update failed') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── POST /api/conversations/:conversationId/clear-history ───────────────────

describe('POST /api/conversations/:conversationId/clear-history', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with clearHistoryBefore when valid date provided', async () => {
    const beforeDate = '2024-01-15T10:30:00.000Z';
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.clearHistoryBefore).toBeDefined();
    expect(body.data.message).toContain('Chat history cleared before');
  });

  it('returns 400 when beforeDate is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: 'not-a-date' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when beforeDate is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when user is not a member', async () => {
    const appNotMember = await buildApp({ participantFindFirst: null });
    const res = await appNotMember.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: '2024-01-15T10:30:00.000Z' }),
    });
    expect(res.statusCode).toBe(403);
    await appNotMember.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: '2024-01-15T10:30:00.000Z' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ participantFindFirst: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ beforeDate: '2024-01-15T10:30:00.000Z' }),
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /api/messages/:messageId/delete-for-me ───────────────────────────

describe('DELETE /api/messages/:messageId/delete-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when member deletes their message', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Message deleted from your view');
  });

  it('returns 404 when message does not exist', async () => {
    const appNoMsg = await buildApp({ messageFindUnique: null });
    const res = await appNoMsg.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await appNoMsg.close();
  });

  it('returns 403 when user is not a member of the conversation', async () => {
    const msgNoParticipant: PrismaMessage = {
      ...MESSAGE,
      conversation: { participants: [] },
    };
    const appForbidden = await buildApp({ messageFindUnique: msgNoParticipant });
    const res = await appForbidden.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    await appForbidden.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during findUnique', async () => {
    const appErr = await buildApp({ messageFindUnique: new Error('db crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on database error during upsert', async () => {
    const appErr = await buildApp({ msgDeletionUpsert: new Error('upsert failed') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── POST /api/messages/:messageId/restore-for-me ────────────────────────────

describe('POST /api/messages/:messageId/restore-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when restoring a previously deleted message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Message restored');
  });

  it('returns 400 when no deletion record exists', async () => {
    const appNoDeletion = await buildApp({ msgDeletionFindUnique: null });
    const res = await appNoDeletion.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    await appNoDeletion.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during findUnique', async () => {
    const appErr = await buildApp({ msgDeletionFindUnique: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on database error during delete', async () => {
    const appErr = await buildApp({ msgDeletionDelete: new Error('delete failed') });
    const res = await appErr.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /api/messages/bulk/delete-for-me ─────────────────────────────────

describe('DELETE /api/messages/bulk/delete-for-me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with deleted count when given valid messageIds', async () => {
    const messageIds = [MSG_ID, 'cccccccccccccccccccccccc'];
    const appBulk = await buildApp({
      msgFindMany: messageIds.map((id) => ({ id })),
    });
    const res = await appBulk.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.deletedCount).toBe(2);
    expect(body.data.requestedCount).toBe(2);
    await appBulk.close();
  });

  it('returns 200 with partial count when some messages not accessible', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID, 'inaccessible-id'] }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.requestedCount).toBe(2);
    expect(body.data.deletedCount).toBeLessThanOrEqual(2);
  });

  it('returns 400 when messageIds array is empty', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [] }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when messageIds has more than 100 entries', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `msg-${i}`);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: tooMany }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when none of the messages are accessible', async () => {
    const appNoAccess = await buildApp({ msgFindMany: [] });
    const res = await appNoAccess.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID] }),
    });
    expect(res.statusCode).toBe(403);
    await appNoAccess.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID] }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ msgFindMany: new Error('db crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ messageIds: [MSG_ID] }),
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── GET /api/user/deleted-conversations ─────────────────────────────────────

describe('GET /api/user/deleted-conversations', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with list of deleted conversations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].conversationId).toBe(CONV_ID);
    expect(body.data[0].deletedAt).toBeDefined();
    expect(body.data[0].conversation).toBeDefined();
  });

  it('returns 200 with empty array when no conversations deleted', async () => {
    const appEmpty = await buildApp({ convPrefFindMany: [] });
    const res = await appEmpty.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
    await appEmpty.close();
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ convPrefFindMany: new Error('db crash') });
    const res = await appErr.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('maps deleted preferences to conversationId, deletedAt, and conversation fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    const body = res.json();
    const firstItem = body.data[0];
    expect(firstItem).toHaveProperty('conversationId');
    expect(firstItem).toHaveProperty('deletedAt');
    expect(firstItem).toHaveProperty('conversation');
    expect(firstItem.conversation).toHaveProperty('id');
    expect(firstItem.conversation).toHaveProperty('identifier');
    expect(firstItem.conversation).toHaveProperty('type');
  });
});
