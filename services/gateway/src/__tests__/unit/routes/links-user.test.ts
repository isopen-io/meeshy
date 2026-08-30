/**
 * Unit tests for links/user.ts routes.
 * Tests GET /links and GET /links/stats
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockIsRegisteredUser = jest.fn<any>();

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  UnifiedAuthRequest: {},
  isRegisteredUser: (...a: any[]) => mockIsRegisteredUser(...a),
}));

const mockAuthMiddleware = jest.fn<any>();

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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerUserRoutes } from '../../../routes/links/user';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const CONV_ID = '507f1f77bcf86cd799439088';
const OTHER_USER_ID = '507f1f77bcf86cd799439077';

const mockLink = {
  id: '507f1f77bcf86cd799439099',
  linkId: 'mshy_link_abc123',
  identifier: 'my-link',
  name: 'Test Link',
  isActive: true,
  currentUses: 5,
  maxUses: 100,
  expiresAt: null,
  createdAt: new Date('2025-01-01'),
  conversation: { id: 'conv-1', title: 'Test Chat', type: 'group', description: 'Desc' },
  creator: { id: OTHER_USER_ID, username: 'creator1', firstName: 'C', lastName: 'R', displayName: null, avatar: null },
  description: 'Un lien de test',
  maxConcurrentUsers: 10,
  currentConcurrentUsers: 2,
  maxUniqueSessions: 50,
  currentUniqueSessions: 5,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  allowViewHistory: true,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedCountries: ['FR'],
  allowedLanguages: ['fr', 'en'],
  allowedIpRanges: [],
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  // `conversationShareLink`/`participant` sont extraits AVANT le spread final
  // — sans cela, `...rest` (l'ancien `...overrides` en queue) écraserait
  // ENTIÈREMENT le sous-objet fusionné dès qu'un appelant ne fournit qu'UNE
  // partie de ses méthodes (ex. `{count, aggregate}` sans `findMany`), perdant
  // silencieusement les défauts déjà posés (`findMany is not a function`,
  // seulement au premier appel — un piège classique de « le dernier spread
  // gagne » qu'aucun appelant du fichier d'origine n'avait révélé, tous
  // fournissant jusqu'ici les TROIS méthodes de `conversationShareLink` à
  // chaque override.
  const { conversationShareLink, participant, ...rest } = overrides;
  return {
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([mockLink]),
      // Le curseur (`?cursor=`) résout l'`id` du dernier élément de la page
      // précédente en une date de création — `null` par défaut (aucun test
      // qui n'active pas le curseur ne doit dépendre de ce mock).
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(1),
      aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 5 } }),
      ...conversationShareLink,
    },
    // Membership pour le scope `?conversationId=` — absent par défaut (les
    // témoins globaux, sans `conversationId`, ne l'appellent jamais).
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      ...participant,
    },
    ...rest,
  };
}

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(authContext: any = { registeredUser: { id: USER_ID } }): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    (req as any).authContext = authContext;
  });
  mockIsRegisteredUser.mockImplementation((ctx: any) => ctx?.registeredUser !== undefined);

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma() as any);
  await registerUserRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /links ───────────────────────────────────────────────────────────────

describe('GET /links — not registered user', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ /* no registeredUser */ });
    mockIsRegisteredUser.mockReturnValue(false);
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when not a registered user', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links — success with links', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ registeredUser: { id: USER_ID } });
    mockIsRegisteredUser.mockReturnValue(true);
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with links list', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].linkId).toBe('mshy_link_abc123');
  });

  it('returns pagination metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/links?limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });
});

describe('GET /links — empty result', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prismaWithEmpty = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prismaWithEmpty as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty data array', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });
});

describe('GET /links — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prismaWithError = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prismaWithError as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /links — link with null maxUses and expiresAt, no conversation title', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const linkWithNulls = {
      ...mockLink,
      name: null,
      maxUses: null,
      expiresAt: null,
      conversation: null,
    };

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([linkWithNulls]),
        count: jest.fn<any>().mockResolvedValue(1),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 5 } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with null fields properly mapped', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const item = res.json().data[0];
    expect(item.name).toBeNull();
    expect(item.maxUses).toBeNull();
    expect(item.expiresAt).toBeNull();
    expect(item.conversationTitle).toBeNull();
  });
});

// ─── GET /links?conversationId= — #4170 crit. 1/2 : absorbe                ───
// ─── GET /conversations/:conversationId/links, corrige creatorId→createdBy ───

