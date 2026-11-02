/**
 * **LA DEMANDE DE MESSAGE DU LECTEUR ATTEINT LE FIL** (#14107, MSG-01/02) — et
 * `?requests=` sépare la liste principale de la boîte de demandes. Même patron
 * que le témoin des réglages de conteneur (#6908), dont ce harnais est repris :
 *
 * `conversation-list-select-parity.test.ts` garde que le `select` RÉELLEMENT
 * exécuté par `GET /conversations` (`conversationListQuerySelect`) charge
 * `description`, `defaultWriteRole`, `slowModeSeconds` et
 * `autoTranslateEnabled`. Ce fichier ferme la boucle par la route COMPLÈTE
 * (`app.inject`), sur le même patron que `conversations.bridge.test.ts` : un
 * `select` juste ne suffit pas si le mapper qui construit la réponse ne
 * transporte pas la colonne jusqu'au fil (piège `_count`/`memberCount`, même
 * fichier), et un schéma qui DÉCLARE les champs ne suffit pas si la requête ne
 * les charge jamais (#6908 lui-même — la fonction corrigée en 2026-09-11
 * n'était appelée par aucune route).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439101';
const PARTICIPANT_ID = '507f1f77bcf86cd799439201';

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
    _count: { participants: 2 },
    defaultWriteRole: 'moderator',
    isAnnouncementChannel: true,
    slowModeSeconds: 30,
    autoTranslateEnabled: false,
    participants: [
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

const REQUEST_SINCE = new Date('2026-11-01T08:00:00.000Z');

function makePrisma(conversations: any[]): any {
  return {
    conversation: {
      findMany: jest.fn(async () => conversations),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => conversations.length),
    },
    participant: {
      findMany: jest.fn(async (args: any) =>
        args?.where?.messageRequestAt && args.where.userId === USER_ID
          ? [{ conversationId: CONV_ID, messageRequestAt: REQUEST_SINCE, messageRequestRisk: 80 }]
          : []
      ),
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

describe('GET /conversations — la boîte de demandes (#14107)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sert la demande en attente du lecteur : datée, filtrée selon son score, médias floutés', async () => {
    const prisma = makePrisma([makeConversation({ type: 'direct', title: null })]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].messageRequest).toEqual({ since: REQUEST_SINCE.toISOString(), filtered: true, mediaBlurred: true });
    await app.close();
  });

  it('une conversation ordinaire porte messageRequest: null', async () => {
    const prisma = makePrisma([makeConversation({ id: '507f1f77bcf86cd799439102' })]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    expect(res.json().data[0].messageRequest).toBeNull();
    await app.close();
  });

  it('?requests=exclude ne garde que les conversations où le LECTEUR n\'a pas de demande en attente', async () => {
    const prisma = makePrisma([]);
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/conversations?requests=exclude', headers: { authorization: 'Bearer x' } });
    const where = JSON.stringify(prisma.conversation.findMany.mock.calls[0][0].where);
    expect(where).toContain('"messageRequestAt":null');
    expect(where).toContain(`"userId":"${USER_ID}"`);
    await app.close();
  });

  it('sans ?requests=, la liste reste celle d\'avant le lot (un ancien client ne perd rien)', async () => {
    const prisma = makePrisma([]);
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    expect(JSON.stringify(prisma.conversation.findMany.mock.calls[0][0].where)).not.toContain('messageRequest');
    await app.close();
  });

  it('refuse une valeur inconnue de ?requests=', async () => {
    const prisma = makePrisma([]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/conversations?requests=all', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
