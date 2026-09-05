/**
 * `DELETE /admin/share-links/:id` — la console d'administration peut enfin
 * FERMER un lien de partage (#3734).
 *
 * ## Pourquoi une route de plus, alors que `DELETE /links/:linkId` existe
 *
 * Deux mesures, pas une intuition :
 *
 * 1. **La console ne détient pas la clé qu'elle demande.** `GET
 *    /admin/share-links` retire délibérément `linkId` de son `select` (#4157 —
 *    le secret de jointure ne se distribue pas en liste) ; la page n'a donc que
 *    `ConversationShareLink.id`, l'ObjectId opaque. La route existante prend le
 *    `mshy_*` PUBLIC en paramètre. Elle est inatteignable depuis la console par
 *    CONSTRUCTION, quelle que soit l'autorisation de l'appelant.
 * 2. **Son autorisation est celle de la CONVERSATION, pas de la plateforme.**
 *    `loadShareLinkForManagement` dérive `isConversationAdmin` d'un `.some()`
 *    sur `conversation.participants` déjà filtré `where: { userId }` : un
 *    administrateur de plateforme ÉTRANGER à la conversation a une liste vide,
 *    donc `false`, donc **403**. C'est voulu et documenté
 *    (`conversation-authority.ts` : « un administrateur de la plateforme
 *    étranger à la conversation reste étranger »). Cette route-ci pose l'autre
 *    question — celle de l'administration de la PLATEFORME — et n'a donc pas à
 *    consulter le rang de conversation.
 *
 * ## Le seuil, mesuré sur la matrice et pas deviné
 *
 * `requireAdmin = requirePermission('canAccessAdmin')` admet BIGBOSS, ADMIN,
 * MODERATOR **et AUDIT** — ce n'est pas « ADMIN+ ». La loi de CETTE ressource
 * est `canManageConversations`, celle que `GET /admin/share-links` applique
 * déjà dans son corps : BIGBOSS, ADMIN, MODERATOR. Une porte plus étroite que
 * la liste montrerait à un modérateur des lignes sur lesquelles il ne peut pas
 * agir ; une porte plus large laisserait AUDIT — rôle de LECTURE — fermer des
 * liens. Le témoin exerce donc les six rôles, pas seulement celui qui passe :
 * un témoin qui n'éprouve que le succès serait vert sur une route sans garde.
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

const revokeShareLinkGuests = jest.fn<any>().mockResolvedValue([]);
jest.mock('../../../../socketio/revokeShareLinkGuests', () => ({
  revokeShareLinkGuests: (...args: unknown[]) => revokeShareLinkGuests(...args),
}));

import { registerAdminShareLinkRoutes } from '../../../../routes/admin/share-links';

const ACTOR_ID = '507f1f77bcf86cd799439011';
const LINK_ID = '507f1f77bcf86cd799439033';
const CONV_ID = '507f1f77bcf86cd799439044';

/** Un lien créé par QUELQU'UN D'AUTRE, dans une conversation où l'acteur n'est pas. */
function foreignLinkRow() {
  return { id: LINK_ID, conversationId: CONV_ID, isActive: true };
}

function makePrisma(row: Record<string, unknown> | null = foreignLinkRow()) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      update: jest.fn<any>().mockResolvedValue({ id: LINK_ID, isActive: false }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    adminAuditLog: {
      create: jest.fn<any>().mockResolvedValue({}),
    },
  } as any;
}

/** `role: null` ⇒ aucun contexte d'authentification du tout. */
async function buildApp(prisma: any, role: string | null = 'ADMIN'): Promise<FastifyInstance> {
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
  registerAdminShareLinkRoutes(app);
  await app.ready();
  return app;
}

const close = (app: FastifyInstance) =>
  app.inject({ method: 'DELETE', url: `/share-links/${LINK_ID}` });

describe('DELETE /admin/share-links/:id — qui a le droit (#3734)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['BIGBOSS', 'ADMIN', 'MODERATOR'])(
    'un %s de la plateforme ferme un lien qu’il n’a pas créé, dans une conversation où il n’est pas',
    async (role) => {
      const app = await buildApp(makePrisma(), role);

      const res = await close(app);

      expect(res.statusCode).toBe(200);
      await app.close();
    }
  );

  it('refuse un AUDIT — canAccessAdmin ne suffit pas, la ressource exige canManageConversations', async () => {
    const app = await buildApp(makePrisma(), 'AUDIT');

    const res = await close(app);

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it.each(['ANALYST', 'USER'])('refuse un %s — arrêté à la porte', async (role) => {
    const app = await buildApp(makePrisma(), role);

    const res = await close(app);

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse 401 quand aucun contexte d’authentification n’est posé', async () => {
    const app = await buildApp(makePrisma(), null);

    const res = await close(app);

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('un rôle refusé ne TOUCHE PAS la ligne — le refus est antérieur à toute écriture', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, 'USER');

    await close(app);

    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    expect(revokeShareLinkGuests).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /admin/share-links/:id — ce que le geste FAIT (#3734)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rend 404 quand le lien n’existe pas', async () => {
    const prisma = makePrisma(null);
    const app = await buildApp(prisma);

    const res = await close(app);

    expect(res.statusCode).toBe(404);
    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('charge la ligne par son ObjectId — jamais par le `mshy_*` public', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await close(app);

    expect(prisma.conversationShareLink.findUnique.mock.calls[0][0].where).toEqual({ id: LINK_ID });
    await app.close();
  });

  it('FERME en douceur : `isActive:false`, la ligne survit — `delete` n’est jamais appelé (#4170)', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await close(app);

    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: { isActive: false },
    });
    expect(prisma.conversationShareLink.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it('révoque les invités du lien AVANT de le fermer — jamais un lien fermé dont les invités restent', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await close(app);

    expect(revokeShareLinkGuests).toHaveBeenCalledTimes(1);
    expect((revokeShareLinkGuests.mock.calls[0][0] as any).shareLinkId).toBe(LINK_ID);
    const revokeOrder = revokeShareLinkGuests.mock.invocationCallOrder[0];
    const updateOrder = prisma.conversationShareLink.update.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(updateOrder);
    await app.close();
  });

  it('trace le geste dans AdminAuditLog — savoir qui a le droit ne sert à rien sans savoir qui s’en est servi', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await close(app);

    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const entry = (prisma.adminAuditLog.create.mock.calls[0][0] as any).data;
    expect(entry.entityId).toBe(LINK_ID);
    expect(entry.entity).toBe('ConversationShareLink');
    expect(entry.adminId).toBe(ACTOR_ID);
    await app.close();
  });

  it('sert un corps qui NOMME la ligne fermée — le schéma de réponse ne doit rien éjecter', async () => {
    const app = await buildApp(makePrisma());

    const res = await close(app);

    // Assertion EXACTE, jamais `objectContaining` : fast-json-stringify RETIRE
    // toute clé que le schéma ne déclare pas, et une clé retirée ne fait
    // échouer aucune assertion partielle. `message` en fait partie —
    // `sendSuccess` le pose à la RACINE de l'enveloppe, à côté de `data`.
    expect(JSON.parse(res.body)).toEqual({
      success: true,
      data: { id: LINK_ID, isActive: false },
      message: 'Lien fermé avec succès',
    });
    await app.close();
  });

  it('rend 500 quand la base échoue, sans laisser fuir l’erreur', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockRejectedValue(new Error('boom'));
    const app = await buildApp(prisma);

    const res = await close(app);

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('boom');
    await app.close();
  });
});
