/**
 * #10205 — `GET /conversations` lu par un INVITÉ (session de lien, sans compte
 * Meeshy) : sa ligne de liste ne porte ni l'effectif ni les autres membres —
 * sa seule ligne de participant survit. Un compte garde tout. Témoin par la
 * route complète (`app.inject`) et le vrai contrat de fil.
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
        user: { id: USER_ID, username: 'moi', displayName: 'Moi', firstName: null, lastName: null, isOnline: true, lastActiveAt: null },
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
const GUEST = {
  type: 'anonymous',
  isAuthenticated: true,
  isAnonymous: true,
  userId: GUEST_ID,
  participantId: GUEST_ID,
  hasFullAccess: false,
};

async function buildApp(prisma: PrismaClient, authContext: Record<string, unknown>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = authContext;
  };
  const { registerCoreRoutes } = await import('../../routes/conversations/core');
  registerCoreRoutes(app, prisma, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

const row = async (authContext: Record<string, unknown>) => {
  const app = await buildApp(makePrisma([makeConversation()]), authContext);
  const res = await app.inject({ method: 'GET', url: '/conversations' });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data[0] as Record<string, unknown>;
};

describe('#10205 — GET /conversations lu par un invité', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('la ligne de l’invité ne porte aucun effectif', async () => {
    const served = await row(GUEST);
    expect(served).not.toHaveProperty('memberCount');
    expect(served).not.toHaveProperty('memberCountCapped');
  });

  it('la ligne de l’invité ne porte que SA participation', async () => {
    const served = await row(GUEST);
    expect((served.participants as { id: string }[]).map((p) => p.id)).toEqual([GUEST_ID]);
  });

  it('un compte Meeshy garde l’effectif et les membres', async () => {
    const served = await row(MEMBER);
    expect(served.memberCount).toBe(12);
    expect((served.participants as { id: string }[]).map((p) => p.id)).toEqual([GUEST_ID, PARTICIPANT_ID]);
  });
});
