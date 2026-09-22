/**
 * #7358 (G-9) — `GET /conversations/:id` sert `currentUserJoinedAt`, la date
 * d'adhésion de l'APPELANT, comme la liste le fait déjà (`core-list.ts`).
 *
 * Le témoin passe par la route et le vrai contrat de fil
 * (`conversationResponseSchema`, non mocké) : c'est la sérialisation qui
 * décide si la valeur atteint le client, jamais la liste des champs déclarés.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439aaa';

const mockResolveConversationId = jest.fn<any>().mockResolvedValue(CONV_ID);
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: any[]) => mockResolveConversationId(...a),
}));

const mockCanAccess = jest.fn<any>().mockResolvedValue(true);
const JOINED_AT = new Date('2026-07-14T08:30:00.000Z');
const mockResolveCallerParticipant = jest.fn<any>().mockResolvedValue({ id: 'p-1', role: 'admin', joinedAt: JOINED_AT });
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

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  // Le crochet d'ETag GLOBAL, monté comme dans `server.ts` : c'est lui, et pas
  // la route, qui pose le validateur de `/conversations/:id`.
  app.addHook('onSend', conditionalGetOnSend);
  app.decorate('notificationService', { markConversationNotificationsAsRead: async () => undefined } as never);
  app.decorate('presenceChecker', undefined as never);
  const optionalAuth = async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  registerConversationDetailRoute(app, prisma, optionalAuth);
  await app.ready();
  return app;
}

const detail = async (query = '') => {
  const app = await buildApp(makePrisma());
  const response = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}${query}` });
  await app.close();
  expect(response.statusCode).toBe(200);
  return response.json().data as Record<string, unknown>;
};

describe('#7358 — GET /conversations/:id sert currentUserJoinedAt', () => {
  it("le profil par défaut sert la date d'adhésion de l'appelant", async () => {
    expect((await detail()).currentUserJoinedAt).toBe(JOINED_AT.toISOString());
  });

  it('`fields=currentUserJoinedAt` la sert seule', async () => {
    expect((await detail('?fields=currentUserJoinedAt')).currentUserJoinedAt).toBe(JOINED_AT.toISOString());
  });

  it('une projection qui ne la demande pas ne la sert pas', async () => {
    expect((await detail('?fields=id,type')).currentUserJoinedAt).toBeUndefined();
  });

  it("un appelant sans ligne Participant n'en reçoit aucune — rien n'est fabriqué", async () => {
    mockResolveCallerParticipant.mockResolvedValueOnce(null);
    expect((await detail()).currentUserJoinedAt).toBeUndefined();
  });
});
