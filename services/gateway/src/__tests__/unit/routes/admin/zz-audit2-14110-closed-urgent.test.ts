/**
 * Contre-audit #14110 (B1 corrigé) — la vue par défaut de la console (aucun
 * filtre de statut, `sortBy=createdAt&sortOrder=desc`) montre-t-elle en page 1
 * le signalement prioritaire EN ATTENTE quand l'historique porte des
 * signalements prioritaires déjà CLOS ?
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { reportRoutes } from '../../../../routes/admin/reports';
import { reportTable } from '../../../helpers/report-table';

const VIEWER = '507f1f77bcf86cd799439011';
const hex = (n: number) => n.toString(16).padStart(24, '0');
type Row = { id: string; priority: number; createdAt: Date; status: string; reportType: string; reportedType: string; reportedEntityId: string };
const day = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * 86_400_000);

const CLOSED_URGENT: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: hex(1000 + i), priority: 1, createdAt: day(i), status: 'resolved', reportType: 'spam', reportedType: 'user', reportedEntityId: VIEWER }));
const OPEN_URGENT: Row = { id: hex(9999), priority: 1, createdAt: day(300), status: 'pending', reportType: 'harassment', reportedType: 'user', reportedEntityId: VIEWER };
const ROWS = [...CLOSED_URGENT, OPEN_URGENT];

const table = reportTable(ROWS);

it('le prioritaire en attente est en page 1 de la vue par défaut', async () => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: VIEWER, registeredUser: { id: VIEWER, role: 'MODERATOR' } };
  });
  app.decorate('prisma', { report: table, user: { findMany: async () => [] } } as any);
  await app.register(reportRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/?offset=0&limit=20&sortBy=createdAt&sortOrder=desc' });
  await app.close();
  expect(res.statusCode).toBe(200);
  const ids = res.json().data.reports.map((r: { id: string }) => r.id);
  expect(ids[0]).toBe(OPEN_URGENT.id);
  expect(ids.slice(1)).toEqual([...CLOSED_URGENT].reverse().slice(0, 19).map((r) => r.id));
});
