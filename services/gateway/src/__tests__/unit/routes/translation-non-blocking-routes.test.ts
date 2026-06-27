/**
 * translation-non-blocking-routes.test.ts
 *
 * Unit tests for src/routes/translation-non-blocking.ts
 * Covers: POST /translate, GET /status/:messageId/:language, GET /conversation/:identifier
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { translationRoutes } from '../../../routes/translation-non-blocking';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID  = '507f1f77bcf86cd799439012';
const MSG_ID   = '507f1f77bcf86cd799439013';

// ---------------------------------------------------------------------------
// Mock services / prisma
// ---------------------------------------------------------------------------

const mockHandleNewMessage  = jest.fn<any>().mockResolvedValue({});
const mockGetTranslation    = jest.fn<any>();
const mockHandleMessage     = jest.fn<any>().mockResolvedValue({});

const mockMessage = { findUnique: jest.fn<any>() };
const mockConversation = { findFirst: jest.fn<any>() };

const mockPrisma: any = {
  message: mockMessage,
  conversation: mockConversation,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  app.decorate('prisma', mockPrisma);
  app.decorate('translationService', {
    handleNewMessage: mockHandleNewMessage,
    getTranslation: mockGetTranslation,
  });
  app.decorate('messagingService', {
    handleMessage: mockHandleMessage,
  });

  // Simulate fastify.authenticate: sets authContext then continues
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (authContext?.reject) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    req.authContext = authContext ?? {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
      isAnonymous: false,
    };
  });

  app.register(translationRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /translate
// ---------------------------------------------------------------------------

describe('POST /translate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleNewMessage.mockResolvedValue({});
    mockHandleMessage.mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 immediately when retranslating existing message (CAS 1)', async () => {
    await app.ready();
    mockMessage.findUnique.mockResolvedValue({
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'Hello',
      originalLanguage: 'en',
      conversation: { participants: [] },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: {
        message_id: MSG_ID,
        target_language: 'fr',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.messageId).toBe(MSG_ID);
    // Non-blocking — translationService called fire-and-forget style
    expect(mockHandleNewMessage).toHaveBeenCalled();
  });

  it('returns 200 with custom text override in CAS 1', async () => {
    await app.ready();
    mockMessage.findUnique.mockResolvedValue({
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'Original text',
      originalLanguage: 'en',
      conversation: { participants: [] },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: {
        message_id: MSG_ID,
        text: 'Custom override text',
        target_language: 'de',
        model_type: 'premium',
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when message_id not found', async () => {
    await app.ready();
    mockMessage.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.errorCode).toBe('MESSAGE_NOT_FOUND');
  });

  it('returns 200 immediately when translating new text (CAS 2)', async () => {
    await app.ready();
    mockResolveConversationId.mockResolvedValue(CONV_ID);

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: {
        text: 'Hello world',
        conversation_id: CONV_ID,
        target_language: 'fr',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('processing');
    expect(body.data.conversationId).toBe(CONV_ID);
    expect(mockHandleMessage).toHaveBeenCalled();
  });

  it('returns 400 when conversation_id missing for new message (CAS 2)', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'Hello', target_language: 'fr' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when conversation not found (CAS 2)', async () => {
    await app.ready();
    mockResolveConversationId.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'Hello', conversation_id: 'unknown-conv', target_language: 'fr' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when neither text nor message_id provided (Zod validation)', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { target_language: 'fr' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when target_language is missing (AJV/Zod validation)', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'Hello' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /status/:messageId/:language
// ---------------------------------------------------------------------------

describe('GET /status/:messageId/:language', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with completed status when translation found', async () => {
    await app.ready();
    const translationResult = {
      translatedText: 'Bonjour monde',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      confidenceScore: 0.98,
      modelType: 'basic',
      processingTime: 0.123,
    };
    mockGetTranslation.mockResolvedValue(translationResult);

    const res = await app.inject({
      method: 'GET',
      url: `/status/${MSG_ID}/fr`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.translation).toBeDefined();
    expect(mockGetTranslation).toHaveBeenCalledWith(MSG_ID, 'fr');
  });

  it('returns 200 with processing status when no translation yet', async () => {
    await app.ready();
    mockGetTranslation.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/status/${MSG_ID}/fr`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('processing');
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetTranslation.mockRejectedValue(new Error('service error'));

    const res = await app.inject({
      method: 'GET',
      url: `/status/${MSG_ID}/fr`,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.errorCode).toBe('STATUS_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /conversation/:identifier
// ---------------------------------------------------------------------------

describe('GET /conversation/:identifier', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with conversation data', async () => {
    await app.ready();
    mockConversation.findFirst.mockResolvedValue({
      id: CONV_ID,
      identifier: 'conv_test',
      title: 'Test Conv',
      type: 'direct',
      createdAt: new Date('2024-01-15'),
      lastMessageAt: new Date('2024-01-16'),
      _count: { messages: 42, participants: 3 },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/conversation/conv_test',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(CONV_ID);
    expect(body.data.messageCount).toBe(42);
    expect(body.data.memberCount).toBe(3);
  });

  it('returns 404 when conversation not found', async () => {
    await app.ready();
    mockConversation.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/conversation/unknown-conv',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.errorCode).toBe('CONVERSATION_NOT_FOUND');
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversation.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/conversation/conv_test',
    });

    expect(res.statusCode).toBe(500);
  });
});
