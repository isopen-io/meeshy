/**
 * #7593 — `PUT|PATCH /conversations/:id` : renommer le groupe se lit « Nom du
 * groupe modifié » dans la liste (`system.conversation-renamed`), changer son
 * image « Photo du groupe modifiée » (`system.conversation-image`). Aucun avis
 * n'était émis : seul le titre de la ligne changeait. Un champ réécrit à
 * l'identique n'annonce rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd7994390bb';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue('507f1f77bcf86cd7994390bb'),
  invalidateConversationIdCache: jest.fn(),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>(async () => new Map()) }),
}));

import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const BEFORE = { title: 'Recette aperçu', avatar: 'https://static.meeshy.me/old.jpg' };

function monterPrisma() {
  const message = { create: jest.fn<any>(async ({ data }: any) => ({ id: 'sys-1', createdAt: new Date(), ...data })) };
  const prisma = {
    participant: {
      findFirst: jest.fn<any>(async () => ({
        id: 'p-demo', userId: ADMIN_ID, role: 'admin', displayName: 'Demo', isActive: true,
        conversation: { type: 'group', ...BEFORE },
      })),
    },
    conversation: {
      update: jest.fn<any>(async (args: any) => ({
        id: CONV_ID, type: 'group', ...BEFORE, ...(args?.data ?? {}),
        participants: [{ id: 'p-demo', userId: ADMIN_ID, isActive: true, user: { id: ADMIN_ID, username: 'demo' } }],
      })),
      findUnique: jest.fn<any>(),
    },
    message,
  };
  return prisma;
}

async function monterApp(prisma: ReturnType<typeof monterPrisma>) {
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
  const chain = (): any => ({ to: () => chain(), emit: () => undefined });
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: 'USER' }, hasFullAccess: true,
    };
  };
  (app as unknown as Record<string, unknown>).socketIOHandler = {
    getManager: () => ({ getIO: () => ({ to: () => chain() }), broadcastMessage }),
  };
  const { registerCoreRoutes } = await import('../../../../routes/conversations/core');
  registerCoreRoutes(app, prisma as unknown as PrismaClient, auth, auth);
  await app.ready();
  return { app, broadcastMessage };
}

async function modifier(payload: Record<string, unknown>, method: 'PUT' | 'PATCH' = 'PUT') {
  const prisma = monterPrisma();
  const { app, broadcastMessage } = await monterApp(prisma);
  const res = await app.inject({ method, url: `/conversations/${CONV_ID}`, headers: { authorization: 'Bearer x' }, payload });
  await app.close();
  const created = prisma.message.create.mock.calls.map((call: any) => call[0].data);
  return { res, created, broadcastMessage };
}

describe('#7593 — PUT|PATCH /conversations/:id annonce le renommage et l’image', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['PUT', 'PATCH'] as const)('%s : un titre changé se lit « Nom du groupe modifié »', async (method) => {
    const { res, created, broadcastMessage } = await modifier({ title: 'Recette renommée' }, method);
    expect(res.statusCode).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0].senderId).toBe('p-demo');
    expect(systemEventFromMessage(created[0])).toEqual({ key: 'system.conversation-renamed', params: { actor: 'Demo' } });
    expect(broadcastMessage).toHaveBeenCalledWith(expect.objectContaining({ metadata: created[0].metadata }), CONV_ID);
  });

  it('une image changée se lit « Photo du groupe modifiée »', async () => {
    const { created } = await modifier({ avatar: 'https://static.meeshy.me/new.jpg' });
    expect(created.map((data: Record<string, unknown>) => systemEventFromMessage(data)?.key)).toEqual(['system.conversation-image']);
  });

  it('titre et image changés : deux avis, dans cet ordre', async () => {
    const { created } = await modifier({ title: 'Autre', avatar: 'https://static.meeshy.me/new.jpg' });
    expect(created.map((data: Record<string, unknown>) => systemEventFromMessage(data)?.key)).toEqual([
      'system.conversation-renamed',
      'system.conversation-image',
    ]);
  });

  it("un titre réécrit à l'identique, une description ou une bannière n'annoncent rien", async () => {
    const { created } = await modifier({ title: BEFORE.title, description: 'd', banner: 'https://static.meeshy.me/b.jpg' });
    expect(created).toHaveLength(0);
  });
});
