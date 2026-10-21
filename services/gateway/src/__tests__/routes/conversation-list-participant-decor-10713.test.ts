/**
 * #10713 — la ligne de LISTE sert le contour équipé de ses participants
 * (`profileDecor.avatarRing`), pour que le pair d'une directe le porte dans la
 * liste. Charge ADDITIVE : sans contour, aucune clé. Témoin par la route
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

const servedParticipants = async () => {
  const prisma = makePrisma([makeConversation()]);
  const app = await buildApp(prisma);
  const res = await app.inject({ method: 'GET', url: '/conversations' });
  await app.close();
  expect(res.statusCode).toBe(200);
  return { participants: res.json().data[0].participants as Record<string, unknown>[], prisma };
};

describe('#10713 — GET /conversations sert le contour des participants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sert le contour équipé au niveau du participant', async () => {
    const { participants } = await servedParticipants();
    expect(participants.find((p) => p.id === PARTICIPANT_ID)?.profileDecor).toEqual({
      avatarRing: { pack: 'contours-essentiels', item: 'perle', origin: 'builtin', contract: null },
    });
  });

  it('ne sert jamais la colonne brute', async () => {
    const { participants } = await servedParticipants();
    expect(JSON.stringify(participants)).not.toContain('equippedAvatarRing');
  });

  it('un participant sans compte ne porte aucun décor', async () => {
    const { participants } = await servedParticipants();
    expect(participants.find((p) => p.id === GUEST_ID)).not.toHaveProperty('profileDecor');
  });

  it('demande la colonne du contour au chargement', async () => {
    const { prisma } = await servedParticipants();
    expect(JSON.stringify(prisma.conversation.findMany.mock.calls[0][0])).toContain('"equippedAvatarRing":true');
  });
});

/**
 * Les lectures de la route sur cette fixture, toutes tables confondues : le
 * contour vient de la jointure de l'aperçu, il n'en ajoute aucune — une
 * lecture de plus, conditionnelle ou non, fait tomber ce compte.
 */
const LIST_QUERIES = 5;

describe('#10945 — GET /conversations sert le contour du dernier expéditeur', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const lastMessage = (equippedAvatarRing: string | null) => ({
    id: '507f1f77bcf86cd799439301',
    conversationId: CONV_ID,
    content: 'salut',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-08-10T00:00:00Z'),
    senderId: PARTICIPANT_ID,
    translations: [],
    attachments: [],
    metadata: null,
    sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'Moi', avatar: null, type: 'user', user: { id: USER_ID, username: 'moi', displayName: 'Moi', avatar: null, equippedAvatarRing } },
  });

  const served = async (equippedAvatarRing: string | null) => {
    const prisma = makePrisma([makeConversation({ messages: [lastMessage(equippedAvatarRing)] })]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/conversations' });
    await app.close();
    expect(res.statusCode).toBe(200);
    return { sender: res.json().data[0].lastMessage.sender as Record<string, unknown>, body: res.body, prisma };
  };

  it('sert lastMessage.sender.profileDecor, jamais la colonne', async () => {
    const { sender, body } = await served('contours-essentiels/perle');
    expect(sender.profileDecor).toEqual({ avatarRing: { pack: 'contours-essentiels', item: 'perle', origin: 'builtin', contract: null } });
    expect(body).not.toContain('equippedAvatarRing');
  });

  it('aucune clé sans contour', async () => {
    const { sender } = await served(null);
    expect(sender).not.toHaveProperty('profileDecor');
  });

  it('le contour vient de la requête de liste : aucune lecture de plus', async () => {
    const calls = (prisma: Record<string, Record<string, { mock: { calls: unknown[] } }>>) =>
      Object.values(prisma).flatMap((model) => Object.values(model)).reduce((total, fn) => total + fn.mock.calls.length, 0);
    const bare = await served(null);
    const { prisma } = await served('contours-essentiels/perle');
    expect(calls(prisma)).toBe(calls(bare.prisma));
    expect(prisma.conversation.findMany).toHaveBeenCalledTimes(2);
    expect(calls(prisma)).toBe(LIST_QUERIES);
    const query = prisma.conversation.findMany.mock.calls[0][0] as { select: { messages: { select: { sender: { select: { user: { select: Record<string, unknown> } } } } } } };
    expect(query.select.messages.select.sender.select.user.select).toMatchObject({ equippedAvatarRing: true });
  });
});
