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
      data: { scale: DEFAULT_ENGAGEMENT_SCALE, updatedAt: null, updatedBy: null },
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
      data: { scale: tuned, updatedAt: '2026-09-30T12:00:00.000Z', updatedBy: ADMIN_ID },
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
});
