/**
 * `PATCH /links/:linkId { resetUses: true }` — « Remettre le compteur à zéro »
 * de la fiche d'un lien de partage (#19283).
 *
 * Les vrais schémas d'entrée (Zod et JSON) et la vraie règle de gestion
 * (`loadShareLinkForManagement`) sont exercés : seule la porte d'identité est
 * doublée. Remettre le compteur à zéro est un geste de GESTION : son auteur,
 * un modérateur de la conversation — jamais un simple membre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = (req as unknown as { _testAuthContext: unknown })._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: { registeredUser?: unknown } | null) => ctx?.registeredUser != null),
}));

import { registerManagementRoutes } from '../../../routes/links/management';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const MODERATOR_ID = '507f1f77bcf86cd799439012';
const MEMBER_ID = '507f1f77bcf86cd799439013';
const LINK_DB_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';
const CONV_ID = '507f1f77bcf86cd799439033';

function fakePrisma(options: { readonly memberRole?: string; readonly caller?: string } = {}) {
  const update = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    id: LINK_DB_ID, linkId: LINK_ID, currentUses: 46, ...args.data,
  }));
  const prisma = {
    conversationShareLink: {
      findFirst: jest.fn(async () => ({
        id: LINK_DB_ID, linkId: LINK_ID, createdBy: CREATOR_ID, conversationId: CONV_ID,
        conversation: {
          id: CONV_ID,
          participants: options.memberRole ? [{ userId: options.caller, role: options.memberRole, isActive: true }] : [],
        },
      })),
      findUnique: jest.fn(async () => ({ createdBy: CREATOR_ID, isActive: true, expiresAt: null })),
      update,
    },
    participant: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  return { prisma, update };
}

async function buildApp(prisma: unknown, caller: string) {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as unknown as { _testAuthContext: unknown })._testAuthContext =
      { isAuthenticated: true, isAnonymous: false, userId: caller, registeredUser: { id: caller, role: 'USER' } };
  });
  await registerManagementRoutes(app);
  await app.ready();
  return app;
}

const patch = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: `/links/${LINK_ID}`, payload });

describe('remettre le compteur d’un lien à zéro (#19283)', () => {
  it('l’auteur du lien remet le compteur à zéro', async () => {
    const { prisma, update } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    const res = await patch(app, { resetUses: true });

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: LINK_DB_ID }, data: { currentUses: 0 } }));
    expect(res.json().data.currentUses).toBe(0);
    await app.close();
  });

  it('un modérateur de la conversation le remet aussi', async () => {
    const { prisma, update } = fakePrisma({ memberRole: 'moderator', caller: MODERATOR_ID });
    const app = await buildApp(prisma, MODERATOR_ID);

    expect((await patch(app, { resetUses: true })).statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { currentUses: 0 } }));
    await app.close();
  });

  it('un simple membre reçoit 403, et rien n’est écrit', async () => {
    const { prisma, update } = fakePrisma({ memberRole: 'member', caller: MEMBER_ID });
    const app = await buildApp(prisma, MEMBER_ID);

    expect((await patch(app, { resetUses: true })).statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });

  it('resetUses à false ne touche pas au compteur', async () => {
    const { prisma, update } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await patch(app, { resetUses: false, name: 'Studio' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Studio' } }));
    await app.close();
  });

  it('se compose avec les autres champs sans en retirer aucun', async () => {
    const { prisma, update } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await patch(app, { resetUses: true, maxUses: 50 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { maxUses: 50, currentUses: 0 } }));
    await app.close();
  });

  it('un currentUses écrit directement par le client reste ignoré : seul resetUses remet à zéro', async () => {
    const { prisma, update } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await patch(app, { currentUses: 3, name: 'Studio' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Studio' } }));
    await app.close();
  });

  it('resetUses d’un autre type est refusé', async () => {
    const { prisma, update } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    expect((await patch(app, { resetUses: 'oui' })).statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });
});
