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
