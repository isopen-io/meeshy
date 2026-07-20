/**
 * Route tests — translation-non-blocking routes
 *
 * Covers all 3 routes via Fastify inject:
 *   POST /translate                          — submit async translation
 *   GET  /status/:messageId/:language        — poll translation status
 *   GET  /conversation/:identifier           — get conversation by identifier
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockHandleNewMessage = jest.fn();
const mockHandleMessage = jest.fn();
const mockGetTranslation = jest.fn();

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn().mockResolvedValue(RESOLVED_CONV_ID),
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

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const MSG_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CONV_IDENTIFIER = 'conv_abc123';
const RESOLVED_CONV_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AUTH = { authorization: 'Bearer token' };

const TRANSLATION_RESULT = {
  translatedText: 'Bonjour le monde',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  confidenceScore: 0.95,
  modelType: 'basic',
  processingTime: 0.234,
};

const DB_CONVERSATION = {
  id: RESOLVED_CONV_ID,
  identifier: CONV_IDENTIFIER,
  title: 'Test Chat',
  type: 'direct',
  createdAt: new Date('2024-01-01'),
  lastMessageAt: new Date('2024-01-15'),
  _count: { messages: 42, participants: 2 },
};

const DB_MESSAGE = {
  id: MSG_ID,
  content: 'Hello world',
  conversationId: RESOLVED_CONV_ID,
  originalLanguage: 'en',
  conversation: { participants: [] },
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  messageFindUnique?: typeof DB_MESSAGE | null | Error;
  conversationFindFirst?: typeof DB_CONVERSATION | null | Error;
};

function opt<T>(v: T | undefined, fallback: T): T {
  return v === undefined ? fallback : v;
}

function mockFn<T>(v: T | Error): jest.Mock {
  return v instanceof Error
    ? jest.fn().mockRejectedValue(v)
    : jest.fn().mockResolvedValue(v);
}

function makePrisma(opts: PrismaOpts = {}) {
  return {
    message: {
      findUnique: mockFn(opt(opts.messageFindUnique, DB_MESSAGE)),
    },
    conversation: {
      findFirst: mockFn(opt(opts.conversationFindFirst, DB_CONVERSATION)),
    },
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

async function buildApp(prismaOpts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  app.decorate('translationService', {
    handleNewMessage: (...a: unknown[]) => mockHandleNewMessage(...(a as [])),
    getTranslation: (...a: unknown[]) => mockGetTranslation(...(a as [])),
  } as unknown);
  app.decorate('messagingService', {
    handleMessage: (...a: unknown[]) => mockHandleMessage(...(a as [])),
  } as unknown);
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers['authorization'];
    if (!token) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    (req as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      userId: USER_ID,
      isAnonymous: false,
      hasFullAccess: true,
    };
  });

  const { translationRoutes } = await import('../../../routes/translation-non-blocking');
  await app.register(translationRoutes, { prefix: '' });
  await app.ready();
  return app;
}

// ─── POST /translate ─────────────────────────────────────────────────────────

describe('POST /translate', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockHandleMessage.mockResolvedValue(undefined);
  });

  it('returns 200 with processing status when retranslating an existing message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({
        message_id: MSG_ID,
        target_language: 'fr',
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.messageId).toBe(MSG_ID);
    expect(body.data.targetLanguage).toBe('fr');
  });

  it('triggers non-blocking translation without awaiting when retranslating', async () => {
    await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'es' }),
    });
    expect(mockHandleNewMessage).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with processing status when submitting new text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello world',
        target_language: 'fr',
        conversation_id: CONV_IDENTIFIER,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
  });

  it('returns 404 when message_id refers to a non-existent message', async () => {
    const appNoMsg = await buildApp({ messageFindUnique: null });
    const res = await appNoMsg.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(404);
    await appNoMsg.close();
  });

  it('returns 400 when neither text nor message_id is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is provided without conversation_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when target_language is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when conversation_id cannot be resolved', async () => {
    const { resolveConversationId } = jest.requireMock('../../../utils/conversation-id-cache') as {
      resolveConversationId: jest.Mock;
    };
    resolveConversationId.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello',
        target_language: 'fr',
        conversation_id: 'unknown-conv',
      }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /status/:messageId/:language ────────────────────────────────────────

describe('GET /status/:messageId/:language', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with completed status when translation is available', async () => {
    mockGetTranslation.mockResolvedValue(TRANSLATION_RESULT);
    const res = await app.inject({
      method: 'GET',
      url: `/status/${MSG_ID}/fr`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.translation).toEqual(TRANSLATION_RESULT);
  });

  it('returns 200 with processing status when translation is not yet available', async () => {
    mockGetTranslation.mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: `/status/${MSG_ID}/fr`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.translation).toBeUndefined();
  });

  it('returns 500 when translation service throws', async () => {
    mockGetTranslation.mockRejectedValue(new Error('service crash'));
    const res = await app.inject({
      method: 'GET',
      url: `/status/${MSG_ID}/fr`,
    });
    expect(res.statusCode).toBe(500);
  });

  it('passes correct messageId and language to getTranslation', async () => {
    mockGetTranslation.mockResolvedValue(null);
    await app.inject({ method: 'GET', url: `/status/${MSG_ID}/de` });
    expect(mockGetTranslation).toHaveBeenCalledWith(MSG_ID, 'de');
  });
});

// ─── GET /conversation/:identifier ───────────────────────────────────────────

describe('GET /conversation/:identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with conversation details when identifier matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/conversation/${CONV_IDENTIFIER}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(RESOLVED_CONV_ID);
    expect(body.data.identifier).toBe(CONV_IDENTIFIER);
    expect(body.data.messageCount).toBe(42);
    expect(body.data.memberCount).toBe(2);
  });

  it('returns 404 when conversation identifier not found', async () => {
    const appNoConv = await buildApp({ conversationFindFirst: null });
    const res = await appNoConv.inject({
      method: 'GET',
      url: '/conversation/unknown-identifier',
    });
    expect(res.statusCode).toBe(404);
    await appNoConv.close();
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ conversationFindFirst: new Error('db crash') });
    const res = await appErr.inject({
      method: 'GET',
      url: `/conversation/${CONV_IDENTIFIER}`,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('response includes all expected fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/conversation/${CONV_IDENTIFIER}`,
    });
    const body = res.json();
    expect(body.data).toMatchObject({
      id: expect.any(String),
      identifier: expect.any(String),
      type: expect.any(String),
      messageCount: expect.any(Number),
      memberCount: expect.any(Number),
    });
  });
});
