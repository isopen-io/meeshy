/**
 * Unit tests for src/routes/conversation-encryption.ts
 *
 * Tests:
 * - GET /conversations/:conversationId/encryption-status
 * - POST /conversations/:conversationId/encryption
 */

// ---------------------------------------------------------------------------
// Module mocks — ALL jest.mock() calls before any imports
// ---------------------------------------------------------------------------

const mockGetEncryptionService = jest.fn<any>();
jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: (...args: any[]) => mockGetEncryptionService(...args),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: any) => {
    req.authContext = req._injectedAuthContext ?? makeAuthContext();
  }),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../validation/helpers.js', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/conversation-encryption-schemas.js', () => ({
  ConversationIdParamSchema: {},
  SetEncryptionModeBodySchema: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import encryptionRoutes from '../../../routes/conversation-encryption';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PART_ID = '507f1f77bcf86cd799439013';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversation = {
  findUnique: jest.fn<any>(),
  update: jest.fn<any>(),
};
const mockParticipant = { findFirst: jest.fn<any>() };
const mockMessage = { create: jest.fn<any>().mockResolvedValue({}) };
const mockPrisma: any = {
  conversation: mockConversation,
  participant: mockParticipant,
  message: mockMessage,
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function makeAuthContext(overrides: any = {}) {
  return {
    isAuthenticated: true,
    isAnonymous: false,
    userId: USER_ID,
    registeredUser: { id: USER_ID },
    ...overrides,
  };
}

function buildApp(authContext?: any): FastifyInstance {
  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? makeAuthContext();
    }
  );

  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.register(encryptionRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /conversations/:conversationId/encryption-status
// ---------------------------------------------------------------------------

describe('GET /conversations/:conversationId/encryption-status', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEncryptionService.mockResolvedValue({
      getOrCreateConversationKey: jest.fn().mockResolvedValue('server-key-123'),
    });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with isEncrypted: false when encryption is not enabled', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: null,
      encryptionMode: null,
      encryptionEnabledBy: null,
      participants: [{ userId: USER_ID }],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isEncrypted).toBe(false);
    expect(body.data.mode).toBeNull();
    expect(body.data.enabledAt).toBeNull();
    expect(body.data.enabledBy).toBeNull();
  });

  it('returns 200 with isEncrypted: true and canTranslate: true for server mode', async () => {
    await app.ready();
    const enabledAt = new Date('2026-01-15T10:00:00Z');
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: enabledAt,
      encryptionMode: 'server',
      encryptionEnabledBy: USER_ID,
      participants: [{ userId: USER_ID }],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isEncrypted).toBe(true);
    expect(body.data.mode).toBe('server');
    expect(body.data.canTranslate).toBe(true);
    expect(body.data.enabledBy).toBe(USER_ID);
  });

  it('returns 200 with canTranslate: false for e2ee mode', async () => {
    await app.ready();
    const enabledAt = new Date('2026-01-20T08:00:00Z');
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: enabledAt,
      encryptionMode: 'e2ee',
      encryptionEnabledBy: USER_ID,
      participants: [{ userId: USER_ID }],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isEncrypted).toBe(true);
    expect(body.data.mode).toBe('e2ee');
    expect(body.data.canTranslate).toBe(false);
  });

  it('returns 404 when conversation is not found', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 403 when user is not a member of the conversation', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: null,
      encryptionMode: null,
      encryptionEnabledBy: null,
      participants: [{ userId: 'other-user-id' }],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 for anonymous user without performing member check', async () => {
    await app.close();
    app = buildApp(makeAuthContext({ isAnonymous: true, userId: undefined }));
    await app.ready();

    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: null,
      encryptionMode: null,
      encryptionEnabledBy: null,
      participants: [],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isEncrypted).toBe(false);
  });

  it('returns 500 when a database error occurs', async () => {
    await app.ready();
    mockConversation.findUnique.mockRejectedValue(new Error('DB connection lost'));

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/encryption-status`,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /conversations/:conversationId/encryption
// ---------------------------------------------------------------------------

describe('POST /conversations/:conversationId/encryption', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEncryptionService.mockResolvedValue({
      getOrCreateConversationKey: jest.fn().mockResolvedValue('server-key-123'),
    });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when server mode encryption is enabled on a direct conversation', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      encryptionEnabledAt: null,
      encryptionMode: null,
      participants: [{ userId: USER_ID, role: 'MEMBER' }],
    });
    mockConversation.update.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: new Date(),
      encryptionMode: 'server',
      encryptionProtocol: 'aes-256-gcm',
      encryptionEnabledBy: USER_ID,
    });
    mockParticipant.findFirst.mockResolvedValue({ id: PART_ID });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isEncrypted).toBe(true);
    expect(body.data.mode).toBe('server');
    expect(body.data.canTranslate).toBe(true);
    expect(body.message).toMatch(/Server-side/i);
  });

  it('returns 200 when e2ee mode is enabled by a moderator in a group conversation', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'group',
      encryptionEnabledAt: null,
      encryptionMode: null,
      participants: [{ userId: USER_ID, role: 'MODERATOR' }],
    });
    mockConversation.update.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: new Date(),
      encryptionMode: 'e2ee',
      encryptionProtocol: 'signal_v3',
      encryptionEnabledBy: USER_ID,
    });
    mockParticipant.findFirst.mockResolvedValue({ id: PART_ID });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'e2ee' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe('e2ee');
    expect(body.data.canTranslate).toBe(false);
    expect(body.message).toMatch(/End-to-end/i);
  });

  it('returns 200 when hybrid mode encryption is enabled', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      encryptionEnabledAt: null,
      encryptionMode: null,
      participants: [{ userId: USER_ID, role: 'MEMBER' }],
    });
    mockConversation.update.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: new Date(),
      encryptionMode: 'hybrid',
      encryptionProtocol: 'aes-256-gcm',
      encryptionEnabledBy: USER_ID,
    });
    mockParticipant.findFirst.mockResolvedValue({ id: PART_ID });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'hybrid' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe('hybrid');
    expect(body.data.canTranslate).toBe(true);
    expect(body.message).toMatch(/Hybrid/i);
  });

  it('returns 400 with custom response when encryption is already enabled', async () => {
    await app.ready();
    const existingEnabledAt = new Date('2026-01-01T00:00:00Z');
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      encryptionEnabledAt: existingEnabledAt,
      encryptionMode: 'server',
      participants: [{ userId: USER_ID, role: 'MEMBER' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'e2ee' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already enabled/i);
    expect(body.data.currentMode).toBe('server');
  });

  it('returns 400 when an invalid mode is provided', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'invalid-mode' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 403 when an anonymous user attempts to enable encryption', async () => {
    await app.close();
    app = buildApp(makeAuthContext({ isAnonymous: true, userId: undefined }));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 404 when conversation is not found', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 403 when user is not a member of the conversation', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      encryptionEnabledAt: null,
      encryptionMode: null,
      participants: [{ userId: 'another-user-id', role: 'MEMBER' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 403 when a non-moderator member tries to enable encryption in a group conversation', async () => {
    await app.ready();
    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'group',
      encryptionEnabledAt: null,
      encryptionMode: null,
      participants: [{ userId: USER_ID, role: 'MEMBER' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('calls getOrCreateConversationKey for server mode and creates a system message', async () => {
    await app.ready();
    const mockGetOrCreate = jest.fn<any>().mockResolvedValue('server-key-abc');
    mockGetEncryptionService.mockResolvedValue({
      getOrCreateConversationKey: mockGetOrCreate,
    });
    await app.close();
    app = buildApp();
    await app.ready();

    mockConversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      encryptionEnabledAt: null,
      encryptionMode: null,
      participants: [{ userId: USER_ID, role: 'MEMBER' }],
    });
    mockConversation.update.mockResolvedValue({
      id: CONV_ID,
      encryptionEnabledAt: new Date(),
      encryptionMode: 'server',
      encryptionProtocol: 'aes-256-gcm',
      encryptionEnabledBy: USER_ID,
    });
    mockParticipant.findFirst.mockResolvedValue({ id: PART_ID });

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID }),
      })
    );
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: CONV_ID,
          senderId: PART_ID,
          messageType: 'system',
        }),
      })
    );
  });

  it('returns 500 when a database error occurs', async () => {
    await app.ready();
    mockConversation.findUnique.mockRejectedValue(new Error('DB connection lost'));

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});
