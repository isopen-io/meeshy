/**
 * Unit tests for admin/analytics.ts
 * Tests all 7 analytics routes: GET /realtime, /hourly-activity, /message-types,
 * /user-distribution, /language-distribution, /kpis, /volume-timeline
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockCacheGet = jest.fn<any>().mockResolvedValue(null);
const mockCacheSet = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: (...a: any[]) => mockCacheGet(...a),
    set: (...a: any[]) => mockCacheSet(...a),
  }),
}));

jest.mock('../../../validation/helpers.js', () => ({
  validateQuery: () => async (_req: any, _reply: any) => {},
}));

jest.mock('../../../validation/admin-schemas.js', () => ({
  AnalyticsMessageTypesQuerySchema: {},
  AnalyticsLanguageDistQuerySchema: {},
  AnalyticsKpisQuerySchema: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { analyticsRoutes } from '../../../routes/admin/analytics';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    user: {
      count: jest.fn<any>().mockResolvedValue(100),
      groupBy: jest.fn<any>().mockResolvedValue([{ preferredLanguage: 'fr', _count: { _all: 50 } }]),
      ...overrides.user,
    },
    message: {
      count: jest.fn<any>().mockResolvedValue(500),
      groupBy: jest.fn<any>().mockResolvedValue([{ conversationId: 'conv-1', _count: { _all: 10, id: 10 }, messageType: 'TEXT', originalLanguage: 'fr' }]),
      ...overrides.message,
    },
    messageTranslation: {
      groupBy: jest.fn<any>().mockResolvedValue([{ targetLanguage: 'fr', _count: { _all: 20 } }]),
      ...overrides.messageTranslation,
    },
    ...overrides,
  };
}

async function buildApp(role = 'ADMIN', prismaOverrides: any = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);
  await app.register(analyticsRoutes);
  await app.ready();
  return app;
}

// ─── GET /realtime ────────────────────────────────────────────────────────────

describe('GET /realtime — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(analyticsRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authenticate hook rejects', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /realtime — USER role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /realtime — MODERATOR role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has MODERATOR role', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /realtime — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    await app.close();
  });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /realtime — ANALYST success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ANALYST');
  });
  afterAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    await app.close();
  });

  it('returns 200 for ANALYST role', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /realtime — cached response', () => {
  let app: FastifyInstance;
  const cachedBody = JSON.stringify({
    success: true,
    data: { onlineUsers: 5, messagesLastHour: 42, activeConversations: 3, timestamp: new Date().toISOString() },
  });
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(cachedBody);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    await app.close();
  });

  it('returns 200 from cache hit', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /realtime — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      user: { count: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/realtime' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /hourly-activity ─────────────────────────────────────────────────────

describe('GET /hourly-activity — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /hourly-activity — AUDIT success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('AUDIT');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for AUDIT role', async () => {
    const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /hourly-activity — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: { count: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/hourly-activity' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /message-types ───────────────────────────────────────────────────────

describe('GET /message-types — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(500),
        groupBy: jest.fn<any>().mockResolvedValue([
          { messageType: 'TEXT', _count: { id: 80 } },
          { messageType: 'IMAGE', _count: { id: 20 } },
        ]),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/message-types' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /message-types — with period query param', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(500),
        groupBy: jest.fn<any>().mockResolvedValue([{ messageType: 'AUDIO', _count: { id: 30 } }]),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for period=30d', async () => {
    const res = await app.inject({ method: 'GET', url: '/message-types?period=30d' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /message-types — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(500),
        groupBy: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/message-types' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /user-distribution ───────────────────────────────────────────────────

describe('GET /user-distribution — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-distribution' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /user-distribution — BIGBOSS success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('BIGBOSS');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for BIGBOSS role', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-distribution' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /user-distribution — USER forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 for USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-distribution' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /user-distribution — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      user: { count: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-distribution' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /language-distribution ───────────────────────────────────────────────

describe('GET /language-distribution — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(500),
        groupBy: jest.fn<any>().mockResolvedValue([
          { originalLanguage: 'fr', _count: { id: 60 } },
          { originalLanguage: 'en', _count: { id: 30 } },
        ]),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/language-distribution' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /language-distribution — with limit query param', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ANALYST', {
      message: {
        count: jest.fn<any>().mockResolvedValue(500),
        groupBy: jest.fn<any>().mockResolvedValue([{ originalLanguage: 'es', _count: { id: 10 } }]),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for limit=3', async () => {
    const res = await app.inject({ method: 'GET', url: '/language-distribution?limit=3' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /language-distribution — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(500),
        groupBy: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/language-distribution' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /kpis ────────────────────────────────────────────────────────────────

describe('GET /kpis — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/kpis' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /kpis — with period=7d', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('AUDIT');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for period=7d', async () => {
    const res = await app.inject({ method: 'GET', url: '/kpis?period=7d' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /kpis — with period=90d', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ANALYST');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for period=90d', async () => {
    const res = await app.inject({ method: 'GET', url: '/kpis?period=90d' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /kpis — USER forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 for USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/kpis' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /kpis — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: { count: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/kpis' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /volume-timeline ─────────────────────────────────────────────────────

describe('GET /volume-timeline — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /volume-timeline — BIGBOSS success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('BIGBOSS');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for BIGBOSS role', async () => {
    const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /volume-timeline — cached response', () => {
  let app: FastifyInstance;
  const cachedBody = JSON.stringify({
    success: true,
    data: [{ date: 'lun. 30/06', messages: 120 }],
  });
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(cachedBody);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    await app.close();
  });

  it('returns 200 from cache hit', async () => {
    const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /volume-timeline — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ADMIN', {
      message: { count: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/volume-timeline' });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
