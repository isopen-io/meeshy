/**
 * La frontière de lecture DU LECTEUR (`lastReadMessageId`, `lastReadAt`,
 * `lastReadMessageCreatedAt`) sur `GET /conversations` et
 * `GET /conversations/:id` — issue #7198.
 *
 * Avant ce lot, ces trois champs n'étaient JAMAIS servis par le détail, et
 * seul `lastReadAt` fuyait par la liste — SEULEMENT quand le pont ✦
 * s'affichait (`unreadCount > 0`, `ConversationBridgeService` avait quelque
 * chose à annoncer). Une conversation ENTIÈREMENT lue (`unreadCount === 0`),
 * pourtant la plus fréquente, ne portait donc jamais sa propre frontière —
 * exactement ce dont D-L2 (ouverture sur le séparateur) et le séparateur
 * « — N messages non lus — » (D-L3) ont besoin côté client, indépendamment du
 * pont. Ce fichier prouve la levée de cette dépendance.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439101';
const PARTICIPANT_ID = '507f1f77bcf86cd799439201';
const LAST_READ_MESSAGE_ID = '507f1f77bcf86cd799439301';

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

// Le compteur de non-lus est contrôlé DIRECTEMENT par ce test : la preuve de
// ce lot est justement que la frontière survit à `unreadCount === 0`.
const mockGetUnreadCountsForUser = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
jest.mock('../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: (...args: any[]) => mockGetUnreadCountsForUser(...args),
    getUnreadCount: (...args: any[]) => mockGetUnreadCount(...args),
  })),
}));

// Le pont ✦ (G-123) n'est pas ce que ce fichier vérifie — mocké à vide,
// comme `conversations.bridge.test.ts`.
const mockBuildBridgeData = jest.fn<any>();
jest.mock('../../services/ConversationBridgeService', () => ({
  ConversationBridgeService: jest.fn().mockImplementation(() => ({
    buildBridgeData: (...args: any[]) => mockBuildBridgeData(...args),
  })),
}));

const mockCanAccessConversation = jest.fn<any>();
const mockResolveCallerParticipant = jest.fn<any>();
jest.mock('../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
  resolveCallerParticipant: (...args: any[]) => mockResolveCallerParticipant(...args),
}));

function makeListConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    title: 'Conv',
    type: 'direct',
    identifier: 'conv-a',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-10T00:00:00Z'),
    lastMessageAt: new Date('2026-08-10T00:00:00Z'),
    banner: null,
    avatar: null,
    communityId: null,
    _count: { participants: 2 },
    isAnnouncementChannel: false,
    participants: [
      {
        id: PARTICIPANT_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        type: 'user',
        displayName: 'Moi',
        avatar: null,
        role: 'member',
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

function makeListPrisma(conversations: any[]): any {
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

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../routes/conversations/core');
  registerCoreRoutes(app, prisma, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

describe('frontière de lecture — GET /conversations (#7198)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildBridgeData.mockResolvedValue(new Map());
    mockGetUnreadCountsForUser.mockResolvedValue(new Map()); // unreadCount === 0 partout
  });

  it("sert lastReadMessageId/lastReadAt/lastReadMessageCreatedAt MÊME quand unreadCount === 0 (pas de pont)", async () => {
    const lastReadAt = new Date('2026-09-20T10:00:00Z');
    const lastReadMessageCreatedAt = new Date('2026-09-20T09:59:00Z');
    const prisma = makeListPrisma([makeListConversation()]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([
      { participantId: PARTICIPANT_ID, lastReadMessageId: LAST_READ_MESSAGE_ID, lastReadAt, lastReadMessageCreatedAt },
    ]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    // Le pont ✦ n'apparaît PAS — la frontière ne dépend plus de lui.
    expect('bridge' in body.data[0]).toBe(false);
    expect(mockBuildBridgeData).not.toHaveBeenCalled();

    expect(body.data[0].lastReadMessageId).toBe(LAST_READ_MESSAGE_ID);
    expect(body.data[0].lastReadAt).toBe(lastReadAt.toISOString());
    expect(body.data[0].lastReadMessageCreatedAt).toBe(lastReadMessageCreatedAt.toISOString());

    await app.close();
  });

  it('lit lastReadMessageId dans le SELECT du curseur (pas seulement lastReadAt/lastReadMessageCreatedAt)', async () => {
    const prisma = makeListPrisma([makeListConversation()]);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

    expect(prisma.conversationReadCursor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ lastReadMessageId: true, lastReadAt: true, lastReadMessageCreatedAt: true }),
      })
    );

    await app.close();
  });

  it('laisse les TROIS champs ABSENTS (jamais null) quand aucun curseur n’existe', async () => {
    const prisma = makeListPrisma([makeListConversation()]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect('lastReadMessageId' in body.data[0]).toBe(false);
    expect('lastReadAt' in body.data[0]).toBe(false);
    expect('lastReadMessageCreatedAt' in body.data[0]).toBe(false);

    await app.close();
  });

  it('lit le curseur de lecture UNE SEULE FOIS pour toute la page (le pont réutilise la même lecture)', async () => {
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_ID, 3]])); // fait aussi entrer le pont
    const prisma = makeListPrisma([makeListConversation()]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([
      { participantId: PARTICIPANT_ID, lastReadMessageId: LAST_READ_MESSAGE_ID, lastReadAt: new Date(), lastReadMessageCreatedAt: new Date() },
    ]);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

    expect(prisma.conversationReadCursor.findMany).toHaveBeenCalledTimes(1);
    expect(mockBuildBridgeData).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

describe('frontière de lecture — GET /conversations/:id (#7198)', () => {
  const makeFullConversation = (overrides: Record<string, unknown> = {}) => ({
    id: CONV_ID,
    identifier: 'conv-a',
    type: 'direct',
    title: null,
    description: null,
    avatar: null,
    banner: null,
    communityId: null,
    isActive: true,
    lastMessageAt: new Date('2026-08-10T00:00:00Z'),
    defaultWriteRole: 'everyone',
    isAnnouncementChannel: false,
    slowModeSeconds: 0,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-10T00:00:00Z'),
    encryptionMode: null,
    encryptionProtocol: null,
    encryptionEnabledAt: null,
    encryptionEnabledBy: null,
    serverEncryptionKeyId: null,
    autoTranslateEnabled: null,
    _count: { participants: 2 },
    ...overrides,
  });

  function makeDetailPrisma(conversation: any): any {
    return {
      conversation: {
        findFirst: jest.fn(async () => conversation),
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessConversation.mockResolvedValue(true);
    mockResolveCallerParticipant.mockResolvedValue({ id: PARTICIPANT_ID, role: 'member' });
    mockGetUnreadCount.mockResolvedValue(0);
  });

  it('sert lastReadMessageId/lastReadAt/lastReadMessageCreatedAt SANS `?fields=` (profil par défaut)', async () => {
    const lastReadAt = new Date('2026-09-20T10:00:00Z');
    const lastReadMessageCreatedAt = new Date('2026-09-20T09:59:00Z');
    const prisma = makeDetailPrisma(makeFullConversation());
    (prisma as any).conversationReadCursor = {
      findMany: jest.fn(async () => [
        { participantId: PARTICIPANT_ID, lastReadMessageId: LAST_READ_MESSAGE_ID, lastReadAt, lastReadMessageCreatedAt },
      ]),
    };
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}`, headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.lastReadMessageId).toBe(LAST_READ_MESSAGE_ID);
    expect(body.data.lastReadAt).toBe(lastReadAt.toISOString());
    expect(body.data.lastReadMessageCreatedAt).toBe(lastReadMessageCreatedAt.toISOString());

    await app.close();
  });

  it('laisse les TROIS champs ABSENTS (jamais null) quand aucun curseur n’existe pour ce lecteur', async () => {
    const prisma = makeDetailPrisma(makeFullConversation());
    (prisma as any).conversationReadCursor = { findMany: jest.fn(async () => []) };
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}`, headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect('lastReadMessageId' in body.data).toBe(false);
    expect('lastReadAt' in body.data).toBe(false);
    expect('lastReadMessageCreatedAt' in body.data).toBe(false);

    await app.close();
  });

  it('respecte `?fields=lastReadMessageId` — restreint aux champs nommés, épinglé `id` compris', async () => {
    const lastReadAt = new Date('2026-09-20T10:00:00Z');
    const prisma = makeDetailPrisma(makeFullConversation());
    (prisma as any).conversationReadCursor = {
      findMany: jest.fn(async () => [
        { participantId: PARTICIPANT_ID, lastReadMessageId: LAST_READ_MESSAGE_ID, lastReadAt, lastReadMessageCreatedAt: null },
      ]),
    };
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}?fields=lastReadMessageId`,
      headers: { authorization: 'Bearer x' },
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.id).toBe(CONV_ID);
    expect(body.data.lastReadMessageId).toBe(LAST_READ_MESSAGE_ID);
    expect('lastReadAt' in body.data).toBe(false);
    expect('unreadCount' in body.data).toBe(false);

    await app.close();
  });
});
