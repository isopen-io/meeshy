/**
 * Unit tests for src/routes/signal-protocol.ts
 *
 * Tests:
 * - POST /signal/keys          — Upload pre-key bundle
 * - GET  /signal/keys/:userId  — Get pre-key bundle for another user
 * - POST /signal/session/establish — Establish E2EE session
 */

// ---------------------------------------------------------------------------
// Module mocks — ALL jest.mock() calls before any imports
// ---------------------------------------------------------------------------

// Mock @fastify/rate-limit as a no-op plugin so registration succeeds
jest.mock('@fastify/rate-limit', () => {
  const plugin = async () => {};
  return { default: plugin, __esModule: true };
});

// Mock getEncryptionService — the factory variable is assigned after hoisting
const mockGetEncryptionService = jest.fn<any>();
jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: (...args: any[]) => mockGetEncryptionService(...args),
}));

// Mock createUnifiedAuthMiddleware — implementation is injected per-test via buildApp()
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
  UnifiedAuthRequest: {},
}));

// Mock createSignalProtocolRateLimitConfig — returns a plain object; the route
// passes it to @fastify/rate-limit (which is already a no-op above)
jest.mock('../../../middleware/rate-limiter', () => ({
  createSignalProtocolRateLimitConfig: jest.fn(() => ({})),
}));

// Mock @meeshy/shared/types/api-schemas — AJV won't validate bodies so Zod
// guards inside the route handlers run as usual
jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
  signalPreKeyBundleSchema: { type: 'object', additionalProperties: true },
  generatePreKeyBundleRequestSchema: { type: 'object', additionalProperties: true },
  generatePreKeyBundleResponseSchema: { type: 'object', additionalProperties: true },
  getPreKeyBundleResponseSchema: { type: 'object', additionalProperties: true },
  establishSessionRequestSchema: { type: 'object', additionalProperties: true },
  establishSessionResponseSchema: { type: 'object', additionalProperties: true },
}));

// Mock logger-enhanced — prevents Winston/Pino bootstrapping in tests
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import signalProtocolRoutes from '../../../routes/signal-protocol';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439099';
const CONV_ID = '507f1f77bcf86cd799439012';

// ---------------------------------------------------------------------------
// Mock Prisma models
// ---------------------------------------------------------------------------

const mockSignalPreKeyBundle = {
  upsert: jest.fn<any>().mockResolvedValue({}),
  findUnique: jest.fn<any>(),
  update: jest.fn<any>().mockResolvedValue({}),
};

const mockParticipant = {
  findMany: jest.fn<any>(),
  findFirst: jest.fn<any>(),
};

const mockFriendRequest = {
  findFirst: jest.fn<any>().mockResolvedValue(null),
};

const mockPrisma: any = {
  signalPreKeyBundle: mockSignalPreKeyBundle,
  participant: mockParticipant,
  friendRequest: mockFriendRequest,
};

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/** A pre-key bundle stored in MongoDB (base64-encoded binary fields) */
const sampleBundle = {
  identityKey: Buffer.from([1, 2, 3]).toString('base64'),
  registrationId: 12345,
  deviceId: 1,
  preKeyId: 1,
  preKeyPublic: Buffer.from([4, 5, 6]).toString('base64'),
  signedPreKeyId: 1,
  signedPreKeyPublic: Buffer.from([7, 8, 9]).toString('base64'),
  signedPreKeySignature: Buffer.from([10, 11, 12]).toString('base64'),
  kyberPreKeyId: null,
  kyberPreKeyPublic: null,
  kyberPreKeySignature: null,
};

/** Valid POST /signal/keys request body */
const validKeysBody = {
  identityKey: 'abc',
  registrationId: 12345,
  deviceId: 1,
  signedPreKeyId: 1,
  signedPreKeyPublic: 'def',
  signedPreKeySignature: 'ghi',
};

/** Valid POST /signal/session/establish request body */
const validEstablishBody = {
  recipientUserId: TARGET_USER_ID,
  conversationId: CONV_ID,
};

// ---------------------------------------------------------------------------
// Mock signal service (returned by encryptionService.getSignalService())
// ---------------------------------------------------------------------------

const mockGetSignalService = jest.fn<any>().mockReturnValue({ processBundle: jest.fn() });

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeAuthContext(overrides: any = {}) {
  return {
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID },
    ...overrides,
  };
}

