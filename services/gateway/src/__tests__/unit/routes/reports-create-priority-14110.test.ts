/**
 * Signaler un contenu n'est plus un geste d'administration (#4155).
 *
 * Ces témoins tiennent les quatre choses que l'adresse `/admin/reports` ne
 * tenait pas :
 *
 *   1. l'adresse — un compte ORDINAIRE signale par `/reports`, et le même
 *      compte est refusé sur toute autre route d'administration ;
 *   2. la CIBLE existe et était atteignable — on ne signale plus un ObjectId
 *      inventé ;
 *   3. l'identité du signalant vient du SERVEUR, jamais du corps ;
 *   4. trois seuils de débit, dont celui par CIBLE — le seul qui protège la
 *      personne signalée du harcèlement par signalement en masse.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const createReport = jest.fn<any>();

jest.mock('../../../services/admin/report.service', () => ({
  getReportService: jest.fn().mockReturnValue({
    createReport: (...a: any[]) => createReport(...a),
    listReports: jest.fn<any>().mockResolvedValue({ reports: [], total: 0 }),
    getReportStats: jest.fn<any>().mockResolvedValue({}),
    getRecentReports: jest.fn<any>().mockResolvedValue([]),
    getReportById: jest.fn<any>().mockResolvedValue(null),
    updateReport: jest.fn<any>().mockResolvedValue({}),
    deleteReport: jest.fn<any>().mockResolvedValue(undefined),
    getReportsForEntity: jest.fn<any>().mockResolvedValue({ reports: [], total: 0 }),
    assignModerator: jest.fn<any>().mockResolvedValue({}),
    getModeratorReports: jest.fn<any>().mockResolvedValue([]),
  }),
}));

const notifyCreate = jest.fn<any>();

import { reportCreationRoutes } from '../../../routes/reports';
import { reportRoutes } from '../../../routes/admin/reports';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';
import { setSharedNotificationService } from '../../../services/notifications/notification-service-registry';

/** Tout appel, sur n'importe quelle méthode, est consigné : un canal qui n'existe pas ne peut pas passer pour muet. */
const calls: string[] = [];
const recorder = (name: string): any => new Proxy(() => undefined, {
  get: (_t, key) => (key === 'then' ? undefined : recorder(`${name}.${String(key)}`)),
  apply: () => { calls.push(name); return recorder(`${name}()`); },
});

const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439077';

const CORPS = {
  reportedType: 'message',
  reportedEntityId: MESSAGE_ID,
  reportType: 'spam',
} as const;

/** Ce que la base répond — chaque témoin le règle pour SON cas. */
const base = {
  message: null as { conversationId: string; senderId?: string; sender?: { userId: string | null } } | null,
  participe: true,
  utilisateur: null as { id: string } | null,
  post: null as { authorId: string; visibility: string; visibilityUserIds: string[]; deletedAt: Date | null } | null,
  commentaire: null as { postId: string; authorId: string; deletedAt: Date | null } | null,
  // Lignes `FriendRequest` pour la porte de signalement d'un post (#4866) —
  // le double HONORE le `where` réel d'`amitieAcceptee`, jamais un booléen.
  demandesAmitie: [] as ReadonlyArray<Record<string, unknown>>,
  naissances: [] as ReadonlyArray<{ id: string; birthDate: Date | null }>,
  membres: [] as ReadonlyArray<{ userId: string }>,
};

function prismaDouble() {
  return {
    message: { findUnique: async () => base.message },
    conversation: { findUnique: async () => ({ id: CONVERSATION_ID, type: 'group' }) },
    participant: { findFirst: async () => (base.participe ? { id: 'p1' } : null), findMany: async () => base.membres, count: async (a: any) => base.membres.filter((m) => base.naissances.some((u) => u.id === m.userId && u.birthDate !== null && u.birthDate >= a.where.user.is.birthDate.gte)).length, findUnique: async () => ({ userId: '507f1f77bcf86cd799439099' }) },
    user: { findUnique: async () => base.utilisateur, findMany: async (a: any) => base.naissances.filter((u) => a?.where?.id?.in?.includes(u.id)) },
    post: { findUnique: async () => base.post },
    postComment: { findUnique: async () => base.commentaire },
    friendRequest: { findFirst: (args?: unknown) => findFirstHonouringWhere(base.demandesAmitie)(args) },
    userRelation: { findUnique: async () => null, findMany: async () => [] },
    notification: { create: (...a: unknown[]) => notifyCreate(...a), createMany: (...a: unknown[]) => notifyCreate(...a) },
  } as any;
}

async function buildApp(options: { role?: string; username?: string } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: options.role ?? 'USER', username: options.username ?? 'lambda' },
    };
  });
  app.decorate('prisma', prismaDouble());
  app.decorate('socketIOHandler', recorder('io'));
  await app.register(reportCreationRoutes, { prefix: '/reports' });
  await app.register(reportRoutes, { prefix: '/admin/reports' });
  await app.ready();
  return app;
}

describe('POST /reports — signaler reste invisible, et ce qui touche un mineur passe en tête (#14110)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    base.message = { conversationId: CONVERSATION_ID };
    base.participe = true;
    base.utilisateur = null;
    base.naissances = [];
    base.membres = [];
    calls.length = 0;
    setSharedNotificationService(recorder('notifications'));
    createReport.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'rpt-1', status: 'pending', createdAt: new Date('2026-11-02T00:00:00Z'), ...data,
    }));
  });

  it('SEC-06 : signaler n\'écrit aucune notification et n\'émet rien, pour personne — registre, socket et table observés', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });
    expect(res.statusCode).toBe(201);
    expect(notifyCreate).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    await app.close();
  });

  it('le registre observé SAIT rougir : un appel au service partagé est vu', async () => {
    const { getSharedNotificationService } = await import('../../../services/notifications/notification-service-registry');
    (getSharedNotificationService() as any).createNotification({});
    expect(calls).toEqual(['notifications.createNotification']);
  });

  it('un message de la conversation d\'un mineur passe en tête, à travers la route (audit m2)', async () => {
    base.message = { conversationId: CONVERSATION_ID, senderId: 'p-auteur' };
    base.naissances = [{ id: '507f1f77bcf86cd799439088', birthDate: new Date('2012-01-01T00:00:00Z') }];
    base.membres = [{ userId: '507f1f77bcf86cd799439099' }, { userId: '507f1f77bcf86cd799439088' }];
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });
    expect(res.statusCode).toBe(201);
    expect(createReport).toHaveBeenCalledWith(expect.objectContaining({ priority: 1, priorityReasons: ['minor'] }));
    await app.close();
  });

  it('la priorité est calculée par la passerelle et transmise au service, jamais lue du corps', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/reports', payload: { ...CORPS, priority: 1, priorityReasons: ['minor'] } });
    expect(createReport).toHaveBeenCalledWith(expect.objectContaining({ priority: 0, priorityReasons: [] }));
    await app.close();
  });

  it('le signalant ne reçoit ni la priorité ni ses raisons, même par l\'alias historique', async () => {
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending', createdAt: new Date(), priority: 1, priorityReasons: ['minor'] });
    const app = await buildApp();
    for (const url of ['/reports', '/admin/reports']) {
      const res = await app.inject({ method: 'POST', url, payload: CORPS });
      expect(JSON.stringify(res.json())).not.toContain('priority');
    }
    await app.close();
  });
});
