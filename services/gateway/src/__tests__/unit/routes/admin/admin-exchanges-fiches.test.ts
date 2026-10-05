/**
 * Les fiches des échanges (#8876, § 6.6, § 6.7) : la conversation et le lien de
 * partage, vus par l'administration.
 *
 * Ce que ces témoins gardent :
 *  - la PORTE de la conversation : `canManageConversations` ET le rang
 *    d'administration — celle de la liste, à l'identique (MODERATOR porte la
 *    permission, pas le rang) ;
 *  - la PORTE du lien : `canAccessAdmin` ET `canManageConversations` ;
 *  - les NOMS : communauté, personne qui a fermé, invités récents ;
 *  - ce qui part À CÔTÉ : jamais `linkId`, `identifier` ni `allowedIpRanges` d'un
 *    lien — la colonne n'est même pas lue ;
 *  - la liste des conversations gagne sa communauté nommée, sa date de
 *    fermeture et un filtre par communauté.
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

import { registerConversationsSovereignRoute } from '../../../../routes/admin/conversations-sovereign';
import { registerContentShareLinkRoutes } from '../../../../routes/admin/content-share-links';

const ACTOR = '507f1f77bcf86cd799439011';
const AWA = '507f1f77bcf86cd799439021';
const COMMUNITY = '507f1f77bcf86cd799439051';
const CONVERSATION = '507f1f77bcf86cd799439031';
const LINK = '507f1f77bcf86cd799439033';

type Row = Record<string, unknown>;

const awa = { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/awa.png' };

const participant = (n: number): Row => ({
  id: `p${n}`,
  userId: `u${n}`,
  type: 'user',
  displayName: `Membre ${n}`,
  avatar: null,
  role: 'member',
  joinedAt: new Date('2026-05-01T00:00:00.000Z'),
  isActive: true,
});

const conversationRow = (over: Row = {}): Row => ({
  id: CONVERSATION,
  identifier: 'mshy_famille',
  title: 'Famille',
  description: 'Les nouvelles',
  type: 'group',
  avatar: null,
  banner: null,
  isActive: true,
  closedAt: null,
  closedBy: null,
  communityId: COMMUNITY,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  lastMessageAt: new Date('2026-09-29T00:00:00.000Z'),
  defaultWriteRole: 'everyone',
  isAnnouncementChannel: false,
  slowModeSeconds: 0,
  autoTranslateEnabled: true,
  encryptionMode: null,
  _count: { participants: 9, shareLinks: 2 },
  conversationMessageStats: { totalMessages: 1234 },
  community: { id: COMMUNITY, name: 'Lycée Njanda', identifier: 'mshy_lycee-njanda' },
  participants: [1, 2, 3, 4, 5, 6].map(participant),
  ...over,
});

const inIds = (where: Row | undefined): string[] => ((where?.id as { in?: string[] } | undefined)?.in ?? []);

function makeConversationPrisma(row: Row | null = conversationRow(), agent: Row | null = { enabled: true }) {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn<any>(async (args: { where?: Row }) => [awa].filter((p) => inIds(args.where).includes(p.id))),
    },
    agentConfig: { findUnique: jest.fn<any>().mockResolvedValue(agent) },
  } as any;
}

async function buildConversationApp(prisma: any, role: string | null = 'ADMIN'): Promise<FastifyInstance> {
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
  await app.register(async (instance) => registerConversationsSovereignRoute(instance), { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const conversation = (app: FastifyInstance, id = CONVERSATION) =>
  app.inject({ method: 'GET', url: `/api/v1/admin/conversations/${id}` });

describe('GET /admin/conversations/:conversationId — qui a le droit', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['BIGBOSS', 'ADMIN'])('sert un %s', async (role) => {
    const app = await buildConversationApp(makeConversationPrisma(), role);
    expect((await conversation(app)).statusCode).toBe(200);
    await app.close();
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST', 'USER'])(
    'refuse un %s — MODERATOR porte canManageConversations mais pas le rang d’administration',
    async (role) => {
      const prisma = makeConversationPrisma();
      const app = await buildConversationApp(prisma, role);
      expect((await conversation(app)).statusCode).toBe(403);
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
      await app.close();
    }
  );

  it('refuse 401 sans contexte d’authentification', async () => {
    const app = await buildConversationApp(makeConversationPrisma(), null);
    expect((await conversation(app)).statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /admin/conversations/:conversationId — la fiche', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert les métadonnées, la communauté nommée, les six premiers membres, les liens et l’agent', async () => {
    const app = await buildConversationApp(makeConversationPrisma());
    const { data } = JSON.parse((await conversation(app)).body);

    expect(data).toMatchObject({
      id: CONVERSATION,
      identifier: 'mshy_famille',
      title: 'Famille',
      type: 'group',
      isActive: true,
      closedAt: null,
      memberCount: 9,
      messageCount: 1234,
      settings: { defaultWriteRole: 'everyone', isAnnouncementChannel: false, slowModeSeconds: 0, autoTranslateEnabled: true, encryptionMode: null },
      community: { id: COMMUNITY, name: 'Lycée Njanda', identifier: 'mshy_lycee-njanda' },
      closedBy: null,
      shareLinkCount: 2,
      agentEnabled: true,
    });
    expect(data.participantsPreview).toHaveLength(6);
    expect(data.participantsPreview[0]).toEqual({
      id: 'p1',
      userId: 'u1',
      type: 'user',
      displayName: 'Membre 1',
      avatar: null,
      role: 'member',
      joinedAt: '2026-05-01T00:00:00.000Z',
      isActive: true,
    });
    await app.close();
  });

  it('nomme la personne qui a fermé la conversation', async () => {
    const prisma = makeConversationPrisma(
      conversationRow({ closedAt: new Date('2026-09-10T00:00:00.000Z'), closedBy: AWA })
    );
    const app = await buildConversationApp(prisma);
    const { data } = JSON.parse((await conversation(app)).body);

    expect(data.closedAt).toBe('2026-09-10T00:00:00.000Z');
    expect(data.closedBy).toEqual(awa);
    await app.close();
  });

  it('une conversation sans communauté, sans configuration d’agent : community null, agentEnabled false', async () => {
    const prisma = makeConversationPrisma(conversationRow({ communityId: null, community: null }), null);
    const app = await buildConversationApp(prisma);
    const { data } = JSON.parse((await conversation(app)).body);

    expect(data.community).toBeNull();
    expect(data.agentEnabled).toBe(false);
    await app.close();
  });

  it('borne l’aperçu des membres à six et ne lit que les membres actifs', async () => {
    const prisma = makeConversationPrisma();
    const app = await buildConversationApp(prisma);
    await conversation(app);

    const select = prisma.conversation.findUnique.mock.calls[0][0].select;
    expect(select.participants.take).toBe(6);
    expect(select.participants.where).toEqual({ isActive: true });
    await app.close();
  });

  it('ne sert ni contenu de message ni présence — la forme des membres est figée', async () => {
    const app = await buildConversationApp(makeConversationPrisma());
    const { data } = JSON.parse((await conversation(app)).body);

    expect(Object.keys(data.participantsPreview[0]).sort()).toEqual(
      ['avatar', 'displayName', 'id', 'isActive', 'joinedAt', 'role', 'type', 'userId']
    );
    expect(JSON.stringify(data)).not.toMatch(/isOnline|lastActiveAt|content/);
    await app.close();
  });

  it('rend 404 pour une conversation inconnue et 400 pour un identifiant malformé', async () => {
    const app = await buildConversationApp(makeConversationPrisma(null));
    expect((await conversation(app)).statusCode).toBe(404);
    expect((await conversation(app, 'pas-un-objectid')).statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /admin/conversations — la liste gagne la communauté et la fermeture', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert community {id, name} et closedAt', async () => {
    const prisma = makeConversationPrisma();
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: CONVERSATION,
        identifier: 'mshy_famille',
        title: 'Famille',
        type: 'group',
        avatar: null,
        isActive: true,
        closedAt: new Date('2026-09-10T00:00:00.000Z'),
        communityId: COMMUNITY,
        community: { id: COMMUNITY, name: 'Lycée Njanda' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastMessageAt: new Date('2026-09-29T00:00:00.000Z'),
        _count: { participants: 9 },
        participants: [],
      },
    ]);
    prisma.conversation.count.mockResolvedValue(1);
    const app = await buildConversationApp(prisma);
    const row = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/admin/conversations' })).body).data[0];

    expect(row.community).toEqual({ id: COMMUNITY, name: 'Lycée Njanda' });
    expect(row.closedAt).toBe('2026-09-10T00:00:00.000Z');
    await app.close();
  });

  it('une conversation hors communauté rend community null', async () => {
    const prisma = makeConversationPrisma();
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: CONVERSATION,
        identifier: 'mshy_x',
        title: null,
        type: 'direct',
        avatar: null,
        isActive: true,
        closedAt: null,
        communityId: null,
        community: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastMessageAt: new Date('2026-09-29T00:00:00.000Z'),
        _count: { participants: 2 },
        participants: [],
      },
    ]);
    prisma.conversation.count.mockResolvedValue(1);
    const app = await buildConversationApp(prisma);
    const row = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/admin/conversations' })).body).data[0];
    expect(row.community).toBeNull();
    await app.close();
  });

  it('filtre par communauté — le même where pour la page et le compte', async () => {
    const prisma = makeConversationPrisma();
    const app = await buildConversationApp(prisma);
    await app.inject({ method: 'GET', url: `/api/v1/admin/conversations?communityId=${COMMUNITY}` });

    const where = prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ AND: [{ communityId: COMMUNITY }] });
    expect(prisma.conversation.count.mock.calls[0][0].where).toEqual(where);
    await app.close();
  });

  it('refuse 400 un communityId qui n’est pas un ObjectId — sans interroger la base', async () => {
    const prisma = makeConversationPrisma();
    const app = await buildConversationApp(prisma);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/conversations?communityId=abc' })).statusCode).toBe(400);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

// ── Le lien de partage ───────────────────────────────────────────────────────

const linkRow = (over: Row = {}): Row => ({
  id: LINK,
  linkId: 'mshy_SECRETLINKID',
  identifier: 'mshy_SECRETIDENT',
  allowedIpRanges: ['203.0.113.0/24'],
  name: 'Invitation été',
  description: 'Pour les cousins',
  maxUses: 50,
  currentUses: 12,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 1,
  maxUniqueSessions: 30,
  currentUniqueSessions: 9,
  visitCount: 140,
  expiresAt: new Date('2026-12-31T00:00:00.000Z'),
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  allowViewHistory: false,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: true,
  allowedCountries: ['SN', 'FR'],
  allowedLanguages: ['fr'],
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  creator: awa,
  conversation: { id: CONVERSATION, identifier: 'mshy_famille', title: 'Famille', type: 'group' },
  ...over,
});

/** Le double honore le `select` : une colonne non demandée n'est pas rendue. */
function project(row: Row, select: unknown): Row {
  if (!select || typeof select !== 'object') return { ...row };
  return Object.fromEntries(
    Object.entries(select as Row)
      .filter(([key, value]) => value && key in row)
      .map(([key, value]) => {
        const nested = (value as { select?: unknown }).select;
        const target = row[key];
        return [key, nested && target && typeof target === 'object' && !Array.isArray(target) ? project(target as Row, nested) : target];
      })
  );
}

