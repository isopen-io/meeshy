/**
 * `GET|PUT /admin/engagement-scale` — le barème d'engagement réglé par
 * l'administration (#8906) : le RANG (ADMIN et BIGBOSS seuls), le refus
 * fail-closed d'un barème invalide, et l'écriture qui invalide le cache du
 * crédit et laisse sa trace.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { engagementScaleAdminRoutes } from '../../../routes/admin/engagement-scale';
import { engagementScaleServiceFor } from '../../../services/engagement/EngagementScaleService';

const ADMIN_ID = '507f1f77bcf86cd799439001';

/** Le barème tel qu'il part sur le fil : `clawbackHours` figé à la loi des 30 jours (#11525). */
const served = <S extends typeof DEFAULT_ENGAGEMENT_SCALE>(scale: S) => ({
  ...scale,
  abuse: { ...scale.abuse, clawbackHours: 720 },
});

function makePrisma() {
  let stored: { config: unknown; updatedAt: Date; updatedById: string | null } | null = null;
  const auditCreate = jest.fn(async (_args: unknown) => ({}));
  const upsert = jest.fn(async (args: unknown) => {
    const { update } = args as { update: { config: unknown; updatedById: string } };
    stored = { config: update.config, updatedAt: new Date('2026-09-30T12:00:00.000Z'), updatedById: update.updatedById };
    return stored;
  });
  const prisma = {
    engagementScaleConfig: { findUnique: jest.fn(async () => stored), upsert },
    adminAuditLog: { create: auditCreate },
    user: { findMany: jest.fn(async () => [{ id: ADMIN_ID, username: 'awa', displayName: 'Awa Diop', avatar: null }]) },
  } as unknown as PrismaClient;
  return { prisma, upsert, auditCreate };
}

async function buildApp(prisma: PrismaClient, role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = role
      ? {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: ADMIN_ID,
          registeredUser: { id: ADMIN_ID, role },
          hasFullAccess: true,
        }
      : { isAuthenticated: false, isAnonymous: false };
  });
  await app.register(engagementScaleAdminRoutes, { prefix: '/api/v1/admin' });
  await app.ready();
  return app;
}

async function call(role: string | null, method: 'GET' | 'PUT', payload?: unknown, prismaBundle = makePrisma()) {
  const app = await buildApp(prismaBundle.prisma, role);
  const res = await app.inject({
    method,
    url: '/api/v1/admin/engagement-scale',
    headers: { authorization: 'Bearer x' },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  await app.close();
  return { res, ...prismaBundle };
}

const tuned = {
  ...DEFAULT_ENGAGEMENT_SCALE,
  operations: {
    ...DEFAULT_ENGAGEMENT_SCALE.operations,
    'tool.reaction': { points: 2, multiplied: false, cap: 10, variantPoints: {} },
  },
  multiplier: { ...DEFAULT_ENGAGEMENT_SCALE.multiplier, maxFactor: 3, levelCaps: [{ minLevel: 0, maxFactor: 2 }] },
};

describe('GET /admin/engagement-scale', () => {
  it.each(['USER', 'MODERATOR', 'AUDIT', 'ANALYST'])('refuse %s (403)', async (role) => {
    const { res } = await call(role, 'GET');
    expect(res.statusCode).toBe(403);
  });

  it('refuse une requête sans session (401)', async () => {
    const { res } = await call(null, 'GET');
    expect(res.statusCode).toBe(401);
  });

  it.each(['ADMIN', 'BIGBOSS'])('sert les défauts à %s tant que rien n\'a été réglé', async (role) => {
    const { res } = await call(role, 'GET');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { scale: served(DEFAULT_ENGAGEMENT_SCALE), updatedAt: null, updatedBy: null, updatedByPerson: null },
    });
  });
});

