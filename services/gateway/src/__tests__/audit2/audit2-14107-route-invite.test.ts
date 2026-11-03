/**
 * Témoin de ROUTE : `POST /conversations/:id/invite` vers un inconnu.
 * `decideDirectOpening` est le VRAI ; seule la loi d'accès est doublée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../services/relations/pairAccess', () => ({
  pairAccessAmong: jest.fn(async (_p: unknown, params: any) =>
    new Map(params.otherIds.map((id: string) => [id, { allowed: params.feature === 'dm.request', effectiveLevel: 'PUBLIC', reason: 'level' }]))),
}));
jest.mock('../../utils/conversation-id-cache', () => ({ resolveConversationId: jest.fn(async () => '507f1f77bcf86cd799439011') }));
jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTarget: jest.fn(async () => ({ showOnline: false, showLastSeenTimestamp: false })) }),
}));

import { registerSharingRoutes } from '../../routes/conversations/sharing';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';
type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

function monter() {
  const routes: Array<{ method: string; path: string; handler: Handler }> = [];
  const register = (method: string) => jest.fn((path: string, _o: unknown, handler: Handler) => { routes.push({ method, path, handler }); });
  const bob = { id: BOB, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', deactivatedAt: null, createdAt: new Date('2025-01-01') };
  const prisma: any = {
    conversation: {
      findUnique: jest.fn(async () => ({
        id: CONV_ID, title: 'Groupe', type: 'group', isActive: true, closedAt: null,
        participants: [{ id: 'p-actor', userId: ACTOR, role: 'admin', displayName: 'Demo', user: { id: ACTOR, username: 'demo', role: 'USER' } }],
      })),
      update: jest.fn(async () => undefined),
    },
    user: { findMany: jest.fn(async () => [{ id: BOB, birthDate: new Date('1990-01-01') }]), findUnique: jest.fn(async () => bob) },
    participant: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async (a: any) => ({ id: 'p-bob', userId: BOB, ...a.data, user: bob })),
      update: jest.fn(),
    },
    message: { create: jest.fn(async ({ data }: any) => ({ id: 'sys-1', createdAt: new Date(), ...data })) },
  };
  const notificationService = {
    createConversationInviteNotification: jest.fn(async () => undefined),
    createMemberJoinedNotificationsBatch: jest.fn(async () => 0),
  };
  const fastify = {
    prisma, notificationService,
    socketIOHandler: { getManager: jest.fn(() => ({ joinUserToConversationRoom: jest.fn(async () => undefined), broadcastMessage: jest.fn(async () => undefined) })) },
    get: register('GET'), post: register('POST'), patch: register('PATCH'),
  };
  registerSharingRoutes(fastify as never, prisma as never, jest.fn());
  const route = routes.find((r) => r.method === 'POST' && r.path.includes('invite'))!;
  const sent: unknown[] = [];
  const reply: Record<string, unknown> = {};
  reply.status = jest.fn(() => reply);
  reply.code = jest.fn(() => reply);
  reply.send = jest.fn((body: unknown) => { sent.push(body); return reply; });
  const request = { params: { id: CONV_ID }, body: { userId: BOB }, authContext: { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } } };
  return { route, reply, request, prisma, notificationService, sent };
}

describe('contre-audit #14107 — invitation d\'un inconnu (route)', () => {
  it('pose la demande, ne notifie pas l\'invité, et ne sert pas les colonnes de demande', async () => {
    const { route, reply, request, prisma, notificationService, sent } = monter();
    await route.handler(request, reply);
    const data = prisma.participant.create.mock.calls[0][0].data;
    expect({
      request: data.messageRequestAt instanceof Date,
      notified: notificationService.createConversationInviteNotification.mock.calls.length,
      leaks: JSON.stringify(sent).includes('messageRequest'),
    }).toEqual({ request: true, notified: 0, leaks: false });
  });
});
