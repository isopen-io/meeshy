/**
 * Unit tests for Voice Analysis Routes
 *
 * Covers all 5 endpoints:
 *   POST /attachments/:attachmentId/analysis
 *   POST /attachments/batch/analysis
 *   GET  /attachments/:attachmentId/analysis
 *   POST /voice/analysis
 *   GET  /voice/analysis
 *
 * Auth strategy: the middleware mock sets req.auth = { userId: 'user-123' }
 * when the Authorization header is present. Omitting the header leaves
 * req.auth undefined, exercising the !userId → 401 branch.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Top-level mock vars (declared before jest.mock so hoisting works) ────────

const mockAnalyzeAttachment = jest.fn<any>();
const mockAnalyzeAttachmentsBatch = jest.fn<any>();
const mockAnalyzeVoiceProfile = jest.fn<any>();
const mockGetAttachmentAnalysis = jest.fn<any>();
const mockGetVoiceProfileAnalysis = jest.fn<any>();

// ─── Module mocks (hoisted by Jest) ──────────────────────────────────────────

jest.mock('../../../services/VoiceAnalysisService', () => ({
  VoiceAnalysisService: jest.fn().mockImplementation(() => ({
    analyzeAttachment: (...args: unknown[]) => mockAnalyzeAttachment(...args),
    analyzeAttachmentsBatch: (...args: unknown[]) => mockAnalyzeAttachmentsBatch(...args),
    analyzeVoiceProfile: (...args: unknown[]) => mockAnalyzeVoiceProfile(...args),
    getAttachmentAnalysis: (...args: unknown[]) => mockGetAttachmentAnalysis(...args),
    getVoiceProfileAnalysis: (...args: unknown[]) => mockGetVoiceProfileAnalysis(...args),
  })),
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn<any>().mockResolvedValue({}) },
}));

/**
 * Auth middleware: sets req.auth.userId when Authorization header is present.
 * Omitting the header leaves req.auth undefined → exercises the 401 branch.
 */
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (
        request: import('fastify').FastifyRequest,
        _reply: import('fastify').FastifyReply
      ): Promise<void> => {
        if (request.headers['authorization']) {
          (request as any).auth = { userId: 'user-123', type: 'registered' };
        }
      }
  ),
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

jest.mock('@meeshy/shared/types/voice-api', () => ({}));

// ─── Import the route under test (AFTER all jest.mock calls) ─────────────────

import { voiceAnalysisRoutes } from '../../../routes/voice-analysis';

// ─── Constants & factory helpers ─────────────────────────────────────────────

const USER_ID = 'user-123';
const ATTACHMENT_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439022';
const AUTH_HEADER = 'Bearer token';

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return { messageId: MESSAGE_ID, ...overrides };
}

function makeAnalysisResult(overrides: Record<string, unknown> = {}) {
  return {
    attachmentId: ATTACHMENT_ID,
    messageId: MESSAGE_ID,
    analysis: { pitch: { mean: 150 } },
    persisted: true,
    ...overrides,
  };
}

function makeBatchResult(overrides: Record<string, unknown> = {}) {
  return {
    success: [makeAnalysisResult()],
    failures: [],
    ...overrides,
  };
}

function makeVoiceProfileResult(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    analysis: { pitch: { mean: 180 } },
    persisted: true,
    ...overrides,
  };
}

function makeBatchAttachment(overrides: Record<string, unknown> = {}) {
  return { attachmentId: ATTACHMENT_ID, messageId: MESSAGE_ID, ...overrides };
}

// ─── App factory ──────────────────────────────────────────────────────────────

type AppOptions = {
  hasPrisma?: boolean;
  findUniqueResult?: Record<string, unknown> | null;
};

