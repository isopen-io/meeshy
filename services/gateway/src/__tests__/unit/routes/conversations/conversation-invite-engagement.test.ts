/**
 * `social.conversation_invite` (#8959) — faire entrer quelqu'un dans une
 * conversation paie celui qui l'a fait entrer, une fois par personne et par
 * conversation (`targetId = conversation:personne`). Les DEUX portes d'ajout
 * par un tiers le créditent : `POST …/participants` et `POST …/invite`.
 * Rien pour un « déjà membre ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async () => '507f1f77bcf86cd799439011'),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn(),
}));

jest.mock('../../../../socketio/emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: jest.fn(async () => ({ showOnline: false, showLastSeenTimestamp: false })),
  }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn().mockImplementation(() => ({ recordEvent: jest.fn(async () => undefined) })),
}));

import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';
import { registerSharingRoutes } from '../../../../routes/conversations/sharing';
import type { EngagementService } from '../../../../services/engagement/EngagementService';

type RecordActivity = EngagementService['recordActivity'];

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';

type Row = { id: string; conversationId: string; userId: string; role: string; isActive: boolean; type: string; [key: string]: unknown };
type Where = { id?: string; conversationId?: string; isActive?: boolean; type?: string; userId?: string | { notIn?: string[] } };

const matches = (rows: Row[], where: Where | undefined): Row[] =>
  rows.filter((row) => {
    if (where?.id !== undefined && where.id !== row.id) return false;
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.type !== undefined && where.type !== row.type) return false;
    if (typeof where?.userId === 'string' && where.userId !== row.userId) return false;
    if (typeof where?.userId === 'object' && where.userId.notIn?.includes(row.userId)) return false;
    return true;
  });

const bob = { id: BOB, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null, deactivatedAt: null, systemLanguage: 'fr' };

function prismaDouble(bobAlreadyMember: boolean) {
  const rows: Row[] = [
    { id: 'p-actor', conversationId: CONV_ID, userId: ACTOR, role: 'admin', isActive: true, type: 'user', bannedAt: null, displayName: 'Demo' },
    ...(bobAlreadyMember
      ? [{ id: 'p-bob', conversationId: CONV_ID, userId: BOB, role: 'member', isActive: true, type: 'user', bannedAt: null, displayName: 'Bob' }]
      : []),
  ];
  return {
    conversation: {
      findUnique: jest.fn(async () => ({
        id: CONV_ID, title: 'Groupe', type: 'group', isActive: true, closedAt: null, createdAt: new Date('2025-01-01'),
        participants: [{ id: 'p-actor', userId: ACTOR, role: 'admin', displayName: 'Demo', user: { id: ACTOR, username: 'demo', role: 'USER' } }],
      })),
      update: jest.fn(async () => undefined),
    },
    participant: {
      findFirst: jest.fn(async (args: { where?: Where }) => matches(rows, args?.where)[0] ?? null),
      findMany: jest.fn(async (args: { where?: Where }) => matches(rows, args?.where)),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        const row: Row = { isActive: true, type: 'user', role: 'member', conversationId: CONV_ID, userId: BOB, ...args.data, id: 'p-bob', user: bob };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data, user: bob })),
    },
    user: {
      findFirst: jest.fn(async () => bob),
      findUnique: jest.fn(async () => bob),
    },
    message: { create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'sys-1', createdAt: new Date(), ...args.data })) },
  };
}

const socketDouble = () => {
  const chainable: { emit: jest.Mock; to: jest.Mock } = { emit: jest.fn(), to: jest.fn() };
  chainable.to.mockReturnValue(chainable);
  return {
    getManager: () => ({
      getIO: () => chainable,
      joinUserToConversationRoom: jest.fn(async () => undefined),
      broadcastMessage: jest.fn(async () => undefined),
    }),
  };
};

const authenticateAs = (userId: string) => async (request: FastifyRequest & { authContext?: unknown }) => {
  request.authContext = { type: 'user', userId, isAuthenticated: true, isAnonymous: false, registeredUser: { id: userId, role: 'USER' } };
};

async function buildApp(recordActivity: jest.Mock<RecordActivity>, bobAlreadyMember = false) {
  const prisma = prismaDouble(bobAlreadyMember);
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', authenticateAs(ACTOR));
  app.decorate('notificationService', {
    createAddedToConversationNotification: jest.fn(async () => undefined),
    createMemberJoinedNotificationsBatch: jest.fn(async () => 0),
    createConversationInviteNotification: jest.fn(async () => undefined),
  } as never);
  app.decorate('socketIOHandler', socketDouble() as never);
  const engagement = { recordActivity };
  registerParticipantWriteRoutes(app, prisma as never, authenticateAs(ACTOR), engagement);
  registerSharingRoutes(app, prisma as never, authenticateAs(ACTOR), engagement);
  await app.ready();
  return app;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

let recordActivity: jest.Mock<RecordActivity>;

beforeEach(() => {
  recordActivity = jest.fn<RecordActivity>(async () => undefined);
});

describe.each([
  ['POST …/participants', `/conversations/${CONV_ID}/participants`],
  ['POST …/invite', `/conversations/${CONV_ID}/invite`],
])('%s — crédit de l’invitation', (_label, url) => {
  it('crédite celui qui fait entrer, avec la paire conversation:personne pour cible', async () => {
    const app = await buildApp(recordActivity);

    const res = await app.inject({ method: 'POST', url, payload: { userId: BOB } });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(recordActivity).toHaveBeenCalledWith(ACTOR, 'social.conversation_invite', { targetId: `${CONV_ID}:${BOB}` });
    await app.close();
  });

  it('ne crédite rien pour un déjà-membre', async () => {
    const app = await buildApp(recordActivity, true);

    const res = await app.inject({ method: 'POST', url, payload: { userId: BOB } });
    await flush();

    expect(res.statusCode).toBe(400);
    expect(recordActivity).not.toHaveBeenCalledWith(ACTOR, 'social.conversation_invite', expect.anything());
    await app.close();
  });
});
