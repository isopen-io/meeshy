/**
 * Unit tests for voice analysis routes (analysis.ts)
 * Tests POST /api/v1/voice/analyze, /compare, /feedback.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerAnalysisRoutes } from '../../../../routes/voice/analysis';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const PREFIX = '/api/v1/voice';

// ─── Mock AudioTranslateService ───────────────────────────────────────────────

function makeAudioTranslateService(overrides: Record<string, any> = {}) {
  return {
    analyzeVoice: jest.fn<any>().mockResolvedValue({ pitch: 200, timbre: 'baritone' }),
    compareVoices: jest.fn<any>().mockResolvedValue({ similarity: 0.95, verdict: 'same' }),
    submitFeedback: jest.fn<any>().mockResolvedValue({ success: true }),
    getTranslationHistory: jest.fn<any>().mockResolvedValue({ translations: [], total: 0 }),
    getUserStats: jest.fn<any>().mockResolvedValue({ totalTranslations: 0, totalMinutes: 0 }),
    ...overrides,
  } as any;
}

// ─── Helper ────────────────────────────────────────────────────────────────────

async function buildApp(opts: {
  authenticated?: boolean;
  service?: ReturnType<typeof makeAudioTranslateService>;
} = {}): Promise<{ app: FastifyInstance; service: ReturnType<typeof makeAudioTranslateService> }> {
  const { authenticated = true, service = makeAudioTranslateService() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Set request.user to simulate JWT auth
  app.addHook('preHandler', async (req) => {
    if (authenticated) {
      (req as any).user = { userId: USER_ID, role: 'user' };
    }
  });

  registerAnalysisRoutes(app, service, PREFIX);
  await app.ready();
  return { app, service };
}

// ─── POST /api/v1/voice/analyze ───────────────────────────────────────────────

describe('POST /api/v1/voice/analyze — unauthenticated', () => {
  it('returns 401 when userId is not available', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/analyze`, payload: { audioBase64: 'dGVzdA==' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/v1/voice/analyze — missing audioBase64', () => {
  it('returns 400 when audioBase64 is missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/analyze`, payload: {} });
    // Fastify schema validation returns 400 for missing required field
    expect([400, 422]).toContain(res.statusCode);
    await app.close();
  });
});

describe('POST /api/v1/voice/analyze — success', () => {
  it('returns 200 with analysis result', async () => {
    const { app, service } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/analyze`, payload: { audioBase64: 'dGVzdA==' } });
    expect(res.statusCode).toBe(200);
    expect(service.analyzeVoice).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ audioBase64: 'dGVzdA==' }));
    await app.close();
  });
});

describe('POST /api/v1/voice/analyze — service error', () => {
  it('returns 500 when service throws', async () => {
    const service = makeAudioTranslateService();
    service.analyzeVoice = jest.fn<any>().mockRejectedValue(new Error('analysis failed'));
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/analyze`, payload: { audioBase64: 'dGVzdA==' } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /api/v1/voice/compare ───────────────────────────────────────────────

describe('POST /api/v1/voice/compare — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/compare`, payload: { audioBase64_1: 'dA==', audioBase64_2: 'dA==' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/v1/voice/compare — missing samples', () => {
  it('returns 400 when audio samples are missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/compare`, payload: { audioBase64_1: 'dA==' } });
    expect([400, 422]).toContain(res.statusCode);
    await app.close();
  });
});

describe('POST /api/v1/voice/compare — success', () => {
  it('returns 200 with comparison result', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/compare`, payload: { audioBase64_1: 'dA==', audioBase64_2: 'dA==' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /api/v1/voice/feedback ──────────────────────────────────────────────

describe('POST /api/v1/voice/feedback — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/feedback`, payload: { translationId: 'tr-1', rating: 4 } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/v1/voice/feedback — success', () => {
  it('returns 2xx when feedback is submitted', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/feedback`, payload: { translationId: 'tr-1', rating: 4 } });
    expect([200, 201]).toContain(res.statusCode);
    await app.close();
  });
});
