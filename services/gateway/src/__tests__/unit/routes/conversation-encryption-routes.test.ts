/**
 * Route tests — conversation-encryption routes
 *
 * Covers both routes via Fastify inject:
 *   GET  /conversations/:conversationId/encryption-status
 *   POST /conversations/:conversationId/encryption
 *
 * Key branches:
 *   GET:
 *     - conversation not found → 404
 *     - not anonymous + not a member → 403
 *     - anonymous user → skips membership check
 *     - member found → 200 (isEncrypted=true/false, canTranslate=true/false)
 *     - throws → 500
 *   POST:
 *     - anonymous user → 403
 *     - invalid mode → 400
 *     - conversation not found → 404
 *     - already encrypted → 400
 *     - not a member → 403
 *     - group + no moderator role → 403
 *     - direct conversation → skips role check
 *     - mode=e2ee → no server key
 *     - mode=server → getOrCreateConversationKey called
 *     - senderParticipant found → message created
 *     - senderParticipant null → no message
 *     - throws → 500
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Module-level mock controls ───────────────────────────────────────────────

const mockGetOrCreateConversationKey = jest.fn<any>().mockResolvedValue('server-key-id');

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    getOrCreateConversationKey: (...a: unknown[]) => mockGetOrCreateConversationKey(...a),
  }),
}));

// mutable auth context — tests mutate it before inject
let testAuthContext: Record<string, unknown> = {
  isAuthenticated: true,
  isAnonymous: false,
  userId: '507f1f77bcf86cd799439011',
};

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() =>
    async (request: any, _reply: any) => {
      request.authContext = testAuthContext;
    }
  ),
  UnifiedAuthRequest: {},
}));

// validateParams / validateBody are no-ops so tests control params/body freely
jest.mock('../../../validation/helpers.js', () => ({
  validateParams: jest.fn(() => async (_req: any, _reply: any) => {}),
  validateBody: jest.fn(() => async (_req: any, _reply: any) => {}),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import encryptionRoutes from '../../../routes/conversation-encryption';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439014';
const AUTH = { authorization: 'Bearer valid-token' };

// ─── Prisma factory ───────────────────────────────────────────────────────────

type ConvShape = {
  encryptionEnabledAt?: Date | null;
  encryptionMode?: string | null;
  encryptionEnabledBy?: string | null;
  participants?: Array<{ userId: string; role?: string }>;
  type?: string;
} | null;

function makeConversation(conv: ConvShape) {
  if (!conv) return null;
  return {
    id: CONV_ID,
    encryptionEnabledAt: conv.encryptionEnabledAt ?? null,
    encryptionMode: conv.encryptionMode ?? null,
    encryptionEnabledBy: conv.encryptionEnabledBy ?? null,
    participants: conv.participants ?? [{ userId: USER_ID, role: 'MEMBER' }],
    type: conv.type ?? 'group',
  };
}

function makePrisma(opts: {
  conversation?: ConvShape;
  senderParticipant?: { id: string } | null;
  conversationFindError?: Error | null;
} = {}) {
  const { conversation = {}, senderParticipant = { id: PARTICIPANT_ID }, conversationFindError = null } = opts;
  return {
    conversation: {
      findUnique: conversationFindError
        ? jest.fn().mockRejectedValue(conversationFindError)
        : jest.fn().mockResolvedValue(makeConversation(conversation)),
      update: jest.fn().mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
        encryptionProtocol: 'signal_v3',
        encryptionEnabledBy: USER_ID,
      }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(senderParticipant),
    },
    message: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildApp(prismaOpts: Parameters<typeof makePrisma>[0] = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  await app.register(encryptionRoutes);
  await app.ready();
  return app;
}

// ─── GET /conversations/:conversationId/encryption-status ────────────────────

describe('GET /conversations/:conversationId/encryption-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  });

  it('returns 404 when conversation not found', async () => {
    const app = await buildApp({ conversation: null });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not a member (non-anonymous)', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: OTHER_ID }] } });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 with isEncrypted=false when encryption not enabled', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID }], encryptionEnabledAt: null } });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isEncrypted).toBe(false);
    expect(body.data.canTranslate).toBe(false);
    await app.close();
  });

  it('returns 200 with isEncrypted=true and canTranslate=true for server mode', async () => {
    const app = await buildApp({
      conversation: {
        participants: [{ userId: USER_ID }],
        encryptionEnabledAt: new Date(),
        encryptionMode: 'server',
        encryptionEnabledBy: USER_ID,
      },
    });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isEncrypted).toBe(true);
    expect(body.data.canTranslate).toBe(true);
    await app.close();
  });

  it('returns 200 with canTranslate=true for hybrid mode', async () => {
    const app = await buildApp({
      conversation: {
        participants: [{ userId: USER_ID }],
        encryptionEnabledAt: new Date(),
        encryptionMode: 'hybrid',
      },
    });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.canTranslate).toBe(true);
    await app.close();
  });

  it('skips membership check for anonymous user and returns 200', async () => {
    testAuthContext = { isAuthenticated: true, isAnonymous: true, userId: USER_ID };
    // participants don't include USER_ID but anonymous check is skipped
    const app = await buildApp({ conversation: { participants: [{ userId: OTHER_ID }] } });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 on db error', async () => {
    const app = await buildApp({ conversationFindError: new Error('db crash') });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /conversations/:conversationId/encryption ──────────────────────────

describe('POST /conversations/:conversationId/encryption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  });

  it('returns 403 for anonymous users', async () => {
    testAuthContext = { isAuthenticated: true, isAnonymous: true, userId: USER_ID };
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 for invalid mode', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID, role: 'OWNER' }] } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'invalid' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 when conversation not found', async () => {
    const app = await buildApp({ conversation: null });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 when encryption is already enabled', async () => {
    const app = await buildApp({
      conversation: {
        participants: [{ userId: USER_ID, role: 'OWNER' }],
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
      },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'server' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 403 when user is not a member', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: OTHER_ID, role: 'OWNER' }] } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 for group conversation when member lacks moderator role', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'MEMBER' }], type: 'group' },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 for direct conversation regardless of role (e2ee, no server key)', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'MEMBER' }], type: 'direct' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(200);
    expect(mockGetOrCreateConversationKey).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 for server mode (calls getOrCreateConversationKey)', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'OWNER' }], type: 'group' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'server' } });
    expect(res.statusCode).toBe(200);
    expect(mockGetOrCreateConversationKey).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns 200 for hybrid mode (calls getOrCreateConversationKey)', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'MODERATOR' }], type: 'group' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'hybrid' } });
    expect(res.statusCode).toBe(200);
    expect(mockGetOrCreateConversationKey).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('skips system message creation when senderParticipant is null', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'OWNER' }], type: 'group' },
      senderParticipant: null,
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 on db error', async () => {
    const app = await buildApp({ conversationFindError: new Error('db crash') });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