describe('GET /links?conversationId= — non-member', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID, role: 'USER' } };
    });
    app = await buildApp({ registeredUser: { id: USER_ID, role: 'USER' } });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 — jamais un 500 — quand le lecteur n\'est pas membre de la conversation', async () => {
    const res = await app.inject({ method: 'GET', url: `/links?conversationId=${CONV_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links?conversationId= — membre NON modérateur', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID, role: 'USER' } };
    });
    prisma = makePrisma({
      participant: { findFirst: jest.fn<any>().mockResolvedValue({ role: 'member' }) },
    });
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  // Critère 7 de #4170 : le témoin interroge la RÉPONSE, pas seulement le
  // code — c'est exactement la classe de défaut que `creatorId` (colonne
  // inexistante sur ConversationShareLink) produisait ailleurs : un filtre
  // qui lève ne se voit qu'en LISANT ce qui revient.
  it('reçoit 200 et SES PROPRES liens (filtre createdBy, jamais creatorId)', async () => {
    const res = await app.inject({ method: 'GET', url: `/links?conversationId=${CONV_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID, createdBy: USER_ID } })
    );
    expect(prisma.conversationShareLink.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID, createdBy: USER_ID } })
    );
  });

  it('meta.viewerIsModerator est `false`, présent dans le corps SÉRIALISÉ', async () => {
    const res = await app.inject({ method: 'GET', url: `/links?conversationId=${CONV_ID}` });
    // Après fast-json-stringify (res.json()), pas sur l'objet du handler —
    // c'est exactement le défaut que ce critère corrige (schéma sans
    // `properties` déclarées pour `meta`/`viewerIsModerator`).
    expect(res.json().meta.viewerIsModerator).toBe(false);
  });
});

describe('GET /links?conversationId= — modérateur de la conversation', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID, role: 'USER' } };
    });
    prisma = makePrisma({
      participant: { findFirst: jest.fn<any>().mockResolvedValue({ role: 'moderator' }) },
    });
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('voit TOUS les liens de la conversation (aucun filtre createdBy)', async () => {
    const res = await app.inject({ method: 'GET', url: `/links?conversationId=${CONV_ID}` });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID } })
    );
  });

  it('meta.viewerIsModerator est `true`, présent dans le corps sérialisé', async () => {
    const res = await app.inject({ method: 'GET', url: `/links?conversationId=${CONV_ID}` });
    expect(res.json().meta.viewerIsModerator).toBe(true);
  });

  it('?mine=true force la vue restreinte même pour un modérateur', async () => {
    await app.inject({ method: 'GET', url: `/links?conversationId=${CONV_ID}&mine=true` });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID, createdBy: USER_ID } })
    );
  });
});

describe('GET /links — sans conversationId, meta est ABSENT (rien n\'a été calculé)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ registeredUser: { id: USER_ID, role: 'USER' } });
    mockIsRegisteredUser.mockReturnValue(true);
  });
  afterAll(async () => { await app.close(); });

  it('ne porte aucune clé `meta` — un objet vide serait déjà une affirmation', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toBeUndefined();
  });
});

describe('GET /links — expand=conversation,creator', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ registeredUser: { id: USER_ID, role: 'USER' } });
    mockIsRegisteredUser.mockReturnValue(true);
  });
  afterAll(async () => { await app.close(); });

  it('sans expand : conversation/creator ABSENTS (compat iOS/Android inchangée)', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    const item = res.json().data[0];
    expect(item.conversation).toBeUndefined();
    expect(item.creator).toBeUndefined();
    expect(item.conversationTitle).toBe('Test Chat');
  });

  it('avec expand=conversation,creator : les deux objets sont servis', async () => {
    const res = await app.inject({ method: 'GET', url: '/links?expand=conversation,creator' });
    const item = res.json().data[0];
    expect(item.conversation).toEqual({ id: 'conv-1', title: 'Test Chat', type: 'group', description: 'Desc' });
    expect(item.creator).toEqual(
      expect.objectContaining({ id: OTHER_USER_ID, username: 'creator1' })
    );
  });

  // Troisième volet d'`expand`, au-delà des deux nommés au critère 1 :
  // `conversation-links-section.tsx` (web) affiche permissions et
  // restrictions dans sa popover de détails — des colonnes SCALAIRES du lien
  // lui-même, déjà chargées (aucun `select` ne les exclut de la requête).
  it('avec expand=policy : permissions et restrictions sont servies, absentes sinon', async () => {
    const withPolicy = await app.inject({ method: 'GET', url: '/links?expand=policy' });
    const item = withPolicy.json().data[0];
    expect(item.allowAnonymousMessages).toBe(true);
    expect(item.allowAnonymousFiles).toBe(false);
    expect(item.allowedLanguages).toEqual(['fr', 'en']);
    expect(item.description).toBe('Un lien de test');

    const withoutPolicy = await app.inject({ method: 'GET', url: '/links' });
    const bareItem = withoutPolicy.json().data[0];
    expect(bareItem.allowAnonymousMessages).toBeUndefined();
    expect(bareItem.allowedLanguages).toBeUndefined();
  });
});