async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const { hasPrisma = true, findUniqueResult = makeAttachment() } = opts;
  const app = Fastify({ logger: false });

  if (hasPrisma) {
    app.decorate('prisma', {
      messageAttachment: {
        findUnique: jest.fn<any>().mockResolvedValue(findUniqueResult),
      },
    } as any);
  }

  await app.register(voiceAnalysisRoutes);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('voiceAnalysisRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Route registration guard
  // ══════════════════════════════════════════════════════════════════════════

  describe('Route registration', () => {
    it('registers routes successfully when prisma is available', async () => {
      // Route exists → any status other than 404 (Fastify "route not found")
      mockAnalyzeAttachment.mockResolvedValueOnce(makeAnalysisResult());

      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('returns early without crashing when prisma is missing', async () => {
      const noPrismaApp = await buildApp({ hasPrisma: false });

      const response = await noPrismaApp.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      // Routes were not registered → Fastify returns 404
      expect(response.statusCode).toBe(404);
      await noPrismaApp.close();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /attachments/:attachmentId/analysis
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /attachments/:attachmentId/analysis', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        payload: {},
        // No Authorization header → middleware leaves req.auth undefined
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 404 when attachment does not exist', async () => {
      const missingApp = await buildApp({ findUniqueResult: null });

      const response = await missingApp.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      await missingApp.close();
    });

    it('returns 200 with analysis data on service success', async () => {
      const result = makeAnalysisResult();
      mockAnalyzeAttachment.mockResolvedValueOnce(result);

      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: { audioPath: '/tmp/audio.wav', persist: true },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        attachmentId: ATTACHMENT_ID,
        persisted: true,
      });
    });

    it('passes userId and attachment metadata to analyzeAttachment', async () => {
      const result = makeAnalysisResult();
      mockAnalyzeAttachment.mockResolvedValueOnce(result);

      await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: { audioBase64: 'base64data', analysisTypes: ['pitch'] },
      });

      expect(mockAnalyzeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentId: ATTACHMENT_ID,
          messageId: MESSAGE_ID,
          userId: USER_ID,
          audioBase64: 'base64data',
          analysisTypes: ['pitch'],
        })
      );
    });

    it('returns 500 when analyzeAttachment throws', async () => {
      mockAnalyzeAttachment.mockRejectedValueOnce(new Error('ZMQ timeout'));

      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('ZMQ timeout');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /attachments/batch/analysis
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /attachments/batch/analysis', () => {
    it('returns 401 when Authorization header is absent', async () => {
      // Send a schema-valid payload so Fastify's schema validation passes
      // and the preHandler (auth check) is reached.
      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        payload: { attachments: [makeBatchAttachment()] },
        // No Authorization header → middleware leaves req.auth undefined
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 when attachments array is empty', async () => {
      // The route schema has minItems: 1, so Fastify's JSON Schema validator
      // rejects an empty array before the handler runs.
      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when attachments array is missing', async () => {
      // Route schema marks attachments as required, Fastify rejects at schema level.
      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when attachments array exceeds 50 items', async () => {
      // Route schema has maxItems: 50, Fastify rejects at schema level.
      const attachments = Array.from({ length: 51 }, (_, i) =>
        makeBatchAttachment({ attachmentId: `att-${i}`, messageId: `msg-${i}` })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 200 with success/failures/counts on service success', async () => {
      const batchResult = makeBatchResult();
      mockAnalyzeAttachmentsBatch.mockResolvedValueOnce(batchResult);

      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments: [makeBatchAttachment()] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        total: 1,
        successCount: 1,
        failureCount: 0,
      });
      expect(Array.isArray(body.data.success)).toBe(true);
      expect(Array.isArray(body.data.failures)).toBe(true);
    });

    it('passes per-attachment options with userId to analyzeAttachmentsBatch', async () => {
      mockAnalyzeAttachmentsBatch.mockResolvedValueOnce(makeBatchResult());

      const att = makeBatchAttachment({ audioPath: '/tmp/a.wav', analysisTypes: ['timbre'] });
      await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments: [att], persist: false },
      });

      expect(mockAnalyzeAttachmentsBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          attachmentId: ATTACHMENT_ID,
          messageId: MESSAGE_ID,
          userId: USER_ID,
          audioPath: '/tmp/a.wav',
          analysisTypes: ['timbre'],
          persist: false,
        }),
      ]);
    });

    it('returns 500 when analyzeAttachmentsBatch throws', async () => {
      mockAnalyzeAttachmentsBatch.mockRejectedValueOnce(new Error('batch failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments: [makeBatchAttachment()] },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('batch failed');
    });

    it('allows exactly 50 attachments (boundary)', async () => {
      mockAnalyzeAttachmentsBatch.mockResolvedValueOnce({
        success: [],
        failures: [],
      });

      const attachments = Array.from({ length: 50 }, (_, i) =>
        makeBatchAttachment({ attachmentId: `att-${i}`, messageId: `msg-${i}` })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.total).toBe(50);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /attachments/:attachmentId/analysis
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /attachments/:attachmentId/analysis', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 200 with null data when no analysis exists', async () => {
      mockGetAttachmentAnalysis.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    it('returns 200 with wrapped analysis when analysis exists', async () => {
      const analysis = { pitch: { mean: 150 }, timbre: { spectralCentroid: 1500 } };
      mockGetAttachmentAnalysis.mockResolvedValueOnce(analysis);

      const response = await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      // `toHaveProperty` seul a laissé vivre le défaut : `{}` porte la clé.
      // Les témoins de VALEUR sont plus bas (§ « le sérialiseur sert enfin »).
      expect(body.data).toHaveProperty('analysis');
    });

    it('passes attachmentId to getAttachmentAnalysis', async () => {
      mockGetAttachmentAnalysis.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
      });

      expect(mockGetAttachmentAnalysis).toHaveBeenCalledWith(ATTACHMENT_ID);
    });

    it('returns 500 when getAttachmentAnalysis throws', async () => {
      mockGetAttachmentAnalysis.mockRejectedValueOnce(new Error('DB read error'));

      const response = await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('DB read error');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /voice/analysis
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /voice/analysis', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/voice/analysis',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 200 with profile result on service success', async () => {
      const result = makeVoiceProfileResult();
      mockAnalyzeVoiceProfile.mockResolvedValueOnce(result);

      const response = await app.inject({
        method: 'POST',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { audioBase64: 'base64audio', persist: true },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ userId: USER_ID, persisted: true });
    });

    it('passes userId and audio options to analyzeVoiceProfile', async () => {
      mockAnalyzeVoiceProfile.mockResolvedValueOnce(makeVoiceProfileResult());

      await app.inject({
        method: 'POST',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: {
          audioPath: '/tmp/voice.wav',
          analysisTypes: ['pitch', 'mfcc'],
          persist: false,
        },
      });

      expect(mockAnalyzeVoiceProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          audioPath: '/tmp/voice.wav',
          analysisTypes: ['pitch', 'mfcc'],
          persist: false,
        })
      );
    });

    it('returns 500 when analyzeVoiceProfile throws', async () => {
      mockAnalyzeVoiceProfile.mockRejectedValueOnce(new Error('voice model unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('voice model unavailable');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /voice/analysis
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /voice/analysis', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/voice/analysis',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 200 with null data when no profile analysis exists', async () => {
      mockGetVoiceProfileAnalysis.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    it('returns 200 with wrapped analysis when profile analysis exists', async () => {
      const analysis = { pitch: { mean: 200 }, classification: { voiceType: 'soprano' } };
      mockGetVoiceProfileAnalysis.mockResolvedValueOnce(analysis);

      const response = await app.inject({
        method: 'GET',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      // `toHaveProperty` seul a laissé vivre le défaut : `{}` porte la clé.
      // Les témoins de VALEUR sont plus bas (§ « le sérialiseur sert enfin »).
      expect(body.data).toHaveProperty('analysis');
    });

    it('passes userId to getVoiceProfileAnalysis', async () => {
      mockGetVoiceProfileAnalysis.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
      });

      expect(mockGetVoiceProfileAnalysis).toHaveBeenCalledWith(USER_ID);
    });

    it('returns 500 when getVoiceProfileAnalysis throws', async () => {
      mockGetVoiceProfileAnalysis.mockRejectedValueOnce(new Error('profile read failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('profile read failed');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Error fallback message branches (error.message || 'fallback')
  // These cover the right-hand side of each catch block's || operator by
  // throwing a non-Error object that has no `message` property.
  // ══════════════════════════════════════════════════════════════════════════

  describe('error fallback messages', () => {
    it('POST /attachments/:id/analysis — uses fallback when error has no message', async () => {
      mockAnalyzeAttachment.mockRejectedValueOnce({ code: 'TIMEOUT' });

      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Voice analysis failed');
    });

    it('POST /attachments/batch/analysis — uses fallback when error has no message', async () => {
      mockAnalyzeAttachmentsBatch.mockRejectedValueOnce({ code: 'ZMQ_ERR' });

      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments: [makeBatchAttachment()] },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Batch voice analysis failed');
    });

    it('GET /attachments/:id/analysis — uses fallback when error has no message', async () => {
      mockGetAttachmentAnalysis.mockRejectedValueOnce({ code: 'DB_ERR' });

      const response = await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to retrieve analysis');
    });

    it('POST /voice/analysis — uses fallback when error has no message', async () => {
      mockAnalyzeVoiceProfile.mockRejectedValueOnce({ code: 'MODEL_ERR' });

      const response = await app.inject({
        method: 'POST',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Voice profile analysis failed');
    });

    it('GET /voice/analysis — uses fallback when error has no message', async () => {
      mockGetVoiceProfileAnalysis.mockRejectedValueOnce({ code: 'DB_ERR' });

      const response = await app.inject({
        method: 'GET',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to retrieve profile analysis');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // persist=true default branch — requires a Fastify app with AJV useDefaults
  // disabled so the schema doesn't inject the default before the handler.
  // ══════════════════════════════════════════════════════════════════════════

  describe('persist=true JS-level default (AJV defaults disabled)', () => {
    let noDefaultApp: FastifyInstance;

    beforeEach(async () => {
      jest.clearAllMocks();
      noDefaultApp = Fastify({
        logger: false,
        ajv: { customOptions: { useDefaults: false } },
      });
      noDefaultApp.decorate('prisma', {
        messageAttachment: {
          findUnique: jest.fn<any>().mockResolvedValue(makeAttachment()),
        },
      } as any);
      await noDefaultApp.register(voiceAnalysisRoutes);
      await noDefaultApp.ready();
    });

    afterEach(async () => {
      await noDefaultApp.close();
    });

    it('POST /attachments/:id/analysis — defaults persist to true when not in body', async () => {
      mockAnalyzeAttachment.mockResolvedValueOnce(makeAnalysisResult());

      await noDefaultApp.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: { audioPath: '/tmp/a.wav' }, // no persist field
      });

      expect(mockAnalyzeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ persist: true })
      );
    });

    it('POST /attachments/batch/analysis — defaults persist to true when not in body', async () => {
      mockAnalyzeAttachmentsBatch.mockResolvedValueOnce(makeBatchResult());

      await noDefaultApp.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { attachments: [makeBatchAttachment()] }, // no persist field
      });

      expect(mockAnalyzeAttachmentsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ persist: true })])
      );
    });

    it('POST /voice/analysis — defaults persist to true when not in body', async () => {
      mockAnalyzeVoiceProfile.mockResolvedValueOnce(makeVoiceProfileResult());

      await noDefaultApp.inject({
        method: 'POST',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { audioPath: '/tmp/voice.wav' }, // no persist field
      });

      expect(mockAnalyzeVoiceProfile).toHaveBeenCalledWith(
        expect.objectContaining({ persist: true })
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Le sérialiseur sert enfin ce que le handler produit (cycle 90)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Les quatre charges utiles `analysis` étaient déclarées `{ type: 'object' }`
   * NU. fast-json-stringify applique `additionalProperties: false` par défaut :
   * elles sortaient toutes en `{}`. Les témoins historiques ne le voyaient pas —
   * ils demandaient la CLÉ (`toHaveProperty('analysis')`), que `{}` porte.
   *
   * Ceux-ci traversent le sérialiseur et assertent sur des VALEURS.
   */
  describe('les charges utiles `analysis` traversent le sérialiseur', () => {
    const ANALYSIS = {
      pitch: { mean: 152.5, std: 24.5, min: 98.25, max: 233.75 },
      timbre: {
        spectralCentroid: 1820.5,
        spectralBandwidth: 1640.25,
        spectralRolloff: 3480.75,
        spectralFlatness: 0.0421
      },
      mfcc: { mean: [-282.4], std: [41.7] },
      energy: { rms: 0.0834, dynamicRange: 42.5 },
      classification: {
        voiceType: 'medium_male',
        gender: 'male',
        ageRange: 'adult',
        confidence: 0.82
      },
      prosody: { energyMean: 0.0834, energyStd: 0.0217, silenceRatio: 0.235, speechRateWpm: 142.5 },
      qualityMetrics: {
        overallScore: 0.83,
        clarity: 0.708,
        consistency: 0.84,
        suitableForCloning: true,
        trainingQuality: 'excellent'
      }
    };

    it('POST /attachments/:id/analysis sert les familles, pas `{}`', async () => {
      mockAnalyzeAttachment.mockResolvedValueOnce({
        attachmentId: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        analysis: ANALYSIS,
        persisted: true
      });

      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: { audioBase64: 'AAA' }
      });

      const { analysis } = response.json().data;
      expect(analysis.pitch).toEqual({ mean: 152.5, std: 24.5, min: 98.25, max: 233.75 });
      expect(analysis.timbre.spectralCentroid).toBe(1820.5);
      expect(analysis.energy.dynamicRange).toBe(42.5);
      expect(analysis.classification.voiceType).toBe('medium_male');
      expect(analysis.mfcc.mean).toEqual([-282.4]);
    });

    it('POST /attachments/:id/analysis sert la prosodie et les métriques de qualité', async () => {
      mockAnalyzeAttachment.mockResolvedValueOnce({
        attachmentId: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        analysis: ANALYSIS,
        persisted: true
      });

      const response = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER },
        payload: { audioBase64: 'AAA' }
      });

      const { analysis } = response.json().data;
      expect(analysis.prosody.speechRateWpm).toBe(142.5);
      expect(analysis.qualityMetrics.trainingQuality).toBe('excellent');
      expect(analysis.qualityMetrics.suitableForCloning).toBe(true);
    });

    it('GET /attachments/:id/analysis sert l’analyse persistée', async () => {
      mockGetAttachmentAnalysis.mockResolvedValueOnce(ANALYSIS);

      const response = await app.inject({
        method: 'GET',
        url: `/attachments/${ATTACHMENT_ID}/analysis`,
        headers: { Authorization: AUTH_HEADER }
      });

      expect(response.json().data.analysis.timbre.spectralRolloff).toBe(3480.75);
    });

    it('POST /voice/analysis sert l’analyse du profil vocal', async () => {
      mockAnalyzeVoiceProfile.mockResolvedValueOnce({
        userId: USER_ID,
        analysis: ANALYSIS,
        persisted: true
      });

      const response = await app.inject({
        method: 'POST',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: { audioBase64: 'AAA' }
      });

      expect(response.json().data.analysis.classification.confidence).toBe(0.82);
    });

    it('GET /voice/analysis sert l’analyse persistée du profil', async () => {
      mockGetVoiceProfileAnalysis.mockResolvedValueOnce(ANALYSIS);

      const response = await app.inject({
        method: 'GET',
        url: '/voice/analysis',
        headers: { Authorization: AUTH_HEADER }
      });

      expect(response.json().data.analysis.pitch.mean).toBe(152.5);
    });

    it('le lot sert chaque ligne entière — la liste de la bonne longueur remplie de `{}` est le piège', async () => {
      mockAnalyzeAttachmentsBatch.mockResolvedValueOnce({
        success: [
          { attachmentId: ATTACHMENT_ID, messageId: MESSAGE_ID, analysis: ANALYSIS, persisted: true }
        ],
        failures: [{ id: 'att-2', error: 'boom' }]
      });

      const response = await app.inject({
        method: 'POST',
        url: '/attachments/batch/analysis',
        headers: { Authorization: AUTH_HEADER },
        payload: {
          attachments: [
            { attachmentId: ATTACHMENT_ID, messageId: MESSAGE_ID, audioBase64: 'AAA' }
          ]
        }
      });

      const body = response.json().data;
      expect(body.success[0].attachmentId).toBe(ATTACHMENT_ID);
      expect(body.success[0].analysis.energy.rms).toBe(0.0834);
      expect(body.failures[0]).toEqual({ id: 'att-2', error: 'boom' });
    });
  });
});
