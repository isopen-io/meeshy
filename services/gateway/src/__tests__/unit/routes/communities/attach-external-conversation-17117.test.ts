/**
 * #17117 — une conversation externe (un ami WhatsApp) ne devient pas un salon
 * de communauté.
 *
 * `POST /communities/:id/conversations/:conversationId` rattache une
 * conversation que l'appelant administre à une communauté qu'il administre.
 * Le rattachement CONFÈRE des droits aux administrateurs de la communauté hôte
 * (supervision de la liste des membres des salons qu'elle héberge, admission
 * au salon par la loi de la communauté) et le fait sortir de la conversation
 * quand l'ouvreur quitte la communauté, par un chemin qui n'efface pas
 * l'adresse de l'ami. L'ouvreur administre sa conversation externe : sans
 * garde, il pouvait la rattacher. Le témoin observe l'écriture (`update`),
 * jamais émise.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { EXTERNAL_CONVERSATION_ERROR_CODES, EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../../routes/communities/member-presence', () => ({
  gateConversationParticipantsPresence: jest.fn(async (_p: unknown, _v: unknown, rows: unknown[]) => rows),
}));

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
}));

import { registerCoreRoutes } from '../../../../routes/communities/core';

const OUVREUR = '507f1f77bcf86cd799439011';
const COMMUNAUTE = '507f1f77bcf86cd7994390aa';
const CONVERSATION = '507f1f77bcf86cd7994390bb';

async function buildApp(type: string) {
  const update = jest.fn(async (_args: unknown) => ({
    id: CONVERSATION,
    communityId: COMMUNAUTE,
    participants: [],
    _count: { messages: 0, participants: 1 },
  }));
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: unknown) => {
    (req as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      userId: OUVREUR,
      registeredUser: { id: OUVREUR, role: 'USER' },
    };
  });
  app.decorate('prisma', {
    community: {
      findFirst: jest.fn(async () => ({ id: COMMUNAUTE, createdBy: OUVREUR, isPrivate: false, members: [] })),
    },
    conversation: {
      findFirst: jest.fn(async () => ({
        id: CONVERSATION,
        type,
        communityId: null,
        participants: [{ userId: OUVREUR, role: 'creator', isActive: true }],
      })),
      update,
    },
  } as never);
  await app.register(registerCoreRoutes);
  await app.ready();
  return { app, update };
}

const attach = (app: Awaited<ReturnType<typeof buildApp>>['app']) =>
  app.inject({ method: 'POST', url: `/communities/${COMMUNAUTE}/conversations/${CONVERSATION}` });

describe('POST /communities/:id/conversations/:conversationId — une conversation externe n’est pas un salon', () => {
  it('refuse en 409 EXTERNAL_CONVERSATION_SINGLE_MEMBER, sans rien écrire', async () => {
    const { app, update } = await buildApp(EXTERNAL_CONVERSATION_TYPE);

    const res = await attach(app);

    expect(update).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.SINGLE_MEMBER });
    await app.close();
  });

  it('rattache toujours une conversation Meeshy que l’appelant administre', async () => {
    const { app, update } = await buildApp('group');

    const res = await attach(app);

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
