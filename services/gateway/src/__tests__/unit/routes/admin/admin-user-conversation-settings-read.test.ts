/**
 * La ligne de conversation que la fiche d'un membre sert à la feuille
 * « Configurer » (#7999) :
 *
 *   GET /admin/users/:userId/conversations
 *
 * - `membership` est lue À PART : l'aperçu est borné à six participants, et
 *   un membre entré septième y rendait `null`.
 * - les réglages que la feuille pré-remplit voyagent sous `settings`, jamais
 *   à plat, et `_count` ne sort pas.
 *
 * Harnais : VRAIS `permissionsService`, `UserManagementService`,
 * `sanitizationService` et `UserAuditService` — seul Prisma est doublé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

type AnyRecord = Record<string, unknown>;

type PrismaOpts = {
  conversations: AnyRecord[];
  memberships?: AnyRecord[];
};

function createMockPrisma(opts: PrismaOpts) {
  return {
    user: {
      findUnique: jest.fn(async () => ({ id: TARGET_ID })),
    },
    conversation: {
      findMany: jest.fn(async () => opts.conversations),
      count: jest.fn(async () => opts.conversations.length),
    },
    participant: {
      findMany: jest.fn(async () => opts.memberships ?? []),
    },
    adminAuditLog: {
      create: jest.fn(async (args: { data: AnyRecord }) => ({ id: 'audit-1', ...args.data })),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

async function getConversations(prisma: MockPrisma) {
  const app: FastifyInstance = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as AnyRecord).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
      hasFullAccess: true,
    };
  });
  const { userAdminRoutes } = await import('../../../../routes/admin/users');
  await app.register(userAdminRoutes, { prefix: '/api/v1' });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/conversations` });
  await app.close();
  return res;
}

describe('GET /admin/users/:userId/conversations — la ligne que la feuille « Configurer » pré-remplit (#7999)', () => {
  it('serves the membership of a member who is NOT among the six previewed participants', async () => {
    const apercu = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ userId: `early-${id}`, role: 'member', joinedAt: new Date() }));
    const prisma = createMockPrisma({
      conversations: [{ id: 'c1', identifier: 'big-group', type: 'group', participants: apercu, _count: { participants: 40 } }],
      memberships: [{ id: 'p-late', userId: TARGET_ID, conversationId: 'c1', role: 'moderator', isActive: true }],
    });
    const res = await getConversations(prisma);
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].membership).toMatchObject({ userId: TARGET_ID, role: 'moderator' });
    const lecture = (prisma.participant.findMany.mock.calls[0] as unknown[])[0] as { where: AnyRecord };
    expect(lecture.where).toMatchObject({ userId: TARGET_ID, isActive: true, conversationId: { in: ['c1'] } });
  });

  it('serves the conversation settings the admin sheet pre-fills', async () => {
    const prisma = createMockPrisma({
      conversations: [
        {
          id: 'c1',
          identifier: 'grp',
          type: 'group',
          description: 'Le groupe',
          defaultWriteRole: 'moderator',
          isAnnouncementChannel: true,
          slowModeSeconds: 30,
          autoTranslateEnabled: false,
          encryptionMode: null,
          conversationMessageStats: null,
          participants: [],
          _count: { participants: 3 },
        },
      ],
    });
    const res = await getConversations(prisma);
    const ligne = res.json().data[0];
    expect(ligne).toMatchObject({
      description: 'Le groupe',
      memberCount: 3,
      messageCount: null,
      settings: { defaultWriteRole: 'moderator', isAnnouncementChannel: true, slowModeSeconds: 30, autoTranslateEnabled: false },
    });
    expect(ligne).not.toHaveProperty('defaultWriteRole');
    expect(ligne).not.toHaveProperty('_count');
  });
});
