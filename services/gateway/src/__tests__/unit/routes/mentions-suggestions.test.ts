/**
 * mentions-suggestions.test.ts
 *
 * Tests for GET /mentions/suggestions with unified contextId/contextType design.
 *
 * Covers:
 * - Schema validation: legacy conversationId, new contextId+contextType, invalid inputs
 * - Route handler wiring: correct service method called for each contextType
 * - Unauthenticated → 401
 * - contextType=post with access denied → 403
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MentionSuggestion } from '../../../services/MentionService';

const VALID_CONV_ID = '507f1f77bcf86cd799439011';
const VALID_POST_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439099';

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Jest before imports)
// ---------------------------------------------------------------------------

const mockGetSuggestionsForConversation = jest.fn<(contextId: string, userId: string, query: string) => Promise<MentionSuggestion[]>>();
const mockGetSuggestionsForPost = jest.fn<(postId: string, userId: string, query: string) => Promise<MentionSuggestion[]>>();

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    getUserSuggestionsForConversation: mockGetSuggestionsForConversation,
    getUserSuggestionsForPost: mockGetSuggestionsForPost,
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    (_prisma: unknown, _opts: unknown) =>
      async (
        request: import('fastify').FastifyRequest,
        reply: import('fastify').FastifyReply
      ): Promise<void> => {
        const token = request.headers['authorization'];
        if (!token) {
          await reply.code(401).send({ success: false, error: 'Authentification requise' });
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

// ---------------------------------------------------------------------------
// Fastify helpers
// ---------------------------------------------------------------------------

function buildSuggestion(overrides: Partial<MentionSuggestion> = {}): MentionSuggestion {
  return {
    id: '507f1f77bcf86cd799439001',
    username: 'alice',
    displayName: 'Alice',
    avatar: null,
    badge: 'conversation',
    inConversation: true,
    isFriend: false,
    ...overrides,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Decorate prisma to satisfy plugin expectations
  app.decorate('prisma', {} as PrismaClient);
  const { default: mentionRoutes } = await import('../../../routes/mentions');
  await app.register(mentionRoutes);
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Schema validation tests (no Fastify needed)
// ---------------------------------------------------------------------------

describe('SuggestionsQuerySchema validation', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SuggestionsQuerySchema } = require('../../../validation/mentions-schemas') as typeof import('../../../validation/mentions-schemas');

  describe('valid inputs', () => {
    it('accepts legacy conversationId alone', () => {
      const result = SuggestionsQuerySchema.safeParse({ conversationId: VALID_CONV_ID });
      expect(result.success).toBe(true);
    });

    it('accepts contextId + contextType=conversation', () => {
      const result = SuggestionsQuerySchema.safeParse({
        contextId: VALID_CONV_ID,
        contextType: 'conversation',
      });
      expect(result.success).toBe(true);
    });

    it('accepts contextId + contextType=post', () => {
      const result = SuggestionsQuerySchema.safeParse({
        contextId: VALID_POST_ID,
        contextType: 'post',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all params together with optional query', () => {
      const result = SuggestionsQuerySchema.safeParse({
        contextId: VALID_POST_ID,
        contextType: 'post',
        query: 'alice',
      });
      expect(result.success).toBe(true);
    });

    it('accepts conversationId with optional query', () => {
      const result = SuggestionsQuerySchema.safeParse({
        conversationId: VALID_CONV_ID,
        query: 'bob',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs → validation error', () => {
    it('rejects when neither conversationId nor (contextId + contextType) provided', () => {
      const result = SuggestionsQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects contextId without contextType', () => {
      const result = SuggestionsQuerySchema.safeParse({ contextId: VALID_POST_ID });
      expect(result.success).toBe(false);
    });

    it('rejects contextType without contextId', () => {
      const result = SuggestionsQuerySchema.safeParse({ contextType: 'post' });
      expect(result.success).toBe(false);
    });

    it('rejects non-hex contextId', () => {
      const result = SuggestionsQuerySchema.safeParse({
        contextId: 'not-a-valid-object-id',
        contextType: 'post',
      });
      expect(result.success).toBe(false);
    });

    it('rejects contextId that is too short (not 24 hex chars)', () => {
      const result = SuggestionsQuerySchema.safeParse({
        contextId: '507f1f77',
        contextType: 'post',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid contextType enum value', () => {
      const result = SuggestionsQuerySchema.safeParse({
        contextId: VALID_POST_ID,
        contextType: 'story',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-hex conversationId', () => {
      const result = SuggestionsQuerySchema.safeParse({ conversationId: 'not-valid' });
      expect(result.success).toBe(false);
    });

    it('rejects query longer than 64 characters', () => {
      const result = SuggestionsQuerySchema.safeParse({
        conversationId: VALID_CONV_ID,
        query: 'a'.repeat(65),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('backwards compatibility', () => {
    it('legacy conversationId alone succeeds — no contextId/contextType required', () => {
      const result = SuggestionsQuerySchema.safeParse({ conversationId: VALID_CONV_ID });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conversationId).toBe(VALID_CONV_ID);
        expect(result.data.contextId).toBeUndefined();
        expect(result.data.contextType).toBeUndefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Route handler wiring tests
// ---------------------------------------------------------------------------

describe('GET /mentions/suggestions — route handler wiring', () => {
  let app: FastifyInstance;
  const defaultSuggestions: MentionSuggestion[] = [buildSuggestion()];

  beforeAll(async () => {
    mockGetSuggestionsForConversation.mockResolvedValue(defaultSuggestions);
    mockGetSuggestionsForPost.mockResolvedValue(defaultSuggestions);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSuggestionsForConversation.mockResolvedValue(defaultSuggestions);
    mockGetSuggestionsForPost.mockResolvedValue(defaultSuggestions);
  });

  it('returns 401 for unauthenticated requests (no Authorization header)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?conversationId=${VALID_CONV_ID}`,
      // no Authorization header
    });
    expect(res.statusCode).toBe(401);
  });

  it('legacy conversationId → calls getUserSuggestionsForConversation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?conversationId=${VALID_CONV_ID}`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetSuggestionsForConversation).toHaveBeenCalledWith(VALID_CONV_ID, USER_ID, '');
    expect(mockGetSuggestionsForPost).not.toHaveBeenCalled();
  });

  it('contextId + contextType=conversation → calls getUserSuggestionsForConversation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?contextId=${VALID_CONV_ID}&contextType=conversation`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetSuggestionsForConversation).toHaveBeenCalledWith(VALID_CONV_ID, USER_ID, '');
    expect(mockGetSuggestionsForPost).not.toHaveBeenCalled();
  });

  it('contextId + contextType=post → calls getUserSuggestionsForPost', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?contextId=${VALID_POST_ID}&contextType=post`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetSuggestionsForPost).toHaveBeenCalledWith(VALID_POST_ID, USER_ID, '');
    expect(mockGetSuggestionsForConversation).not.toHaveBeenCalled();
  });

  it('contextType=post with query=alice → passes query to getUserSuggestionsForPost', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?contextId=${VALID_POST_ID}&contextType=post&query=alice`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetSuggestionsForPost).toHaveBeenCalledWith(VALID_POST_ID, USER_ID, 'alice');
  });

  it('contextType=post access denied by service → 403', async () => {
    mockGetSuggestionsForPost.mockRejectedValue(new Error('Post non trouvé ou accès refusé'));

    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?contextId=${VALID_POST_ID}&contextType=post`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('missing both → 400 from schema validation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('contextId not a valid MongoDB ObjectId → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?contextId=not-valid-id&contextType=post`,
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns suggestions array in response data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mentions/suggestions?conversationId=${VALID_CONV_ID}`,
      headers: { authorization: 'Bearer fake-token' },
    });
    const body = JSON.parse(res.body) as { success: boolean; data: MentionSuggestion[] };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].username).toBe('alice');
  });
});
