/**
 * Extended tests for getUserStats in preferences.ts — covers:
 *   - Achievement unlock branches (isUnlocked=true) when counts exceed thresholds
 *   - $runCommandRaw returning no `n` field → `r.n ?? 0` right-side branch
 *   - languagesRaw.filter(Boolean) — falsy entry filtered out
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getUserStats } from '../../../../routes/users/preferences';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID  = '507f1f77bcf86cd799439022';

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(prismaOverrides: Record<string, any> = {}): Promise<FastifyInstance> {
  const prisma = {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: TARGET_USER_ID,
        createdAt: new Date('2020-01-01'),
      }),
    },
    message: {
      count:   jest.fn<any>().mockResolvedValue(0),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    friendRequest: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ n: 0 }),
    ...prismaOverrides,
  } as any;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: CURRENT_USER_ID,
      registeredUser: { id: CURRENT_USER_ID },
    };
  });

  await getUserStats(app);
  await app.ready();
  return app;
}

// ─── Achievement unlock: isUnlocked=true branches ─────────────────────────────

describe('GET /users/:userId/stats — achievements unlocked when counts exceed thresholds', () => {
  it('marks bavard unlocked when totalMessages >= 1000', async () => {
    const app = await buildApp({
      message: {
        count:   jest.fn<any>().mockResolvedValue(1500),
        groupBy: jest.fn<any>().mockResolvedValue([{ originalLanguage: 'fr' }, { originalLanguage: 'en' }]),
      },
      participant: { count: jest.fn<any>().mockResolvedValue(15) },
      friendRequest: { count: jest.fn<any>().mockResolvedValue(60) },
      $runCommandRaw: jest.fn<any>().mockResolvedValue({ n: 150 }),
    });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const achievements = body.data.achievements as Array<{ id: string; isUnlocked: boolean; progress: number }>;
    const bavard = achievements.find(a => a.id === 'bavard');
    expect(bavard?.isUnlocked).toBe(true);
    expect(bavard?.progress).toBe(1);
    const connecteur = achievements.find(a => a.id === 'connecteur');
    expect(connecteur?.isUnlocked).toBe(true);
    const populaire = achievements.find(a => a.id === 'populaire');
    expect(populaire?.isUnlocked).toBe(true);
    await app.close();
  });

  it('marks polyglotte unlocked when languagesUsed >= 5', async () => {
    const app = await buildApp({
      message: {
        count:   jest.fn<any>().mockResolvedValue(10),
        groupBy: jest.fn<any>().mockResolvedValue([
          { originalLanguage: 'fr' },
          { originalLanguage: 'en' },
          { originalLanguage: 'es' },
          { originalLanguage: 'de' },
          { originalLanguage: 'pt' },
          { originalLanguage: '' },  // falsy — filtered out by filter(Boolean)
        ]),
      },
    });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const achievements = body.data.achievements as Array<{ id: string; isUnlocked: boolean }>;
    const polyglotte = achievements.find(a => a.id === 'polyglotte');
    expect(polyglotte?.isUnlocked).toBe(true);
    // Empty language string is filtered out
    expect(body.data.languages).not.toContain('');
    await app.close();
  });

  it('marks fidele unlocked when memberDays >= 30 (old account)', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const app = await buildApp({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: TARGET_USER_ID,
          createdAt: oldDate,
        }),
      },
    });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const fidele = (body.data.achievements as Array<{ id: string; isUnlocked: boolean }>)
      .find(a => a.id === 'fidele');
    expect(fidele?.isUnlocked).toBe(true);
    await app.close();
  });
});

// ─── $runCommandRaw returns no `n` field → r.n ?? 0 right-side ───────────────

describe('GET /users/:userId/stats — $runCommandRaw returns no n field', () => {
  it('uses 0 as totalTranslations when r.n is undefined', async () => {
    const app = await buildApp({
      $runCommandRaw: jest.fn<any>().mockResolvedValue({}),  // no `n` key
    });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totalTranslations).toBe(0);
    await app.close();
  });
});

// ─── Lines 473-474: getUserStats catch block ──────────────────────────────────

describe('GET /users/:userId/stats — catch block (lines 473-474)', () => {
  it('returns 500 when prisma.message.count throws', async () => {
    const app = await buildApp({
      message: {
        count:   jest.fn<any>().mockRejectedValue('DB error string'),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