function makeLinkPrisma(row: Row | null = linkRow()) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>(async (args: { select?: unknown }) => (row ? project(row, args.select) : null)),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'g1', displayName: 'Invité 1', avatar: null, joinedAt: new Date('2026-09-20T00:00:00.000Z'), isActive: true },
        { id: 'g2', displayName: 'Invité 2', avatar: null, joinedAt: new Date('2026-09-19T00:00:00.000Z'), isActive: false },
      ]),
      groupBy: jest.fn<any>().mockResolvedValue([{ shareLinkId: LINK, _count: { _all: 2 } }]),
    },
  } as any;
}

async function buildLinkApp(prisma: any, role: string | null = 'MODERATOR'): Promise<FastifyInstance> {
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
  registerContentShareLinkRoutes(app);
  await app.ready();
  return app;
}

const shareLink = (app: FastifyInstance, id = LINK) => app.inject({ method: 'GET', url: `/share-links/${id}` });

describe('GET /admin/share-links/:id — qui a le droit', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['BIGBOSS', 'ADMIN', 'MODERATOR'])('sert un %s', async (role) => {
    const app = await buildLinkApp(makeLinkPrisma(), role);
    expect((await shareLink(app)).statusCode).toBe(200);
    await app.close();
  });

  it.each(['AUDIT', 'ANALYST', 'USER'])('refuse un %s — canManageConversations requise', async (role) => {
    const prisma = makeLinkPrisma();
    const app = await buildLinkApp(prisma, role);
    expect((await shareLink(app)).statusCode).toBe(403);
    expect(prisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse 401 sans contexte d’authentification', async () => {
    const app = await buildLinkApp(makeLinkPrisma(), null);
    expect((await shareLink(app)).statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /admin/share-links/:id — la fiche', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert la ligne, les exigences, les restrictions, l’usage et les invités récents nommés', async () => {
    const app = await buildLinkApp(makeLinkPrisma());
    const { data } = JSON.parse((await shareLink(app)).body);

    expect(data).toEqual({
      id: LINK,
      name: 'Invitation été',
      description: 'Pour les cousins',
      maxUses: 50,
      currentUses: 12,
      maxConcurrentUsers: null,
      currentConcurrentUsers: 1,
      maxUniqueSessions: 30,
      currentUniqueSessions: 9,
      visitCount: 140,
      expiresAt: '2026-12-31T00:00:00.000Z',
      isActive: true,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: false,
      requireAccount: false,
      requireNickname: true,
      requireEmail: false,
      requireBirthday: true,
      allowedCountries: ['SN', 'FR'],
      allowedLanguages: ['fr'],
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      creator: awa,
      conversation: { id: CONVERSATION, identifier: 'mshy_famille', title: 'Famille', type: 'group' },
      _count: { anonymousParticipants: 2 },
      recentGuests: [
        { id: 'g1', displayName: 'Invité 1', avatar: null, joinedAt: '2026-09-20T00:00:00.000Z', isActive: true },
        { id: 'g2', displayName: 'Invité 2', avatar: null, joinedAt: '2026-09-19T00:00:00.000Z', isActive: false },
      ],
    });
    await app.close();
  });

  it('JAMAIS linkId, identifier ni allowedIpRanges — ni dans la requête ni dans la réponse', async () => {
    const prisma = makeLinkPrisma();
    const app = await buildLinkApp(prisma);
    const res = await shareLink(app);

    const select = prisma.conversationShareLink.findUnique.mock.calls[0][0].select;
    for (const secret of ['linkId', 'identifier', 'allowedIpRanges']) expect(select[secret]).toBeUndefined();
    expect(res.body).not.toMatch(/SECRETLINKID|SECRETIDENT|203\.0\.113|allowedIpRanges|linkId/);
    await app.close();
  });

  it('les invités récents sont les participants anonymes de CE lien, les dix derniers', async () => {
    const prisma = makeLinkPrisma();
    const app = await buildLinkApp(prisma);
    await shareLink(app);

    const args = prisma.participant.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ shareLinkId: LINK, type: 'anonymous' });
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual({ joinedAt: 'desc' });
    expect(Object.keys(args.select).sort()).toEqual(['avatar', 'displayName', 'id', 'isActive', 'joinedAt']);
    await app.close();
  });

  it('rend 404 pour un lien inconnu et 400 pour un identifiant malformé', async () => {
    const app = await buildLinkApp(makeLinkPrisma(null));
    expect((await shareLink(app)).statusCode).toBe(404);
    expect((await shareLink(app, 'pas-un-objectid')).statusCode).toBe(400);
    await app.close();
  });
});
