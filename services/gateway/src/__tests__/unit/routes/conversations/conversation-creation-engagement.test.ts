/**
 * #8906 — créer un GROUPE crédite `conversation.group_created` au créateur,
 * avec les membres invités : l'unicité par ensemble de membres est tenue par
 * `EngagementService.recordGroupCreation`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_groupe'),
  generateCompactConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl'),
  ensureUniqueConversationIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendForbidden: jest.fn<any>((reply: any) => reply),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({
    recordEvent: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

const recordGroupCreation = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn<any>().mockImplementation(() => ({ recordGroupCreation })),
}));

import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';

function prismaDouble() {
  return {
    community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({
        id: CONV_ID, type: 'group', title: 'Équipe', createdAt: new Date(), participants: [],
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: MOI, displayName: 'Moi', username: 'moi', avatar: null },
        { id: AUTRE, displayName: 'Alice', username: 'alice', avatar: null },
      ]),
    },
  };
}

function replyDouble() {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    header: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
}

/**
 * Crée un GROUPE avec un membre initial, et rend les lignes `Participant`
 * telles qu'elles partent vers Prisma — c'est le seul endroit où la table
 * apparaît.
 */
async function creer(type: 'group' | 'direct', participantIds: string[]) {
  const prisma = prismaDouble();
  let handler: any;
  const fastify: any = {
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };

  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());

  await handler(
    {
      body: { type, title: 'Équipe', participantIds },
      params: {}, query: {}, headers: {},
      authContext: {
        type: 'user', isAuthenticated: true, isAnonymous: false,
        userId: MOI, registeredUser: { id: MOI, role: 'USER' },
      },
      user: { userId: MOI },
    },
    replyDouble(),
  );

  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#8906 — créer un groupe rapporte', () => {
  it('crédite le créateur avec les membres invités', async () => {
    await creer('group', [AUTRE]);

    expect(recordGroupCreation).toHaveBeenCalledWith(MOI, CONV_ID, [AUTRE]);
  });

  it('ne crédite pas une conversation directe', async () => {
    await creer('direct', [AUTRE]);

    expect(recordGroupCreation).not.toHaveBeenCalled();
  });
});
