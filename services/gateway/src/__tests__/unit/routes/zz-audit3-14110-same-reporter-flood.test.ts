/**
 * Contre-audit 3 #14110 — sans seuil par cible ni regroupement à la lecture, UN
 * compte déclaré mineur écrit dix signalements PRIORITAIRES de la même cible
 * par heure, et ils passent devant tout signalement prioritaire plus récent.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { reportCreationRoutes } from '../../../routes/reports';
import { priorityFirst } from '../../../services/reports/priorityQueue';
import { reportTable, type ReportRow } from '../../helpers/report-table';

const MINOR_BIRTH = new Date('2012-06-01');
const SPAMMEURS = ['507f1f77bcf86cd799439041', '507f1f77bcf86cd799439042', '507f1f77bcf86cd799439043'];
const VICTIME_MINEURE = '507f1f77bcf86cd799439049';
const CIBLE_DU_RAID = '507f1f77bcf86cd799439031';
const HARCELEUR = '507f1f77bcf86cd799439039';
const rows: ReportRow[] = [];
let clock = Date.UTC(2026, 10, 2, 10);

async function app() {
  const f = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  f.decorate('authenticate', async (req: any) => {
    const id = req.headers['x-as'] as string;
    req.authContext = { isAuthenticated: true, isAnonymous: false, userId: id, registeredUser: { id, role: 'USER', username: id } };
  });
  f.decorate('prisma', {
    user: {
      findUnique: async (a: any) => ({ id: a.where.id }),
      findMany: async (a: any) => (a.where.id.in as string[]).map((id) => ({ id, birthDate: [...SPAMMEURS, VICTIME_MINEURE].includes(id) ? MINOR_BIRTH : new Date('1990-01-01') })),
    },
    participant: { count: async () => 0 },
    message: { findUnique: async () => null },
    userRelation: { findUnique: async () => null },
    report: {
      // Adapté (#14627) : le dédoublonnage lit la ligne ouverte du signalant — le double l'évalue sur les lignes écrites.
      findFirst: (a: any) => reportTable(rows).findFirst(a),
      create: async (a: any) => {
        const row = { id: (rows.length + 1).toString(16).padStart(24, '0'), createdAt: new Date((clock += 1000)), ...a.data };
        rows.push(row);
        return row;
      },
    },
  } as any);
  await f.register(reportCreationRoutes, { prefix: '/reports' });
  await f.ready();
  return f;
}

describe('contre-audit 3 — le palier prioritaire se remplit d\'un seul geste répété', () => {
  it('un même signalant n\'a qu\'un signalement ouvert par cible, et la victime reste en page 1', async () => {
    const f = await app();
    const raid = { reportedType: 'user', reportedEntityId: CIBLE_DU_RAID, reportType: 'spam' };
    for (const [k, qui] of SPAMMEURS.entries()) for (let i = 0; i < 10; i++) await f.inject({ method: 'POST', url: '/reports', remoteAddress: `10.0.0.${k + 1}`, headers: { 'x-as': qui }, payload: raid });
    const victime = await f.inject({ method: 'POST', url: '/reports', remoteAddress: '10.0.1.1', headers: { 'x-as': VICTIME_MINEURE }, payload: { reportedType: 'user', reportedEntityId: HARCELEUR, reportType: 'harassment' } });
    await f.close();
    expect(victime.statusCode).toBe(201);
    const page1 = await priorityFirst<ReportRow>(reportTable(rows), { where: {}, orderBy: { createdAt: 'desc' }, skip: 0, take: 20 });
    expect(page1.rows.map((r) => r.reporterId)).toContain(VICTIME_MINEURE);
    expect(rows.filter((r) => r.reporterId === SPAMMEURS[0])).toHaveLength(1);
  });
});
