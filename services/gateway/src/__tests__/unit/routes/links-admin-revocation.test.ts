/**
 * Retirer un lien de partage retire l'accès à ses invités.
 *
 * Les deux routes qui retirent un lien le déclarent dans leur propre contrat
 * OpenAPI — « inaccessible to new AND EXISTING anonymous users » pour la
 * désactivation, « immediately invalidate all anonymous participants » pour la
 * suppression — et aucune des deux ne portait de code derrière cette phrase.
 * Ces témoins gardent la seconde moitié de chacune.
 *
 * Ce qu'ils n'affirment PAS : le détail de l'éviction, gardé chez son unité
 * (`socketio/__tests__/revokeShareLinkGuests.test.ts`). Ici on garde le
 * CÂBLAGE — que la route appelle la révocation, sur le bon lien, au bon moment.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

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

const mockRevokeShareLinkGuests = jest.fn<any>(async () => []);
jest.mock('../../../socketio/revokeShareLinkGuests', () => ({
  revokeShareLinkGuests: (...args: unknown[]) => mockRevokeShareLinkGuests(...args),
}));

import { registerAdminRoutes } from '../../../routes/links/admin';

const USER_ID = '507f1f77bcf86cd799439011';
const LINK_DB_ID = '507f1f77bcf86cd799439033';
const LINK_PUBLIC_ID = 'mshy_abc123_def456';
const CONV_ID = '507f1f77bcf86cd799439044';

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: LINK_DB_ID,
        linkId: LINK_PUBLIC_ID,
        createdBy: USER_ID,
        conversationId: CONV_ID,
        conversation: { id: CONV_ID, title: 'Fil', type: 'group', participants: [] },
      }),
      update: jest.fn<any>().mockResolvedValue({ id: LINK_DB_ID, linkId: LINK_PUBLIC_ID }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as any;
}

async function buildApp(prisma: any) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.addHook('onRequest', async (req) => {
    (req as any)._testAuthContext = {
      type: 'registered' as const,
      registeredUser: { id: USER_ID, username: 'host', role: 'USER' },
    };
  });
  await registerAdminRoutes(app);
  await app.ready();
  return app;
}

describe('retirer un lien de partage retire l\'accès à ses invités', () => {
  beforeEach(() => jest.clearAllMocks());

  it('désactiver un lien révoque ses invités', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRevokeShareLinkGuests).toHaveBeenCalledWith(
      expect.objectContaining({ shareLinkId: LINK_DB_ID })
    );
    await app.close();
  });

  it("RÉACTIVER un lien ne rend rien à personne — une appartenance close se rouvre par la porte d'entrée", async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}/toggle`,
      payload: { isActive: true },
    });

    expect(res.statusCode).toBe(200);
    expect(mockRevokeShareLinkGuests).not.toHaveBeenCalled();
    await app.close();
  });

  it('supprimer un lien révoque ses invités AVANT de le supprimer', async () => {
    const order: string[] = [];
    const prisma = makePrisma();
    prisma.conversationShareLink.delete = jest.fn<any>(async () => {
      order.push('delete');
      return {};
    });
    mockRevokeShareLinkGuests.mockImplementation(async () => {
      order.push('revoke');
      return [];
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/links/${LINK_PUBLIC_ID}` });

    expect(res.statusCode).toBe(200);
    // `Participant.shareLinkId` est une colonne nue : la ligne supprimée, plus
    // rien ne relie ses invités au lien qu'on vient de retirer.
    expect(order).toEqual(['revoke', 'delete']);
    await app.close();
  });

  it("une révocation qui échoue laisse le lien EN PLACE — la reprise est alors possible", async () => {
    const prisma = makePrisma();
    mockRevokeShareLinkGuests.mockRejectedValueOnce(new Error('mongo down'));
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/links/${LINK_PUBLIC_ID}` });

    expect(res.statusCode).toBe(500);
    expect(prisma.conversationShareLink.delete).not.toHaveBeenCalled();
    await app.close();
  });
});
