/**
 * `GET /admin/audit-logs` — le journal d'audit lisible par la console (#8876, § 6.2).
 *
 * Ce que ces témoins gardent :
 *  - la PORTE : `canViewAuditLogs` (BIGBOSS, AUDIT) — un ADMIN est refusé par la matrice ;
 *  - les NOMS : l'administrateur, le sujet et la cible sont rendus par leur nom, jamais
 *    par un identifiant, et le secret de jointure d'un lien de partage ne part jamais ;
 *  - l'INTERPRÉTATION : `metadata` ne sert que `reason`, `changes` est normalisé depuis
 *    ses formes connues, les secrets et (sans droit) les coordonnées sont masqués ;
 *  - ce qui part À CÔTÉ : adresse IP et navigateur seulement avec `canViewSensitiveData`.
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

import { registerAuditLogRoutes } from '../../../../routes/admin/audit-logs';

const ACTOR_ID = '507f1f77bcf86cd799439011';
const AWA = '507f1f77bcf86cd799439021';
const JEAN = '507f1f77bcf86cd799439022';
const CONVERSATION = '507f1f77bcf86cd799439031';
const COMMUNITY = '507f1f77bcf86cd799439032';
const SHARE_LINK = '507f1f77bcf86cd799439033';
const POST = '507f1f77bcf86cd799439034';
const BROADCAST = '507f1f77bcf86cd799439035';
const REPORT = '507f1f77bcf86cd799439036';
const TRACKING_LINK = '507f1f77bcf86cd799439037';
const FRIEND_REQUEST = '507f1f77bcf86cd799439038';

const PEOPLE = [
  { id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/awa.png' },
  { id: JEAN, username: 'jean', displayName: null, avatar: null },
];

type Row = Record<string, unknown>;

const auditRow = (over: Row = {}): Row => ({
  id: '607f1f77bcf86cd799439101',
  action: 'UPDATE_PROFILE',
  entity: 'User',
  entityId: JEAN,
  userId: JEAN,
  adminId: AWA,
  changes: null,
  metadata: null,
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2026-09-30T10:00:00.000Z'),
  ...over,
});

const inIds = (where: Row | undefined): string[] => {
  const id = where?.id as { in?: string[] } | undefined;
  return id?.in ?? [];
};

function makePrisma(rows: Row[] = [auditRow()], total: number = rows.length) {
  return {
    adminAuditLog: {
      findMany: jest.fn<any>().mockResolvedValue(rows),
      count: jest.fn<any>().mockResolvedValue(total),
    },
    user: {
      findMany: jest.fn<any>(async (args: { where?: Row }) =>
        PEOPLE.filter((p) => inIds(args.where).includes(p.id))
      ),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: CONVERSATION, title: 'Famille', type: 'group' }]),
    },
    community: {
      findMany: jest
        .fn<any>()
        .mockResolvedValue([{ id: COMMUNITY, name: 'Lycée Njanda', identifier: 'mshy_lycee-njanda' }]),
    },
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: SHARE_LINK, name: 'Invitation été', conversation: { title: 'Famille' } },
      ]),
    },
    post: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: POST, type: 'STORY', author: { displayName: 'Awa Diop', username: 'awa' } },
      ]),
    },
    adminBroadcast: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: BROADCAST, name: 'Rentrée', subject: 'Bonne rentrée' }]),
    },
    report: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: REPORT, reportType: 'spam', reportedType: 'message' }]),
    },
    trackingLink: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: TRACKING_LINK, name: 'Affiche', campaign: 'rentree' }]),
    },
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue([
        {
          id: FRIEND_REQUEST,
          sender: { displayName: 'Awa Diop', username: 'awa' },
          receiver: { displayName: null, username: 'jean' },
        },
      ]),
    },
  } as any;
}

/** `role: null` ⇒ aucun contexte d'authentification du tout. */
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
  registerAuditLogRoutes(app);
  await app.ready();
  return app;
}

const get = (app: FastifyInstance, query = '') => app.inject({ method: 'GET', url: `/audit-logs${query}` });

const firstRow = async (prisma: any, role = 'AUDIT') => {
  const app = await buildApp(prisma, role);
  const res = await get(app);
  await app.close();
  return JSON.parse(res.body).data[0];
};

