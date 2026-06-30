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

// ─── GET /api/v1/voice/history ────────────────────────────────────────────────

describe('GET /api/v1/voice/history — unauthenticated', () => {
  it('returns 401 when userId is not available', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/history` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /api/v1/voice/history — success', () => {
  it('returns 200 with history data', async () => {
    const historyResult = { items: [{ id: 'h-1', sourceLanguage: 'en', targetLanguage: 'fr' }], total: 1, limit: 50, offset: 0, hasMore: false };
    const service = makeAudioTranslateService({ getHistory: jest.fn<any>().mockResolvedValue(historyResult) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/history` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /api/v1/voice/history — service error', () => {
  it('returns 500 when service throws', async () => {
    const service = makeAudioTranslateService({ getHistory: jest.fn<any>().mockRejectedValue(new Error('DB error')) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/history` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /api/v1/voice/stats ──────────────────────────────────────────────────

describe('GET /api/v1/voice/stats — unauthenticated', () => {
  it('returns 401 when userId is not available', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/stats` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /api/v1/voice/stats — success', () => {
  it('returns 200 with stats data', async () => {
    const stats = { totalTranslations: 10, totalMinutes: 5, languagesUsed: ['en', 'fr'], avgProcessingTime: 1.2, feedbackRating: 4.5 };
    const service = makeAudioTranslateService({ getUserStats: jest.fn<any>().mockResolvedValue(stats) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/stats?period=week` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /api/v1/voice/stats — service error', () => {
  it('returns 500 when service throws', async () => {
    const service = makeAudioTranslateService({ getUserStats: jest.fn<any>().mockRejectedValue(new Error('DB error')) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/stats` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /api/v1/voice/admin/metrics ─────────────────────────────────────────

describe('GET /api/v1/voice/admin/metrics — unauthenticated', () => {
  it('returns 401 when userId is not available', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/admin/metrics` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /api/v1/voice/admin/metrics — non-admin', () => {
  it('returns 403 when user is not admin', async () => {
    const { app } = await buildApp({ authenticated: true });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/admin/metrics` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /api/v1/voice/admin/metrics — admin success', () => {
  it('returns 200 with metrics when user is admin', async () => {
    const metrics = { activeJobs: 2, queuedJobs: 5, completionRate: 0.98, uptime: 99999 };
    const service = makeAudioTranslateService({ getSystemMetrics: jest.fn<any>().mockResolvedValue(metrics) });
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.addHook('preHandler', async (req) => {
      (req as any).user = { userId: USER_ID, role: 'admin' };
    });
    registerAnalysisRoutes(app, service, PREFIX);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/admin/metrics` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /api/v1/voice/admin/metrics — service error', () => {
  it('returns 500 when service throws', async () => {
    const service = makeAudioTranslateService({ getSystemMetrics: jest.fn<any>().mockRejectedValue(new Error('metrics error')) });
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.addHook('preHandler', async (req) => {
      (req as any).user = { userId: USER_ID, role: 'admin' };
    });
    registerAnalysisRoutes(app, service, PREFIX);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/admin/metrics` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /api/v1/voice/health ─────────────────────────────────────────────────

describe('GET /api/v1/voice/health — healthy', () => {
  it('returns 200 when service is healthy', async () => {
    const service = makeAudioTranslateService({ getHealthStatus: jest.fn<any>().mockResolvedValue({ status: 'healthy', services: {} }) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/health` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('healthy');
    await app.close();
  });
});

describe('GET /api/v1/voice/health — degraded', () => {
  it('returns 200 when service is degraded', async () => {
    const service = makeAudioTranslateService({ getHealthStatus: jest.fn<any>().mockResolvedValue({ status: 'degraded', services: {} }) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/health` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /api/v1/voice/health — unhealthy', () => {
  it('returns 503 when service is unhealthy', async () => {
    const service = makeAudioTranslateService({ getHealthStatus: jest.fn<any>().mockResolvedValue({ status: 'unhealthy', services: {} }) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/health` });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/v1/voice/health — service error', () => {
  it('returns 503 when getHealthStatus throws', async () => {
    const service = makeAudioTranslateService({ getHealthStatus: jest.fn<any>().mockRejectedValue(new Error('health check failed')) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/health` });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ─── GET /api/v1/voice/languages ─────────────────────────────────────────────

describe('GET /api/v1/voice/languages — success', () => {
  it('returns 200 with supported languages', async () => {
    const langs = { languages: [{ code: 'en', name: 'English' }], totalCount: 1 };
    const service = makeAudioTranslateService({ getSupportedLanguages: jest.fn<any>().mockResolvedValue(langs) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/languages` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /api/v1/voice/languages — service error', () => {
  it('returns 500 when service throws', async () => {
    const service = makeAudioTranslateService({ getSupportedLanguages: jest.fn<any>().mockRejectedValue(new Error('lang error')) });
    const { app } = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/languages` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
