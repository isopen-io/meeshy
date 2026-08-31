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
  // Le module réel est ÉTALÉ d'abord — PROLONGER, jamais REMPLACER
  // (`services/gateway/CLAUDE.md` § « Un double PARTIEL d'un module perd en
  // silence tout ce que le module GAGNE »). Une usine qui n'énumère que les
  // schémas dont CE fichier a besoin rend `undefined` tous les autres : le
  // jour où un module VOISIN en compose un au chargement — ce que fait
  // `api-schemas-attachments.ts`, réexporté par le barillet `types/index.ts` —
  // la suite entière cesse de se charger, sur un `TypeError` sans rapport avec
  // ce qu'elle teste. Les surcharges ci-dessous restent PRIORITAIRES : elles
  // sont posées après l'étalement.
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
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

import { registerAdminRoutes } from '../../../routes/links/admin';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const LINK_DB_ID = '507f1f77bcf86cd799439033';
const LINK_PUBLIC_ID = 'mshy_abc123_def456';
const CONV_ID = '507f1f77bcf86cd799439044';

/**
 * **Un `findFirst` qui HONORE son `where`.**
 *
 * Les tests voisins de `links-admin.test.ts` posent `mockResolvedValue(row)` :
 * la ligne revient quel que soit le filtre demandé. C'est ce qui a laissé vivre
 * #4007 — « returns 200 when user is conversation ADMIN » y était VERT pendant
 * que la production rendait 404, parce que le seul `where` que le test ne
 * jouait pas était justement celui qui décidait.
 *
 * Ce faux applique la sémantique Prisma sur les champs scalaires du `where` :
 * la ligne ne revient que si elle satisfait TOUTES les contraintes. Un site qui
 * pré-filtre sur `createdBy` rend donc `null` pour un hôte non-créateur — et le
 * 404 qu'il produit devient visible.
 */
function findFirstHonouringWhere(row: Record<string, any> | null) {
  return jest.fn<any>(async (args: any) => {
    if (!row) return null;
    const where = (args?.where ?? {}) as Record<string, unknown>;
    const satisfied = Object.entries(where).every(([field, expected]) => row[field] === expected);
    return satisfied ? row : null;
  });
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: findFirstHonouringWhere(null),
      count: jest.fn<any>().mockResolvedValue(0),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      // Retirer un lien révoque ses invités (`revokeShareLinkGuests`).
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as any;
}

/** Un lien créé par QUELQU'UN D'AUTRE, dans une conversation où l'appelant a `role`. */
function linkCreatedByOtherWithCallerAs(role: string | null) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_PUBLIC_ID,
    createdBy: OTHER_USER_ID,
    conversationId: CONV_ID,
    currentUses: 5,
    allowedLanguages: ['fr', 'en'],
    conversation: {
      id: CONV_ID,
      title: 'Test Conv',
      type: 'group',
      description: null,
      participants: role === null ? [] : [{ userId: USER_ID, role, isActive: true }],
    },
  };
}

