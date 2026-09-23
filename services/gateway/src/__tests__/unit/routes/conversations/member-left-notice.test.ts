/**
 * #7593 — `POST /conversations/:id/leave` : un départ volontaire se lit « Bob a
 * quitté la conversation » dans la liste des restants (`system.member-left`
 * { actor }), diffusé par `broadcastMessage`. Le créateur seul qui part CLÔT
 * le fil : il n'y a plus personne à qui l'annoncer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue('507f1f77bcf86cd799439022'),
}));
jest.mock('../../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn<any>() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }),
  },
}));

import Fastify from 'fastify';
import { registerLeaveRoutes } from '../../../../routes/conversations/leave';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

function makePrisma(role: string, remaining: Array<Record<string, unknown>>) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'p-bob', conversationId: CONV_ID, userId: USER_ID, role, displayName: 'Bob', isActive: true }),
      count: jest.fn<any>().mockResolvedValue(0),
      findMany: jest.fn<any>().mockResolvedValue(remaining),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    notification: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false, participants: [] }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    conversationShareLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    message: { create: jest.fn<any>(async ({ data }: any) => ({ id: 'sys-1', createdAt: new Date(), ...data })) },
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
  };
}

async function leave(prisma: ReturnType<typeof makePrisma>) {
  const chain: any = { emit: jest.fn<any>() };
  chain.to = jest.fn<any>(() => chain);
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
  const app = Fastify({ logger: false });
  app.decorate('socketIOHandler', {
    getManager: () => ({
      getIO: () => ({ to: chain.to, in: () => ({ fetchSockets: async () => [] }) }),
      invalidateParticipantCache: () => {},
      broadcastMessage,
    }),
  } as never);
  const requiredAuth = async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  registerLeaveRoutes(app, prisma as never, jest.fn(), requiredAuth);
  await app.ready();
  const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
  await app.close();
  return { res, broadcastMessage };
}

describe('#7593 — quitter une conversation', () => {
  it('un membre qui part se lit « Bob a quitté la conversation »', async () => {
    const prisma = makePrisma('member', [{ id: 'p-demo', userId: 'u-demo' }]);
    const { res, broadcastMessage } = await leave(prisma);
    expect(res.statusCode).toBe(200);

    const data = prisma.message.create.mock.calls[0][0].data;
    expect(data.senderId).toBe('p-bob');
    expect(systemEventFromMessage(data)).toEqual({ key: 'system.member-left', params: { actor: 'Bob' } });
    expect(broadcastMessage).toHaveBeenCalledWith(expect.objectContaining({ metadata: data.metadata }), CONV_ID);
  });

  it('le créateur seul qui part clôt le fil sans annoncer de départ', async () => {
    const prisma = makePrisma('creator', []);
    const { res } = await leave(prisma);
    expect(res.statusCode).toBe(200);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
