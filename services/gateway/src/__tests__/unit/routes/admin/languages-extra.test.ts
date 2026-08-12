import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { languagesRoutes } from '../../../../routes/admin/languages';

function makePrisma(): any {
  return {
    message: {
      groupBy: jest.fn<any>(),
      aggregateRaw: jest.fn<any>(),
      findMany: jest.fn<any>(),
    },
    user: {
      groupBy: jest.fn<any>(),
    },
  };
}

function makeAuthContext(role: string) {
  return {
    isAuthenticated: true,
    registeredUser: {
      id: '507f1f77bcf86cd799439011',
      role,
      username: 'admin',
    },
  };
}

function buildApp(
  prisma: any,
  authContext: Record<string, unknown> | null = makeAuthContext('ADMIN'),
): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    if (authContext !== null) {
      request.authContext = authContext;
    }
    // null → no authContext set → 401
  });
  app.register(languagesRoutes);
  return app;
}

// ────────────────────────────────────────────────────────────────────────────
// Shared mock data helpers
// ────────────────────────────────────────────────────────────────────────────

/** Minimal happy-path mock values for GET /stats */
function setupStatsMocks(prisma: any, options: {
  topLanguages?: Array<{ originalLanguage: string; _count: { id: number } }>;
  prevLanguages?: Array<{ originalLanguage: string; _count: { id: number } }>;
  userCountRows?: Array<{ _id: string; userCount: number }>;
  pairRows?: Array<{ _id: { from: string; to: string }; count: number; totalScore: number; scoreCount: number }>;
  usersByLanguage?: Array<{ systemLanguage: string; _count: { id: number } }>;
} = {}) {
  const {
    topLanguages = [{ originalLanguage: 'fr', _count: { id: 50 } }],
    prevLanguages = [],
    userCountRows = [],
    pairRows = [],
    usersByLanguage = [],
  } = options;

  prisma.message.groupBy
    .mockResolvedValueOnce(topLanguages)   // current period
    .mockResolvedValueOnce(prevLanguages); // previous period

  prisma.message.aggregateRaw
    .mockResolvedValueOnce(userCountRows)  // distinct users pipeline
    .mockResolvedValueOnce(pairRows);      // translation pairs pipeline

  prisma.user.groupBy.mockResolvedValueOnce(usersByLanguage);
}

