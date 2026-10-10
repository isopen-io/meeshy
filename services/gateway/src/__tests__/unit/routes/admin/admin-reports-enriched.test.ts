/**
 * Les lectures de signalements servent des NOMS (#8876, § 6.4).
 *
 * `Report` porte un couple polymorphe (`reportedType`, `reportedEntityId`) et deux
 * identifiants de personnes. Ces témoins gardent ce que la console en lit :
 *  - le signalant, le modérateur et l'entité signalée sont NOMMÉS, par lot ;
 *  - l'extrait d'un contenu PROTÉGÉ ou RETIRÉ n'est jamais servi, et la réponse
 *    DIT qu'elle masque (`isProtected`) plutôt que de se taire ;
 *  - le schéma de réponse est FERMÉ : une colonne que le service remet sans
 *    qu'elle soit déclarée disparaît ;
 *  - les deux filtres neufs (`reportedEntityId`, `assigned`) atteignent le service.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const listReports = jest.fn<any>();
const getReportById = jest.fn<any>();
const getRecentReports = jest.fn<any>();
const getReportsForEntity = jest.fn<any>();
const getModeratorReports = jest.fn<any>();

jest.mock('../../../../services/admin/report.service', () => ({
  getReportService: jest.fn().mockReturnValue({
    listReports: (...a: any[]) => listReports(...a),
    getReportById: (...a: any[]) => getReportById(...a),
    getRecentReports: (...a: any[]) => getRecentReports(...a),
    getReportsForEntity: (...a: any[]) => getReportsForEntity(...a),
    getModeratorReports: (...a: any[]) => getModeratorReports(...a),
    getReportStats: jest.fn<any>(),
    updateReport: jest.fn<any>(),
    deleteReport: jest.fn<any>(),
    assignModerator: jest.fn<any>(),
    createReport: jest.fn<any>(),
  }),
}));

import { reportRoutes } from '../../../../routes/admin/reports';

const VIEWER = '507f1f77bcf86cd799439011';
const AWA = '507f1f77bcf86cd799439021';
const JEAN = '507f1f77bcf86cd799439022';
const MOD = '507f1f77bcf86cd799439023';
const ID = (n: number) => `607f1f77bcf86cd7994391${String(n).padStart(2, '0')}`;
const MESSAGE = ID(1);
const CONVERSATION = ID(2);
const COMMUNITY = ID(3);
const POST = ID(4);
const STORY = ID(5);
const COMMENT = ID(6);
const SOUND = ID(7);
const PRIVATE_POST = ID(8);
const GHOST = ID(9);

type Row = Record<string, unknown>;

const awa = { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/awa.png' };
const jean = { id: JEAN, username: 'jean', displayName: null, avatar: null };

const report = (over: Row = {}): Row => ({
  id: ID(50),
  reportedType: 'message',
  reportedEntityId: MESSAGE,
  reporterId: AWA,
  reporterName: null,
  reportType: 'harassment',
  reason: 'Insultes répétées',
  status: 'pending',
  moderatorId: null,
  moderatorNotes: null,
  actionTaken: null,
  createdAt: new Date('2026-09-29T10:00:00.000Z'),
  updatedAt: new Date('2026-09-29T10:05:00.000Z'),
  resolvedAt: null,
  ...over,
});

const inIds = (where: Row | undefined): string[] => ((where?.id as { in?: string[] } | undefined)?.in ?? []);
const pick = <T extends { id: string }>(rows: T[], where: Row | undefined): T[] => rows.filter((r) => inIds(where).includes(r.id));

const messageRow = (over: Row = {}): Row => ({
  id: MESSAGE,
  content: 'Tu es nul et tout le monde le sait',
  conversationId: CONVERSATION,
  deletedAt: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  isEncrypted: false,
  encryptionMode: null,
  sender: { id: 'p1', displayName: 'Jean', avatar: null, user: jean },
  ...over,
});

function makePrisma(over: { messages?: Row[]; posts?: Row[] } = {}) {
  const messages = over.messages ?? [messageRow()];
  const posts = over.posts ?? [
    { id: POST, content: 'Un long texte public', visibility: 'PUBLIC', deletedAt: null, author: awa },
    { id: STORY, content: 'Ma story', visibility: 'FRIENDS', deletedAt: null, author: jean },
    { id: PRIVATE_POST, content: 'Brouillon secret', visibility: 'PRIVATE', deletedAt: null, author: awa },
  ];
  return {
    user: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        pick([awa, jean, { id: MOD, username: 'mod', displayName: 'Modératrice', avatar: null }], args.where)
      ),
    },
    message: { findMany: jest.fn<any>(async (args: { where?: Row }) => pick(messages as any[], args.where)) },
    conversation: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        pick([{ id: CONVERSATION, title: 'Famille' }], args.where)
      ),
    },
    community: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        pick([{ id: COMMUNITY, name: 'Lycée Njanda', deletedAt: null, creator: awa }], args.where)
      ),
    },
    post: { findMany: jest.fn<any>(async (args: { where?: Row }) => pick(posts as any[], args.where)) },
    postComment: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        pick([{ id: COMMENT, content: 'Commentaire', deletedAt: null, author: jean }], args.where)
      ),
    },
    sound: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        pick([{ id: SOUND, title: 'Ambiance été', uploader: awa }], args.where)
      ),
    },
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
  } as any;
}

async function buildApp(prisma: any, role = 'MODERATOR'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: VIEWER, registeredUser: { id: VIEWER, role } };
  });
  app.decorate('prisma', prisma);
  await app.register(reportRoutes);
  await app.ready();
  return app;
}

/** Une liste d'un seul signalement, lue à travers toute la sérialisation. */
async function served(prisma: any, row: Row, role = 'MODERATOR') {
  listReports.mockResolvedValue({ reports: [row], total: 1 });
  const app = await buildApp(prisma, role);
  const res = await app.inject({ method: 'GET', url: '/' });
  await app.close();
  return JSON.parse(res.body).data.reports[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  listReports.mockResolvedValue({ reports: [], total: 0 });
});

