/**
 * Unit tests for translation routes (translation.ts)
 * Tests GET /languages, POST /detect-language, POST /translate-blocking.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { translationRoutes } from '../../../routes/translation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
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

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(setUser = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Reproduit `createUnifiedAuthMiddleware({ requireAuth: true })` : 401
  // immédiat sans jeton, sinon peuple `request.user.userId` (compat legacy —
  // voir middleware/auth.ts:489-517). La route /translate-blocking exige
  // désormais ce `preHandler` (cf. faille CWE-862 corrigée : la vérification
  // d'appartenance était sautée quand `request.user` restait `undefined`).
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!setUser) {
      return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    req.user = { userId: USER_ID };
  });

  app.decorate('prisma', {
    message: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  });

  app.decorate('translationService', {
    handleNewMessage: jest.fn().mockResolvedValue({ messageId: MSG_ID }),
    getTranslation: jest.fn().mockResolvedValue(mockTranslationResult),
    translateText: jest.fn().mockResolvedValue(mockTranslationResult),
  });

  await translationRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /languages ───────────────────────────────────────────────────────────

describe('GET /languages', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with list of supported languages', async () => {
    const res = await app.inject({ method: 'GET', url: '/languages' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.languages)).toBe(true);
    expect(body.data.languages.length).toBeGreaterThan(0);
    expect(res.headers['cache-control']).toContain('public');
  });
});

// ─── POST /detect-language ────────────────────────────────────────────────────

describe('POST /detect-language', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with detected French language', async () => {
    const res = await app.inject({
      method: 'POST', url: '/detect-language',
      payload: { text: 'Où est la clé ?' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.language).toBe('fr');
  });

  it('returns 200 with detected English (no special chars)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/detect-language',
      payload: { text: 'Hello, how are you today?' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.language).toBe('en');
  });

  it('returns 200 detecting German text', async () => {
    const res = await app.inject({
      method: 'POST', url: '/detect-language',
      payload: { text: 'Die Straße ist sehr groß.' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.language).toBe('de');
  });
});

// ─── POST /translate-blocking ─────────────────────────────────────────────────

describe('POST /translate-blocking', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when target_language is missing (Fastify schema)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when neither text nor message_id is provided (Zod refine)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { target_language: 'fr' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text provided but conversation_id missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello world', target_language: 'fr' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when text+conversation_id but no auth', async () => {
    const noAuthApp = await buildApp(false);
    const res = await noAuthApp.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { text: 'Hello world', target_language: 'fr', conversation_id: CONV_ID },
    });
    expect(res.statusCode).toBe(401);
    await noAuthApp.close();
  });

  it('returns 404 when message_id not found', async () => {
    (app as any).prisma.message.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'fr' },
    });
    expect(res.statusCode).toBe(404);
  });

  // Parité avec la SSOT `CommonSchemas.language` (`packages/shared/utils/validation.ts`),
  // délibérément élargie à `.max(6)` pour admettre un code ISO 639-3 régionalisé
  // (`bas-CM`, `ewo-CM` — langues camerounaises officiellement supportées). Le
  // `.max(5)` local rejouait la régression exacte que la SSOT documente avoir
  // corrigée : le code voyage jusqu'au handler (404 message introuvable), il
  // n'est plus refusé à la frontière AJV/Zod.
  it('accepts region-tagged 6-char language codes (SSOT max=6) on source and target', async () => {
    (app as any).prisma.message.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, source_language: 'bas-CM', target_language: 'ewo-CM' },
    });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(404);
  });

  it('still rejects an over-long language code (7 chars) at the boundary', async () => {
    const res = await app.inject({
      method: 'POST', url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'abcd-CM' },
    });
    expect(res.statusCode).toBe(400);
  });
});