function buildApp(authContext?: any): FastifyInstance {
  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(
    () => async (req: any) => {
      req.authContext = authContext ?? makeAuthContext();
    }
  );

  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.register(signalProtocolRoutes);
  return app;
}

// ===========================================================================
// POST /signal/keys
// ===========================================================================

describe('POST /signal/keys', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEncryptionService.mockResolvedValue({
      getSignalService: mockGetSignalService,
      getOrCreateConversationKey: jest.fn().mockResolvedValue('key-123'),
    });
    mockSignalPreKeyBundle.upsert.mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when a complete pre-key bundle is uploaded successfully', async () => {
    await app.ready();
    const body = {
      ...validKeysBody,
      preKeyId: 1,
      preKeyPublic: 'xyz',
      kyberPreKeyId: 2,
      kyberPreKeyPublic: 'kyb',
      kyberPreKeySignature: 'kybsig',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/signal/keys',
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.registrationId).toBe(12345);
    expect(parsed.data.deviceId).toBe(1);
    expect(parsed.data.signedPreKeyId).toBe(1);
    expect(parsed.data.message).toMatch(/uploaded successfully/i);
    expect(mockSignalPreKeyBundle.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 200 when only required fields are provided (no preKeyPublic, no kyberPreKey)', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/signal/keys',
      payload: validKeysBody,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.registrationId).toBe(12345);
    expect(parsed.data.deviceId).toBe(1);
    // upsert should have been called with null for optional fields
    const upsertCall = mockSignalPreKeyBundle.upsert.mock.calls[0] as any[];
    const createData = (upsertCall[0] as any).create;
    expect(createData.preKeyPublic).toBeNull();
    expect(createData.kyberPreKeyPublic).toBeNull();
    expect(createData.kyberPreKeySignature).toBeNull();
  });

  it('returns 500 when the database upsert throws', async () => {
    await app.ready();
    mockSignalPreKeyBundle.upsert.mockRejectedValue(new Error('DB write failed'));

    const res = await app.inject({
      method: 'POST',
      url: '/signal/keys',
      payload: validKeysBody,
    });

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// GET /signal/keys/:userId
// ===========================================================================

describe('GET /signal/keys/:userId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEncryptionService.mockResolvedValue({
      getSignalService: mockGetSignalService,
      getOrCreateConversationKey: jest.fn().mockResolvedValue('key-123'),
    });
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when the requesting user shares a conversation with the target', async () => {
    await app.ready();
    mockParticipant.findMany.mockResolvedValue([{ conversationId: CONV_ID }]);
    mockParticipant.findFirst.mockResolvedValue({
      userId: TARGET_USER_ID,
      conversationId: CONV_ID,
      isActive: true,
    });
    mockFriendRequest.findFirst.mockResolvedValue(null);
    mockSignalPreKeyBundle.findUnique.mockResolvedValue(sampleBundle);

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_USER_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.registrationId).toBe(12345);
    expect(parsed.data.deviceId).toBe(1);
    // identityKey is returned as a Uint8Array (serialized as an object with numeric indices)
    expect(parsed.data.identityKey).toBeDefined();
  });

  it('returns 200 when the requesting user is friends with the target (no shared conversation)', async () => {
    await app.ready();
    // No shared conversations — conversationIds array is empty so findFirst is skipped
    mockParticipant.findMany.mockResolvedValue([]);
    mockFriendRequest.findFirst.mockResolvedValue({ id: 'friendship-1', status: 'accepted' });
    mockSignalPreKeyBundle.findUnique.mockResolvedValue(sampleBundle);

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_USER_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.registrationId).toBe(12345);
  });

  it('returns 403 when the requesting user has no shared conversation or friendship with the target', async () => {
    await app.ready();
    mockParticipant.findMany.mockResolvedValue([]);
    mockFriendRequest.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_USER_ID}`,
    });

    expect(res.statusCode).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not authorized/i);
  });

  it('returns 404 when the target user has no keys stored', async () => {
    await app.ready();
    mockParticipant.findMany.mockResolvedValue([{ conversationId: CONV_ID }]);
    mockParticipant.findFirst.mockResolvedValue({ id: 'p-1', userId: TARGET_USER_ID });
    mockFriendRequest.findFirst.mockResolvedValue(null);
    mockSignalPreKeyBundle.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_USER_ID}`,
    });

    expect(res.statusCode).toBe(404);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not generated encryption keys/i);
  });

  it('returns 500 when a database error occurs', async () => {
    await app.ready();
    mockParticipant.findMany.mockRejectedValue(new Error('DB connection lost'));

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${TARGET_USER_ID}`,
    });

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
  });

  it('does not call findMany when authorization check is skipped for self-lookup', async () => {
    // This test verifies the route guards run before DB access:
    // when the target userId equals the requesting userId, the route still
    // performs the shared-conversation / friendship check (no special bypass).
    await app.ready();
    mockParticipant.findMany.mockResolvedValue([]);
    mockFriendRequest.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/signal/keys/${USER_ID}`,
    });

    // No shared conversation and no friendship → 403, even for self
    expect(res.statusCode).toBe(403);
    expect(mockParticipant.findMany).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// POST /signal/session/establish