describe('signalements — le signalant et le modérateur sont nommés', () => {
  it('sert reporter et moderator comme des personnes, jamais comme des identifiants seuls', async () => {
    const row = await served(makePrisma(), report({ reporterId: AWA, moderatorId: MOD }));

    expect(row.reporter).toEqual({ id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/awa.png' });
    expect(row.moderator).toEqual({ id: MOD, username: 'mod', displayName: 'Modératrice', avatar: null });
  });

  it('un signalement anonyme ou non assigné rend reporter et moderator null', async () => {
    const row = await served(makePrisma(), report({ reporterId: null, reporterName: 'Visiteur', moderatorId: null }));

    expect(row.reporter).toBeNull();
    expect(row.moderator).toBeNull();
    expect(row.reporterName).toBe('Visiteur');
  });

  it('un compte supprimé depuis rend null, sans erreur', async () => {
    const row = await served(makePrisma(), report({ reporterId: '507f1f77bcf86cd7994390ee' }));
    expect(row.reporter).toBeNull();
  });
});

describe('signalements — l’entité signalée, genre par genre', () => {
  it('un MESSAGE : auteur, conversation nommée et extrait', async () => {
    const row = await served(makePrisma(), report());

    expect(row.reportedEntity).toEqual({
      type: 'message',
      id: MESSAGE,
      label: null,
      owner: jean,
      excerpt: 'Tu es nul et tout le monde le sait',
      isProtected: false,
      deleted: false,
      conversation: { id: CONVERSATION, title: 'Famille' },
    });
  });

  it('un message d’un invité est attribué au nom sous lequel il s’est présenté', async () => {
    const prisma = makePrisma({
      messages: [messageRow({ sender: { id: 'p9', displayName: 'Invité 42', avatar: null, user: null } })],
    });
    const row = await served(prisma, report());

    expect(row.reportedEntity.owner).toEqual({ id: 'p9', username: '', displayName: 'Invité 42', avatar: null });
  });

  it.each([
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['chiffré', { isEncrypted: true }],
    ['éphémère déjà expiré', { expiresAt: new Date('2020-01-01T00:00:00.000Z') }],
  ])('un message %s n’a pas d’extrait, et la réponse dit qu’elle le masque', async (_nom, flags) => {
    const row = await served(makePrisma({ messages: [messageRow(flags)] }), report());

    expect(row.reportedEntity.excerpt).toBeNull();
    expect(row.reportedEntity.isProtected).toBe(true);
    expect(JSON.stringify(row)).not.toContain('Tu es nul');
  });

  it('un message retiré (deletedAt) n’a pas d’extrait et se dit supprimé', async () => {
    const row = await served(makePrisma({ messages: [messageRow({ deletedAt: new Date('2026-09-28') })] }), report());

    expect(row.reportedEntity).toMatchObject({ excerpt: null, deleted: true, isProtected: false });
  });

  it('tronque l’extrait à 120 caractères', async () => {
    const row = await served(makePrisma({ messages: [messageRow({ content: 'x'.repeat(300) })] }), report());

    expect(row.reportedEntity.excerpt).toBe(`${'x'.repeat(120)}…`);
  });

  it('un UTILISATEUR est nommé par son nom affiché, ou son @username à défaut', async () => {
    const named = await served(makePrisma(), report({ reportedType: 'user', reportedEntityId: AWA }));
    const bare = await served(makePrisma(), report({ reportedType: 'user', reportedEntityId: JEAN }));

    expect(named.reportedEntity).toMatchObject({ type: 'user', label: 'Awa Diop', owner: null, deleted: false });
    expect(bare.reportedEntity.label).toBe('@jean');
  });

  it('une CONVERSATION est nommée par son titre', async () => {
    const row = await served(makePrisma(), report({ reportedType: 'conversation', reportedEntityId: CONVERSATION }));
    expect(row.reportedEntity).toMatchObject({ label: 'Famille', excerpt: null, conversation: null });
  });

  it('une COMMUNAUTÉ est nommée, son créateur est propriétaire', async () => {
    const row = await served(makePrisma(), report({ reportedType: 'community', reportedEntityId: COMMUNITY }));
    expect(row.reportedEntity).toMatchObject({ label: 'Lycée Njanda', owner: awa, deleted: false });
  });

  it('une communauté désactivée se dit supprimée', async () => {
    const prisma = makePrisma();
    prisma.community.findMany.mockResolvedValue([
      { id: COMMUNITY, name: 'Lycée Njanda', deletedAt: new Date('2026-09-01'), creator: awa },
    ]);
    const row = await served(prisma, report({ reportedType: 'community', reportedEntityId: COMMUNITY }));
    expect(row.reportedEntity.deleted).toBe(true);
  });

  it.each([
    ['post', POST, awa, 'Un long texte public'],
    ['story', STORY, jean, 'Ma story'],
  ])('une publication (%s) : auteur propriétaire, extrait de son contenu', async (type, id, owner, excerpt) => {
    const row = await served(makePrisma(), report({ reportedType: type, reportedEntityId: id }));
    expect(row.reportedEntity).toMatchObject({ type, owner, excerpt, isProtected: false, deleted: false });
  });

  it.each(['PRIVATE', 'ONLY', 'EXCEPT'])('une publication à audience restreinte (%s) est protégée, sans extrait', async (visibility) => {
    const prisma = makePrisma({
      posts: [{ id: PRIVATE_POST, content: 'Brouillon secret', visibility, deletedAt: null, author: awa }],
    });
    const row = await served(prisma, report({ reportedType: 'post', reportedEntityId: PRIVATE_POST }));

    expect(row.reportedEntity).toMatchObject({ excerpt: null, isProtected: true });
    expect(JSON.stringify(row)).not.toContain('Brouillon secret');
  });

  it('un COMMENTAIRE : auteur et extrait ; un SON : titre et téléversant', async () => {
    const comment = await served(makePrisma(), report({ reportedType: 'comment', reportedEntityId: COMMENT }));
    const sound = await served(makePrisma(), report({ reportedType: 'sound', reportedEntityId: SOUND }));

    expect(comment.reportedEntity).toMatchObject({ owner: jean, excerpt: 'Commentaire' });
    expect(sound.reportedEntity).toMatchObject({ label: 'Ambiance été', owner: awa });
  });

  it('une entité introuvable est dite supprimée — pas une erreur, pas un extrait', async () => {
    const row = await served(makePrisma(), report({ reportedEntityId: GHOST }));
    expect(row.reportedEntity).toEqual({
      type: 'message',
      id: GHOST,
      label: null,
      owner: null,
      excerpt: null,
      isProtected: false,
      deleted: true,
      conversation: null,
    });
  });

  it('un genre inconnu est servi tel quel, sans requête ni supposition', async () => {
    const prisma = makePrisma();
    const row = await served(prisma, report({ reportedType: 'hologram', reportedEntityId: GHOST }));

    expect(row.reportedEntity).toMatchObject({ type: 'hologram', label: null, deleted: false, isProtected: false });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe('signalements — une requête par genre, jamais une par ligne', () => {
  it('trois messages signalés : une lecture de messages, une de comptes, une de conversations', async () => {
    const prisma = makePrisma({ messages: [messageRow(), messageRow({ id: ID(11) }), messageRow({ id: ID(12) })] });
    listReports.mockResolvedValue({
      reports: [
        report({ id: ID(51), reportedEntityId: MESSAGE }),
        report({ id: ID(52), reportedEntityId: ID(11), moderatorId: MOD }),
        report({ id: ID(53), reportedEntityId: ID(12) }),
      ],
      total: 3,
    });
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/' });

    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(prisma.community.findMany).not.toHaveBeenCalled();
    expect(prisma.sound.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('une page vide ne touche à rien', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/' });

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('signalements — les cinq lectures servent le même signalement nommé', () => {
  it('GET /:id', async () => {
    getReportById.mockResolvedValue(report({ moderatorId: MOD }));
    const app = await buildApp(makePrisma());
    const body = JSON.parse((await app.inject({ method: 'GET', url: `/${ID(50)}` })).body);

    expect(body.data.moderator.displayName).toBe('Modératrice');
    expect(body.data.reportedEntity.conversation).toEqual({ id: CONVERSATION, title: 'Famille' });
    await app.close();
  });

  it('GET /recent', async () => {
    getRecentReports.mockResolvedValue([report()]);
    const app = await buildApp(makePrisma());
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/recent' })).body);

    expect(body.data[0].reporter.username).toBe('awa');
    expect(body.data[0].reportedEntity.owner.username).toBe('jean');
    await app.close();
  });

  it('GET /moderator/mine', async () => {
    getModeratorReports.mockResolvedValue([report({ moderatorId: VIEWER })]);
    const app = await buildApp(makePrisma());
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/moderator/mine' })).body);

    expect(body.data[0].reportedEntity.label).toBeNull();
    expect(body.data[0].reportedEntity.excerpt).toBe('Tu es nul et tout le monde le sait');
    await app.close();
  });

  it('GET /entity/:type/:id — liste paginée V1', async () => {
    getReportsForEntity.mockResolvedValue({ reports: [report()], total: 1 });
    const app = await buildApp(makePrisma());
    const body = JSON.parse((await app.inject({ method: 'GET', url: `/entity/message/${MESSAGE}` })).body);

    expect(body.data[0].reportedEntity.type).toBe('message');
    expect(body.pagination).toBeDefined();
    await app.close();
  });

  it('GET /:id rend 404 pour un signalement inconnu', async () => {
    getReportById.mockResolvedValue(null);
    const app = await buildApp(makePrisma());
    expect((await app.inject({ method: 'GET', url: `/${ID(99)}` })).statusCode).toBe(404);
    await app.close();
  });
});

describe('signalements — le schéma de réponse est fermé', () => {
  it('une colonne non déclarée que le service remet ne part pas ; les quatorze colonnes servies restent', async () => {
    const row = await served(makePrisma(), report({ internalFlag: 'ne pas servir', reporterIp: '203.0.113.9' }));

    expect(JSON.stringify(row)).not.toMatch(/internalFlag|reporterIp|203\.0\.113/);
    expect(Object.keys(row).sort()).toEqual(
      [
        'actionTaken', 'createdAt', 'id', 'moderator', 'moderatorId', 'moderatorNotes', 'reason', 'reportType',
        'reportedEntity', 'reportedEntityId', 'reportedType', 'reporter', 'reporterId', 'reporterName',
        'resolvedAt', 'status', 'updatedAt',
      ].sort()
    );
  });
});

describe('signalements — les filtres neufs atteignent le service', () => {
  const lastFilters = () => (listReports.mock.calls.at(-1) as [Row, unknown])[0];

  it('reportedEntityId', async () => {
    const app = await buildApp(makePrisma());
    expect((await app.inject({ method: 'GET', url: `/?reportedEntityId=${MESSAGE}` })).statusCode).toBe(200);
    expect(lastFilters().reportedEntityId).toBe(MESSAGE);
    await app.close();
  });

  it('assigned=me filtre sur l’appelant lui-même', async () => {
    const app = await buildApp(makePrisma());
    await app.inject({ method: 'GET', url: '/?assigned=me' });
    expect(lastFilters()).toMatchObject({ moderatorId: VIEWER, unassigned: false });
    await app.close();
  });

  it('assigned=none demande les signalements sans modérateur', async () => {
    const app = await buildApp(makePrisma());
    await app.inject({ method: 'GET', url: '/?assigned=none' });
    expect(lastFilters()).toMatchObject({ unassigned: true });
    expect(lastFilters().moderatorId).toBeUndefined();
    await app.close();
  });

  it('sans filtre neuf, rien ne change', async () => {
    const app = await buildApp(makePrisma());
    await app.inject({ method: 'GET', url: '/' });
    expect(lastFilters()).toMatchObject({ unassigned: false });
    expect(lastFilters().reportedEntityId).toBeUndefined();
    await app.close();
  });

  it.each([
    ['un reportedEntityId qui n’est pas un ObjectId', '?reportedEntityId=abc'],
    ['un assigned inconnu', '?assigned=everyone'],
  ])('refuse 400 %s — sans interroger le service', async (_nom, query) => {
    const app = await buildApp(makePrisma());
    expect((await app.inject({ method: 'GET', url: `/${query}` })).statusCode).toBe(400);
    expect(listReports).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('signalements — la porte', () => {
  it.each(['AUDIT', 'ANALYST', 'USER'])('refuse un %s', async (role) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, role);
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(403);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'])('sert un %s avec l’extrait', async (role) => {
    const row = await served(makePrisma(), report(), role);
    expect(row.reportedEntity.excerpt).toBe('Tu es nul et tout le monde le sait');
  });
});
