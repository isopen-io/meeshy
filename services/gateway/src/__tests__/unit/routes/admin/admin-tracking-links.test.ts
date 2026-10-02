/**
 * `GET /admin/tracking-links`, `GET /admin/tracking-links/:linkId` et
 * `PATCH /admin/tracking-links/:linkId` — la supervision des liens de suivi
 * (#8876, § 6.3).
 *
 * Ce que ces témoins gardent :
 *  - la PORTE : lecture = `canAccessAdmin` ET `canViewAnalytics` (BIGBOSS, ADMIN, AUDIT) ;
 *    écriture = la même lecture PLUS le rang d'administration — AUDIT, rôle de
 *    lecture, ne ferme pas un lien ;
 *  - les NOMS : créateur, conversation et cible sont nommés, jamais un identifiant ;
 *  - ce qui part À CÔTÉ : les derniers clics ne portent ni IP, ni user-agent, ni
 *    empreinte d'appareil — le `select` ne les demande même pas ;
 *  - le geste : il écrit, il trace (`AdminAuditLog`), et il ne fait RIEN quand le
 *    lien est déjà dans l'état demandé.
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

const getTrackingLinkStats = jest.fn<any>();
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkStats: (...args: unknown[]) => getTrackingLinkStats(...args),
  })),
}));

import { registerTrackingLinkAdminRoutes } from '../../../../routes/admin/tracking-links';

const ACTOR_ID = '507f1f77bcf86cd799439011';
const AWA = '507f1f77bcf86cd799439021';
const LINK = '507f1f77bcf86cd799439041';
const POST = '507f1f77bcf86cd799439034';
const CONVERSATION = '507f1f77bcf86cd799439031';

type Row = Record<string, unknown>;

const linkRow = (over: Row = {}): Row => ({
  id: LINK,
  token: 'a1b2c3',
  name: 'Affiche',
  campaign: 'rentree',
  source: 'newsletter',
  medium: 'email',
  originalUrl: 'https://exemple.fr/promo',
  shortUrl: 'https://meeshy.me/l/a1b2c3',
  targetType: 'POST',
  targetId: POST,
  conversationId: CONVERSATION,
  createdBy: AWA,
  totalClicks: 42,
  uniqueClicks: 30,
  isActive: true,
  expiresAt: null,
  lastClickedAt: new Date('2026-09-29T08:00:00.000Z'),
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  ...over,
});

const inIds = (where: Row | undefined): string[] => ((where?.id as { in?: string[] } | undefined)?.in ?? []);

function makePrisma(rows: Row[] = [linkRow()], total: number = rows.length) {
  return {
    trackingLink: {
      findMany: jest.fn<any>().mockResolvedValue(rows),
      count: jest.fn<any>().mockResolvedValue(total),
      findUnique: jest.fn<any>().mockResolvedValue(rows[0] ?? null),
      update: jest.fn<any>().mockImplementation(async (args: any) => ({ id: LINK, isActive: args.data.isActive })),
    },
    trackingLinkClick: {
      findMany: jest.fn<any>().mockResolvedValue([
        {
          id: 'c1',
          country: 'SN',
          city: 'Dakar',
          device: 'mobile',
          browser: 'Safari',
          os: 'iOS',
          referrer: 'https://wa.me',
          socialSource: 'whatsapp',
          redirectStatus: 'confirmed',
          clickedAt: new Date('2026-09-29T08:00:00.000Z'),
        },
      ]),
      groupBy: jest.fn<any>().mockResolvedValue([
        { redirectStatus: 'confirmed', _count: { _all: 9 } },
        { redirectStatus: null, _count: { _all: 2 } },
      ]),
    },
    user: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        [{ id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: null }].filter((p) => inIds(args.where).includes(p.id))
      ),
    },
    post: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: POST, type: 'POST', author: { displayName: 'Awa Diop', username: 'awa' } },
      ]),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: CONVERSATION, title: 'Famille' }]),
    },
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
  } as any;
}

async function buildApp(prisma: any, role: string | null = 'AUDIT'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    if (role === null) return;
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR_ID,
      registeredUser: { id: ACTOR_ID, role, username: 'acteur' },
    };
  });
  registerTrackingLinkAdminRoutes(app);
  await app.ready();
  return app;
}

const list = (app: FastifyInstance, query = '') => app.inject({ method: 'GET', url: `/tracking-links${query}` });
const detail = (app: FastifyInstance, id = LINK) => app.inject({ method: 'GET', url: `/tracking-links/${id}` });
const patch = (app: FastifyInstance, payload: unknown, id = LINK) =>
  app.inject({ method: 'PATCH', url: `/tracking-links/${id}`, payload: payload as any });

const STATS = {
  trackingLink: linkRow(),
  totalClicks: 42,
  uniqueClicks: 30,
  confirmedClicks: 9,
  clicksByCountry: { SN: 5, FR: 7 },
  clicksByDevice: { mobile: 3 },
  clicksByBrowser: {},
  clicksByOS: { iOS: 2 },
  clicksByLanguage: { fr: 4 },
  clicksByHour: { '8': 1 },
  clicksBySocialSource: { whatsapp: 4 },
  clicksByDate: { '2026-09-02': 3, '2026-09-01': 1 },
  topReferrers: [
    { referrer: 'https://wa.me', count: 2 },
    { referrer: 'https://t.me', count: 5 },
  ],
};

describe('liens de suivi — qui a le droit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTrackingLinkStats.mockResolvedValue(STATS);
  });

  it.each(['BIGBOSS', 'ADMIN', 'AUDIT'])('un %s lit la liste et la fiche', async (role) => {
    const app = await buildApp(makePrisma(), role);
    expect((await list(app)).statusCode).toBe(200);
    expect((await detail(app)).statusCode).toBe(200);
    await app.close();
  });

  it.each(['MODERATOR', 'ANALYST', 'USER'])(
    'refuse un %s — il faut canAccessAdmin ET canViewAnalytics',
    async (role) => {
      const prisma = makePrisma();
      const app = await buildApp(prisma, role);
      expect((await list(app)).statusCode).toBe(403);
      expect((await detail(app)).statusCode).toBe(403);
      expect((await patch(app, { isActive: false })).statusCode).toBe(403);
      expect(prisma.trackingLink.findMany).not.toHaveBeenCalled();
      expect(prisma.trackingLink.update).not.toHaveBeenCalled();
      await app.close();
    }
  );

  it('refuse 401 sans contexte d’authentification, lecture comme écriture', async () => {
    const app = await buildApp(makePrisma(), null);
    expect((await list(app)).statusCode).toBe(401);
    expect((await detail(app)).statusCode).toBe(401);
    expect((await patch(app, { isActive: false })).statusCode).toBe(401);
    await app.close();
  });

  it('AUDIT lit mais ne ferme pas un lien — l’écriture exige le rang d’administration', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, 'AUDIT');
    expect((await patch(app, { isActive: false })).statusCode).toBe(403);
    expect(prisma.trackingLink.update).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['BIGBOSS', 'ADMIN'])('un %s ferme un lien', async (role) => {
    const app = await buildApp(makePrisma(), role);
    expect((await patch(app, { isActive: false })).statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /admin/tracking-links — la liste', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert une ligne nommée, dont la forme est figée', async () => {
    const app = await buildApp(makePrisma(), 'ADMIN');
    const body = JSON.parse((await list(app)).body);

    expect(body.pagination).toEqual({ total: 1, limit: 20, offset: 0, hasMore: false });
    const row = body.data[0];
    expect(row).toEqual({
      id: LINK,
      token: 'a1b2c3',
      name: 'Affiche',
      campaign: 'rentree',
      source: 'newsletter',
      medium: 'email',
      originalUrl: 'https://exemple.fr/promo',
      shortUrl: 'https://meeshy.me/l/a1b2c3',
      targetType: 'POST',
      target: { type: 'POST', id: POST, label: 'Awa Diop' },
      conversation: { id: CONVERSATION, title: 'Famille' },
      creator: { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: null },
      totalClicks: 42,
      uniqueClicks: 30,
      isActive: true,
      expiresAt: null,
      lastClickedAt: '2026-09-29T08:00:00.000Z',
      createdAt: '2026-09-01T08:00:00.000Z',
    });
    await app.close();
  });

  it('un lien externe n’a pas de cible ; un lien sans conversation ni créateur rend null', async () => {
    const prisma = makePrisma([
      linkRow({ targetType: 'EXTERNAL', targetId: null, conversationId: null, createdBy: null }),
    ]);
    const app = await buildApp(prisma);
    const row = JSON.parse((await list(app)).body).data[0];

    expect(row.target).toBeNull();
    expect(row.conversation).toBeNull();
    expect(row.creator).toBeNull();
    await app.close();
  });

  it('nomme une cible Conversation par son titre et une cible Profil par son nom', async () => {
    const prisma = makePrisma([
      linkRow({ id: 'l1', targetType: 'CONVERSATION', targetId: CONVERSATION }),
      linkRow({ id: 'l2', targetType: 'PROFILE', targetId: AWA }),
    ]);
    const app = await buildApp(prisma, 'ADMIN');
    const data = JSON.parse((await list(app)).body).data;

    expect(data[0].target).toEqual({ type: 'CONVERSATION', id: CONVERSATION, label: 'Famille' });
    expect(data[1].target).toEqual({ type: 'PROFILE', id: AWA, label: 'Awa Diop' });
    await app.close();
  });

  it('une cible disparue est servie avec label null, sans erreur', async () => {
    const prisma = makePrisma([linkRow()]);
    prisma.post.findMany.mockResolvedValue([]);
    const app = await buildApp(prisma);
    const row = JSON.parse((await list(app)).body).data[0];

    expect(row.target).toEqual({ type: 'POST', id: POST, label: null });
    await app.close();
  });

  it('résout les noms par lot — une requête par genre, jamais une par ligne', async () => {
    const prisma = makePrisma([linkRow(), linkRow({ id: 'l2' }), linkRow({ id: 'l3' })]);
    const app = await buildApp(prisma, 'ADMIN');
    await list(app);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.findMany).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('trie par date de création décroissante par défaut, et relaie la pagination', async () => {
    const prisma = makePrisma([linkRow()], 90);
    const app = await buildApp(prisma);
    const body = JSON.parse((await list(app, '?limit=40&offset=40')).body);

    expect(body.pagination).toEqual({ total: 90, limit: 40, offset: 40, hasMore: true });
    const args = prisma.trackingLink.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBe(40);
    expect(args.skip).toBe(40);
    await app.close();
  });

  it.each(['createdAt', 'totalClicks', 'uniqueClicks', 'lastClickedAt'])('accepte le tri par %s', async (sort) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await list(app, `?sort=${sort}&order=asc`);
    expect(prisma.trackingLink.findMany.mock.calls[0][0].orderBy[0]).toEqual({ [sort]: 'asc' });
    await app.close();
  });

  it('traduit chaque filtre en where, le même pour le compte', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await list(app, `?search=affi&isActive=true&targetType=POST&createdBy=${AWA}&source=newsletter&campaign=rentree`);

    const where = prisma.trackingLink.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: 'affi', mode: 'insensitive' } },
            { token: { contains: 'affi', mode: 'insensitive' } },
            { campaign: { contains: 'affi', mode: 'insensitive' } },
          ],
        },
        { isActive: true },
        { targetType: 'POST' },
        { createdBy: AWA },
        { source: { equals: 'newsletter', mode: 'insensitive' } },
        { campaign: { equals: 'rentree', mode: 'insensitive' } },
      ],
    });
    expect(prisma.trackingLink.count.mock.calls[0][0].where).toEqual(where);
    await app.close();
  });

  it('isActive=false filtre les liens désactivés', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await list(app, '?isActive=false');
    expect(prisma.trackingLink.findMany.mock.calls[0][0].where).toEqual({ AND: [{ isActive: false }] });
    await app.close();
  });

  it.each([
    ['un genre de cible inconnu', '?targetType=BOGUS'],
    ['un créateur qui n’est pas un ObjectId', '?createdBy=abc'],
    ['un tri hors liste', '?sort=ipAddress'],
    ['un ordre inconnu', '?order=sideways'],
    ['isActive illisible', '?isActive=peut-etre'],
  ])('refuse 400 %s — sans toucher la base', async (_nom, query) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    expect((await list(app, query)).statusCode).toBe(400);
    expect(prisma.trackingLink.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /admin/tracking-links/:linkId — la fiche', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTrackingLinkStats.mockResolvedValue(STATS);
  });

  it('rend 404 quand le lien n’existe pas, et 400 quand l’identifiant est malformé', async () => {
    const prisma = makePrisma([]);
    const app = await buildApp(prisma);
    expect((await detail(app)).statusCode).toBe(404);
    expect((await detail(app, 'pas-un-objectid')).statusCode).toBe(400);
    await app.close();
  });

  it('sert la ligne, les agrégats lus par le service existant, et les derniers clics', async () => {
    const app = await buildApp(makePrisma());
    const body = JSON.parse((await detail(app)).body);

    expect(getTrackingLinkStats).toHaveBeenCalledWith('a1b2c3');
    expect(body.data).toMatchObject({ id: LINK, name: 'Affiche', target: { label: 'Awa Diop' }, totalClicks: 42 });
    expect(body.data.stats).toEqual({
      confirmedClicks: 9,
      clicksByDate: [
        { date: '2026-09-01', count: 1 },
        { date: '2026-09-02', count: 3 },
      ],
      byCountry: [
        { key: 'FR', count: 7 },
        { key: 'SN', count: 5 },
      ],
      byDevice: [{ key: 'mobile', count: 3 }],
      byBrowser: [],
      byOs: [{ key: 'iOS', count: 2 }],
      bySocialSource: [{ key: 'whatsapp', count: 4 }],
      topReferrers: [
        { referrer: 'https://t.me', count: 5 },
        { referrer: 'https://wa.me', count: 2 },
      ],
      byRedirectStatus: [
        { key: 'confirmed', count: 9 },
        { key: 'pending', count: 2 },
      ],
    });
    expect(body.data.recentClicks).toEqual([
      {
        id: 'c1',
        country: 'SN',
        city: 'Dakar',
        device: 'mobile',
        browser: 'Safari',
        os: 'iOS',
        referrer: 'https://wa.me',
        socialSource: 'whatsapp',
        redirectStatus: 'confirmed',
        clickedAt: '2026-09-29T08:00:00.000Z',
      },
    ]);
    await app.close();
  });

  it('les derniers clics sont au plus vingt, du plus récent au plus ancien', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await detail(app);

    const args = prisma.trackingLinkClick.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual({ clickedAt: 'desc' });
    expect(args.where).toEqual({ trackingLinkId: LINK });
    await app.close();
  });

  it('ne lit et ne sert JAMAIS l’IP, le user-agent ni l’empreinte d’appareil d’un clic', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await detail(app);

    const select = prisma.trackingLinkClick.findMany.mock.calls[0][0].select;
    for (const secret of ['ipAddress', 'userAgent', 'deviceFingerprint', 'participantId', 'language', 'languages']) {
      expect(select[secret]).toBeUndefined();
    }
    expect(res.body).not.toMatch(/ipAddress|userAgent|deviceFingerprint/);
    await app.close();
  });
});

describe('PATCH /admin/tracking-links/:linkId — le geste', () => {
  beforeEach(() => jest.clearAllMocks());

  it('désactive un lien actif, rend son nouvel état et le trace avec le motif', async () => {
    const prisma = makePrisma([linkRow({ isActive: true })]);
    const app = await buildApp(prisma, 'ADMIN');
    const res = await patch(app, { isActive: false, reason: 'Campagne terminée' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual({ id: LINK, isActive: false });
    expect(prisma.trackingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINK }, data: { isActive: false } })
    );
    const audit = prisma.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: 'ADMIN_TRACKING_LINK_DEACTIVATED',
      entity: 'TrackingLink',
      entityId: LINK,
      adminId: ACTOR_ID,
      userId: AWA,
    });
    expect(JSON.parse(audit.metadata)).toEqual({ reason: 'Campagne terminée' });
    await app.close();
  });

  it('réactive un lien désactivé et le trace comme une réactivation', async () => {
    const prisma = makePrisma([linkRow({ isActive: false })]);
    const app = await buildApp(prisma, 'BIGBOSS');
    const res = await patch(app, { isActive: true });

    expect(JSON.parse(res.body).data).toEqual({ id: LINK, isActive: true });
    expect(prisma.adminAuditLog.create.mock.calls[0][0].data.action).toBe('ADMIN_TRACKING_LINK_REACTIVATED');
    await app.close();
  });

  it('ne fait rien — ni écriture ni trace — quand le lien est déjà dans l’état demandé', async () => {
    const prisma = makePrisma([linkRow({ isActive: true })]);
    const app = await buildApp(prisma, 'ADMIN');
    const res = await patch(app, { isActive: true });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual({ id: LINK, isActive: true });
    expect(prisma.trackingLink.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('un lien créé par personne est tracé au nom de l’administrateur', async () => {
    const prisma = makePrisma([linkRow({ createdBy: null })]);
    const app = await buildApp(prisma, 'ADMIN');
    await patch(app, { isActive: false });
    expect(prisma.adminAuditLog.create.mock.calls[0][0].data.userId).toBe(ACTOR_ID);
    await app.close();
  });

  it('ignore un champ inconnu : seul isActive est jamais écrit', async () => {
    const prisma = makePrisma([linkRow({ isActive: true })]);
    const app = await buildApp(prisma, 'ADMIN');
    const res = await patch(app, { isActive: false, totalClicks: 0 });

    expect(res.statusCode).toBe(200);
    expect(prisma.trackingLink.update.mock.calls[0][0].data).toEqual({ isActive: false });
    await app.close();
  });

  it('rend 404 pour un lien inconnu', async () => {
    const app = await buildApp(makePrisma([]), 'ADMIN');
    expect((await patch(app, { isActive: false })).statusCode).toBe(404);
    await app.close();
  });

  it.each([
    ['un corps sans isActive', {}],
    ['isActive qui n’est pas un booléen', { isActive: 'non' }],
    ['un motif de deux caractères', { isActive: false, reason: 'ok' }],
    ['un motif de 501 caractères', { isActive: false, reason: 'x'.repeat(501) }],
  ])('refuse 400 %s — sans écrire', async (_nom, payload) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, 'ADMIN');
    expect((await patch(app, payload)).statusCode).toBe(400);
    expect(prisma.trackingLink.update).not.toHaveBeenCalled();
    await app.close();
  });
});
