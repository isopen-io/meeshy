/**
 * Contre-audit #14110 — au-delà du seuil par cible, l'excédent n'est pas écrit.
 * Qu'est-ce qui se perd ?
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { reportCreationRoutes } from '../../../routes/reports';
import { reportMatches, type ReportRow } from '../../helpers/report-table';

const HARCELEUR = '507f1f77bcf86cd799439031';
const VICTIME_MINEURE = '507f1f77bcf86cd799439032';
const POST_ID = '507f1f77bcf86cd799439050';
const ADULTES = ['507f1f77bcf86cd799439041', '507f1f77bcf86cd799439042', '507f1f77bcf86cd799439043'];

const created: Array<Record<string, unknown>> = [];

async function app() {
  created.length = 0;
  const f = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  f.decorate('authenticate', async (req: any) => {
    const id = req.headers['x-as'] as string;
    req.authContext = { isAuthenticated: true, isAnonymous: false, userId: id, registeredUser: { id, role: 'USER', username: id } };
  });
  f.decorate('prisma', {
    user: {
      findUnique: async (a: any) => ({ id: a.where.id }),
      findMany: async (a: any) => (a.where.id.in as string[]).map((id) => ({ id, birthDate: id === VICTIME_MINEURE ? new Date('2013-01-01') : new Date('1990-01-01') })),
    },
    post: { findUnique: async () => ({ authorId: HARCELEUR, visibility: 'PUBLIC', visibilityUserIds: [], deletedAt: null }) },
    report: { findFirst: async (a: any) => (created as ReportRow[]).find((row) => reportMatches(row, a.where)) ?? null, create: async (a: any) => { created.push(a.data); return { id: '507f1f77bcf86cd7994390ff', status: 'pending', createdAt: new Date(), ...a.data }; } },
    participant: { findMany: async () => [] },
    message: { findUnique: async () => null },
    friendRequest: { findMany: async () => [], findFirst: async () => null },
    userRelation: { findMany: async () => [], findUnique: async () => null },
    communityMember: { findMany: async () => [] },
  } as any);
  await f.register(reportCreationRoutes, { prefix: '/reports' });
  await f.ready();
  return f;
}

describe('contre-audit M1 — l\'excédent dédoublonné', () => {
  it('le signalement PRIORITAIRE d\'une mineure, quatrième de l\'heure, est écrit', async () => {
    const f = await app();
    const corps = { reportedType: 'user', reportedEntityId: HARCELEUR, reportType: 'harassment' };
    for (const qui of ADULTES) await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': qui }, payload: corps });
    const r = await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': VICTIME_MINEURE }, payload: corps });
    await f.close();
    expect(r.statusCode).toBe(201);
    expect(created.filter((c) => c.reporterId === VICTIME_MINEURE)).toEqual([expect.objectContaining({ priority: 1 })]);
  });

  it('l\'auteur d\'un post ne le rend pas insignalable en le signalant lui-même trois fois', async () => {
    const f = await app();
    const corps = { reportedType: 'post', reportedEntityId: POST_ID, reportType: 'other' };
    const auto = [];
    for (let i = 0; i < 3; i++) auto.push((await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': HARCELEUR }, payload: corps })).statusCode);
    const r = await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': VICTIME_MINEURE }, payload: { ...corps, reportType: 'harassment' } });
    await f.close();
    // Adapté (#14110, N2 b) : l'auteur ne signale plus sa publication — le même 404 qu'une cible introuvable.
    expect(auto).toEqual([404, 404, 404]);
    expect(r.statusCode).toBe(201);
    expect(created.filter((c) => c.reporterId === VICTIME_MINEURE)).toHaveLength(1);
  });
});
