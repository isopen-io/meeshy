/**
 * translation-routes.test.ts
 *
 * Unit tests for src/routes/translation.ts
 * Covers:
 *   - GET  /languages          (static list, Cache-Control header)
 *   - POST /detect-language    (pattern-based detection)
 *   - POST /translate-blocking (early-exit paths only — no polling loop)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { translationRoutes } from '../../../routes/translation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const MSG_ID  = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockHandleNewMessage = jest.fn<any>();
const mockGetTranslation   = jest.fn<any>();
const mockFindUnique       = jest.fn<any>();
const mockFindFirst        = jest.fn<any>().mockResolvedValue(null);

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(withUser = true): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  const mockPrisma: any = {
    message: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
    },
    participant: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  };

  const mockTranslationService: any = {
    handleNewMessage: (...args: any[]) => mockHandleNewMessage(...args),
    getTranslation:   (...args: any[]) => mockGetTranslation(...args),
  };

  app.decorate('prisma', mockPrisma);
  app.decorate('translationService', mockTranslationService);

  if (withUser) {
    app.addHook('preHandler', async (req: any) => {
      req.user = { userId: USER_ID };
    });
  }

  app.register(translationRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /languages
// ---------------------------------------------------------------------------

describe('GET /languages', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success:true and an array of 8 languages', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/languages' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.languages)).toBe(true);
    expect(body.data.languages).toHaveLength(8);
  });

  it('includes Cache-Control header in response', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/languages' });

    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });
});

// ---------------------------------------------------------------------------
// POST /detect-language
// ---------------------------------------------------------------------------

describe('POST /detect-language', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('detects French when text contains French-specific accented characters', async () => {
    // French regex: /[àáâäçèéêëìíîïñòóôöùúûüÿ]/i — checked first in the route
    // Text with à, ç triggers the French branch
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/detect-language',
      payload: { text: 'Voilà, ça marche très bien' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.language).toBe('fr');
    expect(body.data.confidence).toBeGreaterThan(0.5);
  });

  it('returns fr for text with ñ because French regex runs first and includes ñ', async () => {
    // The pattern-based detection checks French first: /[àáâäçèéêëìíîïñòóôöùúûüÿ]/i
    // ñ appears in the French regex, so any Spanish text with ñ gets classified as French.
    // This test documents the actual implementation behavior (not linguistic accuracy).
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/detect-language',
      payload: { text: 'El niño juega en el jardín' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // ñ is in the French regex → returns 'fr' (French check runs first)
    expect(body.data.language).toBe('fr');
  });

  it('detects German when text contains ß (not in French or Spanish regex)', async () => {
    // ß is NOT in the French regex (/[àáâäçèéêëìíîïñòóôöùúûüÿ]/i)
    // ß is NOT in the Spanish regex (/[ñáéíóúü]/i)
    // ß IS in the German regex (/[äöüß]/i)
    // Text with ONLY ß and no French/Spanish chars falls through to German detection
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/detect-language',
      payload: { text: 'Das Wasser ist heiß' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.language).toBe('de');
  });

  it('defaults to English for plain ASCII text', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/detect-language',
      payload: { text: 'Hello, this is a plain English sentence.' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.language).toBe('en');
  });

  it('returns 400 when text field is missing (schema validation)', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/detect-language',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /translate-blocking — early-exit paths only (no polling loop)
// ---------------------------------------------------------------------------

describe('POST /translate-blocking', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when message_id is provided but message is not found in DB', async () => {
    await app.ready();
    mockFindUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: {
        message_id: MSG_ID,
        target_language: 'fr',
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when message has encryptionMode e2ee', async () => {
    await app.ready();
    mockFindUnique.mockResolvedValue({
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'encrypted content',
      originalLanguage: 'en',
      encryptionMode: 'e2ee',
      conversation: { participants: [] },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: {
        message_id: MSG_ID,
        target_language: 'fr',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('E2EE_NOT_TRANSLATABLE');
  });

  it('returns 400 when neither message_id nor conversation_id is provided', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: {
        text: 'Hello world',
        target_language: 'fr',
        // no message_id, no conversation_id
      },
    });

    // Zod refine fires: text is present but conversation_id is absent
    // The route body is valid per TranslateRequestSchema (text provided),
    // but the handler checks conversation_id explicitly and returns 400
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 401 when conversation_id provided with text but no auth user', async () => {
    // Build app WITHOUT a user preHandler
    const appNoUser = buildApp(false);
    await appNoUser.ready();

    const res = await appNoUser.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: {
        text: 'Hello world',
        conversation_id: CONV_ID,
        target_language: 'fr',
      },
    });

    await appNoUser.close();

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('AUTH_REQUIRED');
  });

  it('returns 500 when prisma.message.findUnique throws', async () => {
    await app.ready();
    mockFindUnique.mockRejectedValue(new Error('DB connection failed'));

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: {
        message_id: MSG_ID,
        target_language: 'fr',
      },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('TRANSLATION_ERROR');
  });
});
