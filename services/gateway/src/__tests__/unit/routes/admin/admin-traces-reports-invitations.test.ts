/**
 * Les gestes que la console EXPOSE laissent une trace (#8876, § 6.10).
 *
 * Trois gestes d'administration écrivaient sans rien consigner :
 *  - `PATCH /admin/reports/:id` — statut, action consignée, notes du modérateur ;
 *  - `POST /admin/reports/:id/assign` — la prise en charge ;
 *  - `PATCH /admin/invitations/:id` — le statut d'une demande de contact.
 *
 * Une console qui donne ces gestes sans journal fabrique exactement ce que le
 * journal d'audit existe pour empêcher : un état qui a changé sans que personne
 * puisse dire qui. La trace est écrite APRÈS le geste réussi — jamais avant, jamais
 * sur un échec — et porte les CHANGEMENTS (avant → après), pas seulement l'intention.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

const getReportById = jest.fn<any>();
const updateReport = jest.fn<any>();
const assignModerator = jest.fn<any>();

jest.mock('../../../../services/admin/report.service', () => ({
  getReportService: jest.fn().mockReturnValue({
    getReportById: (...a: any[]) => getReportById(...a),
    updateReport: (...a: any[]) => updateReport(...a),
    assignModerator: (...a: any[]) => assignModerator(...a),
    listReports: jest.fn<any>(),
    getReportStats: jest.fn<any>(),
    getRecentReports: jest.fn<any>(),
    getReportsForEntity: jest.fn<any>(),
    getModeratorReports: jest.fn<any>(),
    deleteReport: jest.fn<any>(),
    createReport: jest.fn<any>(),
  }),
}));

jest.mock('../../../../services/reports/reportResolvedNotification', () => {
  const actual = jest.requireActual('../../../../services/reports/reportResolvedNotification') as any;
  return { ...actual, notifyReportResolved: jest.fn<any>().mockResolvedValue(undefined) };
});

import { reportRoutes } from '../../../../routes/admin/reports';
import { invitationRoutes } from '../../../../routes/admin/invitations';

const ACTOR = '507f1f77bcf86cd799439011';
const REPORT = '507f1f77bcf86cd799439071';
const TARGET = '507f1f77bcf86cd799439072';
const INVITATION = '507f1f77bcf86cd799439081';
const SENDER = '507f1f77bcf86cd799439082';
const RECEIVER = '507f1f77bcf86cd799439083';

const reportRow = (over: Record<string, unknown> = {}) => ({
  id: REPORT,
  reportedType: 'message',
  reportedEntityId: TARGET,
  reporterId: null,
  reporterName: null,
  reportType: 'spam',
  reason: null,
  status: 'pending',
  moderatorId: null,
  moderatorNotes: null,
  actionTaken: null,
  createdAt: new Date('2026-09-29T10:00:00.000Z'),
  updatedAt: new Date('2026-09-29T10:00:00.000Z'),
  resolvedAt: null,
  ...over,
});

function makePrisma() {
  return {
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
    friendRequest: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: INVITATION, status: 'pending', senderId: SENDER, receiverId: RECEIVER }),
      update: jest.fn<any>().mockResolvedValue({
        id: INVITATION,
        status: 'rejected',
        sender: { id: SENDER, username: 'awa', displayName: 'Awa' },
        receiver: { id: RECEIVER, username: 'jean', displayName: 'Jean' },
      }),
    },
  } as any;
}

async function build(prisma: any, plugin: (app: FastifyInstance) => Promise<void> | void, role = 'ADMIN') {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      userId: ACTOR,
      registeredUser: { id: ACTOR, role, username: 'acteur' },
    };
  });
  await app.register(plugin as any);
  await app.ready();
  return app;
}

const auditRows = (prisma: any) => prisma.adminAuditLog.create.mock.calls.map((c: any[]) => c[0].data);

beforeEach(() => {
  jest.clearAllMocks();
  getReportById.mockResolvedValue(reportRow());
});

describe('PATCH /admin/reports/:id — la décision de modération est tracée', () => {
  it('écrit ADMIN_REPORT_UPDATED avec les changements avant → après et les notes comme motif', async () => {
    const prisma = makePrisma();
    updateReport.mockResolvedValue(
      reportRow({ status: 'resolved', actionTaken: 'content_removed', moderatorNotes: 'Message retiré', moderatorId: ACTOR })
    );
    const app = await build(prisma, reportRoutes);
    const res = await app.inject({
      method: 'PATCH',
      url: `/${REPORT}`,
      payload: { status: 'resolved', actionTaken: 'content_removed', moderatorNotes: 'Message retiré' },
    });

    expect(res.statusCode).toBe(200);
    const [audit] = auditRows(prisma);
    expect(audit).toMatchObject({
      action: 'ADMIN_REPORT_UPDATED',
      entity: 'Report',
      entityId: REPORT,
      adminId: ACTOR,
      userId: TARGET,
    });
    expect(JSON.parse(audit.changes)).toEqual({
      status: { before: 'pending', after: 'resolved' },
      actionTaken: { before: null, after: 'content_removed' },
      moderatorNotes: { before: null, after: 'Message retiré' },
      moderatorId: { before: null, after: ACTOR },
    });
    expect(JSON.parse(audit.metadata)).toEqual({ reason: 'Message retiré' });
    await app.close();
  });

  it('ne consigne que ce qui a CHANGÉ — un champ identique n’apparaît pas', async () => {
    const prisma = makePrisma();
    getReportById.mockResolvedValue(reportRow({ status: 'under_review', moderatorId: ACTOR }));
    updateReport.mockResolvedValue(reportRow({ status: 'rejected', moderatorId: ACTOR }));
    const app = await build(prisma, reportRoutes);
    await app.inject({ method: 'PATCH', url: `/${REPORT}`, payload: { status: 'rejected' } });

    const [audit] = auditRows(prisma);
    expect(JSON.parse(audit.changes)).toEqual({ status: { before: 'under_review', after: 'rejected' } });
    expect(audit.metadata).toBeUndefined();
    await app.close();
  });

  it('n’écrit rien quand le signalement n’existe pas ou que l’écriture échoue', async () => {
    const prisma = makePrisma();
    const app = await build(prisma, reportRoutes);

    getReportById.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'PATCH', url: `/${REPORT}`, payload: { status: 'resolved' } })).statusCode).toBe(404);

    updateReport.mockRejectedValueOnce(new Error('DB error'));
    expect((await app.inject({ method: 'PATCH', url: `/${REPORT}`, payload: { status: 'resolved' } })).statusCode).toBe(500);

    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /admin/reports/:id/assign — la prise en charge est tracée', () => {
  it('écrit ADMIN_REPORT_ASSIGNED avec le nouveau statut et le modérateur', async () => {
    const prisma = makePrisma();
    assignModerator.mockResolvedValue(reportRow({ status: 'under_review', moderatorId: ACTOR }));
    const app = await build(prisma, reportRoutes, 'MODERATOR');
    const res = await app.inject({ method: 'POST', url: `/${REPORT}/assign` });

    expect(res.statusCode).toBe(200);
    const [audit] = auditRows(prisma);
    expect(audit).toMatchObject({
      action: 'ADMIN_REPORT_ASSIGNED',
      entity: 'Report',
      entityId: REPORT,
      adminId: ACTOR,
      userId: TARGET,
    });
    expect(JSON.parse(audit.changes)).toEqual({
      status: { before: 'pending', after: 'under_review' },
      moderatorId: { before: null, after: ACTOR },
    });
    await app.close();
  });

  it('un signalement inconnu rend 404 — sans affectation ni trace', async () => {
    const prisma = makePrisma();
    getReportById.mockResolvedValue(null);
    const app = await build(prisma, reportRoutes);
    const res = await app.inject({ method: 'POST', url: `/${REPORT}/assign` });

    expect(res.statusCode).toBe(404);
    expect(assignModerator).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('une affectation qui échoue ne laisse aucune trace', async () => {
    const prisma = makePrisma();
    assignModerator.mockRejectedValue(new Error('DB error'));
    const app = await build(prisma, reportRoutes);

    expect((await app.inject({ method: 'POST', url: `/${REPORT}/assign` })).statusCode).toBe(500);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /admin/invitations/:id — le statut d’une demande de contact est tracé', () => {
  it('écrit ADMIN_INVITATION_STATUS_SET sur l’entité FriendRequest, sujet = le destinataire', async () => {
    const prisma = makePrisma();
    const app = await build(prisma, invitationRoutes);
    const res = await app.inject({ method: 'PATCH', url: `/${INVITATION}`, payload: { status: 'rejected' } });

    expect(res.statusCode).toBe(200);
    const [audit] = auditRows(prisma);
    expect(audit).toMatchObject({
      action: 'ADMIN_INVITATION_STATUS_SET',
      entity: 'FriendRequest',
      entityId: INVITATION,
      adminId: ACTOR,
      userId: RECEIVER,
    });
    expect(JSON.parse(audit.changes)).toEqual({ status: { before: 'pending', after: 'rejected' } });
    await app.close();
  });

  it('lit l’état AVANT d’écrire : c’est ce qui fait le « avant » du journal', async () => {
    const prisma = makePrisma();
    const app = await build(prisma, invitationRoutes);
    await app.inject({ method: 'PATCH', url: `/${INVITATION}`, payload: { status: 'rejected' } });

    const read = prisma.friendRequest.findUnique.mock.invocationCallOrder[0];
    const write = prisma.friendRequest.update.mock.invocationCallOrder[0];
    expect(read).toBeLessThan(write);
    await app.close();
  });

  it('une demande inconnue rend 404 — sans écriture ni trace', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findUnique.mockResolvedValue(null);
    const app = await build(prisma, invitationRoutes);
    const res = await app.inject({ method: 'PATCH', url: `/${INVITATION}`, payload: { status: 'rejected' } });

    expect(res.statusCode).toBe(404);
    expect(prisma.friendRequest.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('une écriture qui échoue ne laisse aucune trace', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.update.mockRejectedValue(new Error('DB error'));
    const app = await build(prisma, invitationRoutes);

    expect((await app.inject({ method: 'PATCH', url: `/${INVITATION}`, payload: { status: 'rejected' } })).statusCode).toBe(500);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });
});
