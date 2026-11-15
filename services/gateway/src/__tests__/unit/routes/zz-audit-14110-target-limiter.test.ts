/**
 * Audit #14110 — le seuil par CIBLE compte AVANT la vérification de la cible.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { reportCreationRoutes } from '../../../routes/reports';
import { reportMatches, type ReportRow } from '../../helpers/report-table';

const HARCELEUR = '507f1f77bcf86cd799439031';
const VICTIME = '507f1f77bcf86cd799439032';

// `getReportService` est un singleton : il garde le Prisma de la PREMIÈRE app — la liste des écritures est donc celle du module.
const created: unknown[] = [];

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
      findMany: async () => [],
    },
    report: { findFirst: async (a: any) => (created as ReportRow[]).find((row) => reportMatches(row, a.where)) ?? null, create: async (a: any) => { created.push(a.data); return { id: '507f1f77bcf86cd7994390ff', status: 'pending', createdAt: new Date(), ...a.data }; } },
    participant: { findMany: async () => [] },
    message: { findUnique: async () => null },
    friendRequest: { findMany: async () => [], findFirst: async () => null },
    userRelation: { findMany: async () => [], findUnique: async () => null },
    communityMember: { findMany: async () => [] },
  } as any);
  await f.register(reportCreationRoutes, { prefix: '/reports' });
  await f.ready();
  return { f, created };
}

describe('seuil par cible (#4155) vu depuis SEC-06', () => {
  it('le signalé se rend insignalable en trois auto-signalements refusés, et apprend qu\'on l\'a signalé', async () => {
    const { f, created } = await app();
    const corps = { reportedType: 'user', reportedEntityId: HARCELEUR, reportType: 'spam' };
    for (let i = 0; i < 3; i++) {
      const r = await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': HARCELEUR }, payload: corps });
      expect(r.statusCode).toBe(404);
    }
    const victime = await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': VICTIME }, payload: corps });
    // Adapté (#14110) : l'auditeur attendait `created` vide, ce qui ne peut tenir
    // avec un 201 — le signalement de la victime est écrit, et c'est le seul.
    expect(created).toHaveLength(1);
    expect(victime.statusCode).toBe(201);
    await f.close();
  });

  it('cinq signalants d\'une même cible dans l\'heure : cinq accusés, cinq écritures — aucun seuil par cible ne jette (contre-audit N2)', async () => {
    const { f, created } = await app();
    const corps = { reportedType: 'user', reportedEntityId: HARCELEUR, reportType: 'spam' };
    const signalants = ['507f1f77bcf86cd799439041', '507f1f77bcf86cd799439042', '507f1f77bcf86cd799439043', '507f1f77bcf86cd799439044', '507f1f77bcf86cd799439045'];
    const reponses = [];
    for (const qui of signalants) reponses.push(await f.inject({ method: 'POST', url: '/reports', headers: { 'x-as': qui }, payload: corps }));
    await f.close();
    expect(reponses.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201]);
    expect(created).toHaveLength(5);
    expect(new Set(reponses.map((r) => r.json().data.id))).toEqual(new Set(['507f1f77bcf86cd7994390ff']));
  });
});
