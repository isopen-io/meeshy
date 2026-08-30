import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that reference these modules
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { registerContentRoutes } from '../../../routes/admin/content';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  registeredUser: {
    id: '507f1f77bcf86cd799439011',
    role,
    username: 'admin',
  },
});

// ---------------------------------------------------------------------------
// Mock Prisma factory
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  message: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
  },
  community: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
  },
  conversationShareLink: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    findUnique: jest.fn<any>(),
  },
  // #4157 — POST /share-links/:id/reveal (S6) écrit sa trace ici.
  adminAuditLog: {
    create: jest.fn<any>(),
  },
};

// ---------------------------------------------------------------------------
// App builders
// ---------------------------------------------------------------------------

function buildApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(registerContentRoutes);
  return app;
}

function buildNoAuthApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (_request: any) => {
    // deliberately does NOT set authContext
  });
  app.register(registerContentRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /messages
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /messages', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.message.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 401 when no authContext (unauthenticated)', async () => {
    const noAuthApp = buildNoAuthApp();
    await noAuthApp.ready();

    const response = await noAuthApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    await noAuthApp.close();
  });

  it('returns 403 when role is USER', async () => {
    app = buildApp('USER');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 when role is ADMIN', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.message.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /communities
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /communities', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.community.findMany.mockResolvedValue([]);
    mockPrisma.community.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 when role is ADMIN', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.community.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /translations
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /translations', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 when role is BIGBOSS (has canManageTranslations)', async () => {
    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  // #4157 — la table de l'issue documentait `canManageTranslations` LOCALE ⇒
  // BIGBOSS seul, contre `ADMIN: true` au central : « accès refusé à un rôle
  // qui l'a ». Vérifié PÉRIMÉ — #4152 (routes/admin/services/PermissionsService.ts)
  // a fait de la matrice locale une PROJECTION pure de la centrale, où
  // `ADMIN.canManageTranslations = true` (schema.prisma-adjacent :
  // services/admin/permissions.service.ts). Ce témoin verrouille le résultat.
  it('returns 200 when role is ADMIN — prémisse de la ligne #4157 déjà corrigée par #4152', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.message.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /share-links
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /share-links', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversationShareLink.findMany.mockResolvedValue([]);
    mockPrisma.conversationShareLink.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 when role is ADMIN', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.conversationShareLink.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  // #4157 — `linkId` EST le secret qui permet de REJOINDRE la conversation ;
  // il partait en LISTE sous `canManageConversations` (MODERATOR compris).
  // Témoin de PROJECTION : assert sur la REQUÊTE envoyée à Prisma, pas sur le
  // rendu — un `select` qui le redéclarerait romprait ce témoin AVANT même
  // qu'une ligne n'atteigne le sérialiseur (`additionalProperties: true`
  // laisserait passer n'importe quel champ présent, y compris celui-ci).
  it('ne demande plus linkId à Prisma, même pour BIGBOSS (#4157)', async () => {
    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(200);

    expect(mockPrisma.conversationShareLink.findMany).toHaveBeenCalledTimes(1);
    const { select } = mockPrisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(select).not.toHaveProperty('linkId');
    expect(select).toHaveProperty('id', true);
    expect(select).toHaveProperty('identifier', true);
  });
});

// ---------------------------------------------------------------------------
// POST /share-links/:id/reveal — S6, motif écrit, tracé (#4157)
// ---------------------------------------------------------------------------

describe('Admin content routes — POST /share-links/:id/reveal', () => {
  const LINK_ID = '507f1f77bcf86cd799439099';
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversationShareLink.findUnique.mockResolvedValue({
      id: LINK_ID,
      linkId: 'secret-join-token-abc123',
    });
    mockPrisma.adminAuditLog.create.mockResolvedValue({});
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('refuse ADMIN — le rang souverain (BIGBOSS) est requis, pas une permission de domaine', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/share-links/${LINK_ID}/reveal`,
      payload: { reason: 'Enquête sur un signalement utilisateur' },
    });
    expect(response.statusCode).toBe(403);
    expect(mockPrisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  it('refuse un motif absent ou trop court (400, avant tout accès Prisma)', async () => {
    app = buildApp('BIGBOSS');
    await app.ready();

    const sansMotif = await app.inject({ method: 'POST', url: `/share-links/${LINK_ID}/reveal`, payload: {} });
    expect(sansMotif.statusCode).toBe(400);

    const motifCourt = await app.inject({
      method: 'POST',
      url: `/share-links/${LINK_ID}/reveal`,
      payload: { reason: 'court' }, // 5 caractères < minLength: 10
    });
    expect(motifCourt.statusCode).toBe(400);
    expect(mockPrisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  it('révèle le linkId pour BIGBOSS avec un motif écrit, et écrit la trace d\'audit', async () => {
    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/share-links/${LINK_ID}/reveal`,
      payload: { reason: 'Enquête sur un signalement utilisateur' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.linkId).toBe('secret-join-token-abc123');

    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const auditData = mockPrisma.adminAuditLog.create.mock.calls[0][0].data;
    expect(auditData.action).toBe('ADMIN_SHARE_LINK_REVEALED');
    expect(auditData.entity).toBe('ConversationShareLink');
    expect(auditData.entityId).toBe(LINK_ID);
    expect(JSON.parse(auditData.metadata).reason).toBe('Enquête sur un signalement utilisateur');
  });

  it('rend 404 sans écrire de trace quand le lien est introuvable', async () => {
    mockPrisma.conversationShareLink.findUnique.mockResolvedValue(null);
    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/share-links/${LINK_ID}/reveal`,
      payload: { reason: 'Enquête sur un signalement utilisateur' },
    });
    expect(response.statusCode).toBe(404);
    expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Les LIGNES atteignent-elles le fil ?
//
// Les témoins ci-dessus attestent que ces routes RÉPONDENT — `statusCode`,
// `body.success` — et jamais ce qu'elles DISENT ; et leurs doubles rendent `[]`,
// si bien qu'une assertion de contenu y serait de toute façon vide. Les deux
// listes déclaraient `data: { type: 'array', items: { type: 'object' } }` :
// sans `properties`, fast-json-stringify sérialisait CHAQUE ligne en `{}`.
//
// La réponse gardait donc sa longueur et sa pagination — et perdait toutes ses
// données. C'est la forme la plus trompeuse de ce défaut : rien ne ressemble
// autant à une liste valide qu'une liste de la bonne taille.
// ---------------------------------------------------------------------------

const MESSAGE_ROW = {
  id: 'msg-1',
  content: 'Bonjour',
  messageType: 'text',
  originalLanguage: 'fr',
  isEdited: false,
  createdAt: new Date('2026-08-22T10:00:00.000Z'),
  sender: {
    id: 'part-1',
    userId: 'usr-1',
    displayName: 'Alice',
    avatar: null,
    type: 'user',
    language: 'fr',
    user: { id: 'usr-1', username: 'alice', displayName: 'Alice', firstName: 'A', lastName: 'B', avatar: null },
  },
  conversation: { id: 'conv-1', identifier: 'mshy_x', title: 'Fil', type: 'group' },
  attachments: [{ id: 'att-1', fileName: 'a.png', mimeType: 'image/png' }],
  _count: { replies: 3 },
};

const COMMUNITY_ROW = {
  id: 'comm-1',
  identifier: 'mshy_tech',
  name: 'Tech',
  description: 'Une communauté',
  avatar: null,
  isPrivate: false,
  createdAt: new Date('2026-08-22T10:00:00.000Z'),
  creator: { id: 'usr-9', username: 'bob', displayName: 'Bob', avatar: null },
  _count: { members: 12, Conversation: 4 },
};

describe('Admin content routes — les lignes servies, pas seulement le statut', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /messages sert chaque message avec son contenu, son auteur et son fil', async () => {
    mockPrisma.message.findMany.mockResolvedValue([MESSAGE_ROW]);
    mockPrisma.message.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();

    const row = JSON.parse((await local.inject({ method: 'GET', url: '/messages' })).body).data[0];
    await local.close();

    expect(row).toMatchObject({ id: 'msg-1', content: 'Bonjour', messageType: 'text', originalLanguage: 'fr' });
    expect(row.sender).toMatchObject({ id: 'part-1', displayName: 'Alice' });
    expect(row.sender.user).toMatchObject({ username: 'alice' });
    expect(row.conversation).toMatchObject({ id: 'conv-1', title: 'Fil' });
    expect(row._count).toEqual({ replies: 3 });
  });

  // `attachmentMediaSelect` évolue avec le pipeline média : la pièce jointe est
  // une donnée d'inspection, pas un contrat client, et passe donc entière
  // (`additionalProperties: true`) plutôt que par une copie qui dériverait.
  it('GET /messages laisse passer la pièce jointe entière', async () => {
    mockPrisma.message.findMany.mockResolvedValue([MESSAGE_ROW]);
    mockPrisma.message.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();

    const row = JSON.parse((await local.inject({ method: 'GET', url: '/messages' })).body).data[0];
    await local.close();

    expect(row.attachments[0]).toMatchObject({ id: 'att-1', fileName: 'a.png', mimeType: 'image/png' });
  });

  it('GET /communities sert chaque communauté avec son identité, son créateur et ses compteurs', async () => {
    mockPrisma.community.findMany.mockResolvedValue([COMMUNITY_ROW]);
    mockPrisma.community.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();

    const row = JSON.parse((await local.inject({ method: 'GET', url: '/communities' })).body).data[0];
    await local.close();

    expect(row).toMatchObject({ id: 'comm-1', identifier: 'mshy_tech', name: 'Tech', isPrivate: false });
    expect(row.creator).toMatchObject({ id: 'usr-9', username: 'bob' });
    expect(row._count).toEqual({ members: 12, Conversation: 4 });
  });

  it('la pagination reste juste — c’est ce qui rendait la liste vide crédible', async () => {
    mockPrisma.community.findMany.mockResolvedValue([COMMUNITY_ROW]);
    mockPrisma.community.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();

    const body = JSON.parse((await local.inject({ method: 'GET', url: '/communities' })).body);
    await local.close();

    expect(body.pagination).toMatchObject({ total: 1, hasMore: false });
    expect(body.data).toHaveLength(1);
  });
});

/**
 * #4333 bonus — `GET /admin/messages` servait ses pièces jointes via
 * `attachmentMediaSelect`, dont le propre doc-comment dit « No
 * consumption-tracking, no security flags ». Même classe de défaut que
 * #4157 c.4 (`GET /admin/users/:userId/media`) : un média à vue unique /
 * flouté / porté par un message éphémère déjà expiré sortait ENTIER sur une
 * liste PLATEFORME-ENTIÈRE, gardée par `canModerateContent` seul (MODERATOR
 * compris). Le prédicat réutilisé est le MÊME que celui de la porte
 * `users.ts` (`routes/admin/media-protection.ts`), jamais une copie.
 */
describe('Admin content routes — #4333 bonus : un média protégé ne sort pas entier par GET /messages', () => {
  beforeEach(() => jest.clearAllMocks());

  const ATTACHMENT_ORDINAIRE = {
    id: 'att-ordinaire', fileName: 'photo.png', mimeType: 'image/png',
    fileUrl: '2026/08/x/photo.png', thumbnailUrl: '2026/08/x/photo-t.png',
    isViewOnce: false, isBlurred: false, effectFlags: 0,
  };
  const ATTACHMENT_VUE_UNIQUE = {
    id: 'att-vue-unique', fileName: 'secret.png', mimeType: 'image/png',
    fileUrl: '2026/08/x/secret.png', thumbnailUrl: '2026/08/x/secret-t.png',
    isViewOnce: true, isBlurred: false, effectFlags: 0,
  };

  function messageRowWith(attachments: Array<Record<string, unknown>>, messageFlags: Partial<Record<string, unknown>> = {}) {
    return {
      ...MESSAGE_ROW,
      isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: null, deletedAt: null,
      ...messageFlags,
      attachments,
    };
  }

  it("retire fileUrl et thumbnailUrl d'une pièce jointe à VUE UNIQUE, et les garde sur l'ordinaire", async () => {
    mockPrisma.message.findMany.mockResolvedValue([messageRowWith([ATTACHMENT_VUE_UNIQUE, ATTACHMENT_ORDINAIRE])]);
    mockPrisma.message.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();

    const row = JSON.parse((await local.inject({ method: 'GET', url: '/messages' })).body).data[0];
    await local.close();

    const masque = row.attachments.find((a: Record<string, unknown>) => a.id === 'att-vue-unique');
    const ordinaire = row.attachments.find((a: Record<string, unknown>) => a.id === 'att-ordinaire');

    expect(masque.fileUrl).toBeNull();
    expect(masque.thumbnailUrl).toBeNull();
    // La ligne reste LISTÉE — un modérateur doit savoir que le média existe.
    expect(masque.isProtected).toBe(true);

    expect(ordinaire.fileUrl).toBe('2026/08/x/photo.png');
    expect(ordinaire.isProtected).toBe(false);
  });

  it('protège aussi une pièce jointe ORDINAIRE portée par un message à vue unique — les DEUX niveaux comptent', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      messageRowWith([ATTACHMENT_ORDINAIRE], { isViewOnce: true }),
    ]);
    mockPrisma.message.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();

    const row = JSON.parse((await local.inject({ method: 'GET', url: '/messages' })).body).data[0];
    await local.close();

    expect(row.attachments[0].fileUrl).toBeNull();
    expect(row.attachments[0].isProtected).toBe(true);
  });

  it('LIT les drapeaux de protection MESSAGE et PIÈCE JOINTE — une garde sans sa colonne ne garde rien', async () => {
    mockPrisma.message.findMany.mockResolvedValue([messageRowWith([ATTACHMENT_ORDINAIRE])]);
    mockPrisma.message.count.mockResolvedValue(1);
    const local = buildApp('ADMIN');
    await local.ready();
    await local.inject({ method: 'GET', url: '/messages' });
    await local.close();

    const select = mockPrisma.message.findMany.mock.calls[0][0].select;
    expect(select.isViewOnce).toBe(true);
    expect(select.isBlurred).toBe(true);
    expect(select.effectFlags).toBe(true);
    expect(select.attachments.select.isViewOnce).toBe(true);
    expect(select.attachments.select.isBlurred).toBe(true);
    expect(select.attachments.select.effectFlags).toBe(true);
  });
});