describe('GET /links — include=summary', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID, role: 'USER' } };
    });
    // `count` sert à la fois `total` (pagination) et les deux comptages de
    // `computeShareLinksSummary` (`totalLinks`/`activeLinks`) — une valeur
    // CONSTANTE, jamais `mockResolvedValueOnce` enchaîné : ce dernier
    // s'épuise après 3 appels et fausserait le test voisin de ce même bloc
    // (« sans include=summary »), qui rappelle `count` une 4e fois.
    prisma = makePrisma({
      conversationShareLink: {
        count: jest.fn<any>().mockResolvedValue(1),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 5 } }),
      },
    });
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('meta.summary porte des mesures RÉELLES — aucun champ fabriqué (crit. 3)', async () => {
    const res = await app.inject({ method: 'GET', url: '/links?include=summary' });
    expect(res.statusCode).toBe(200);
    const summary = res.json().meta.summary;
    expect(summary).toEqual({ totalLinks: 1, activeLinks: 1, totalUses: 5 });
    // Aucun `memberCount`/`anonymousCount`/`spokenLanguages` — le défaut
    // fabriqué de `GET /links/my-links` (admin.ts) ne se propage pas ici.
    expect(summary.memberCount).toBeUndefined();
    expect(summary.spokenLanguages).toBeUndefined();
  });

  it('sans include=summary, meta.summary est absent', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toBeUndefined();
  });
});

describe('GET /links — pagination', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID, role: 'USER' } };
    });
    prisma = makePrisma();
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('?offset= reste accepté (compat iOS `listMyLinks`/Android `listMyLinks` — hors territoire de ce lot)', async () => {
    await app.inject({ method: 'GET', url: '/links?offset=10&limit=5' });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });

  it('la réponse porte pagination (offset) ET cursorPagination — les deux formes, jamais une seule', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    const body = res.json();
    expect(body.pagination).toEqual(expect.objectContaining({ total: 1, offset: 0, limit: 50 }));
    expect(body.cursorPagination).toBeDefined();
    expect(body.cursorPagination.nextCursor).toBe(mockLink.id);
  });

  it('?cursor=<id> résout la date de création du curseur et filtre createdAt < elle, sans `skip`', async () => {
    prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ createdAt: new Date('2025-06-01') });
    await app.inject({ method: 'GET', url: `/links?cursor=${mockLink.id}` });
    const call = prisma.conversationShareLink.findMany.mock.calls.at(-1)[0];
    expect(call.where.createdAt).toEqual({ lt: new Date('2025-06-01') });
    expect(call.skip).toBeUndefined();
  });
});

describe('GET /links — fields= (sparse fieldset)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ registeredUser: { id: USER_ID, role: 'USER' } });
    mockIsRegisteredUser.mockReturnValue(true);
  });
  afterAll(async () => { await app.close(); });

  it('ne rend que les champs demandés', async () => {
    const res = await app.inject({ method: 'GET', url: '/links?fields=id,linkId,isActive' });
    const item = res.json().data[0];
    expect(Object.keys(item).sort()).toEqual(['id', 'isActive', 'linkId']);
  });
});

// ─── GET /links/stats ─────────────────────────────────────────────────────────

describe('GET /links/stats — not registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(false);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = {};
    });
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma() as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when not a registered user', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/stats — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(3),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 42 } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.totalLinks).toBe(3);
    expect(data.totalUses).toBe(42);
  });

  // #4170 — alias déprécié : la porte annonce sa succession (RFC 9745 +
  // RFC 8288 `successor-version`) plutôt que de se taire, comme l'exige
  // `utils/deprecation.ts`. iOS ET Android l'appellent encore (mesuré par
  // grep, hors territoire de ce lot) : la porte reste VIVANTE.
  it('annonce sa dépréciation (Deprecation + Link successor-version) — iOS/Android l\'appellent encore', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.headers['deprecation']).toBe('@1787961600');
    expect(res.headers['link']).toContain('</api/v1/links?include=summary>; rel="successor-version"');
  });
});

describe('GET /links/stats — null currentUses sum', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns totalUses as 0 when aggregate sum is null', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalUses).toBe(0);
  });
});

describe('GET /links/stats — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(500);
  });
});
