/**
 * Contre-audit 3 #14110 — la victime qui a OUVERT le tête-à-tête ne peut plus
 * signaler la conversation (rôle `creator` posé à l'initiateur d'un direct).
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { reportCreationRoutes } from '../../../routes/reports';
import { reportMatches, type ReportRow } from '../../helpers/report-table';

const VICTIME = '507f1f77bcf86cd799439032';
const HARCELEUR = '507f1f77bcf86cd799439031';
const DM = '507f1f77bcf86cd799439060';
const PARTICIPANTS = [
  { id: 'p1', conversationId: DM, userId: VICTIME, role: 'creator', isActive: true },
  { id: 'p2', conversationId: DM, userId: HARCELEUR, role: 'member', isActive: true },
];
const created: unknown[] = [];

async function app() {
  created.length = 0;
  const f = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  f.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, isAnonymous: false, userId: VICTIME, registeredUser: { id: VICTIME, role: 'USER', username: 'v' } };
  });
  f.decorate('prisma', {
    conversation: { findUnique: async () => ({ id: DM, type: 'direct' }) },
    participant: {
      findFirst: async (a: any) => PARTICIPANTS.find((p) => Object.entries(a.where).every(([k, v]) => (p as any)[k] === v)) ?? null,
      count: async () => 0,
    },
    user: { findMany: async () => [] },
    message: { findUnique: async () => null },
    userRelation: { findUnique: async () => null },
    report: { findFirst: async (a: any) => (created as ReportRow[]).find((row) => reportMatches(row, a.where)) ?? null, create: async (a: any) => { created.push(a.data); return { id: '507f1f77bcf86cd7994390ff', createdAt: new Date(), ...a.data }; } },
  } as any);
  await f.register(reportCreationRoutes, { prefix: '/reports' });
  await f.ready();
  return f;
}

describe('contre-audit 3 — signaler un tête-à-tête qu\'on a ouvert', () => {
  it('la personne qui a envoyé le premier message signale la conversation où on la harcèle', async () => {
    const f = await app();
    const r = await f.inject({ method: 'POST', url: '/reports', payload: { reportedType: 'conversation', reportedEntityId: DM, reportType: 'harassment' } });
    await f.close();
    expect(r.statusCode).toBe(201);
    expect(created).toHaveLength(1);
  });
});