describe('GET /admin/audit-logs — qui a le droit', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['BIGBOSS', 'AUDIT'])('sert un %s — canViewAuditLogs', async (role) => {
    const app = await buildApp(makePrisma(), role);
    expect((await get(app)).statusCode).toBe(200);
    await app.close();
  });

  it.each(['ADMIN', 'MODERATOR', 'ANALYST', 'USER'])(
    'refuse un %s — la matrice ne lui donne pas canViewAuditLogs',
    async (role) => {
      const prisma = makePrisma();
      const app = await buildApp(prisma, role);
      expect((await get(app)).statusCode).toBe(403);
      expect(prisma.adminAuditLog.findMany).not.toHaveBeenCalled();
      await app.close();
    }
  );

  it('refuse 401 sans contexte d’authentification', async () => {
    const app = await buildApp(makePrisma(), null);
    expect((await get(app)).statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /admin/audit-logs — l’enveloppe paginée', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert 30 lignes par défaut, triées du plus récent au plus ancien, et dit s’il y en a d’autres', async () => {
    const prisma = makePrisma([auditRow()], 75);
    const app = await buildApp(prisma);
    const body = JSON.parse((await get(app)).body);

    expect(body.success).toBe(true);
    expect(body.pagination).toEqual({ total: 75, limit: 30, offset: 0, hasMore: true });
    const args = prisma.adminAuditLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(30);
    expect(args.skip).toBe(0);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    await app.close();
  });

  it('plafonne limit à 100 et relaie offset', async () => {
    const prisma = makePrisma([auditRow()], 500);
    const app = await buildApp(prisma);
    const body = JSON.parse((await get(app, '?limit=500&offset=40')).body);

    expect(body.pagination).toMatchObject({ limit: 100, offset: 40, hasMore: true });
    await app.close();
  });

  it('order=asc inverse le tri', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await get(app, '?order=asc');
    expect(prisma.adminAuditLog.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    await app.close();
  });
});

