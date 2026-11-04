/**
 * #15717 — la fiche de conversation dit qu'un interlocuteur a fermé son compte
 * (supprimé OU désactivé) : `accountClosed: true` au niveau du participant,
 * clé ABSENTE sinon. Charge ADDITIVE : un ancien client ignore la clé, et rien
 * d'autre du compte ne part à côté (`deletedAt`, `deactivatedAt`, `user.isActive`).
 * Témoin par la route et le vrai contrat de fil (fast-json-stringify).
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
      user: { id: USER_ID, username: 'ana', displayName: 'Ana', firstName: 'Ana', lastName: 'B', equippedAvatarRing: 'contours-essentiels/filet' },
    },
  ],
  _count: { participants: 3 },
});

const ROW_WITH = (participants: unknown[]) => ({ ...ROW(), participants });

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

const MEMBER = {
  type: 'user',
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID, role: 'USER' },
};

const account = (isActive: boolean) => ({
  id: 'u-peer', username: 'peer', displayName: 'Pair', firstName: 'Pair', lastName: 'X',
  isActive, deletedAt: isActive ? null : new Date('2026-10-01T00:00:00Z'), deactivatedAt: null,
});

const peerRow = (id: string, isActive: boolean) => ({
  id, userId: 'u-peer', type: 'user', displayName: 'Pair', avatar: null,
  role: 'member', permissions: null, isActive: true, isOnline: false,
  lastActiveAt: null, joinedAt: new Date('2026-07-03T10:00:00Z'), user: account(isActive),
});

const withPeers = () => {
  const row = ROW();
  return ROW_WITH([...row.participants, peerRow('p-closed', false), peerRow('p-open', true)]);
};

const served = async () => {
  const prisma = makePrisma();
  prisma.conversation.findFirst.mockResolvedValue(withPeers());
  const app = await buildApp(prisma, MEMBER);
  const response = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
  await app.close();
  expect(response.statusCode).toBe(200);
  return {
    participants: response.json().data.participants as Record<string, unknown>[],
    body: response.body,
    prisma,
  };
};

describe('#15717 — GET /conversations/:id sert accountClosed', () => {
  it('un pair au compte fermé porte accountClosed: true', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === 'p-closed')?.accountClosed).toBe(true);
  });

  it('un pair actif ne porte aucune clé accountClosed', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === 'p-open')).not.toHaveProperty('accountClosed');
  });

  it('un invité anonyme ne porte aucune clé accountClosed', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === 'p-guest')).not.toHaveProperty('accountClosed');
  });

  it('rien d\'autre du compte ne part à côté du booléen', async () => {
    const { participants, body } = await served();
    const closed = participants.find((p) => p.id === 'p-closed') as Record<string, unknown>;
    expect(closed).not.toHaveProperty('deletedAt');
    expect(closed).not.toHaveProperty('deactivatedAt');
    expect(body).not.toContain('deletedAt');
    expect(body).not.toContain('deactivatedAt');
    expect((closed.user as Record<string, unknown> | undefined) ?? {}).not.toHaveProperty('isActive');
  });

  it('demande user.isActive au chargement des participants', async () => {
    const { prisma } = await served();
    const args = prisma.conversation.findFirst.mock.calls[0][0];
    expect(args.select.participants.select.user.select.isActive).toBe(true);
  });
});