describe('PUT /admin/engagement-scale', () => {
  it('refuse un USER (403) sans rien écrire', async () => {
    const { res, upsert } = await call('USER', 'PUT', { scale: tuned });
    expect(res.statusCode).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuse un barème invalide en entier (400) sans rien écrire', async () => {
    const invalid = { ...tuned, multiplier: { ...tuned.multiplier, maxFactor: 99 } };
    const { res, upsert } = await call('ADMIN', 'PUT', { scale: invalid });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'INVALID_ENGAGEMENT_SCALE' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuse un corps sans barème (400)', async () => {
    const { res, upsert } = await call('ADMIN', 'PUT', {});
    expect(res.statusCode).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('écrit, trace, invalide le cache du crédit et rend le document écrit', async () => {
    const bundle = makePrisma();
    const creditCache = engagementScaleServiceFor(bundle.prisma);
    expect(await creditCache.current()).toEqual(DEFAULT_ENGAGEMENT_SCALE);

    const { res, upsert, auditCreate } = await call('ADMIN', 'PUT', { scale: tuned }, bundle);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        scale: served(tuned),
        updatedAt: '2026-09-30T12:00:00.000Z',
        updatedBy: ADMIN_ID,
        // « Réglé par » se NOMME (audit 2026-10-04) : un ObjectId nu ne dit rien.
        updatedByPerson: { id: ADMIN_ID, username: 'awa', displayName: 'Awa Diop', avatar: null },
      },
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'default' } }));
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: ADMIN_ID,
        action: 'UPDATE_ENGAGEMENT_SCALE',
        entity: 'EngagementScaleConfig',
        entityId: 'default',
      }),
    });
    expect(await creditCache.current()).toEqual(tuned);
  });

  // Un diff À PLAT : chaque clé pointée qui a CHANGÉ, et elle seule. Le journal
  // portait les deux barèmes entiers — illisible, et la console n'en tirait rien.
  it('trace un diff à plat des seules valeurs changées', async () => {
    const { auditCreate } = await call('ADMIN', 'PUT', { scale: tuned });
    const changes = JSON.parse((auditCreate.mock.calls[0][0] as { data: { changes: string } }).data.changes);
    expect(changes['multiplier.maxFactor']).toEqual({ before: DEFAULT_ENGAGEMENT_SCALE.multiplier.maxFactor, after: 3 });
    expect(changes).not.toHaveProperty(['operations.tool.reaction.points']); // 2 avant comme après : inchangé, absent
    expect(Object.keys(changes).some((k) => k.startsWith('operations.tool.reaction.'))).toBe(true);
    expect(Object.keys(changes).every((k) => !['before', 'after'].includes(k))).toBe(true);
    for (const { before, after } of Object.values(changes) as Array<{ before: unknown; after: unknown }>) {
      expect(JSON.stringify(before)).not.toBe(JSON.stringify(after));
    }
  });
});

// Un message texte vaut selon le type de sa conversation (#9666) : l'administration
// LIT ses cinq variantes, les GARDE quand elle les règle, et un barème enregistré
// avant elles se sert aux défauts de la décision.
describe('les variantes d’un message texte, par type de conversation (#9666)', () => {
  const DECISION = { direct: 2, group: 4, public: 6, global: 8, other: 4 };

  it('sert les cinq variantes par défaut', async () => {
    const { res } = await call('ADMIN', 'GET');
    expect(res.json().data.scale.operations['content.text_message'].variantPoints).toEqual(DECISION);
  });

  it('garde les variantes réglées, à l’écriture puis à la relecture', async () => {
    const bundle = makePrisma();
    const scale = {
      ...DEFAULT_ENGAGEMENT_SCALE,
      operations: {
        ...DEFAULT_ENGAGEMENT_SCALE.operations,
        'content.text_message': { points: 4, multiplied: true, cap: 300, variantPoints: { ...DECISION, direct: 1, global: 10 } },
      },
    };

    const put = await call('ADMIN', 'PUT', { scale }, bundle);
    const get = await call('ADMIN', 'GET', undefined, bundle);

    const expected = { ...DECISION, direct: 1, global: 10 };
    expect(put.res.json().data.scale.operations['content.text_message'].variantPoints).toEqual(expected);
    expect(get.res.json().data.scale.operations['content.text_message'].variantPoints).toEqual(expected);
  });

  it('sert les défauts de la décision pour un barème enregistré sans ces variantes', async () => {
    const bundle = makePrisma();
    const legacy = {
      ...DEFAULT_ENGAGEMENT_SCALE,
      operations: {
        ...DEFAULT_ENGAGEMENT_SCALE.operations,
        'content.text_message': { points: 3, multiplied: true, cap: 300 },
      },
    };
    (bundle.prisma.engagementScaleConfig.findUnique as unknown as jest.Mock).mockImplementation(async () => ({
      config: legacy,
      updatedAt: new Date('2026-09-30T12:00:00.000Z'),
      updatedById: ADMIN_ID,
    }));

    const { res } = await call('ADMIN', 'GET', undefined, bundle);

    expect(res.json().data.scale.operations['content.text_message']).toEqual({
      points: 3,
      multiplied: true,
      cap: 300,
      variantPoints: DECISION,
    });
  });
});

