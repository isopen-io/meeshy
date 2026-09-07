/**
 * `PATCH /admin/share-links/:id` — la console d'administration peut ROUVRIR un
 * lien de partage qu'elle a fermé (#5429, symétrique de `DELETE`, #3734).
 *
 * Même garde, même seuil, même geste doux — voir le doc-comment de
 * `routes/admin/share-links.ts` pour le détail de la décision. Ce témoin ne
 * réexplique pas le seuil (couvert par `admin-share-links-delete.test.ts`) :
 * il prouve que la réouverture partage la même porte et n'appelle jamais
 * `revokeShareLinkGuests` — rouvrir n'est pas restaurer une session.
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

/** Un lien fermé par quelqu'un d'autre, dans une conversation où l'acteur n'est pas. */
function closedLinkRow() {
  return { id: LINK_ID, conversationId: CONV_ID, isActive: false };
}

function makePrisma(row: Record<string, unknown> | null = closedLinkRow()) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      update: jest.fn<any>().mockResolvedValue({ id: LINK_ID, isActive: true }),
      delete: jest.fn<any>().mockResolvedValue({}),
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

const reopen = (app: FastifyInstance) =>
  app.inject({
    method: 'PATCH',
    url: `/share-links/${LINK_ID}`,
    payload: { active: true },
  });

describe('PATCH /admin/share-links/:id — qui a le droit (#5429)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['BIGBOSS', 'ADMIN', 'MODERATOR'])(
    'un %s de la plateforme rouvre un lien fermé qu’il n’a pas créé, dans une conversation où il n’est pas',
    async (role) => {
      const app = await buildApp(makePrisma(), role);

      const res = await reopen(app);

      expect(res.statusCode).toBe(200);
      await app.close();
    }
  );

  it('refuse un AUDIT — canAccessAdmin ne suffit pas, la ressource exige canManageConversations', async () => {
    const app = await buildApp(makePrisma(), 'AUDIT');

    const res = await reopen(app);

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it.each(['ANALYST', 'USER'])('refuse un %s — arrêté à la porte', async (role) => {
    const app = await buildApp(makePrisma(), role);

    const res = await reopen(app);

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse 401 quand aucun contexte d’authentification n’est posé', async () => {
    const app = await buildApp(makePrisma(), null);

    const res = await reopen(app);

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('un rôle refusé ne TOUCHE PAS la ligne — le refus est antérieur à toute écriture', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, 'USER');

    await reopen(app);

    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /admin/share-links/:id — ce que le geste FAIT (#5429)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rend 404 quand le lien n’existe pas', async () => {
    const prisma = makePrisma(null);
    const app = await buildApp(prisma);

    const res = await reopen(app);

    expect(res.statusCode).toBe(404);
    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejette un corps `active: false` — cette route ne fait que rouvrir', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/share-links/${LINK_ID}`,
      payload: { active: false },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('charge la ligne par son ObjectId — jamais par le `mshy_*` public', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await reopen(app);

    expect(prisma.conversationShareLink.findUnique.mock.calls[0][0].where).toEqual({ id: LINK_ID });
    await app.close();
  });

  it('ROUVRE : `isActive:true`, `delete` n’est jamais appelé', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await reopen(app);

    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: { isActive: true },
    });
    expect(prisma.conversationShareLink.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne rétablit AUCUN invité révoqué — rouvrir n’est pas restaurer une session', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await reopen(app);

    expect(revokeShareLinkGuests).not.toHaveBeenCalled();
    await app.close();
  });

  it('trace le geste dans AdminAuditLog sous ADMIN_SHARE_LINK_REOPENED', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await reopen(app);

    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const entry = (prisma.adminAuditLog.create.mock.calls[0][0] as any).data;
    expect(entry.action).toBe('ADMIN_SHARE_LINK_REOPENED');
    expect(entry.entityId).toBe(LINK_ID);
    expect(entry.entity).toBe('ConversationShareLink');
    expect(entry.adminId).toBe(ACTOR_ID);
    await app.close();
  });

  it('sert un corps qui NOMME la ligne rouverte — le schéma de réponse ne doit rien éjecter', async () => {
    const app = await buildApp(makePrisma());

    const res = await reopen(app);

    // Assertion EXACTE, jamais `objectContaining` : fast-json-stringify RETIRE
    // toute clé que le schéma ne déclare pas.
    expect(JSON.parse(res.body)).toEqual({
      success: true,
      data: { id: LINK_ID, isActive: true },
      message: 'Lien rouvert avec succès',
    });
    await app.close();
  });

  it('rend 500 quand la base échoue, sans laisser fuir l’erreur', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockRejectedValue(new Error('boom'));
    const app = await buildApp(prisma);

    const res = await reopen(app);

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('boom');
    await app.close();
  });
});
