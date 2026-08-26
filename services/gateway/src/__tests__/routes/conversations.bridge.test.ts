/**
 * G-123 — l'attache du pont ✦ sur `GET /conversations`.
 *
 * Le service (`ConversationBridgeService`, G-122) est mocké : sa propre
 * correctness (non-N+1, droits de lecture, absence à `unreadCount === 0`)
 * est couverte par `services/__tests__/ConversationBridgeService.test.ts`.
 * Ce fichier couvre L'ATTACHE : le mapper appelle le service avec les BONS
 * paramètres (candidats, `orchestratorInputs` — workshop A6), et le champ
 * `bridge`/`lastReadAt` survit JUSQU'AU PAYLOAD HTTP RÉEL — le piège précis
 * que `conversationMinimalSchema` (fast-json-stringify) tend : un mapper qui
 * pose le champ ne suffit pas si le schéma de la route ne le déclare pas
 * (même famille de trou que `customName`/`reaction`, déjà documentée dans ce
 * dépôt). D'où un test qui passe par la route COMPLÈTE (`app.inject`), pas
 * par le mapper seul.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_A = '507f1f77bcf86cd799439101';
const CONV_B = '507f1f77bcf86cd799439102';
const PARTICIPANT_A = '507f1f77bcf86cd799439201';
const PARTICIPANT_B = '507f1f77bcf86cd799439202';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

// `getPresenceVisibilityService` touche des collections (`user`, `friendRequest`)
// hors du périmètre de ce test — l'attache du pont, pas la visibilité de
// présence. Mocké comme le fait déjà `conversation-core.test.ts`.
jest.mock('../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async () => new Map(),
  }),
}));

// Le compteur de non-lus est contrôlé DIRECTEMENT par ce test (un candidat
// par scénario), pas recalculé depuis des curseurs simulés — sa propre
// correctness est couverte ailleurs (MessageReadStatusService.test.ts).
const mockGetUnreadCountsForUser = jest.fn<any>();
jest.mock('../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: (...args: any[]) => mockGetUnreadCountsForUser(...args),
  })),
}));

// Le service du pont (G-122) est mocké : ce fichier teste l'ATTACHE, pas la
// loi d'agrégation non-N+1 — déjà couverte par son propre témoin.
const mockBuildBridgeData = jest.fn<any>();
jest.mock('../../services/ConversationBridgeService', () => ({
  ConversationBridgeService: jest.fn().mockImplementation(() => ({
    buildBridgeData: (...args: any[]) => mockBuildBridgeData(...args),
  })),
}));

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_A,
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
        id: PARTICIPANT_A,
        conversationId: CONV_A,
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

describe('GET /conversations — attache du pont ✦ (G-123)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildBridgeData.mockResolvedValue(new Map());
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());
  });

  it('porte bridge et lastReadAt JUSQU’AU PAYLOAD HTTP RÉEL quand le service en rend un', async () => {
    const bridge = {
      kind: 'fallback',
      unreadCount: 4,
      suggestedMode: 'focal',
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 4 },
    };
    const lastReadAt = new Date('2026-08-09T12:00:00Z');
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 4]]));
    mockBuildBridgeData.mockResolvedValue(new Map([[CONV_A, { bridge, lastReadAt }]]));

    const prisma = makePrisma([makeConversation()]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].bridge).toEqual(bridge);
    expect(body.data[0].lastReadAt).toBe(lastReadAt.toISOString());

    await app.close();
  });

  it('laisse bridge et lastReadAt ABSENTS (jamais null) quand unreadCount === 0', async () => {
    mockGetUnreadCountsForUser.mockResolvedValue(new Map()); // aucune entrée ⇒ 0
    const prisma = makePrisma([makeConversation()]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect('bridge' in body.data[0]).toBe(false);
    expect('lastReadAt' in body.data[0]).toBe(false);
    // Le candidat à zéro non-lu n'entre même pas dans la passe du service.
    expect(mockBuildBridgeData).not.toHaveBeenCalled();

    await app.close();
  });

  it('laisse bridge ABSENT quand le service ne rend rien pour cette conversation (map vide)', async () => {
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 3]]));
    mockBuildBridgeData.mockResolvedValue(new Map()); // le service n'a rien à annoncer
    const prisma = makePrisma([makeConversation()]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect('bridge' in body.data[0]).toBe(false);

    await app.close();
  });

  it('appelle le service UNE FOIS pour toute la page — jamais une fois par conversation', async () => {
    const convB = makeConversation({
      id: CONV_B,
      identifier: 'conv-b',
      participants: [
        { ...makeConversation().participants[0], id: PARTICIPANT_B, conversationId: CONV_B },
      ],
    });
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 2], [CONV_B, 5]]));
    mockBuildBridgeData.mockResolvedValue(new Map());
    const prisma = makePrisma([makeConversation(), convB]);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

    expect(mockBuildBridgeData).toHaveBeenCalledTimes(1);
    const callArgs = mockBuildBridgeData.mock.calls[0][0] as { candidates: any[] };
    expect(callArgs.candidates).toEqual(
      expect.arrayContaining([
        { conversationId: CONV_A, unreadCount: 2 },
        { conversationId: CONV_B, unreadCount: 5 },
      ])
    );
    expect(callArgs.candidates).toHaveLength(2);
    // Le curseur de lecture, lui aussi, est batché — une seule lecture pour
    // toute la page, jamais une par conversation.
    expect(prisma.conversationReadCursor.findMany).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('ne change ni le tri ni la pagination — même ordre, même curseur, avec ou sans pont', async () => {
    const convB = makeConversation({
      id: CONV_B,
      identifier: 'conv-b',
      lastMessageAt: new Date('2026-08-05T00:00:00Z'),
      participants: [
        { ...makeConversation().participants[0], id: PARTICIPANT_B, conversationId: CONV_B },
      ],
    });
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 1]]));
    mockBuildBridgeData.mockResolvedValue(new Map());
    // Prisma rend déjà l'ordre trié (orderBy lastMessageAt desc) — la passe
    // ne re-trie jamais elle-même. A avant B ici prouve que l'attache du
    // pont ne réordonne rien après coup.
    const prisma = makePrisma([makeConversation(), convB]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
    const body = res.json();

    expect(body.data.map((c: any) => c.id)).toEqual([CONV_A, CONV_B]);
    expect(body.cursorPagination).toBeDefined();
    expect(body.pagination).toBeDefined();

    await app.close();
  });

  describe('A6 — orchestratorInputs (suggestedMode précalculé)', () => {
    it('fournit stickyChoice depuis UserConversationPreferences.readingMode déjà chargé (zéro requête de plus)', async () => {
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 6]]));
      mockBuildBridgeData.mockResolvedValue(new Map());
      const prisma = makePrisma([
        makeConversation({ userPreferences: [{ readingMode: 'resume' }] }),
      ]);
      const app = await buildApp(prisma);

      await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

      const callArgs = mockBuildBridgeData.mock.calls[0][0] as { orchestratorInputs: Map<string, any> };
      expect(callArgs.orchestratorInputs.get(CONV_A)?.stickyChoice).toBe('resume');

      await app.close();
    });

    it('retombe sur "auto" quand readingMode est absent ou hors énumération', async () => {
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 6]]));
      mockBuildBridgeData.mockResolvedValue(new Map());
      const prisma = makePrisma([makeConversation({ userPreferences: [] })]);
      const app = await buildApp(prisma);

      await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

      const callArgs = mockBuildBridgeData.mock.calls[0][0] as { orchestratorInputs: Map<string, any> };
      expect(callArgs.orchestratorInputs.get(CONV_A)?.stickyChoice).toBe('auto');

      await app.close();
    });

    it('passe activeParticipantCount: null — JAMAIS 0 (aucun décompte serveur honnête d’« actif »)', async () => {
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 6]]));
      mockBuildBridgeData.mockResolvedValue(new Map());
      const prisma = makePrisma([makeConversation()]);
      const app = await buildApp(prisma);

      await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

      const callArgs = mockBuildBridgeData.mock.calls[0][0] as { orchestratorInputs: Map<string, any> };
      expect(callArgs.orchestratorInputs.get(CONV_A)?.capabilities.riverEligibilityReason.current).toBeNull();

      await app.close();
    });

    it('fournit un lastOpenedAt réel depuis le curseur de lecture batché, jamais null par fabrication', async () => {
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 6]]));
      mockBuildBridgeData.mockResolvedValue(new Map());
      const lastReadAt = new Date('2026-07-01T08:00:00Z');
      const prisma = makePrisma([makeConversation()]);
      prisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: PARTICIPANT_A, lastReadAt },
      ]);
      const app = await buildApp(prisma);

      await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

      expect(prisma.conversationReadCursor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { participantId: { in: [PARTICIPANT_A] } } })
      );
      const callArgs = mockBuildBridgeData.mock.calls[0][0] as { orchestratorInputs: Map<string, any> };
      expect(callArgs.orchestratorInputs.get(CONV_A)?.lastOpenedAt).toBe(lastReadAt);

      await app.close();
    });

    // R6-6 — la LISTE lit `conversationReadCursor` une fois pour son propre
    // besoin (`lastOpenedAt` ci-dessus) ; ce même relevé est aussi transmis au
    // service, qui n'a donc plus à le relire lui-même (voir le témoin de
    // compteurs jumeau dans `ConversationBridgeService.test.ts`).
    it('transmet cursorsByParticipant au service — le levier de mutualisation R6-6 est bien branché', async () => {
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 6]]));
      mockBuildBridgeData.mockResolvedValue(new Map());
      const lastReadAt = new Date('2026-07-01T08:00:00Z');
      const lastReadMessageCreatedAt = new Date('2026-07-01T07:30:00Z');
      const prisma = makePrisma([makeConversation()]);
      prisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: PARTICIPANT_A, lastReadAt, lastReadMessageCreatedAt },
      ]);
      const app = await buildApp(prisma);

      await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

      // Sélection étendue : le service a aussi besoin de `lastReadMessageCreatedAt`.
      expect(prisma.conversationReadCursor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { participantId: true, lastReadAt: true, lastReadMessageCreatedAt: true },
        })
      );
      const callArgs = mockBuildBridgeData.mock.calls[0][0] as {
        cursorsByParticipant: Map<string, { lastReadAt: Date | null; lastReadMessageCreatedAt: Date | null }>;
      };
      expect(callArgs.cursorsByParticipant.get(PARTICIPANT_A)).toEqual({
        lastReadAt,
        lastReadMessageCreatedAt,
      });
      // Une seule lecture de la table pour toute la passe — la seconde
      // lecture (celle que le service ferait sans ce paramètre) est évitée
      // en amont : c'est exactement ce que compte le témoin jumeau du service.
      expect(prisma.conversationReadCursor.findMany).toHaveBeenCalledTimes(1);

      await app.close();
    });
  });

  describe('G-127 — étage agent : le pont `kind: agent` survit au schéma fast-json-stringify', () => {
    it('porte `text` + la paire E7 (`translations`/`originalLanguage`) JUSQU’AU PAYLOAD HTTP RÉEL', async () => {
      const bridge = {
        kind: 'agent',
        unreadCount: 5,
        suggestedMode: 'resume',
        text: "Alice et Bruno ont réglé l'horaire de vendredi.",
        translations: { en: 'Alice and Bruno settled the Friday schedule.' },
        originalLanguage: 'fr',
      };
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 5]]));
      mockBuildBridgeData.mockResolvedValue(new Map([[CONV_A, { bridge }]]));

      const prisma = makePrisma([makeConversation()]);
      const app = await buildApp(prisma);
      const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
      const body = res.json();

      expect(body.data[0].bridge).toEqual(bridge);
      expect(body.data[0].bridge.data).toBeUndefined();

      await app.close();
    });

    it("E7 honnête : `text` seul (translations/originalLanguage ABSENTS) — le fast-json-stringify ne les fabrique pas non plus", async () => {
      const bridge = {
        kind: 'agent',
        unreadCount: 2,
        suggestedMode: 'focal',
        text: 'Une phrase agent sans langue déclarée.',
      };
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 2]]));
      mockBuildBridgeData.mockResolvedValue(new Map([[CONV_A, { bridge }]]));

      const prisma = makePrisma([makeConversation()]);
      const app = await buildApp(prisma);
      const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
      const body = res.json();

      expect(body.data[0].bridge.text).toBe('Une phrase agent sans langue déclarée.');
      expect('translations' in body.data[0].bridge).toBe(false);
      expect('originalLanguage' in body.data[0].bridge).toBe(false);

      await app.close();
    });

    it('porte `isComplete: false` sur un pont `agent` (partialité traversant le changement d’étage, G-127)', async () => {
      const bridge = {
        kind: 'agent',
        unreadCount: 5,
        suggestedMode: 'focal',
        isComplete: false,
        text: 'Résumé sur une fenêtre tronquée.',
      };
      mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 5]]));
      mockBuildBridgeData.mockResolvedValue(new Map([[CONV_A, { bridge }]]));

      const prisma = makePrisma([makeConversation()]);
      const app = await buildApp(prisma);
      const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
      const body = res.json();

      expect(body.data[0].bridge.isComplete).toBe(false);

      await app.close();
    });
  });

  it('reste vert — aucun pont — quand le service échoue (le pont est un confort, la liste est le produit)', async () => {
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_A, 2]]));
    mockBuildBridgeData.mockRejectedValue(new Error('bridge down'));
    const prisma = makePrisma([makeConversation()]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect('bridge' in body.data[0]).toBe(false);

    await app.close();
  });
});