// #10388 — un palier de série rapporte jusqu'à 10 000 000 points, chaque acte a
// ses paliers, et un ancien écran (sans `streaks`, sans `loyalty`) n'efface plus
// ce qu'un nouveau a réglé.
describe('les séries, la fidélité et l’ancien écran (#10388)', () => {
  const acts = DEFAULT_ENGAGEMENT_SCALE.streaks?.acts;
  const withStreaks = {
    ...DEFAULT_ENGAGEMENT_SCALE,
    streaks: {
      global: [{ days: 365, points: 100_000, label: 'Un an' }],
      acts: { ...acts, story: [{ days: 7, points: 50 }] },
    },
    loyalty: [{ days: 365, points: 100_000 }],
  };

  it('enregistre un palier de 100 000 points et le sert, avec sa projection à 1000 pour les anciennes passerelles', async () => {
    const bundle = makePrisma();
    const put = await call('BIGBOSS', 'PUT', { scale: withStreaks }, bundle);
    const get = await call('BIGBOSS', 'GET', undefined, bundle);

    expect(put.res.statusCode).toBe(200);
    for (const res of [put.res, get.res]) {
      const { scale } = res.json().data;
      expect(scale.streaks.global).toEqual([{ days: 365, points: 100_000, label: 'Un an' }]);
      expect(scale.streaks.acts.story).toEqual([{ days: 7, points: 50 }]);
      expect(scale.loyalty).toEqual([{ days: 365, points: 100_000 }]);
      expect(scale.streakBonuses).toEqual([{ days: 365, points: 1000 }]);
    }
  });

  it('garde les séries et la fidélité qu’un ancien corps n’envoie pas', async () => {
    const bundle = makePrisma();
    await call('ADMIN', 'PUT', { scale: withStreaks }, bundle);
    const { streaks: _streaks, loyalty: _loyalty, ...legacyBody } = withStreaks;

    const put = await call('ADMIN', 'PUT', { scale: { ...legacyBody, streakBonuses: [{ days: 365, points: 1000 }] } }, bundle);

    const { scale } = put.res.json().data;
    expect(scale.streaks.global).toEqual([{ days: 365, points: 100_000, label: 'Un an' }]);
    expect(scale.streaks.acts.story).toEqual([{ days: 7, points: 50 }]);
    expect(scale.loyalty).toEqual([{ days: 365, points: 100_000 }]);
  });

  it('refuse un palier au-delà de dix millions sans rien écrire', async () => {
    const { res, upsert } = await call('ADMIN', 'PUT', {
      scale: { ...withStreaks, streaks: { ...withStreaks.streaks, global: [{ days: 365, points: 10_000_001 }] } },
    });
    expect(res.statusCode).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});

// #11491 (décision 2026-10-21) — la reprise d'une publication supprimée suit la
// loi des 30 jours ; `abuse.clawbackHours` ne gouverne plus rien. Il n'est plus
// ÉCRIT ; il reste SERVI, figé à la loi (30 × 24 h), parce qu'une console d'avant
// la décision (onglet en cache, coque Android embarquant son paquet) décode le
// barème avec l'ancien `parseAbuse`, qui EXIGE ce champ : sans lui elle déclare
// le barème illisible et ne peut ni l'afficher ni l'enregistrer (#11525).
describe('la fenêtre de reprise n’est plus un réglage (#11491, #11525)', () => {
  const legacyAbuse = { ...DEFAULT_ENGAGEMENT_SCALE.abuse, clawbackHours: 48 };
  const servedAbuse = { ...DEFAULT_ENGAGEMENT_SCALE.abuse, clawbackHours: 720 };

  it('accepte le clawbackHours d’un ancien client sans l’écrire, et sert la loi des 30 jours', async () => {
    const bundle = makePrisma();
    const put = await call('ADMIN', 'PUT', { scale: { ...DEFAULT_ENGAGEMENT_SCALE, abuse: legacyAbuse } }, bundle);
    const get = await call('ADMIN', 'GET', undefined, bundle);

    expect(put.res.statusCode).toBe(200);
    const written = (bundle.upsert.mock.calls[0]?.[0] as { update: { config: { abuse: Record<string, unknown> } } }).update.config;
    expect(written.abuse).not.toHaveProperty('clawbackHours');
    for (const res of [put.res, get.res]) {
      expect(res.json().data.scale.abuse).toEqual(servedAbuse);
    }
  });

  it('ne sert pas la valeur orpheline d’un barème stocké avant la décision : il sert la loi', async () => {
    const bundle = makePrisma();
    (bundle.prisma.engagementScaleConfig.findUnique as unknown as jest.Mock).mockImplementation(async () => ({
      config: { ...DEFAULT_ENGAGEMENT_SCALE, abuse: { ...legacyAbuse, clawbackHours: 9999 } },
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedById: null,
    }));
    const { res } = await call('ADMIN', 'GET', undefined, bundle);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.scale.abuse).toEqual(servedAbuse);
  });

  it('reste lisible par le décodeur d’une console d’avant la décision, qui exige un entier de 0 à 720', async () => {
    const { res } = await call('ADMIN', 'GET');
    const { clawbackHours } = res.json().data.scale.abuse;

    expect(Number.isInteger(clawbackHours)).toBe(true);
    expect(clawbackHours).toBeGreaterThanOrEqual(0);
    expect(clawbackHours).toBeLessThanOrEqual(24 * 30);
  });
});
