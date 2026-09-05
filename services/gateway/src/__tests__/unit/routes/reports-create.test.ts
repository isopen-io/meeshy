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

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

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

import { reportCreationRoutes } from '../../../routes/reports';
import { reportRoutes } from '../../../routes/admin/reports';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

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
  message: null as { conversationId: string } | null,
  participe: true,
  utilisateur: null as { id: string } | null,
  post: null as { authorId: string; visibility: string; visibilityUserIds: string[]; deletedAt: Date | null } | null,
  // Lignes `FriendRequest` pour la porte de signalement d'un post (#4866) —
  // le double HONORE le `where` réel d'`amitieAcceptee`, jamais un booléen.
  demandesAmitie: [] as ReadonlyArray<Record<string, unknown>>,
};

function prismaDouble() {
  return {
    message: { findUnique: async () => base.message },
    participant: { findFirst: async () => (base.participe ? { id: 'p1' } : null) },
    user: { findUnique: async () => base.utilisateur },
    post: { findUnique: async () => base.post },
    friendRequest: { findFirst: (args?: unknown) => findFirstHonouringWhere(base.demandesAmitie)(args) },
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
  await app.register(reportCreationRoutes, { prefix: '/reports' });
  await app.register(reportRoutes, { prefix: '/admin/reports' });
  await app.ready();
  return app;
}

describe('POST /reports — un geste ordinaire, à une adresse ordinaire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    base.message = { conversationId: CONVERSATION_ID };
    base.participe = true;
    base.utilisateur = null;
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
  });

  it('accepte un compte ORDINAIRE — aucune permission d’administration exigée', async () => {
    const app = await buildApp({ role: 'USER' });

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(res.statusCode).toBe(201);
    expect(createReport).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('refuse le même compte sur une autre route d’administration', async () => {
    // C'est CE témoin qui dit que le préfixe `/admin` redevient ce qu'il
    // annonce. Sans lui, « le signalement a déménagé » ne prouve rien sur ce
    // qui reste derrière.
    const app = await buildApp({ role: 'USER' });

    const res = await app.inject({ method: 'GET', url: '/admin/reports' });

    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it('ne renvoie ni l’identité du signalant ni les notes d’un modérateur', async () => {
    // `fast-json-stringify` retire ce que le schéma ne déclare pas — ici c'est
    // une décision : renvoyer `moderatorNotes` à la personne qui vient de
    // signaler serait une fuite, et lui renvoyer sa propre identité du poids
    // pour rien.
    createReport.mockResolvedValue({
      id: 'rpt-1',
      reportedType: 'message',
      reportedEntityId: MESSAGE_ID,
      reportType: 'spam',
      status: 'pending',
      createdAt: new Date('2026-08-29T00:00:00Z'),
      reporterId: USER_ID,
      reporterName: 'lambda',
      moderatorId: 'mod-1',
      moderatorNotes: 'compte deja signale trois fois',
      actionTaken: 'warning_sent',
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(res.statusCode).toBe(201);
    const servi = res.json().data as Record<string, unknown>;
    expect(Object.keys(servi).sort()).toEqual(
      ['createdAt', 'id', 'reportType', 'reportedEntityId', 'reportedType', 'status'].sort()
    );

    await app.close();
  });

  it('dérive le nom du signalant de l’identité SERVEUR, jamais du corps', async () => {
    const app = await buildApp({ role: 'USER', username: 'lambda' });

    await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { ...CORPS, reporterName: 'Le Patron', reporterId: 'quelqu-un-d-autre' },
    });

    const ecrit = createReport.mock.calls[0][0] as Record<string, unknown>;
    expect(ecrit.reporterName).toBe('lambda');
    expect(ecrit.reporterId).toBe(USER_ID);

    await app.close();
  });
});

describe('POST /reports — la cible doit exister et avoir été atteignable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    base.message = { conversationId: CONVERSATION_ID };
    base.participe = true;
    base.utilisateur = null;
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
  });

  it('refuse un ObjectId inventé — rien n’est écrit', async () => {
    base.message = null;
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });

  it('refuse un identifiant qui n’est même pas un ObjectId, SANS interroger la base', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { ...CORPS, reportedEntityId: 'pas-un-objectid' },
    });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });

  it('refuse un message d’une conversation où le signalant n’est pas', async () => {
    base.participe = false;
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });

  it('rend le MÊME refus pour l’inexistant et l’inaccessible — pas d’oracle d’existence', async () => {
    const app = await buildApp();

    base.message = null;
    const inexistant = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    base.message = { conversationId: CONVERSATION_ID };
    base.participe = false;
    const inaccessible = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(inexistant.statusCode).toBe(inaccessible.statusCode);
    expect(inexistant.json().message).toBe(inaccessible.json().message);

    await app.close();
  });

  it('refuse de se signaler soi-même', async () => {
    base.utilisateur = { id: USER_ID };
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { reportedType: 'user', reportedEntityId: USER_ID, reportType: 'spam' },
    });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });
});

