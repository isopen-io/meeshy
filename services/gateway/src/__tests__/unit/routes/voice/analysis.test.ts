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

  // Chaque route voice exige désormais `fastify.authenticate` en `preHandler`
  // (voir routes/voice/analysis.ts). Ce double reproduit le comportement réel
  // de `createUnifiedAuthMiddleware({ requireAuth: true })` : 401 immédiat si
  // aucune identité vérifiée n'a été posée sur `request.user`.
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!req.user?.userId) {
      reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
  });

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

// ─── #4190 — ce module ne monte plus /stats ni /health ────────────────────────

/**
 * GARDE NÉGATIVE. Les describes qui exerçaient `GET /api/v1/voice/stats` et
 * `GET /api/v1/voice/health` ont été retirés avec les routes (#4190) — mais un
 * test SUPPRIMÉ ne protège de rien : rien n'empêcherait de remonter les deux
 * handlers demain. Celui-ci lit la table de routes RÉELLEMENT montée par
 * `registerAnalysisRoutes` (le seul endroit où la méthode et le chemin se
 * lisent ensemble) et exige à la fois l'ABSENCE des deux retirées et la
 * PRÉSENCE de leurs voisines vivantes — cette seconde moitié est ce qui
 * empêche un futur nettoyage d'emporter une route qui sert.
 */
describe('registerAnalysisRoutes — table de routes (#4190)', () => {
  async function mountedRoutes(): Promise<string[]> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async () => {});
    const collected: string[] = [];
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) collected.push(`${method} ${route.url}`);
    });
    registerAnalysisRoutes(app, makeAudioTranslateService(), PREFIX);
    await app.ready();
    await app.close();
    return collected;
  }

  it('ne monte plus GET /api/v1/voice/stats ni GET /api/v1/voice/health', async () => {
    const routes = await mountedRoutes();
    expect(routes).not.toContain(`GET ${PREFIX}/stats`);
    expect(routes).not.toContain(`GET ${PREFIX}/health`);
  });

  it('monte toujours les routes voisines vivantes', async () => {
    const routes = await mountedRoutes();
    expect(routes).toContain(`POST ${PREFIX}/analyze`);
    expect(routes).toContain(`POST ${PREFIX}/compare`);
    expect(routes).toContain(`POST ${PREFIX}/feedback`);
    expect(routes).toContain(`GET ${PREFIX}/history`);
    expect(routes).toContain(`GET ${PREFIX}/admin/metrics`);
    expect(routes).toContain(`GET ${PREFIX}/languages`);
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
    app.decorate('authenticate', async (req: any, reply: any) => {
      if (!req.user?.userId) {
        reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
      }
    });
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
    app.decorate('authenticate', async (req: any, reply: any) => {
      if (!req.user?.userId) {
        reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
      }
    });
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
