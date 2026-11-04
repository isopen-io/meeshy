/**
 * #15717 — la ligne de LISTE dit qu'un interlocuteur a fermé son compte
 * (supprimé OU désactivé) par UN booléen au niveau du participant,
 * `accountClosed`, présent seulement à vrai. Charge ADDITIVE : un compte actif
 * ou un anonyme ne porte aucune clé, et rien d'autre du compte ne part à côté
 * (ni `deletedAt`, ni `deactivatedAt`, ni `user.isActive`). Témoin par la route
 * complète (`app.inject`) et le vrai contrat de fil.
 *
 * @jest-environment node
 */


import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439101';
const PARTICIPANT_ID = '507f1f77bcf86cd799439201';
const GUEST_ID = '507f1f77bcf86cd799439202';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

jest.mock('../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async () => new Map(),
  }),
}));

jest.mock('../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: async () => new Map(),
  })),
}));

jest.mock('../../services/ConversationBridgeService', () => ({
  ConversationBridgeService: jest.fn().mockImplementation(() => ({
    buildBridgeData: async () => new Map(),
  })),
}));

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    title: 'Groupe',
    description: 'Une description bien réelle',
    type: 'group',
    identifier: 'groupe-test',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-10T00:00:00Z'),
    lastMessageAt: new Date('2026-08-10T00:00:00Z'),
    banner: null,
    avatar: null,
    communityId: null,
    _count: { participants: 12 },
    defaultWriteRole: 'moderator',
    isAnnouncementChannel: true,
    slowModeSeconds: 30,
    autoTranslateEnabled: false,
    participants: [
      {
        id: GUEST_ID,
        conversationId: CONV_ID,
        userId: null,
        type: 'anonymous',
        displayName: 'Invité',
        avatar: null,
        role: 'member',
        language: 'fr',
        nickname: null,
        joinedAt: new Date('2026-01-02T00:00:00Z'),
        isActive: true,
        isOnline: true,
        lastActiveAt: null,
        user: null,
      },
      {
        id: PARTICIPANT_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        type: 'user',
        displayName: 'Moi',
        avatar: null,
        role: 'creator',
        language: 'fr',
        nickname: null,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        isActive: true,
        isOnline: true,
        lastActiveAt: null,
        user: { id: USER_ID, username: 'moi', displayName: 'Moi', firstName: null, lastName: null, isOnline: true, lastActiveAt: null, equippedAvatarRing: 'contours-essentiels/perle' },
      },
    ],
    userPreferences: [],
    messages: [],
    ...overrides,
  };
}

function makePrisma(conversations: any[]): any {
  return {
    conversation: {
      findMany: jest.fn(async () => conversations),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => conversations.length),
    },
    participant: {
      findMany: jest.fn(async () => []),
    },
    conversationReadCursor: {
      findMany: jest.fn(async () => []),
    },
  };
}

const MEMBER = {
  type: 'user',
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID, role: 'USER' },
  hasFullAccess: true,
};

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = MEMBER;
  };
  const { registerCoreRoutes } = await import('../../routes/conversations/core');
  registerCoreRoutes(app, prisma, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

const CLOSED_ID = '507f1f77bcf86cd799439203';
const OPEN_ID = '507f1f77bcf86cd799439204';
const CLOSED_USER_ID = '507f1f77bcf86cd799439002';
const OPEN_USER_ID = '507f1f77bcf86cd799439003';

const account = (id: string, isActive: boolean) => ({
  id,
  username: `u${id.slice(-3)}`,
  displayName: 'Pair',
  firstName: null,
  lastName: null,
  isOnline: false,
  lastActiveAt: null,
  isActive,
  deletedAt: isActive ? null : new Date('2026-10-01T00:00:00Z'),
  deactivatedAt: null,
});

const peer = (id: string, userId: string, isActive: boolean) => ({
  id,
  conversationId: CONV_ID,
  userId,
  type: 'user',
  displayName: 'Pair',
  avatar: null,
  role: 'member',
  language: 'fr',
  nickname: null,
  joinedAt: new Date('2026-01-03T00:00:00Z'),
  isActive: true,
  isOnline: false,
  lastActiveAt: null,
  user: account(userId, isActive),
});

const withPeers = () => {
  const base = makeConversation();
  const [guest, me] = base.participants as Record<string, unknown>[];
  return makeConversation({
    participants: [
      guest,
      me,
      peer(CLOSED_ID, CLOSED_USER_ID, false),
      peer(OPEN_ID, OPEN_USER_ID, true),
    ],
  });
};

const served = async () => {
  const prisma = makePrisma([withPeers()]);
  const app = await buildApp(prisma);
  const res = await app.inject({ method: 'GET', url: '/conversations' });
  await app.close();
  expect(res.statusCode).toBe(200);
  return {
    participants: res.json().data[0].participants as Record<string, unknown>[],
    body: res.body,
    prisma,
  };
};

describe('#15717 — GET /conversations sert accountClosed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('un pair au compte fermé porte accountClosed: true', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === CLOSED_ID)?.accountClosed).toBe(true);
  });

  it('un pair actif ne porte aucune clé accountClosed', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === OPEN_ID)).not.toHaveProperty('accountClosed');
  });

  it('un invité anonyme ne porte aucune clé accountClosed', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === GUEST_ID)).not.toHaveProperty('accountClosed');
  });

  it('rien d\'autre du compte ne part à côté du booléen', async () => {
    const { participants, body } = await served();
    const closed = participants.find((p) => p.id === CLOSED_ID) as Record<string, unknown>;
    expect(closed).not.toHaveProperty('deletedAt');
    expect(closed).not.toHaveProperty('deactivatedAt');
    expect(body).not.toContain('deletedAt');
    expect(body).not.toContain('deactivatedAt');
    expect((closed.user as Record<string, unknown> | undefined) ?? {}).not.toHaveProperty('isActive');
  });

  it('charge user.isActive sans ajouter aucune lecture', async () => {
    const { prisma } = await served();
    const query = prisma.conversation.findMany.mock.calls[0][0] as {
      select: { participants: { select: { user: { select: Record<string, unknown> } } } };
    };
    expect(query.select.participants.select.user.select.isActive).toBe(true);
    expect(prisma.conversation.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.participant.findMany.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
