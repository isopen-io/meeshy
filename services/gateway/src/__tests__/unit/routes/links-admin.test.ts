import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>(() => async (req: any) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn<any>((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

jest.mock('../../../routes/links/types', () => ({
  shareLinkSchema: { type: 'object', properties: {}, additionalProperties: true },
  conversationSummarySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSchema: { type: 'object', properties: {}, additionalProperties: true },
  updateLinkSchema: { parse: (b: any) => b },
  updateLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  createLinkSchema: { parse: (b: any) => b },
  createLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  sendMessageSchema: { parse: (b: any) => b },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
  SendMessageInput: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerAdminRoutes } from '../../../routes/links/admin';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const LINK_DB_ID = '507f1f77bcf86cd799439033';
const LINK_PUBLIC_ID = 'mshy_abc123_def456';
const CONV_ID = '507f1f77bcf86cd799439044';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      // La requête qui DÉCIDE (`loadShareLinkForManagement`) ne peut pas être
      // doublée par un `mockResolvedValue` : voir `seedLinks` ci-dessous.
      findFirst: jest.fn<any>(findFirstHonouringWhere([])),
      count: jest.fn<any>().mockResolvedValue(0),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      // Retirer un lien révoque ses invités (`revokeShareLinkGuests`) : le
      // double porte la surface que la production appelle, sinon la route
      // tombe en 500 pour une raison qui n'a rien à voir avec le témoin.
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as any;
}

/**
 * Les deux membres que le `where` de production DOIT écarter — présents dans
 * toute conversation semée, jamais nommés par un témoin.
 *
 * Sans eux, un double qui honore son `where` n'a rien à honorer : une liste
 * déjà réduite à l'appelant traverse le filtre juste exactement comme le
 * filtre élargi, et le témoin reste incapable de tomber (#4585). Chacun tient
 * une moitié de `where: { userId, isActive: true }`.
 */
const AUTRES_MEMBRES = [
  // Un ADMIN qui n'est PAS l'appelant : `userId` retiré du `where`, c'est SON
  // rang qui ouvrirait la porte à l'appelant.
  { userId: OTHER_USER_ID, role: 'ADMIN', isActive: true },
  // L'appelant SORTI de la conversation : `isActive` retiré du `where`, un
  // administrateur parti garderait ses clés.
  { userId: USER_ID, role: 'ADMIN', isActive: false },
];

/** L'appelant, membre ACTIF de la conversation avec ce rang. */
const appelant = (role: string) => ({ userId: USER_ID, role, isActive: true });

/**
 * La ligne telle que la BASE la contient : `participants` nomme les lignes de
 * l'appelant, et la conversation porte toujours `AUTRES_MEMBRES` en plus. Un
 * témoin qui poserait ici la liste DÉJÀ filtrée décrirait le résultat de la
 * garde au lieu de la lui soumettre.
 */
function makeShareLink({ participants = [], ...overrides }: Record<string, any> = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_PUBLIC_ID,
    createdBy: USER_ID,
    conversationId: CONV_ID,
    currentUses: 5,
    allowedLanguages: ['fr', 'en'],
    conversation: {
      id: CONV_ID,
      title: 'Test Conv',
      type: 'group',
      description: null,
      participants: [...AUTRES_MEMBRES, ...participants],
    },
    ...overrides,
  };
}

/**
 * Un AUTRE lien, dans une AUTRE conversation, que l'appelant ne gère pas —
 * semé en TÊTE de toute collection. La base n'a jamais une seule ligne : si le
 * `where: { linkId }` de tête venait à disparaître, c'est lui que `findFirst`
 * rendrait, et les témoins le voient (403 partout, `update` sur le mauvais id).
 */
const AUTRE_LIEN = {
  id: '507f1f77bcf86cd799439055',
  linkId: 'mshy_autre_lien_zzz',
  createdBy: OTHER_USER_ID,
  conversationId: '507f1f77bcf86cd799439066',
  currentUses: 0,
  allowedLanguages: [],
  conversation: {
    id: '507f1f77bcf86cd799439066',
    title: 'Autre conv',
    type: 'group',
    description: null,
    participants: [],
  },
};

/**
 * Sème la collection que `findFirst` interroge, et laisse le `where` de
 * production décider ce qui en revient — plutôt que de décider à sa place.
 */
function seedLinks(prisma: any, ...rows: Record<string, any>[]) {
  prisma.conversationShareLink.findFirst.mockImplementation(
    findFirstHonouringWhere([AUTRE_LIEN, ...rows])
  );
}

function makeRegisteredAuthContext(overrides: Record<string, any> = {}) {
  return {
    type: 'registered' as const,
    registeredUser: {
      id: USER_ID,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      avatar: null,
      role: 'USER',
      ...overrides,
    },
  };
}

async function buildApp({
  authContext = makeRegisteredAuthContext(),
  prisma = makePrisma(),
}: {
  authContext?: any;
  prisma?: any;
} = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req) => {
    (req as any)._testAuthContext = authContext;
  });

  await registerAdminRoutes(app);
  await app.ready();
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /links/my-links
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /links/my-links', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when auth context is null', async () => {
    const app = await buildApp({ authContext: null });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when user is anonymous (no registeredUser)', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 with empty list when no links exist', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    await app.close();
  });

  it('returns 200 with transformed links including stats and conversationUrl', async () => {
    const prisma = makePrisma();
    const link = makeShareLink({
      currentUses: 3,
      allowedLanguages: ['fr', 'en', 'de'],
      conversation: { id: CONV_ID, title: 'My Conv', type: 'group', description: 'Desc' },
    });
    prisma.conversationShareLink.count.mockResolvedValue(1);
    prisma.conversationShareLink.findMany.mockResolvedValue([link]);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    const result = body.data[0];
    expect(result.conversation.conversationUrl).toBe(`/conversations/${CONV_ID}`);
    expect(result.creator).toBeDefined();
    expect(result.stats.totalParticipants).toBe(3);
    expect(result.stats.languageCount).toBe(3);
    expect(result.stats.spokenLanguages).toEqual(['fr', 'en', 'de']);
    await app.close();
  });

  it('handles link with null currentUses (defaults to 0)', async () => {
    const prisma = makePrisma();
    const link = makeShareLink({ currentUses: null, allowedLanguages: null });
    prisma.conversationShareLink.count.mockResolvedValue(1);
    prisma.conversationShareLink.findMany.mockResolvedValue([link]);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].stats.totalParticipants).toBe(0);
    expect(body.data[0].stats.anonymousCount).toBe(0);
    expect(body.data[0].stats.languageCount).toBe(0);
    expect(body.data[0].stats.spokenLanguages).toEqual([]);
    await app.close();
  });

  it('applies default limit=20 and offset=0 when not specified', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
    await app.close();
  });

  it('respects provided limit and offset query params', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(100);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=30' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 30, take: 10 })
    );
    await app.close();
  });

  it('caps limit at 50 even when higher value is requested', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links?limit=200' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
    await app.close();
  });

  it('returns correct pagination meta with hasMore=true', async () => {
    const prisma = makePrisma();
    const links = Array.from({ length: 10 }, (_, i) =>
      makeShareLink({ id: `id-${i}`, linkId: `link-${i}` })
    );
    prisma.conversationShareLink.count.mockResolvedValue(50);
    prisma.conversationShareLink.findMany.mockResolvedValue(links);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=0' });
    const body = JSON.parse(res.body);
    expect(body.pagination.total).toBe(50);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
    await app.close();
  });

  it('returns hasMore=false when on last page', async () => {
    const prisma = makePrisma();
    const links = Array.from({ length: 5 }, (_, i) =>
      makeShareLink({ id: `id-${i}`, linkId: `link-${i}` })
    );
    prisma.conversationShareLink.count.mockResolvedValue(25);
    prisma.conversationShareLink.findMany.mockResolvedValue(links);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links?limit=10&offset=20' });
    const body = JSON.parse(res.body);
    expect(body.pagination.hasMore).toBe(false);
    await app.close();
  });

  it('filters by authenticated user id', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(0);
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const app = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(prisma.conversationShareLink.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: USER_ID } })
    );
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: USER_ID } })
    );
    await app.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when findMany throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count.mockResolvedValue(5);
    prisma.conversationShareLink.findMany.mockRejectedValue(new Error('Query failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  // #4170 — alias déprécié : `GET /links` (`links/user.ts`) absorbe cette
  // liste. Le web migre dans ce même lot ; aucune preuve qu'un déploiement
  // plus ancien ne l'appelle encore, donc la porte annonce plutôt que de se
  // taire (`utils/deprecation.ts`).
  it('annonce sa dépréciation vers GET /links', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/links/my-links' });
    expect(res.headers['deprecation']).toBe('@1787961600');
    expect(res.headers['link']).toContain('</api/v1/links>; rel="successor-version"');
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /links/:linkId/toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /links/:linkId/toggle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user is not registered', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    const prisma = makePrisma();
    seedLinks(prisma);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not admin/moderator', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has non-admin role', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('MEMBER')] }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when user is the link creator (activate)', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      isActive: true,
      conversation: {
        id: CONV_ID,
        title: 'Test',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: USER_ID,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Lien activé avec succès');
    await app.close();
  });

  it('returns 200 when user is the link creator (deactivate)', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      isActive: false,
      conversation: {
        id: CONV_ID,
        title: 'Test',
        description: null,
        type: 'group',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: USER_ID,
        username: 'testuser',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Lien désactivé avec succès');
    await app.close();
  });

  it('returns 200 when user is conversation ADMIN', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      isActive: true,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('ADMIN')] }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is conversation MODERATOR', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      isActive: false,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('MODERATOR')] }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is conversation admin (lowercase — la seule casse écrite en base, #3875)', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      isActive: true,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('admin')] }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('calls update with correct isActive value', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_DB_ID },
        data: { isActive: true },
      })
    );
    await app.close();
  });

  it('returns 500 on DB findFirst error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Write failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  // #4170 — alias déprécié : `PATCH /links/:linkId` (le générique,
  // management.ts) absorbe `isActive` depuis l'origine. Android
  // (`LinkApi.kt: @PATCH "links/{linkId}/toggle"`) en reste le seul
  // appelant mesuré — le successeur porte le `linkId` RÉSOLU, jamais un
  // gabarit `:linkId` non suivable.
  it('annonce sa dépréciation vers PATCH /links/:linkId, avec le linkId résolu', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });
    expect(res.headers['deprecation']).toBe('@1787961600');
    expect(res.headers['link']).toContain(`</api/v1/links/${LINK_PUBLIC_ID}>; rel="successor-version"`);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /links/:linkId/extend
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /links/:linkId/extend', () => {
  beforeEach(() => jest.clearAllMocks());

  const FUTURE_DATE = '2030-12-31T23:59:59Z';

  it('returns 403 when user is not registered', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    const prisma = makePrisma();
    seedLinks(prisma);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not admin/moderator', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has non-privileged role', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('MEMBER')] }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when user is link creator', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      expiresAt: new Date(FUTURE_DATE),
      conversation: {
        id: CONV_ID,
        title: 'Test',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: USER_ID,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Lien prolongé avec succès');
    await app.close();
  });

  it('returns 200 when user is ADMIN in conversation', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('ADMIN')] }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is MODERATOR in conversation', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('MODERATOR')] }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is admin in conversation (lowercase — la seule casse écrite en base, #3875)', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      conversation: {
        id: CONV_ID,
        title: 'T',
        description: null,
        type: 'group',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      creator: {
        id: OTHER_USER_ID,
        username: 'other',
        firstName: null,
        lastName: null,
        displayName: null,
        avatar: null,
      },
    };
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('admin')] }));
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('converts expiresAt string to a Date object when updating', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    const updateCall = prisma.conversationShareLink.update.mock.calls[0][0];
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    expect(updateCall.data.expiresAt.toISOString()).toBe(new Date(FUTURE_DATE).toISOString());
    await app.close();
  });

  it('returns 500 on DB findFirst error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Write failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  // #4170 — même raison que `/toggle` : Android
  // (`LinkApi.kt: @PATCH "links/{linkId}/extend"`) en reste le seul
  // appelant mesuré une fois le web migré vers la porte générique.
  it('annonce sa dépréciation vers PATCH /links/:linkId, avec le linkId résolu', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: FUTURE_DATE },
    });
    expect(res.headers['deprecation']).toBe('@1787961600');
    expect(res.headers['link']).toContain(`</api/v1/links/${LINK_PUBLIC_ID}>; rel="successor-version"`);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /links/:linkId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /links/:linkId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user is not registered', async () => {
    const app = await buildApp({
      authContext: { type: 'anonymous', anonymousUser: { id: 'anon-1' } },
    });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    const prisma = makePrisma();
    seedLinks(prisma);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not admin/moderator', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has non-privileged role', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('MEMBER')] }));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // #4170 crit.5 — DELETE devient une fermeture DOUCE : la ligne survit,
  // `isActive` bascule à `false`. Avant ce lot `.delete()` détruisait la
  // ligne ; ce témoin garde le nouveau contrat (message + verdict que la
  // ligne n'est plus jamais physiquement retirée).
  it('returns 200 and CLOSES (soft-close) the link when user is creator', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID, isActive: false });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Lien fermé avec succès');
    expect(prisma.conversationShareLink.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 when user is conversation ADMIN', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('ADMIN')] }));
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    await app.close();
  });

  it('returns 200 when user is conversation MODERATOR', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('MODERATOR')] }));
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is conversation admin (lowercase — la seule casse écrite en base, #3875)', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: OTHER_USER_ID, participants: [appelant('admin')] }));
    prisma.conversationShareLink.delete.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('calls prisma.update with isActive:false and the link db id — never prisma.delete', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({ method: 'DELETE', url: `/links/${LINK_PUBLIC_ID}` });
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith({
      where: { id: LINK_DB_ID },
      data: { isActive: false },
    });
    expect(prisma.conversationShareLink.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 500 on DB findFirst error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when the closing update throws', async () => {
    const prisma = makePrisma();
    seedLinks(prisma, makeShareLink({ createdBy: USER_ID }));
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Update failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_PUBLIC_ID}`,
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
