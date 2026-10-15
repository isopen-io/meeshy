/**
 * #10713 — le contour d'avatar ÉQUIPÉ voyage avec le participant, sur la fiche
 * de conversation : `profileDecor.avatarRing`, la même forme que `/me` et le
 * profil public. Charge ADDITIVE : un participant sans contour (ou un invité,
 * sans compte) n'en porte pas, et un ancien client ignore la clé. Témoin par la
 * route et le vrai contrat de fil (fast-json-stringify).
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

const servedParticipants = async (row = ROW()) => {
  const prisma = makePrisma();
  prisma.conversation.findFirst.mockResolvedValue(row);
  const app = await buildApp(prisma, MEMBER);
  const response = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
  await app.close();
  expect(response.statusCode).toBe(200);
  return { participants: response.json().data.participants as Record<string, unknown>[], prisma };
};

describe('#10713 — GET /conversations/:id sert le contour de chaque participant', () => {
  it('sert le contour équipé, résolu au registre (builtin, sans contrat)', async () => {
    const { participants } = await servedParticipants();
    const ana = participants.find((p) => p.id === 'p-1');
    expect(ana?.profileDecor).toEqual({ avatarRing: { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null } });
  });

  it('ne sert jamais la colonne brute', async () => {
    const { participants } = await servedParticipants();
    const ana = participants.find((p) => p.id === 'p-1') as Record<string, unknown>;
    expect(JSON.stringify(ana)).not.toContain('equippedAvatarRing');
  });

  it('un invité sans compte ne porte aucun décor', async () => {
    const { participants } = await servedParticipants();
    expect(participants.find((p) => p.id === 'p-guest')).not.toHaveProperty('profileDecor');
  });

  it('un contour qui n’existe plus au registre ne sert rien (jamais une erreur)', async () => {
    const row = ROW();
    const gone = row.participants.map((p) => (p.id === 'p-1' ? { ...p, user: { ...p.user, equippedAvatarRing: 'disparu/rien' } } : p));
    const { participants } = await servedParticipants(ROW_WITH(gone));
    expect(participants.find((p) => p.id === 'p-1')).not.toHaveProperty('profileDecor');
  });

  it('demande la colonne du contour au chargement des participants', async () => {
    const { prisma } = await servedParticipants();
    const args = prisma.conversation.findFirst.mock.calls[0][0];
    expect(JSON.stringify(args)).toContain('"equippedAvatarRing":true');
  });
});
