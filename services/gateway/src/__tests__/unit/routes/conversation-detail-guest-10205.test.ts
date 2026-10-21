/**
 * #10205 — `GET /conversations/:id` lu par un INVITÉ (session de lien, sans
 * compte Meeshy) : son fil reste ouvert, mais la fiche ne lui sert ni la liste
 * des membres (sa propre ligne exceptée, qui porte son nom), ni leur nombre.
 * Un compte garde tout. Témoin par la route et le vrai contrat de fil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439aaa';

const mockResolveConversationId = jest.fn<any>().mockResolvedValue(CONV_ID);
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: any[]) => mockResolveConversationId(...a),
}));

const mockCanAccess = jest.fn<any>().mockResolvedValue(true);
const JOINED_AT = new Date('2026-07-14T08:30:00.000Z');
const mockResolveCallerParticipant = jest.fn<any>().mockResolvedValue({ id: 'p-guest', role: 'member', joinedAt: JOINED_AT });
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...a: any[]) => mockCanAccess(...a),
  resolveCallerParticipant: (...a: any[]) => mockResolveCallerParticipant(...a),
}));

const mockGetUnreadCount = jest.fn<any>().mockResolvedValue(7);
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCount(...a: any[]) { return mockGetUnreadCount(...a); }
  },
}));

const mockResolveForTargets = jest.fn<any>().mockResolvedValue(new Map());
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: (...a: any[]) => mockResolveForTargets(...a) }),
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => ({ id: USER_ID, role: 'USER' }),
  presenceFor: () => ({ showOnline: false, showLastSeenTimestamp: false }),
}));

import { registerConversationDetailRoute } from '../../../routes/conversations/core-detail';
import { conditionalGetOnSend } from '../../../utils/etag';

const ROW = () => ({
  id: CONV_ID,
  identifier: 'mee_demo',
  type: 'group',
  title: 'Le salon',
  description: 'une description',
  avatar: null,
  banner: null,
  communityId: null,
  isActive: true,
  lastMessageAt: new Date('2026-08-01T10:00:00Z'),
  defaultWriteRole: 'everyone',
  isAnnouncementChannel: false,
  slowModeSeconds: 0,
  createdAt: new Date('2026-07-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  encryptionMode: null,
  encryptionProtocol: null,
  encryptionEnabledAt: null,
  encryptionEnabledBy: null,
  serverEncryptionKeyId: null,
  autoTranslateEnabled: true,
  participants: [
    {
      id: 'p-guest', userId: null, type: 'anonymous', displayName: 'Invité', avatar: null,
      role: 'member', permissions: null, isActive: true, isOnline: true,
      lastActiveAt: null, joinedAt: new Date('2026-07-02T10:00:00Z'), user: null,
    },
    {
      id: 'p-1', userId: USER_ID, type: 'user', displayName: 'Ana', avatar: null,
      role: 'admin', permissions: null, isActive: true, isOnline: true,
      lastActiveAt: null, joinedAt: new Date('2026-07-01T10:00:00Z'),
      user: { id: USER_ID, username: 'ana', displayName: 'Ana', firstName: 'Ana', lastName: 'B' },
    },
  ],
  _count: { participants: 3 },
});

function makePrisma() {
  return {
    conversation: { findFirst: jest.fn<any>().mockResolvedValue(ROW()) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function buildApp(prisma: any, authContext: Record<string, unknown>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  // Le crochet d'ETag GLOBAL, monté comme dans `server.ts` : c'est lui, et pas
  // la route, qui pose le validateur de `/conversations/:id`.
  app.addHook('onSend', conditionalGetOnSend);
  app.decorate('notificationService', { markConversationNotificationsAsRead: async () => undefined } as never);
  app.decorate('presenceChecker', undefined as never);
  const optionalAuth = async (req: any) => {
    req.authContext = authContext;
  };
  registerConversationDetailRoute(app, prisma, optionalAuth);
  await app.ready();
  return app;
}

const GUEST = {
  type: 'anonymous',
  isAuthenticated: true,
  isAnonymous: true,
  userId: 'p-guest',
  participantId: 'p-guest',
};
const MEMBER = {
  type: 'user',
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID, role: 'USER' },
};

const detail = async (authContext: Record<string, unknown>) => {
  const app = await buildApp(makePrisma(), authContext);
  const response = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
  await app.close();
  expect(response.statusCode).toBe(200);
  return response.json().data as Record<string, unknown>;
};

describe('#10205 — GET /conversations/:id lu par un invité', () => {
  it('ne sert à l’invité que SA ligne de participant', async () => {
    const data = await detail(GUEST);
    expect((data.participants as { id: string }[]).map((p) => p.id)).toEqual(['p-guest']);
  });

  it('ne sert à l’invité aucun effectif (champ absent, jamais un faux zéro)', async () => {
    const data = await detail(GUEST);
    expect(data).not.toHaveProperty('memberCount');
    expect(data).not.toHaveProperty('memberCountCapped');
  });

  it('sert toujours à l’invité de quoi tenir son fil', async () => {
    const data = await detail(GUEST);
    expect(data).toMatchObject({ id: CONV_ID, title: 'Le salon', type: 'group' });
  });

  it('un compte Meeshy garde la liste entière et l’effectif', async () => {
    const data = await detail(MEMBER);
    expect((data.participants as { id: string }[]).map((p) => p.id)).toEqual(['p-guest', 'p-1']);
    expect(data.memberCount).toBe(3);
  });
});