describe('GET /admin/audit-logs — les filtres deviennent un where', () => {
  beforeEach(() => jest.clearAllMocks());

  it('traduit chaque filtre, et le même where sert le compte', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await get(
      app,
      `?action=BAN_USER,DELETE_POST&entity=Post&entityId=${POST}&adminId=${AWA}&userId=${JEAN}` +
        '&createdAfter=2026-09-01T00:00:00.000Z&createdBefore=2026-09-30T23:59:59.000Z'
    );

    expect(res.statusCode).toBe(200);
    const where = prisma.adminAuditLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      AND: [
        { action: { in: ['BAN_USER', 'DELETE_POST'] } },
        { entity: 'Post' },
        { entityId: POST },
        { adminId: AWA },
        { userId: JEAN },
        { createdAt: { gte: new Date('2026-09-01T00:00:00.000Z') } },
        { createdAt: { lte: new Date('2026-09-30T23:59:59.000Z') } },
      ],
    });
    expect(prisma.adminAuditLog.count.mock.calls[0][0].where).toEqual(where);
    await app.close();
  });

  it('sans filtre, le where est vide', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await get(app);
    expect(prisma.adminAuditLog.findMany.mock.calls[0][0].where).toEqual({});
    await app.close();
  });

  it.each([
    ['un code d’action en minuscules', '?action=ban_user'],
    ['un code d’action avec une virgule vide', '?action=BAN_USER,'],
    ['un genre de cible hors liste', '?entity=Message'],
    ['un userId qui n’est pas un ObjectId', '?userId=abc'],
    ['un adminId qui n’est pas un ObjectId', '?adminId=zzzzzzzzzzzzzzzzzzzzzzzz'],
    ['une date illisible', '?createdAfter=demain'],
    ['un ordre inconnu', '?order=sideways'],
  ])('refuse 400 %s — sans toucher la base', async (_nom, query) => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    expect((await get(app, query)).statusCode).toBe(400);
    expect(prisma.adminAuditLog.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /admin/audit-logs — les vrais noms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('nomme l’administrateur et le sujet, et rend null pour un compte disparu', async () => {
    const row = await firstRow(makePrisma([auditRow({ adminId: AWA, userId: '507f1f77bcf86cd7994390ff' })]));

    expect(row.admin).toEqual({ id: AWA, username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn/awa.png' });
    expect(row.subject).toBeNull();
  });

  it('résout tous les comptes en UNE requête, jamais une par ligne', async () => {
    const prisma = makePrisma([auditRow(), auditRow({ id: 'a2' }), auditRow({ id: 'a3', adminId: JEAN })]);
    await firstRow(prisma);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('une cible Utilisateur est nommée par son nom, avec son @username en second', async () => {
    const row = await firstRow(makePrisma([auditRow({ entity: 'User', entityId: AWA })]));
    expect(row.target).toEqual({ type: 'User', id: AWA, label: 'Awa Diop', secondary: '@awa' });
  });

  it('un compte sans nom affiché est nommé par son @username', async () => {
    const row = await firstRow(makePrisma([auditRow({ entity: 'User', entityId: JEAN })]));
    expect(row.target).toMatchObject({ label: '@jean', secondary: null });
  });

  it.each([
    ['Conversation', CONVERSATION, { label: 'Famille', secondary: 'group' }],
    ['Community', COMMUNITY, { label: 'Lycée Njanda', secondary: 'mshy_lycee-njanda' }],
    ['ConversationShareLink', SHARE_LINK, { label: 'Invitation été', secondary: 'Famille' }],
    ['Post', POST, { label: 'Awa Diop', secondary: 'STORY' }],
    ['Broadcast', BROADCAST, { label: 'Rentrée', secondary: 'Bonne rentrée' }],
    ['Report', REPORT, { label: 'spam', secondary: 'message' }],
    ['TrackingLink', TRACKING_LINK, { label: 'Affiche', secondary: 'rentree' }],
    ['FriendRequest', FRIEND_REQUEST, { label: 'Awa Diop → @jean', secondary: null }],
  ])('nomme une cible %s par son nom', async (entity, entityId, attendu) => {
    const row = await firstRow(makePrisma([auditRow({ entity, entityId })]));
    expect(row.target).toEqual({ type: entity, id: entityId, ...attendu });
  });

  it('une cible sans ligne (supprimée) ou d’un genre sans nom rend label null, pas une erreur', async () => {
    const prisma = makePrisma([
      auditRow({ entity: 'Conversation', entityId: '507f1f77bcf86cd7994390aa' }),
      auditRow({ id: 'a2', entity: 'AgentLlmConfig', entityId: 'global' }),
      auditRow({ id: 'a3', entity: 'Agent', entityId: 'ALL' }),
    ]);
    prisma.conversation.findMany.mockResolvedValue([]);
    const app = await buildApp(prisma);
    const data = JSON.parse((await get(app)).body).data;

    expect(data.map((r: any) => r.target.label)).toEqual([null, null, null]);
    await app.close();
  });

  it('un identifiant qui n’est pas un ObjectId n’atteint jamais la base', async () => {
    const prisma = makePrisma([auditRow({ entity: 'Conversation', entityId: 'ALL' })]);
    await firstRow(prisma);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('ne sert jamais le secret de jointure d’un lien de partage', async () => {
    const prisma = makePrisma([auditRow({ entity: 'ConversationShareLink', entityId: SHARE_LINK })]);
    const app = await buildApp(prisma);
    const res = await get(app);
    const select = prisma.conversationShareLink.findMany.mock.calls[0][0].select;

    expect(select.linkId).toBeUndefined();
    expect(select.identifier).toBeUndefined();
    expect(res.body).not.toMatch(/linkId|identifier/);
    await app.close();
  });
});

describe('GET /admin/audit-logs — le motif et les changements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ne sert de metadata que le motif', async () => {
    const row = await firstRow(
      makePrisma([auditRow({ metadata: JSON.stringify({ reason: 'Spam répété', internalNote: 'ne pas servir', type: 'STORY' }) })])
    );
    expect(row.reason).toBe('Spam répété');
    expect(JSON.stringify(row)).not.toContain('internalNote');
    expect(row).not.toHaveProperty('metadata');
  });

  it('un metadata illisible ou sans motif rend reason null', async () => {
    const data = JSON.parse(
      (
        await get(
          await buildApp(
            makePrisma([
              auditRow({ metadata: '{pas du json' }),
              auditRow({ id: 'a2', metadata: JSON.stringify({ name: 'x' }) }),
              auditRow({ id: 'a3', metadata: null }),
            ])
          )
        )
      ).body
    ).data;
    expect(data.map((r: any) => r.reason)).toEqual([null, null, null]);
  });

  it('normalise { champ: { before, after } }', async () => {
    const row = await firstRow(
      makePrisma([auditRow({ changes: JSON.stringify({ role: { before: 'USER', after: 'MODERATOR' } }) })])
    );
    expect(row.changes).toEqual([{ field: 'role', before: 'USER', after: 'MODERATOR' }]);
  });

  it('normalise { champ: { from, to } } et stringifie les primitives', async () => {
    const row = await firstRow(
      makePrisma([auditRow({ changes: JSON.stringify({ isActive: { from: true, to: false }, limit: { from: 3, to: null } }) })])
    );
    expect(row.changes).toEqual([
      { field: 'isActive', before: 'true', after: 'false' },
      { field: 'limit', before: '3', after: null },
    ]);
  });

  it('normalise la forme { before: {…}, after: {…} } champ par champ, sans les champs inchangés', async () => {
    const row = await firstRow(
      makePrisma([
        auditRow({
          changes: JSON.stringify({ before: { title: 'A', isActive: true }, after: { title: 'B', isActive: true } }),
        }),
      ])
    );
    expect(row.changes).toEqual([{ field: 'title', before: 'A', after: 'B' }]);
  });

  it('normalise un tableau d’entrées { field, before, after }', async () => {
    const row = await firstRow(
      makePrisma([auditRow({ changes: JSON.stringify([{ field: 'name', before: 'x', after: 'y' }, { field: 'n', from: 1, to: 2 }]) })])
    );
    expect(row.changes).toEqual([
      { field: 'name', before: 'x', after: 'y' },
      { field: 'n', before: '1', after: '2' },
    ]);
  });

  it('un instantané à plat est servi comme valeurs « après » seulement', async () => {
    const row = await firstRow(makePrisma([auditRow({ changes: JSON.stringify({ status: 'pending', configs: 4 }) })]));
    expect(row.changes).toEqual([
      { field: 'status', before: null, after: 'pending' },
      { field: 'configs', before: null, after: '4' },
    ]);
  });

  it.each([['{}'], ['{pas du json'], ['"texte"'], ['null'], ['[]']])(
    'changes %s ⇒ null',
    async (raw) => {
      const row = await firstRow(makePrisma([auditRow({ changes: raw })]));
      expect(row.changes).toBeNull();
    }
  );

  it('masque toute valeur dont la clé ressemble à un secret, avant ET après, quel que soit le droit', async () => {
    const row = await firstRow(
      makePrisma([
        auditRow({
          changes: JSON.stringify({
            password: { before: 'ancien', after: 'nouveau' },
            twoFactorBackupCodes: { before: ['a'], after: ['b'] },
            apiKey: { before: null, after: 'sk-123' },
            resetToken: { before: null, after: 't' },
            title: { before: 'a', after: 'b' },
          }),
        }),
      ]),
      'BIGBOSS'
    );
    expect(row.changes).toEqual([
      { field: 'password', before: '•••', after: '•••' },
      { field: 'twoFactorBackupCodes', before: '•••', after: '•••' },
      { field: 'apiKey', before: null, after: '•••' },
      { field: 'resetToken', before: null, after: '•••' },
      { field: 'title', before: 'a', after: 'b' },
    ]);
  });

  it('masque aussi un secret enfoui dans une valeur structurée', async () => {
    const row = await firstRow(
      makePrisma([auditRow({ changes: JSON.stringify({ settings: { before: { theme: 'dark' }, after: { theme: 'dark', token: 'abc' } } }) })]),
      'BIGBOSS'
    );
    expect(JSON.stringify(row.changes)).not.toContain('abc');
  });

  it('masque les coordonnées pour qui n’a pas canViewSensitiveData, et les sert à qui l’a', async () => {
    const changes = JSON.stringify({
      email: { before: 'awa@exemple.fr', after: 'awa@autre.fr' },
      phoneNumber: { before: '+221700000000', after: null },
      pendingEmail: { before: null, after: 'x@y.z' },
    });
    const audit = await firstRow(makePrisma([auditRow({ changes })]), 'AUDIT');
    const boss = await firstRow(makePrisma([auditRow({ changes })]), 'BIGBOSS');

    expect(audit.changes).toEqual([
      { field: 'email', before: '•••', after: '•••' },
      { field: 'phoneNumber', before: '•••', after: null },
      { field: 'pendingEmail', before: null, after: '•••' },
    ]);
    expect(boss.changes[0]).toEqual({ field: 'email', before: 'awa@exemple.fr', after: 'awa@autre.fr' });
    expect(JSON.stringify(audit)).not.toContain('awa@exemple.fr');
  });
});

describe('GET /admin/audit-logs — ce qui part à côté', () => {
  beforeEach(() => jest.clearAllMocks());

  it('AUDIT ne reçoit ni l’adresse IP ni le navigateur, et la base ne les lui lit même pas', async () => {
    const prisma = makePrisma();
    const row = await firstRow(prisma, 'AUDIT');

    expect(row.ipAddress).toBeNull();
    expect(row.userAgent).toBeNull();
    const select = prisma.adminAuditLog.findMany.mock.calls[0][0].select;
    expect(select.ipAddress).toBeUndefined();
    expect(select.userAgent).toBeUndefined();
  });

  it('BIGBOSS les reçoit', async () => {
    const row = await firstRow(makePrisma(), 'BIGBOSS');
    expect(row.ipAddress).toBe('203.0.113.7');
    expect(row.userAgent).toBe('Mozilla/5.0');
  });

  it('la forme d’une ligne est figée — aucun champ brut de la table ne fuit', async () => {
    const row = await firstRow(makePrisma([auditRow({ metadata: JSON.stringify({ reason: 'r' }) })]), 'BIGBOSS');
    expect(Object.keys(row).sort()).toEqual(
      ['action', 'admin', 'changes', 'createdAt', 'entity', 'entityId', 'id', 'ipAddress', 'reason', 'subject', 'target', 'userAgent'].sort()
    );
    expect(row.createdAt).toBe('2026-09-30T10:00:00.000Z');
  });
});
