/**
 * Unit tests for admin/reports.ts
 * Tests all report routes: POST /, GET /, GET /stats, GET /recent,
 * GET /:id, PATCH /:id, DELETE /:id, GET /entity/:type/:id,
 * POST /:id/assign, GET /moderator/mine
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn<any>().mockReturnValue({ offset: 0, limit: 10 }),
  buildPaginationMeta: jest.fn<any>().mockReturnValue({ total: 0, limit: 10, offset: 0 }),
}));

const mockCreateReport = jest.fn<any>().mockResolvedValue({ id: 'rpt-1', status: 'pending' });
const mockListReports = jest.fn<any>().mockResolvedValue({ reports: [], total: 0 });
const mockGetReportStats = jest.fn<any>().mockResolvedValue({ pending: 0, resolved: 0 });
const mockGetRecentReports = jest.fn<any>().mockResolvedValue([]);
const mockGetReportById = jest.fn<any>().mockResolvedValue({ id: 'rpt-1' });
const mockUpdateReport = jest.fn<any>().mockResolvedValue({ id: 'rpt-1', status: 'resolved' });
const mockDeleteReport = jest.fn<any>().mockResolvedValue(undefined);
const mockGetReportsForEntity = jest.fn<any>().mockResolvedValue({ reports: [], total: 0 });
const mockAssignModerator = jest.fn<any>().mockResolvedValue({ id: 'rpt-1' });
const mockGetModeratorReports = jest.fn<any>().mockResolvedValue([]);
const mockAdminAuditLogCreate = jest.fn<any>().mockResolvedValue({});

jest.mock('../../../services/admin/report.service', () => ({
  getReportService: jest.fn().mockReturnValue({
    createReport: (...a: any[]) => mockCreateReport(...a),
    listReports: (...a: any[]) => mockListReports(...a),
    getReportStats: (...a: any[]) => mockGetReportStats(...a),
    getRecentReports: (...a: any[]) => mockGetRecentReports(...a),
    getReportById: (...a: any[]) => mockGetReportById(...a),
    updateReport: (...a: any[]) => mockUpdateReport(...a),
    deleteReport: (...a: any[]) => mockDeleteReport(...a),
    getReportsForEntity: (...a: any[]) => mockGetReportsForEntity(...a),
    assignModerator: (...a: any[]) => mockAssignModerator(...a),
    getModeratorReports: (...a: any[]) => mockGetModeratorReports(...a),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { reportRoutes } from '../../../routes/admin/reports';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const VALID_CREATE_BODY = {
  reportedType: 'message',
  reportedEntityId: '507f1f77bcf86cd799439012',
  reportType: 'spam',
};

// ─── Factory ─────────────────────────────────────────────────────────────────

async function buildApp(role = 'MODERATOR'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });

  // La cible d'un signalement est VÉRIFIÉE avant écriture depuis #4155 : un
  // double `prisma` vide est plus pauvre que la production — la vérification y
  // lèverait, et le témoin lirait 500 là où il croit lire 201.
  //
  // #4157 — `adminAuditLog.create` est appelé par `withAudit` (DELETE /:id) ;
  // le stub est nécessaire pour que la trace s'écrive RÉELLEMENT plutôt que
  // d'échouer en silence (`withAudit` est best-effort et n'échoue jamais la
  // requête, mais un témoin de trace a besoin d'un mock qui répond).
  app.decorate('prisma', {
    message: { findUnique: async () => ({ conversationId: '507f1f77bcf86cd799439077' }) },
    participant: { findFirst: async () => ({ id: 'p1' }) },
    adminAuditLog: { create: mockAdminAuditLogCreate },
  } as any);

  await app.register(reportRoutes);
  await app.ready();
  return app;
}

// ─── POST / — Create report ───────────────────────────────────────────────────

describe('POST / — success (201)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 with success:true for valid report body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

describe('POST / — Zod validation error → 400', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when required fields are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

describe('POST / — service error → 500', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateReport.mockRejectedValue(new Error('DB failure'));
    app = await buildApp();
  });
  afterAll(async () => {
    mockCreateReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
    await app.close();
  });

  it('returns 500 when createReport throws', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET / — List reports ─────────────────────────────────────────────────────

describe('GET / — USER role → 403', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('GET / — MODERATOR role → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success:true for MODERATOR role', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// #4157 — le SEUIL de référence pour la table `Report`. L'issue documente une
// contradiction ENTRE FICHIERS : `GET /admin/users/:id/reports` (routes/admin/
// users.ts, hors territoire de ce lot) admet AUDIT via `canViewUsers`, alors
// que cette route-ci — qui lit la MÊME table — exige `canModerateContent`
// (MODERATOR). Ce témoin fixe le seuil JUSTE de CE fichier ; l'autre route
// doit converger vers lui, pas l'inverse (voir `edits_hors_territoire`).
describe('GET / — AUDIT role → 403 (seuil de référence #4157)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('AUDIT'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 for AUDIT — canModerateContent = false, la table Report exige MODERATOR', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

// ─── GET /stats ───────────────────────────────────────────────────────────────

describe('GET /stats — MODERATOR → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with stats for MODERATOR', async () => {
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /recent ──────────────────────────────────────────────────────────────

describe('GET /recent — MODERATOR → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with recent reports for MODERATOR', async () => {
    const res = await app.inject({ method: 'GET', url: '/recent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /:id — not found → 404', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportById.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1' });
    await app.close();
  });

  it('returns 404 when report does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/rpt-unknown' });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /:id — found → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with report data when found', async () => {
    const res = await app.inject({ method: 'GET', url: '/rpt-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

describe('PATCH /:id — invalid body → 400', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when status enum value is invalid', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/rpt-1',
      payload: { status: 'not_a_valid_status' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

describe('PATCH /:id — success → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUpdateReport.mockResolvedValue({ id: 'rpt-1', status: 'resolved' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with updated report on valid body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/rpt-1',
      payload: { status: 'resolved' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe('DELETE /:id — success → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1', reportedType: 'message', reportedEntityId: 'msg-1', reportType: 'spam', status: 'pending' });
    mockDeleteReport.mockResolvedValue(undefined);
    app = await buildApp();
  });
  afterAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1' });
    await app.close();
  });

  it('returns 200 after deleting a report, and writes an AdminAuditLog trace', async () => {
    mockAdminAuditLogCreate.mockClear();
    const res = await app.inject({ method: 'DELETE', url: '/rpt-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockDeleteReport).toHaveBeenCalledWith('rpt-1');

    expect(mockAdminAuditLogCreate).toHaveBeenCalledTimes(1);
    const auditData = mockAdminAuditLogCreate.mock.calls[0][0].data;
    expect(auditData.action).toBe('ADMIN_REPORT_DELETED');
    expect(auditData.entity).toBe('Report');
    expect(auditData.entityId).toBe('rpt-1');
  });
});

// #4157 — la matrice n'a pas d'avis sur ce point (« — » dans le tableau de
// l'issue) : un modérateur ne peut pas effacer la trace d'un signalement qui
// le VISE (`reportedType === 'user' && reportedEntityId === l'appelant`) —
// sans quoi il efface la preuve avant qu'un rang supérieur ne l'examine.
describe('DELETE /:id — refuse un modérateur qui supprime un signalement le visant (#4157)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportById.mockResolvedValue({
      id: 'rpt-self',
      reportedType: 'user',
      reportedEntityId: USER_ID, // == l'id du modérateur authentifié par buildApp()
      reportType: 'harassment',
      status: 'pending',
    });
    app = await buildApp('MODERATOR');
  });
  afterAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1' });
    await app.close();
  });

  it('returns 403 and does NOT delete the report', async () => {
    mockDeleteReport.mockClear();
    const res = await app.inject({ method: 'DELETE', url: '/rpt-self' });
    expect(res.statusCode).toBe(403);
    expect(mockDeleteReport).not.toHaveBeenCalled();
  });
});

// Un signalement visant un AUTRE utilisateur (ou une autre entité) reste
// supprimable — la garde ne porte que sur l'AUTO-suppression.
describe('DELETE /:id — un signalement visant un TIERS reste supprimable', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportById.mockResolvedValue({
      id: 'rpt-other',
      reportedType: 'user',
      reportedEntityId: '507f1f77bcf86cd799439099', // ≠ USER_ID
      reportType: 'harassment',
      status: 'pending',
    });
    mockDeleteReport.mockResolvedValue(undefined);
    app = await buildApp('MODERATOR');
  });
  afterAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1' });
    await app.close();
  });

  it('returns 200 and deletes the report', async () => {
    mockDeleteReport.mockClear();
    const res = await app.inject({ method: 'DELETE', url: '/rpt-other' });
    expect(res.statusCode).toBe(200);
    expect(mockDeleteReport).toHaveBeenCalledWith('rpt-other');
  });
});

describe('DELETE /:id — 404 quand le signalement est introuvable', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportById.mockResolvedValue(null);
    app = await buildApp('MODERATOR');
  });
  afterAll(async () => {
    mockGetReportById.mockResolvedValue({ id: 'rpt-1' });
    await app.close();
  });

  it('returns 404 and does NOT delete anything', async () => {
    mockDeleteReport.mockClear();
    const res = await app.inject({ method: 'DELETE', url: '/rpt-missing' });
    expect(res.statusCode).toBe(404);
    expect(mockDeleteReport).not.toHaveBeenCalled();
  });
});

// ─── GET /entity/:type/:id ────────────────────────────────────────────────────

describe('GET /entity/:type/:id — success → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReportsForEntity.mockResolvedValue({ reports: [], total: 0 });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with reports for the entity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/entity/message/507f1f77bcf86cd799439012',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /:id/assign ─────────────────────────────────────────────────────────

describe('POST /:id/assign — success → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockAssignModerator.mockResolvedValue({ id: 'rpt-1' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 after assigning moderator to report', async () => {
    const res = await app.inject({ method: 'POST', url: '/rpt-1/assign' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /moderator/mine ──────────────────────────────────────────────────────

describe('GET /moderator/mine — success → 200', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetModeratorReports.mockResolvedValue([]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with reports assigned to current moderator', async () => {
    const res = await app.inject({ method: 'GET', url: '/moderator/mine' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
