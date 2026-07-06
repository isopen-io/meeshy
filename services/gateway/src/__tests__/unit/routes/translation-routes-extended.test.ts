/**
 * Extended unit tests for routes/translation.ts
 * Covers branches not hit by translation-routes.test.ts:
 *   - getPredictedModelType() basic/medium/premium (lines 46-48)
 *   - translationRoutes() throw when no translationService (line 271)
 *   - POST /translate-blocking message_id path: e2ee, forbidden, same-lang, polling, fallback
 *   - POST /translate-blocking text path: polling, fallback
 *   - GET /test: success + failure
 *
 * IMPORTANT: fake timers must be activated AFTER buildApp() because Fastify's
 * app.ready() uses process.nextTick / setImmediate internally — activating fake
 * timers before ready() causes the app to hang.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { translationRoutes } from '../../../routes/translation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-ext-abc';
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const mockTranslationResult = {
  translatedText: 'Bonjour le monde',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  confidenceScore: 0.95,
  processingTime: 0.1,
  modelType: 'basic',
};

function makeMessage(overrides: Record<string, any> = {}) {
  return {
    id: MSG_ID,
    content: 'Hello world',
    originalLanguage: 'en',
    encryptionMode: null,
    conversationId: CONV_ID,
    conversation: { participants: [{ userId: USER_ID }] },
    ...overrides,
  };
}

// ─── Safety net: always restore real timers after each test ──────────────────
afterEach(() => jest.useRealTimers());

// ─── App factory ──────────────────────────────────────────────────────────────

type BuildOpts = {
  userId?: string | null;
  messageFindResult?: any;
  participantFindResult?: any;
  translationServiceOverrides?: Record<string, any>;
};

async function buildApp(opts: BuildOpts = {}): Promise<FastifyInstance> {
  const {
    userId = USER_ID,
    messageFindResult = null,
    participantFindResult = null,
    translationServiceOverrides = {},
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  if (userId !== null) {
    app.addHook('preHandler', async (req) => {
      (req as any).user = { userId };
    });
  }

  app.decorate('prisma', {
    message: { findUnique: jest.fn<any>().mockResolvedValue(messageFindResult) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(participantFindResult) },
  });

  app.decorate('translationService', {
    handleNewMessage: jest.fn<any>().mockResolvedValue({ messageId: MSG_ID }),
    getTranslation: jest.fn<any>().mockResolvedValue(mockTranslationResult),
    ...translationServiceOverrides,
  });

  await translationRoutes(app);
  await app.ready();
  return app;
}

// Helper: build app, activate fake timers, inject, advance timers, restore.
// IMPORTANT: doNotFake setImmediate/nextTick so Fastify's dispatch works.
// Only setTimeout is faked — the polling loop in translate-blocking uses setTimeout.
async function injectWithFakeTimers(
  app: FastifyInstance,
  injectOpts: any,
  advanceMs = 11000,
) {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  const responsePromise = app.inject(injectOpts);
  // Yield once so Fastify's real setImmediate can dispatch the request before we advance.
  await new Promise<void>((r) => setImmediate(r));
  await jest.advanceTimersByTimeAsync(advanceMs);
  const res = await responsePromise;
  jest.useRealTimers();
  return res;
}

// ─── translationRoutes throws when no translationService (line 271) ───────────

describe('translationRoutes — throws when translationService missing (line 271)', () => {
  it('throws during setup when fastify.translationService is undefined', async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', {
      message: { findUnique: jest.fn() },
      participant: { findFirst: jest.fn() },
    });
    await expect(translationRoutes(app)).rejects.toThrow('MessageTranslationService not provided');
  });
});

// ─── getPredictedModelType (lines 46-48) via text path with model_type=basic ─

describe('getPredictedModelType via translate-blocking text path (lines 46-48)', () => {
  it('predicts basic for short text (<20 chars)', async () => {
    const app = await buildApp({ participantFindResult: { id: 'p-1' } });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hi', target_language: 'fr', conversation_id: CONV_ID, model_type: 'basic' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('predicts medium for 50-char text (20-100 chars)', async () => {
    const app = await buildApp({ participantFindResult: { id: 'p-1' } });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'A'.repeat(50), target_language: 'fr', conversation_id: CONV_ID, model_type: 'basic' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('predicts premium for long text (>100 chars)', async () => {
    const app = await buildApp({ participantFindResult: { id: 'p-1' } });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'A'.repeat(150), target_language: 'fr', conversation_id: CONV_ID, model_type: 'basic' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── message_id path: e2ee check (line 337-338) ──────────────────────────────

describe('POST /translate-blocking — message_id e2ee returns 400 (line 337)', () => {
  it('returns 400 when message has encryptionMode = e2ee', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ encryptionMode: 'e2ee' }),
    });
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('E2EE_NOT_TRANSLATABLE');
    await app.close();
  });
});

// ─── message_id path: access denied (lines 342-347) ─────────────────────────

describe('POST /translate-blocking — message_id forbidden (line 345)', () => {
  it('returns 403 when user is not a participant', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({
        conversation: { participants: [{ userId: 'other-user' }] },
      }),
    });
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── message_id path: same source/target language short circuit (lines 355-367) ─

describe('POST /translate-blocking — message_id same-lang skip (lines 355-367)', () => {
  it('returns 200 immediately when source and target are the same', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ originalLanguage: 'fr' }),
    });
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.source_language).toBe('fr');
    expect(body.data.target_language).toBe('fr');
    await app.close();
  });

  it('returns 200 when source_language param matches target (line 356)', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ originalLanguage: null }),
    });
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'de', source_language: 'de' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── message_id path: getPredictedModelType via model_type=basic (lines 370-372) ─

describe('POST /translate-blocking — message_id — model_type predicts (lines 370-372)', () => {
  it('predicts model when model_type is basic for message', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ content: 'Hi', originalLanguage: null }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr', model_type: 'basic' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('uses explicit non-basic model_type for message (line 372 else)', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ originalLanguage: null }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr', model_type: 'premium' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('defaults to basic when no model_type (line 372 default)', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ originalLanguage: null }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── message_id path: happy path with translation result (lines 385-413) ────

describe('POST /translate-blocking — message_id path — translation found (lines 385-412)', () => {
  it('returns 200 when getTranslation resolves on first poll', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ originalLanguage: null }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.translated_text).toBe('Bonjour le monde');
    await app.close();
  });

  it('uses message text from DB when no text in payload (line 351)', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ content: 'DB message text', originalLanguage: null }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('uses source_language param over message.originalLanguage (line 352)', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ originalLanguage: 'en' }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr', source_language: 'de' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('skips access check when no userId (line 343 false branch)', async () => {
    const app = await buildApp({
      userId: null,
      messageFindResult: makeMessage({ originalLanguage: null }),
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── message_id path: fallback when getTranslation always null (lines 401-413) ─

describe('POST /translate-blocking — message_id fallback (lines 401-413)', () => {
  it('returns 200 with [FR] prefix fallback when getTranslation always returns null', async () => {
    const app = await buildApp({
      messageFindResult: makeMessage({ content: 'Hello', originalLanguage: 'en' }),
      translationServiceOverrides: {
        getTranslation: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.translated_text).toContain('[FR]');
    await app.close();
  });
});

// ─── text path: no userId (line 429-431) ─────────────────────────────────────

describe('POST /translate-blocking — text path — no auth (line 429)', () => {
  it('returns 401 when no user for new message translation', async () => {
    const app = await buildApp({ userId: null });
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello', target_language: 'fr', conversation_id: CONV_ID },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── text path: polls and returns result (lines 449-476) ─────────────────────

describe('POST /translate-blocking — text path — translation found (lines 449-476)', () => {
  it('returns 200 with translation on first poll', async () => {
    const app = await buildApp({ participantFindResult: { id: 'p-1' } });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello world', target_language: 'fr', conversation_id: CONV_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.translated_text).toBe('Bonjour le monde');
    await app.close();
  });

  it('falls back to senderId when no participant found (line 442)', async () => {
    const app = await buildApp({ participantFindResult: null });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello', target_language: 'fr', conversation_id: CONV_ID },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('uses provided source_language in messageData (line 443)', async () => {
    const app = await buildApp({ participantFindResult: { id: 'p-2' } });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hallo', target_language: 'fr', conversation_id: CONV_ID, source_language: 'de' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── text path: fallback when getTranslation always null (lines 465-477) ─────

describe('POST /translate-blocking — text path fallback (lines 465-477)', () => {
  it('returns 200 with [FR] prefix when translation never arrives', async () => {
    const app = await buildApp({
      participantFindResult: { id: 'p-3' },
      translationServiceOverrides: {
        getTranslation: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const res = await injectWithFakeTimers(app, {
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello world', target_language: 'fr', conversation_id: CONV_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.translated_text).toContain('[FR]');
    await app.close();
  });
});

// ─── GET /test — success (lines 644-674) ─────────────────────────────────────

describe('GET /test — success path (lines 644-674)', () => {
  it('returns 200 with test result when translation service works', async () => {
    const app = await buildApp();
    const res = await injectWithFakeTimers(app, { method: 'GET', url: '/test' }, 3000);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Translation service is working');
    await app.close();
  });
});

// ─── GET /test — failure (lines 660-662) ─────────────────────────────────────

describe('GET /test — failure when getTranslation returns null (lines 660-662)', () => {
  it('returns 500 with TEST_FAILED when no translation result', async () => {
    const app = await buildApp({
      translationServiceOverrides: {
        getTranslation: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const res = await injectWithFakeTimers(app, { method: 'GET', url: '/test' }, 3000);
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('TEST_FAILED');
    await app.close();
  });
});

// ─── GET /test — catch (lines 676-679) ───────────────────────────────────────

describe('GET /test — catch block when handleNewMessage throws (lines 676-679)', () => {
  it('returns 500 with TEST_FAILED when handleNewMessage throws', async () => {
    const app = await buildApp({
      translationServiceOverrides: {
        handleNewMessage: jest.fn<any>().mockRejectedValue(new Error('ZMQ unavailable')),
        getTranslation: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('TEST_FAILED');
    await app.close();
  });
});
