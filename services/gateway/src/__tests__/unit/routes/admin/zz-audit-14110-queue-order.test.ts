/**
 * Audit #14110 — la file servie par la VRAIE route met-elle la priorité en tête ?
 *
 * Repris de l'auditeur (B1) et resserré par m4 : la route et le service sont
 * réels, seul Prisma est doublé, par une table qui ÉVALUE `where`, `orderBy`,
 * `skip` et `take`. Le palier prioritaire passe en tête quel que soit `sortBy`,
 * du plus ancien au plus récent ; le reste suit le tri demandé.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { reportRoutes } from '../../../../routes/admin/reports';
import { reportTable, type ReportRow } from '../../../helpers/report-table';

const VIEWER = '507f1f77bcf86cd799439011';

const at = (hour: number) => new Date(Date.UTC(2026, 10, 2, hour));
const row = (id: string, hour: number, priority?: number, status = 'pending'): ReportRow => ({
  id, createdAt: at(hour), status, reportType: 'spam', reportedType: 'user', reportedEntityId: VIEWER,
  ...(priority === undefined ? {} : { priority }),
});

const ROWS: readonly ReportRow[] = [
  row('507f1f77bcf86cd7994390a2', 11, 1),
  row('507f1f77bcf86cd7994390b1', 12, 0),
  row('507f1f77bcf86cd7994390a1', 10, 1, 'under_review'),
  row('507f1f77bcf86cd7994390b2', 13),
  row('507f1f77bcf86cd7994390b3', 9, 0),
];
const [P2, O1, P1, O2, O3] = ROWS.map((r) => r.id);

async function served(url: string): Promise<string[]> {
  const prisma = { report: reportTable(ROWS), user: { findMany: jest.fn<any>().mockResolvedValue([]) } } as any;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: VIEWER, registeredUser: { id: VIEWER, role: 'MODERATOR' } };
  });
  app.decorate('prisma', prisma);
  await app.register(reportRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data.reports.map((r: { id: string }) => r.id);
}

describe('GET /admin/reports — ordre réel de la file (#14110, MIN-04)', () => {
  it('sans ?sortBy, le palier prioritaire passe en tête, du plus ancien au plus récent', async () => {
    await expect(served('/')).resolves.toEqual([P1, P2, O2, O1, O3]);
  });

  it('avec ?sortBy=createdAt (ce que le web envoie toujours), la priorité reste la première clé', async () => {
    await expect(served('/?sortBy=createdAt&sortOrder=desc')).resolves.toEqual([P1, P2, O2, O1, O3]);
    await expect(served('/?sortBy=createdAt&sortOrder=asc')).resolves.toEqual([P1, P2, O3, O1, O2]);
  });

  it('une page qui chevauche les deux paliers ne perd ni ne double personne', async () => {
    await expect(served('/?offset=1&limit=2')).resolves.toEqual([P2, O2]);
    await expect(served('/?offset=3&limit=2')).resolves.toEqual([O1, O3]);
  });
});
