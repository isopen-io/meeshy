/**
 * La supervision des communautés (#8876, § 6.5) : la liste étendue, la fiche, ses
 * membres, et le geste d'activation.
 *
 * Ce que ces témoins gardent :
 *  - la PORTE : `canAccessAdmin` + `canManageCommunities` (BIGBOSS, ADMIN,
 *    MODERATOR) — AUDIT lit l'administration mais ne gère pas les communautés ;
 *  - les NOMS : créateur, équipe, membres sont des personnes nommées ;
 *  - le GESTE : désactiver pose `deletedAt`, réactiver le remet à `null`, tout
 *    est tracé avec le motif (≥ 10 caractères) et les changements, et un geste
 *    qui ne change rien ne produit ni écriture ni trace ;
 *  - la LISTE étendue : les champs neufs, le filtre d'activation, les deux tris.
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

import { registerCommunityOversightRoutes } from '../../../../routes/admin/communities-oversight';
import { registerContentRoutes } from '../../../../routes/admin/content';

const ACTOR = '507f1f77bcf86cd799439011';
const AWA = '507f1f77bcf86cd799439021';
const JEAN = '507f1f77bcf86cd799439022';
const COMMUNITY = '507f1f77bcf86cd799439051';
const CONVERSATION = '507f1f77bcf86cd799439031';

type Row = Record<string, unknown>;

const awa = { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/awa.png' };
const jean = { id: JEAN, username: 'jean', displayName: null, avatar: null };

const communityRow = (over: Row = {}): Row => ({
  id: COMMUNITY,
  identifier: 'mshy_lycee-njanda',
  name: 'Lycée Njanda',
  description: 'Anciens élèves',
  avatar: 'https://cdn/c.png',
  banner: null,
  isPrivate: false,
  isActive: true,
  deletedAt: null,
  createdBy: AWA,
  createdAt: new Date('2026-01-10T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:00:00.000Z'),
  creator: awa,
  ...over,
});

function makePrisma(row: Row | null = communityRow()) {
  return {
    community: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    communityMember: {
      count: jest.fn<any>(async (args: { where: Row }) => (args.where.isActive === true ? 42 : 7)),
      findMany: jest.fn<any>(),
    },
    conversation: {
      count: jest.fn<any>().mockResolvedValue(3),
      findMany: jest.fn<any>().mockResolvedValue([
        {
          id: CONVERSATION,
          title: 'Promo 2004',
          identifier: 'mshy_promo',
          type: 'group',
          isActive: true,
          lastMessageAt: new Date('2026-09-29T08:00:00.000Z'),
          _count: { participants: 18 },
        },
      ]),
    },
    post: { count: jest.fn<any>().mockResolvedValue(12) },
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
  } as any;
}

const staffRows = [
  { id: 'cm2', role: 'moderator', joinedAt: new Date('2026-02-01T00:00:00.000Z'), user: jean },
  { id: 'cm1', role: 'admin', joinedAt: new Date('2026-01-10T08:00:00.000Z'), user: awa },
];

async function buildApp(prisma: any, role: string | null = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    if (role === null) return;
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR,
      registeredUser: { id: ACTOR, role, username: 'acteur' },
    };
  });
  registerCommunityOversightRoutes(app);
  await app.register(registerContentRoutes);
  await app.ready();
  return app;
}

const detail = (app: FastifyInstance, id = COMMUNITY) => app.inject({ method: 'GET', url: `/communities/${id}` });
const members = (app: FastifyInstance, query = '', id = COMMUNITY) =>
  app.inject({ method: 'GET', url: `/communities/${id}/members${query}` });
const patch = (app: FastifyInstance, payload: unknown, id = COMMUNITY) =>
  app.inject({ method: 'PATCH', url: `/communities/${id}`, payload: payload as any });

function withStaff(prisma: any) {
  prisma.communityMember.findMany.mockResolvedValue(staffRows);
  return prisma;
}

describe('communautés — qui a le droit', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['BIGBOSS', 'ADMIN', 'MODERATOR'])('un %s lit la fiche, les membres et la liste, et agit', async (role) => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma, role);
    expect((await detail(app)).statusCode).toBe(200);
    expect((await members(app)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/communities' })).statusCode).toBe(200);
    expect((await patch(app, { isPrivate: true, reason: 'Décision de modération' })).statusCode).toBe(200);
    await app.close();
  });

  it.each(['AUDIT', 'ANALYST', 'USER'])('refuse un %s partout — AUDIT a canAccessAdmin mais pas canManageCommunities', async (role) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, role);
    expect((await detail(app)).statusCode).toBe(403);
    expect((await members(app)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/communities' })).statusCode).toBe(403);
    expect((await patch(app, { isActive: false, reason: 'Décision de modération' })).statusCode).toBe(403);
    expect(prisma.community.findUnique).not.toHaveBeenCalled();
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse 401 sans contexte d’authentification', async () => {
    const app = await buildApp(makePrisma(), null);
    expect((await detail(app)).statusCode).toBe(401);
    expect((await members(app)).statusCode).toBe(401);
    expect((await patch(app, { isActive: false, reason: 'Décision de modération' })).statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /admin/communities/:communityId — la fiche', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert l’identité, les chiffres, le créateur, l’équipe et les conversations', async () => {
    const app = await buildApp(withStaff(makePrisma()));
    const body = JSON.parse((await detail(app)).body);

    expect(body.data).toEqual({
      id: COMMUNITY,
      identifier: 'mshy_lycee-njanda',
      name: 'Lycée Njanda',
      description: 'Anciens élèves',
      avatar: 'https://cdn/c.png',
      banner: null,
      isPrivate: false,
      isActive: true,
      deletedAt: null,
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
      creator: awa,
      activeMemberCount: 42,
      leftMemberCount: 7,
      conversationCount: 3,
      postCount: 12,
      conversations: [
        {
          id: CONVERSATION,
          title: 'Promo 2004',
          identifier: 'mshy_promo',
          type: 'group',
          isActive: true,
          lastMessageAt: '2026-09-29T08:00:00.000Z',
          memberCount: 18,
        },
      ],
      staff: [
        { user: awa, role: 'admin', joinedAt: '2026-01-10T08:00:00.000Z' },
        { user: jean, role: 'moderator', joinedAt: '2026-02-01T00:00:00.000Z' },
      ],
    });
    await app.close();
  });

  it('range l’équipe par responsabilité — administrateurs d’abord — et la borne à vingt', async () => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma);
    await detail(app);

    const args = prisma.communityMember.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.where).toMatchObject({ communityId: COMMUNITY, isActive: true });
    expect(args.where.role.in.sort()).toEqual(['admin', 'moderator']);
    await app.close();
  });

  it('borne les conversations à vingt et compte les membres actifs seulement', async () => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma);
    await detail(app);

    const convArgs = prisma.conversation.findMany.mock.calls[0][0];
    expect(convArgs.take).toBe(20);
    expect(convArgs.where).toEqual({ communityId: COMMUNITY });
    expect(convArgs.select._count).toEqual({ select: { participants: { where: { isActive: true } } } });
    expect(prisma.post.count.mock.calls[0][0].where).toEqual({ communityId: COMMUNITY, deletedAt: null });
    await app.close();
  });

  it('une communauté désactivée dit quand elle l’a été', async () => {
    const prisma = withStaff(makePrisma(communityRow({ isActive: false, deletedAt: new Date('2026-09-20T00:00:00.000Z') })));
    const app = await buildApp(prisma);
    const { data } = JSON.parse((await detail(app)).body);

    expect(data).toMatchObject({ isActive: false, deletedAt: '2026-09-20T00:00:00.000Z' });
    await app.close();
  });

  it('rend 404 pour une communauté inconnue et 400 pour un identifiant malformé', async () => {
    const app = await buildApp(makePrisma(null));
    expect((await detail(app)).statusCode).toBe(404);
    expect((await detail(app, 'pas-un-objectid')).statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /admin/communities/:communityId/members — les membres', () => {
  beforeEach(() => jest.clearAllMocks());

  const memberRow = (over: Row = {}): Row => ({
    id: 'cm1',
    role: 'member',
    joinedAt: new Date('2026-03-01T00:00:00.000Z'),
    isActive: true,
    leftAt: null,
    user: awa,
    ...over,
  });

  it('sert chaque membre nommé, avec son rôle, son arrivée et son éventuel départ', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValue([
      memberRow(),
      memberRow({ id: 'cm2', user: jean, isActive: false, leftAt: new Date('2026-06-01T00:00:00.000Z') }),
    ]);
    prisma.communityMember.count.mockResolvedValue(2);
    const app = await buildApp(prisma);
    const body = JSON.parse((await members(app)).body);

    expect(body.pagination).toEqual({ total: 2, limit: 20, offset: 0, hasMore: false });
    expect(body.data).toEqual([
      { id: 'cm1', role: 'member', joinedAt: '2026-03-01T00:00:00.000Z', isActive: true, leftAt: null, user: awa },
      { id: 'cm2', role: 'member', joinedAt: '2026-03-01T00:00:00.000Z', isActive: false, leftAt: '2026-06-01T00:00:00.000Z', user: jean },
    ]);
    await app.close();
  });

  it('traduit recherche, rôle et activité en where, le même pour le compte', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValue([]);
    prisma.communityMember.count.mockResolvedValue(0);
    const app = await buildApp(prisma);
    await members(app, '?search=awa&role=moderator&isActive=false&limit=10&offset=5');

    const args = prisma.communityMember.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      communityId: COMMUNITY,
      role: 'moderator',
      isActive: false,
      user: {
        OR: [
          { username: { contains: 'awa', mode: 'insensitive' } },
          { displayName: { contains: 'awa', mode: 'insensitive' } },
        ],
      },
    });
    expect(args.take).toBe(10);
    expect(args.skip).toBe(5);
    expect(prisma.communityMember.count.mock.calls[0][0].where).toEqual(args.where);
    await app.close();
  });

  it('sans filtre, ne pose que la communauté', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValue([]);
    prisma.communityMember.count.mockResolvedValue(0);
    const app = await buildApp(prisma);
    await members(app);
    expect(prisma.communityMember.findMany.mock.calls[0][0].where).toEqual({ communityId: COMMUNITY });
    await app.close();
  });

  it('ne sert que l’identité publique d’un membre — jamais sa présence ni ses coordonnées', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValue([memberRow()]);
    prisma.communityMember.count.mockResolvedValue(1);
    const app = await buildApp(prisma);
    await members(app);

    const select = prisma.communityMember.findMany.mock.calls[0][0].select.user.select;
    expect(Object.keys(select).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);
    await app.close();
  });

  it.each([
    ['un rôle inconnu', '?role=owner'],
    ['isActive illisible', '?isActive=peut-etre'],
  ])('refuse 400 %s — sans interroger les membres', async (_nom, query) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    expect((await members(app, query)).statusCode).toBe(400);
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 404 pour une communauté inconnue', async () => {
    const app = await buildApp(makePrisma(null));
    expect((await members(app)).statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /admin/communities/:communityId — le geste', () => {
  beforeEach(() => jest.clearAllMocks());

  const REASON = 'Contenu contraire aux règles';

  it('désactive : pose isActive=false ET deletedAt, trace le motif et le changement, rend la fiche', async () => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma, 'MODERATOR');
    const res = await patch(app, { isActive: false, reason: REASON });

    expect(res.statusCode).toBe(200);
    const update = prisma.community.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: COMMUNITY });
    expect(update.data).toEqual({ isActive: false, deletedAt: expect.any(Date) });

    const audit = prisma.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: 'ADMIN_COMMUNITY_UPDATED',
      entity: 'Community',
      entityId: COMMUNITY,
      adminId: ACTOR,
      userId: AWA,
    });
    expect(JSON.parse(audit.metadata)).toEqual({ reason: REASON });
    expect(JSON.parse(audit.changes)).toEqual({ isActive: { before: true, after: false } });
    expect(JSON.parse(res.body).data.id).toBe(COMMUNITY);
    await app.close();
  });

  it('réactive : remet deletedAt à null', async () => {
    const prisma = withStaff(makePrisma(communityRow({ isActive: false, deletedAt: new Date('2026-09-20') })));
    const app = await buildApp(prisma);
    await patch(app, { isActive: true, reason: REASON });

    expect(prisma.community.update.mock.calls[0][0].data).toEqual({ isActive: true, deletedAt: null });
    expect(JSON.parse(prisma.adminAuditLog.create.mock.calls[0][0].data.changes)).toEqual({
      isActive: { before: false, after: true },
    });
    await app.close();
  });

  it('rend privée / publique sans toucher à l’activation', async () => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma);
    await patch(app, { isPrivate: true, reason: REASON });

    expect(prisma.community.update.mock.calls[0][0].data).toEqual({ isPrivate: true });
    expect(JSON.parse(prisma.adminAuditLog.create.mock.calls[0][0].data.changes)).toEqual({
      isPrivate: { before: false, after: true },
    });
    await app.close();
  });

  it('applique les deux changements d’un coup et les trace tous les deux', async () => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma);
    await patch(app, { isActive: false, isPrivate: true, reason: REASON });

    expect(prisma.community.update.mock.calls[0][0].data).toEqual({
      isActive: false,
      deletedAt: expect.any(Date),
      isPrivate: true,
    });
    expect(Object.keys(JSON.parse(prisma.adminAuditLog.create.mock.calls[0][0].data.changes)).sort()).toEqual([
      'isActive',
      'isPrivate',
    ]);
    await app.close();
  });

  it('ne fait rien — ni écriture ni trace — quand la communauté est déjà dans l’état demandé', async () => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma);
    const res = await patch(app, { isActive: true, isPrivate: false, reason: REASON });

    expect(res.statusCode).toBe(200);
    expect(prisma.community.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['un corps sans aucun changement', { reason: REASON }],
    ['un motif manquant', { isActive: false }],
    ['un motif de neuf caractères', { isActive: false, reason: 'trop bref' }],
    ['isActive qui n’est pas un booléen', { isActive: 'non', reason: REASON }],
  ])('refuse 400 %s — sans écrire', async (_nom, payload) => {
    const prisma = withStaff(makePrisma());
    const app = await buildApp(prisma);
    expect((await patch(app, payload)).statusCode).toBe(400);
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 404 pour une communauté inconnue', async () => {
    const app = await buildApp(makePrisma(null));
    expect((await patch(app, { isActive: false, reason: REASON })).statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /admin/communities — la liste étendue', () => {
  beforeEach(() => jest.clearAllMocks());

  const listRow = (): Row => ({
    id: COMMUNITY,
    identifier: 'mshy_lycee-njanda',
    name: 'Lycée Njanda',
    description: null,
    avatar: null,
    banner: 'https://cdn/b.png',
    isPrivate: true,
    isActive: false,
    deletedAt: new Date('2026-09-20T00:00:00.000Z'),
    createdAt: new Date('2026-01-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    creator: awa,
    _count: { members: 42, Conversation: 3 },
  });

  it('sert les champs neufs et les deux compteurs nommés', async () => {
    const prisma = makePrisma();
    prisma.community.findMany.mockResolvedValue([listRow()]);
    prisma.community.count.mockResolvedValue(1);
    const app = await buildApp(prisma);
    const row = JSON.parse((await app.inject({ method: 'GET', url: '/communities' })).body).data[0];

    expect(row).toMatchObject({
      banner: 'https://cdn/b.png',
      isActive: false,
      deletedAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
      activeMemberCount: 42,
      conversationCount: 3,
    });
    await app.close();
  });

  it('compte les membres ACTIFS dans la requête — pas les départs', async () => {
    const prisma = makePrisma();
    await (await buildApp(prisma)).inject({ method: 'GET', url: '/communities' });
    const select = prisma.community.findMany.mock.calls[0][0].select;
    expect(select._count.select.members).toEqual({ where: { isActive: true } });
  });

  it('filtre par activation', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/communities?isActive=false' });
    expect(prisma.community.findMany.mock.calls[0][0].where.isActive).toBe(false);
    await app.close();
  });

  it.each([
    ['?sort=name&order=asc', [{ name: 'asc' }, { id: 'asc' }]],
    ['?sort=createdAt', [{ createdAt: 'desc' }, { id: 'desc' }]],
    ['', [{ createdAt: 'desc' }, { id: 'desc' }]],
  ])('trie selon %s', async (query, attendu) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/communities${query}` });
    expect(prisma.community.findMany.mock.calls[0][0].orderBy).toEqual(attendu);
    await app.close();
  });

  it.each([
    ['un tri hors liste', '?sort=memberCount'],
    ['isActive illisible', '?isActive=peut-etre'],
  ])('refuse 400 %s', async (_nom, query) => {
    const app = await buildApp(makePrisma());
    expect((await app.inject({ method: 'GET', url: `/communities${query}` })).statusCode).toBe(400);
    await app.close();
  });
});