describe('Admin languages routes — extra coverage', () => {
  let app: FastifyInstance;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
  });

  afterEach(async () => {
    await app?.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Auth guards
  // ──────────────────────────────────────────────────────────────────────────
  describe('Auth guards', () => {
    it('returns 401 when not authenticated (no authContext)', async () => {
      app = buildApp(prisma, null);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for USER role', async () => {
      app = buildApp(prisma, makeAuthContext('USER'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(403);
    });

    it('allows AUDIT role', async () => {
      setupStatsMocks(prisma);
      app = buildApp(prisma, makeAuthContext('AUDIT'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
    });

    it('allows ANALYST role', async () => {
      setupStatsMocks(prisma);
      app = buildApp(prisma, makeAuthContext('ANALYST'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
    });

    it('allows BIGBOSS role', async () => {
      setupStatsMocks(prisma);
      app = buildApp(prisma, makeAuthContext('BIGBOSS'));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — period variants
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats — period variants', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('sets 90-day window for period=90d', async () => {
      setupStatsMocks(prisma);
      const before = Date.now();

      const res = await app.inject({ method: 'GET', url: '/stats?period=90d' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.period).toBe('90d');

      const startDate: Date = prisma.message.groupBy.mock.calls[0][0].where.createdAt.gte;
      const diff = before - startDate.getTime();
      expect(diff).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(91 * 24 * 60 * 60 * 1000);
    });

    it('sets 7-day window for period=7d', async () => {
      setupStatsMocks(prisma);
      const before = Date.now();

      const res = await app.inject({ method: 'GET', url: '/stats?period=7d' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.period).toBe('7d');

      const startDate: Date = prisma.message.groupBy.mock.calls[0][0].where.createdAt.gte;
      const diff = before - startDate.getTime();
      expect(diff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    });

    it('defaults to 30-day window when no period given', async () => {
      setupStatsMocks(prisma);
      const before = Date.now();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.period).toBe('30d');

      const startDate: Date = prisma.message.groupBy.mock.calls[0][0].where.createdAt.gte;
      const diff = before - startDate.getTime();
      expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — empty topLangCodes skips aggregateRaw for user counts
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats — empty topLanguagesByMessages', () => {
    it('skips user count aggregation when no top languages found', async () => {
      setupStatsMocks(prisma, { topLanguages: [] });
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.topLanguages).toEqual([]);
      expect(body.data.totalLanguages).toBe(0);

      // Only 1 aggregateRaw call (translation pairs), NOT the user-count pipeline
      // because topLangCodes.length === 0 causes early skip
      expect(prisma.message.aggregateRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — null originalLanguage and zero-count data branches
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats — null/zero data branches', () => {
    it('falls back to "Unknown" when originalLanguage is null', async () => {
      // When originalLanguage is null, topLangCodes.length === 0 so the
      // distinctUsers aggregateRaw is skipped — only ONE aggregateRaw call (pairRows).
      prisma.message.groupBy
        .mockResolvedValueOnce([{ originalLanguage: null as any, _count: { id: 5 } }])
        .mockResolvedValueOnce([]); // previous period
      prisma.message.aggregateRaw.mockResolvedValueOnce(
        [{ _id: { from: 'fr', to: 'en' }, count: 2, totalScore: 0, scoreCount: 0 }],
      );
      prisma.user.groupBy.mockResolvedValueOnce([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // lang.originalLanguage || 'Unknown' branch hit
      expect(body.data.topLanguages[0].language).toBe('Unknown');
      // usersByLang.get(...) ?? 0 fallback when language not in map
      expect(body.data.topLanguages[0].userCount).toBe(0);
      // pairRow.scoreCount === 0 → avgConfidence = 0 in formattedPairs
      expect(body.data.languagePairs[0].avgConfidence).toBe(0);
    });

    it('returns percentage=0 when all language entries have _count.id=0 (totalMessages=0)', async () => {
      setupStatsMocks(prisma, {
        topLanguages: [{ originalLanguage: 'fr', _count: { id: 0 } }],
      });
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // totalMessages === 0 → percentage false branch
      expect(body.data.topLanguages[0].percentage).toBe(0);
    });

    it('skips growth entry when lang.originalLanguage is null', async () => {
      setupStatsMocks(prisma, {
        topLanguages: [{ originalLanguage: null as any, _count: { id: 10 } }],
        prevLanguages: [{ originalLanguage: null as any, _count: { id: 5 } }],
      });
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // lang.originalLanguage is null → both growth branches skip (no key added)
      expect(Object.keys(body.data.growth)).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /timeline — row date matching (if(dailyData[date]) branch)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /timeline — timeline row date matching', () => {
    it('populates timeline entry when row date matches dailyData', async () => {
      const today = new Date().toISOString().split('T')[0];
      prisma.message.aggregateRaw.mockResolvedValue([
        { _id: { date: today, lang: 'fr' }, count: 42 },
        { _id: { date: '1970-01-01', lang: 'de' }, count: 99 }, // date not in dailyData
      ]);
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/timeline' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // Find the today entry — should include 'fr: 42'
      const todayEntry = body.data.find((e: any) => e.date === today);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.fr).toBe(42);
      // 1970-01-01 is outside the 7-day window, so it's silently skipped
      expect(body.data.find((e: any) => e.date === '1970-01-01')).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — growth calculation
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats — growth calculation', () => {
    it('calculates positive growth when previous period had data', async () => {
      setupStatsMocks(prisma, {
        topLanguages: [{ originalLanguage: 'fr', _count: { id: 100 } }],
        prevLanguages: [{ originalLanguage: 'fr', _count: { id: 50 } }],
      });
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // (100-50)/50*100 = 100%
      expect(body.data.growth.fr).toBe(100);
    });

    it('sets growth to 100 for a new language with no previous data', async () => {
      setupStatsMocks(prisma, {
        topLanguages: [{ originalLanguage: 'es', _count: { id: 20 } }],
        prevLanguages: [],
      });
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.growth.es).toBe(100);
    });

    it('calculates negative growth when count decreased', async () => {
      setupStatsMocks(prisma, {
        topLanguages: [{ originalLanguage: 'fr', _count: { id: 25 } }],
        prevLanguages: [{ originalLanguage: 'fr', _count: { id: 100 } }],
      });
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // (25-100)/100*100 = -75%
      expect(body.data.growth.fr).toBe(-75);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — DB error
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats — error path', () => {
    it('returns 500 when DB throws', async () => {
      prisma.message.groupBy.mockRejectedValue(new Error('DB crash'));
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /timeline — period variants
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /timeline — period variants', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 30 days of entries for period=30d', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/timeline?period=30d' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(30);
    });

    it('defaults to 7d when no period given', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/timeline' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(7);
    });

    it('returns 500 when DB throws', async () => {
      prisma.message.aggregateRaw.mockRejectedValue(new Error('DB crash'));

      const res = await app.inject({ method: 'GET', url: '/timeline' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /translation-accuracy — quality variants
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /translation-accuracy — quality thresholds', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('classifies quality=excellent when avgConfidence > 0.9', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([
        { _id: { from: 'fr', to: 'en' }, count: 10, totalScore: 9.5, scoreCount: 10 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data[0].quality).toBe('excellent');
      // avgConfidence = 0.95 → Math.round(0.95*100) = 95
      expect(body.data[0].avgConfidence).toBe(95);
    });

    it('classifies quality=good when avgConfidence > 0.7 and <= 0.9', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([
        { _id: { from: 'en', to: 'fr' }, count: 5, totalScore: 4.0, scoreCount: 5 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data[0].quality).toBe('good');
      // avgConfidence = 0.8 → 80
      expect(body.data[0].avgConfidence).toBe(80);
    });

    it('classifies quality=fair when avgConfidence > 0.5 and <= 0.7', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([
        { _id: { from: 'es', to: 'de' }, count: 3, totalScore: 1.8, scoreCount: 3 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data[0].quality).toBe('fair');
      // avgConfidence = 0.6 → 60
      expect(body.data[0].avgConfidence).toBe(60);
    });

    it('classifies quality=poor when avgConfidence <= 0.5', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([
        { _id: { from: 'zh', to: 'ar' }, count: 4, totalScore: 1.2, scoreCount: 4 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data[0].quality).toBe('poor');
      // avgConfidence = 0.3 → 30
      expect(body.data[0].avgConfidence).toBe(30);
    });

    it('returns avgConfidence=0 and quality=poor when scoreCount=0', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([
        { _id: { from: 'pt', to: 'ru' }, count: 2, totalScore: 0, scoreCount: 0 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      // scoreCount === 0 → avgConfidence = 0 → Math.round(0) = 0
      expect(body.data[0].avgConfidence).toBe(0);
      expect(body.data[0].quality).toBe('poor');
    });

    it('returns empty array when no pairs found', async () => {
      prisma.message.aggregateRaw.mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('returns 500 when DB throws', async () => {
      prisma.message.aggregateRaw.mockRejectedValue(new Error('DB crash'));

      const res = await app.inject({ method: 'GET', url: '/translation-accuracy' });
      expect(res.statusCode).toBe(500);
    });
  });
});