// ===========================================================================

describe('POST /signal/session/establish', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSignalService.mockReturnValue({ processBundle: jest.fn() });
    mockGetEncryptionService.mockResolvedValue({
      getSignalService: mockGetSignalService,
      getOrCreateConversationKey: jest.fn().mockResolvedValue('key-123'),
    });
    mockSignalPreKeyBundle.update.mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when the session is established successfully', async () => {
    await app.ready();
    // First findFirst call: requesting user IS a participant
    // Second findFirst call: recipient IS a participant
    mockParticipant.findFirst
      .mockResolvedValueOnce({ id: 'p-1', userId: USER_ID, conversationId: CONV_ID })
      .mockResolvedValueOnce({ id: 'p-2', userId: TARGET_USER_ID, conversationId: CONV_ID });
    mockSignalPreKeyBundle.findUnique.mockResolvedValue(sampleBundle);

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      payload: validEstablishBody,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.message).toMatch(/established successfully/i);
    // Pre-key should be consumed (preKeyId is non-null in sampleBundle)
    expect(mockSignalPreKeyBundle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: TARGET_USER_ID },
        data: { preKeyId: null, preKeyPublic: null },
      })
    );
  });

  it('returns 403 when the requesting user is not a participant in the conversation', async () => {
    await app.ready();
    // First findFirst: user is NOT a participant
    mockParticipant.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      payload: validEstablishBody,
    });

    expect(res.statusCode).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not a participant/i);
  });

  it('returns 400 when the recipient is not a participant in the conversation', async () => {
    await app.ready();
    // First findFirst: requesting user IS a participant
    // Second findFirst: recipient is NOT a participant
    mockParticipant.findFirst
      .mockResolvedValueOnce({ id: 'p-1', userId: USER_ID, conversationId: CONV_ID })
      .mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      payload: validEstablishBody,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/recipient is not a participant/i);
  });

  it('returns 404 when the recipient has no encryption keys stored', async () => {
    await app.ready();
    mockParticipant.findFirst
      .mockResolvedValueOnce({ id: 'p-1', userId: USER_ID, conversationId: CONV_ID })
      .mockResolvedValueOnce({ id: 'p-2', userId: TARGET_USER_ID, conversationId: CONV_ID });
    mockSignalPreKeyBundle.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      payload: validEstablishBody,
    });

    expect(res.statusCode).toBe(404);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not generated encryption keys/i);
  });

  it('returns 503 when the Signal Protocol service is not available', async () => {
    await app.ready();
    // Signal service is unavailable
    mockGetSignalService.mockReturnValue(null);
    mockParticipant.findFirst
      .mockResolvedValueOnce({ id: 'p-1', userId: USER_ID, conversationId: CONV_ID })
      .mockResolvedValueOnce({ id: 'p-2', userId: TARGET_USER_ID, conversationId: CONV_ID });
    mockSignalPreKeyBundle.findUnique.mockResolvedValue(sampleBundle);

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      payload: validEstablishBody,
    });

    expect(res.statusCode).toBe(503);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('E2EE_UNAVAILABLE');
  });

  it('returns 500 when a database error occurs during participant lookup', async () => {
    await app.ready();
    mockParticipant.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/signal/session/establish',
      payload: validEstablishBody,
    });

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
  });
});