describe("POST /reports — signaler un post FRIENDS respecte la loi d'amitié (#4866)", () => {
  const AUTHOR_ID = '507f1f77bcf86cd799439055';
  const POST_ID = '507f1f77bcf86cd799439066';
  const CORPS_POST = { reportedType: 'post', reportedEntityId: POST_ID, reportType: 'spam' } as const;

  beforeEach(() => {
    jest.clearAllMocks();
    base.post = { authorId: AUTHOR_ID, visibility: 'FRIENDS', visibilityUserIds: [], deletedAt: null };
    base.demandesAmitie = [];
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
  });

  it("refuse de signaler un post FRIENDS quand la seule relation avec l'auteur est PENDING/REJECTED — le verdict de la loi atteint la réponse servie", async () => {
    base.demandesAmitie = [
      { id: 'fr-pending', senderId: USER_ID, receiverId: AUTHOR_ID, status: 'pending' },
      { id: 'fr-rejected', senderId: AUTHOR_ID, receiverId: USER_ID, status: 'rejected' },
    ];
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS_POST });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });

  it("autorise le signalement d'un post FRIENDS quand une demande ACCEPTÉE existe, même à côté du bruit pending/rejected", async () => {
    base.demandesAmitie = [
      { id: 'fr-pending', senderId: USER_ID, receiverId: AUTHOR_ID, status: 'pending' },
      { id: 'fr-accepted', senderId: AUTHOR_ID, receiverId: USER_ID, status: 'accepted' },
    ];
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS_POST });

    expect(res.statusCode).toBe(201);
    expect(createReport).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

describe('POST /reports — le seuil par CIBLE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    base.message = { conversationId: CONVERSATION_ID };
    base.participe = true;
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
  });

  it('laisse passer trois signalements de la même cible, refuse le quatrième', async () => {
    // Aucune clé par APPELANT ne peut faire ça : dix comptes complices tiennent
    // chacun leur quota. C'est le seul seuil qui protège la personne signalée.
    const app = await buildApp();

    const statuts: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });
      statuts.push(res.statusCode);
    }

    expect(statuts.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuts[3]).toBe(429);
    expect(createReport).toHaveBeenCalledTimes(3);

    await app.close();
  });

  it('ne compte pas une AUTRE cible dans le même seau', async () => {
    const app = await buildApp();

    for (let i = 0; i < 3; i += 1) {
      await app.inject({ method: 'POST', url: '/reports', payload: CORPS });
    }

    const autre = await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { ...CORPS, reportedEntityId: '507f1f77bcf86cd799439099' },
    });

    expect(autre.statusCode).toBe(201);

    await app.close();
  });
});

describe('POST /reports — le signalant ANONYME', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    base.message = { conversationId: CONVERSATION_ID };
    base.participe = true;
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
  });

  /** Un participant de lien de partage : pas de `userId`, une ligne `Participant`. */
  async function buildAppAnonyme(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async (req: any) => {
      req.authContext = {
        isAuthenticated: true,
        isAnonymous: true,
        anonymousUser: { id: 'participant-1', username: 'invite-42' },
      };
    });
    app.decorate('prisma', prismaDouble());
    await app.register(reportCreationRoutes, { prefix: '/reports' });
    await app.ready();
    return app;
  }

  it('accepte un participant anonyme — sa participation se lit sur sa LIGNE', async () => {
    // L'ancienne route acceptait explicitement les signalements anonymes
    // (`authContext.anonymousUser?.username`). Vérifier la cible par le seul
    // `userId` les aurait tous refusés — une régression silencieuse, invisible
    // à tout témoin écrit sur un compte inscrit.
    const app = await buildAppAnonyme();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(res.statusCode).toBe(201);
    expect((createReport.mock.calls[0][0] as Record<string, unknown>).reporterName).toBe('invite-42');
    expect((createReport.mock.calls[0][0] as Record<string, unknown>).reporterId).toBeUndefined();

    await app.close();
  });

  it('refuse un anonyme sur une conversation où sa ligne n’est pas', async () => {
    base.participe = false;
    const app = await buildAppAnonyme();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: CORPS });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /admin/reports — l’adresse historique, en adaptateur mince', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    base.message = { conversationId: CONVERSATION_ID };
    base.participe = true;
    createReport.mockResolvedValue({ id: 'rpt-1', status: 'pending' });
  });

  it('accepte encore un compte ordinaire — les clients installés continuent', async () => {
    const app = await buildApp({ role: 'USER' });

    const res = await app.inject({ method: 'POST', url: '/admin/reports', payload: CORPS });

    expect(res.statusCode).toBe(201);

    await app.close();
  });

  it('applique la MÊME vérification de cible que l’adresse neuve', async () => {
    // Un adaptateur qui recopierait le geste porterait sa propre loi — la forme
    // du défaut, pas sa correction.
    base.message = null;
    const app = await buildApp({ role: 'USER' });

    const res = await app.inject({ method: 'POST', url: '/admin/reports', payload: CORPS });

    expect(res.statusCode).toBe(404);
    expect(createReport).not.toHaveBeenCalled();

    await app.close();
  });

  it('ignore `reporterName` du corps, comme l’adresse neuve', async () => {
    const app = await buildApp({ role: 'USER', username: 'lambda' });

    await app.inject({
      method: 'POST',
      url: '/admin/reports',
      payload: { ...CORPS, reporterName: 'Le Patron' },
    });

    expect((createReport.mock.calls[0][0] as Record<string, unknown>).reporterName).toBe('lambda');

    await app.close();
  });
});