function makeUpdatedLink() {
  return {
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
}

async function buildApp(prisma: any, platformRole: string = 'USER') {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.addHook('onRequest', async (req) => {
    (req as any)._testAuthContext = {
      type: 'registered' as const,
      registeredUser: {
        id: USER_ID,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        avatar: null,
        role: platformRole,
      },
    };
  });
  await registerAdminRoutes(app);
  await app.ready();
  return app;
}

const ROUTES = [
  {
    name: 'PATCH /links/:linkId/toggle',
    inject: { method: 'PATCH' as const, url: `/links/${LINK_PUBLIC_ID}/toggle`, payload: { isActive: true } },
    arm: (prisma: any) => prisma.conversationShareLink.update.mockResolvedValue(makeUpdatedLink()),
  },
  {
    name: 'PATCH /links/:linkId/extend',
    inject: {
      method: 'PATCH' as const,
      url: `/links/${LINK_PUBLIC_ID}/extend`,
      payload: { expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    },
    arm: (prisma: any) => prisma.conversationShareLink.update.mockResolvedValue(makeUpdatedLink()),
  },
  {
    name: 'DELETE /links/:linkId',
    inject: { method: 'DELETE' as const, url: `/links/${LINK_PUBLIC_ID}` },
    arm: (prisma: any) => prisma.conversationShareLink.delete.mockResolvedValue({}),
  },
];

/**
 * **Les routes d'administration d'un lien répondent aux HÔTES, pas seulement à
 * l'auteur du lien** (issue #4007).
 *
 * Les trois routes chargeaient la ligne par `findFirst({ where: { linkId,
 * createdBy: userId } })`. `isCreator` en était TAUTOLOGIQUEMENT vrai, le
 * `isConversationAdmin` calculé juste en dessous ne décidait jamais rien, et
 * l'administrateur d'une conversation qui n'avait pas créé le lien recevait un
 * **404 « Lien non trouvé »** là où la description de la route promet « link
 * creator **or** conversation administrators/moderators ».
 *
 * > Un 404 ne dit pas « tu n'as pas le droit » : il dit « ça n'existe pas ».
 * > Masquer un droit qui EXISTE derrière une absence est un défaut de sécurité
 * > à l'envers — l'hôte cherche un bug là où il y a une règle.
 *
 * Patron de référence, inchangé depuis toujours : `links/management.ts` charge
 * par `linkId` seul puis dérive les deux qualités séparément.
 */
describe('Routes d’administration d’un lien — l’hôte non-créateur est joignable (#4007)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each(ROUTES)('$name', ({ inject, arm }) => {
    it('répond à un ADMIN de la conversation qui n’a pas créé le lien', async () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findFirst = findFirstHonouringWhere(
        linkCreatedByOtherWithCallerAs('admin')
      );
      arm(prisma);
      const app = await buildApp(prisma);

      const res = await app.inject(inject);

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('répond à un MODERATOR de la conversation qui n’a pas créé le lien', async () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findFirst = findFirstHonouringWhere(
        linkCreatedByOtherWithCallerAs('moderator')
      );
      arm(prisma);
      const app = await buildApp(prisma);

      const res = await app.inject(inject);

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('interdit EXPLICITEMENT (403) un membre ordinaire — jamais un 404 qui ferait croire à une absence', async () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findFirst = findFirstHonouringWhere(
        linkCreatedByOtherWithCallerAs('member')
      );
      const app = await buildApp(prisma);

      const res = await app.inject(inject);

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('rend 404 quand le lien n’existe VRAIMENT pas', async () => {
      const prisma = makePrisma();
      const app = await buildApp(prisma);

      const res = await app.inject(inject);

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('interroge la base par l’identifiant PUBLIC du lien seul, sans pré-filtrer sur l’auteur', async () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findFirst = findFirstHonouringWhere(
        linkCreatedByOtherWithCallerAs('admin')
      );
      arm(prisma);
      const app = await buildApp(prisma);

      await app.inject(inject);

      const where = prisma.conversationShareLink.findFirst.mock.calls[0][0].where;
      expect(where).toEqual({ linkId: LINK_PUBLIC_ID });
      await app.close();
    });
  });
});

/**
 * **Un administrateur de la PLATEFORME agit avec les droits du créateur**
 * (issue #3941, décision porteur du 2026-08-27 en tranchant #3892).
 *
 * Administrer un lien de partage est une affaire d'administration de
 * conversation comme une autre. Ces routes ne consultaient que le rang de
 * conversation — et, avant #4007, ne consultaient même pas celui-là.
 */
describe('Routes d’administration d’un lien — l’autorité de plateforme (#3941)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each(ROUTES)('$name', ({ inject, arm }) => {
    it('répond à un ADMIN de la plateforme, simple membre de la conversation', async () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findFirst = findFirstHonouringWhere(
        linkCreatedByOtherWithCallerAs('member')
      );
      arm(prisma);
      const app = await buildApp(prisma, 'ADMIN');

      const res = await app.inject(inject);

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('refuse un MODERATOR de la plateforme — participant ordinaire dans une conversation', async () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findFirst = findFirstHonouringWhere(
        linkCreatedByOtherWithCallerAs('member')
      );
      const app = await buildApp(prisma, 'MODERATOR');

      const res = await app.inject(inject);

      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });
});
