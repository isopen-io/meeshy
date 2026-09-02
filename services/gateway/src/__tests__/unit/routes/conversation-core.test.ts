import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Top-level mock variables (hoisted before jest.mock calls) ────────────────

const mockResolveConversationId = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();
const mockIsBlockedBetween = jest.fn<any>();
const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any, extra?: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any, extra?: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => Object.assign(reply, { _body: { success: false, error: msg } }));
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockGenerateConversationIdentifier = jest.fn<any>().mockReturnValue('auto-id');
const mockGenerateCompactConversationIdentifier = jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl');
const mockEnsureUniqueConversationIdentifier = jest.fn<any>().mockResolvedValue('mshy_unique');
const mockBuildCursorPaginationMeta = jest.fn<any>().mockReturnValue({ nextCursor: null, hasMore: false });
const mockSendWithETag = jest.fn<any>().mockReturnValue(false);
const mockGenerateDefaultConversationTitle = jest.fn<any>().mockReturnValue('Generated Title');
const mockValidateSchema = jest.fn<any>();
const mockCreateError = jest.fn<any>((code: string, msg?: string) => {
  const e = new Error(msg || code) as any;
  e.code = code;
  return e;
});
const mockSendErrorResponse = jest.fn<any>();

// ─── jest.mock calls (hoisted) ────────────────────────────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  // `resolveCallerParticipant` reste REEL : c'est sa regle de precedence
  // (`participantId` avant `userId`) que les tests d'invite anonyme verifient.
  // La stubber rendrait ces tests tautologiques.
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as object),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...args: any[]) => mockIsBlockedBetween(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: (...args: any[]) => mockGenerateConversationIdentifier(...args),
  generateCompactConversationIdentifier: (...args: any[]) => mockGenerateCompactConversationIdentifier(...args),
  ensureUniqueConversationIdentifier: (...args: any[]) => mockEnsureUniqueConversationIdentifier(...args),
}));

// `jest.requireActual` + surcharge CIBLÉE : `GET /conversations` route désormais
// son `limit`/`offset` par le SSOT `validatePagination` (garde `take: NaN`/négatif
// → 500). Un double partiel du module l'aurait rendu `undefined` — le piège du
// double partiel documenté dans `services/gateway/CLAUDE.md`.
jest.mock('../../../utils/pagination', () => ({
  ...(jest.requireActual('../../../utils/pagination') as Record<string, unknown>),
  buildCursorPaginationMeta: (...args: any[]) => mockBuildCursorPaginationMeta(...args),
}));

jest.mock('../../../utils/etag', () => ({
  sendWithETag: (...args: any[]) => mockSendWithETag(...args),
}));

// `resolveUserLanguagesOrdered` garde son implémentation RÉELLE : c'est la
// seule autorité du dépôt sur l'ordre du Prisme (systemLanguage →
// regionalLanguage → customDestinationLanguage → deviceLocale) et sur la
// normalisation des codes. Le doubler ici transformerait les témoins d'aperçu
// traduit en tautologies.
jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  ...(jest.requireActual('@meeshy/shared/utils/conversation-helpers') as Record<string, unknown>),
  generateDefaultConversationTitle: (...args: any[]) => mockGenerateDefaultConversationTitle(...args),
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: (...args: any[]) => mockCreateError(...args),
  sendErrorResponse: (...args: any[]) => mockSendErrorResponse(...args),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  ConversationSchemas: { create: {} },
  validateSchema: (...args: any[]) => mockValidateSchema(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
    getUnreadCount: jest.fn().mockResolvedValue(0),
  })),
}));

// Gate de présence — régime STRICT (2026-08-25) : la co-participation n'ouvre
// rien, seul le viewer (soi / ADMIN+ / ami accepté) voit `isOnline` et
// `lastActiveAt` d'un co-participant ou de l'expéditeur du dernier message.
// Carte vide par défaut pour les témoins qui ne parlent pas de présence ; les
// témoins du régime strict installent `lawFaithfulResolver`, qui applique la
// VRAIE loi partagée à un ensemble d'amis piloté par le test.
const mockResolveForTargets = jest.fn<any>();

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationListResponseSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
  createConversationRequestSchema: { type: 'object' },
  updateConversationRequestSchema: { type: 'object' },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_NEW: 'conversation:new',
    CONVERSATION_UPDATED: 'conversation:updated',
    CONVERSATION_CLOSED: 'conversation:closed',
  },
  ROOMS: {
    user: (id: string) => `user:${id}`,
    conversation: (id: string) => `conversation:${id}`,
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/conversations/core';
import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer } from '../../../services/PresenceVisibilityService';
// Le cap n'est pas recopié ici : un témoin de troncature qui invente son propre
// seuil passe au vert le jour où le vrai bouge.
import { CONVERSATION_TOMBSTONE_LIMIT } from '../../../routes/conversations/utils/delta-tombstones';
import { MEMBER_COUNT_DISPLAY_CAP } from '@meeshy/shared/utils/member-visibility';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const OTHER_USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const COMMUNITY_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = (): any => ({
  conversation: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: CONV_ID,
      type: 'direct',
      title: null,
      createdAt: new Date(),
      participants: [],
    }),
    update: jest.fn().mockResolvedValue({ id: CONV_ID, participants: [] }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  message: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  community: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  communityMember: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
  agentConversationSummary: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  agentUserRole: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  agentAnalysisSnapshot: {
    findMany: jest.fn().mockResolvedValue([]),
  },
});

type Routes = Record<string, Record<string, Function>>;

const createMockFastify = () => {
  const routes: Routes = {};
  const mockEmit = jest.fn();
  // Le double CHAÎNE, comme le vrai `BroadcastOperator` de Socket.IO :
  // `io.to(a).to(b).emit(...)` est la forme qui garantit « au plus une copie
  // par socket », et un `to()` qui ne rendait qu'un `{ emit }` la rendait
  // intestable — pire, il faisait planter tout appelant qui chaîne.
  const broadcast: Record<string, unknown> = { emit: mockEmit };
  const mockTo = jest.fn(() => broadcast);
  broadcast.to = mockTo;
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockJoinRoom = jest.fn().mockResolvedValue(undefined);
  const mockEndLiveLocations = jest.fn();
  const mockGetManager = jest.fn().mockReturnValue({
    getIO: mockGetIO,
    joinUserToConversationRoom: mockJoinRoom,
    endLiveLocationsForClosedConversation: mockEndLiveLocations,
  });

  const fastify: any = {
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    post: jest.fn((path: string, opts: any, handler: Function) => {
      routes['POST'] = routes['POST'] || {};
      routes['POST'][path] = handler;
    }),
    put: jest.fn((path: string, opts: any, handler: Function) => {
      routes['PUT'] = routes['PUT'] || {};
      routes['PUT'][path] = handler;
    }),
    delete: jest.fn((path: string, opts: any, handler: Function) => {
      routes['DELETE'] = routes['DELETE'] || {};
      routes['DELETE'][path] = handler;
    }),
    patch: jest.fn((path: string, opts: any, handler: Function) => {
      routes['PATCH'] = routes['PATCH'] || {};
      routes['PATCH'][path] = handler;
    }),
    // `fastify.route` — l'idiome multi-verbes. Ce double le portait pas, si bien
    // qu'une route enregistrée ainsi faisait tomber TOUTE la suite sur un
    // `fastify.route is not a function` : un double partiel perd en silence ce
    // que le module gagne, et ne se signale qu'au moment où le module grandit.
    // Il enregistre le handler sous CHAQUE méthode déclarée, comme Fastify.
    route: jest.fn((opts: any) => {
      const methods: string[] = Array.isArray(opts.method) ? opts.method : [opts.method];
      methods.forEach((method) => {
        routes[method] = routes[method] || {};
        routes[method][opts.url] = opts.handler;
      });
    }),
    socketIOHandler: {
      getManager: mockGetManager,
    },
    notificationService: null,
    mentionService: null,
    translationService: null,
    presenceChecker: null,
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
    _mockJoinRoom: mockJoinRoom,
    _mockEndLiveLocations: mockEndLiveLocations,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  // Try exact match first, then substring match
  const key = Object.keys(methodRoutes).find(k => k === pathFragment)
    ?? Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}) => ({
  authContext: {
    type: 'user',
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
    isAnonymous: false,
    sessionToken: null,
  },
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

const makeReply = () => {
  const reply: any = {
    _body: null,
    status: jest.fn().mockReturnThis(),
    send: jest.fn((body?: any) => { if (body !== undefined) reply._body = body; return reply; }),
    code: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
};

const PRESENCE_HIDDEN = { showOnline: false, showLastSeenTimestamp: false } as const;

const lawFaithfulResolver =
  (friendsOfViewer: ReadonlySet<string> = new Set()) =>
  async (viewer: PresenceViewer, ids: readonly string[]) =>
    new Map(
      ids.map((id) => [
        id,
        viewer
          ? resolvePresenceVisibility({
              isSelf: viewer.userId === id,
              viewerRole: viewer.role,
              areConnected: friendsOfViewer.has(id),
              targetShowOnlineStatus: true,
              targetShowLastSeen: true,
              targetIsDeactivated: false,
              isBlockedEitherWay: false,
            })
          : PRESENCE_HIDDEN,
      ]),
    );

// `type: 'user'` est la forme RÉELLE que pose `createUnifiedAuthMiddleware`
// pour un inscrit : c'est sur elle que `viewerFromRequest` construit le viewer
// de présence. Un visiteur de lien partagé porte `type: 'anonymous'` et un
// `Participant.id` — jamais de rôle plateforme.
const makeViewerRequest = (viewer: { role: string } | 'anonymous', overrides: any = {}) =>
  makeRequest({
    authContext:
      viewer === 'anonymous'
        ? { type: 'anonymous', isAuthenticated: true, userId: PARTICIPANT_ID, isAnonymous: true, sessionToken: 'tok', registeredUser: null }
        : { type: 'user', isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: viewer.role }, isAnonymous: false, sessionToken: null },
    query: {},
    ...overrides,
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerCoreRoutes', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let fastify: ReturnType<typeof createMockFastify>;
  const optionalAuth = jest.fn();
  const requiredAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    fastify = createMockFastify();

    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockIsBlockedBetween.mockResolvedValue(false);
    mockResolveForTargets.mockResolvedValue(new Map());
    mockSendWithETag.mockReturnValue(false);
    mockBuildCursorPaginationMeta.mockReturnValue({ nextCursor: null, hasMore: false });
    mockEnsureUniqueConversationIdentifier.mockResolvedValue('mshy_unique');
    mockGenerateConversationIdentifier.mockReturnValue('auto-id');
    mockGenerateCompactConversationIdentifier.mockReturnValue('mshy_AbCdEfGhIjKl');
    mockGenerateDefaultConversationTitle.mockReturnValue('Generated Title');
    mockValidateSchema.mockReturnValue({
      type: 'direct',
      participantIds: [OTHER_USER_ID],
    });

    registerCoreRoutes(fastify, prisma, optionalAuth, requiredAuth);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations/check-identifier/:identifier
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations/check-identifier/:identifier', () => {
    const getCheckHandler = (f: any) =>
      getHandler(f, 'GET', 'check-identifier');

    it('returns available:true when identifier is not taken', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { identifier: 'my-conv' } });
      const reply = makeReply();

      await getCheckHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { available: true, identifier: 'my-conv' });
    });

    it('returns available:false when identifier is already taken', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: CONV_ID });
      const req = makeRequest({ params: { identifier: 'taken-conv' } });
      const reply = makeReply();

      await getCheckHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, { available: false, identifier: 'taken-conv' });
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.conversation.findFirst.mockRejectedValue(new Error('DB failure'));
      const req = makeRequest({ params: { identifier: 'test' } });
      const reply = makeReply();

      await getCheckHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    const makeConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      _count: { participants: 2 },
      isAnnouncementChannel: false,
      participants: [
        {
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: true,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: true, lastActiveAt: null },
        },
      ],
      userPreferences: [],
      messages: [],
      ...overrides,
    });

    // ── Plancher d'historique de l'aperçu de liste ───────────────────────────
    //
    // Le dernier message GLOBAL du salon peut précéder l'arrivée du lecteur.
    // La liste lit SES lignes en une passe batchée (`services/historyFloor`) et
    // remplace l'aperçu par le premier message visible depuis son plancher — ou
    // le vide. Fail-closed : plancher illisible ⇒ aperçu retiré.
    describe('plancher d’historique de l’aperçu', () => {
      const JOINED = new Date('2026-06-15T00:00:00Z');
      const BEFORE_JOIN = new Date('2026-06-01T00:00:00Z');
      const readerJoin = (over: Record<string, unknown> = {}) => ({
        conversationId: CONV_ID,
        role: 'member',
        joinedAt: JOINED,
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: { canViewHistory: false },
        anonymousSession: null,
        ...over,
      });
      const oldPreview = () => ({
        id: 'm-old', content: 'avant ton arrivée', createdAt: BEFORE_JOIN, senderId: 'p-x',
        originalLanguage: 'fr', translations: null, metadata: null, sender: null,
      });

      beforeEach(() => {
        (prisma as any).userMessageDeletion = { findMany: jest.fn().mockResolvedValue([]) };
        (prisma as any).userConversationPreferences = { findMany: jest.fn().mockResolvedValue([]) };
        (prisma as any).conversationShareLink = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) };
      });

      it('remplace un aperçu d’AVANT l’arrivée par le premier message visible depuis le plancher', async () => {
        prisma.conversation.findMany.mockResolvedValue([makeConversation({ messages: [oldPreview()] })]);
        prisma.participant.findMany.mockResolvedValue([readerJoin()]);
        prisma.message.findFirst.mockResolvedValue({ ...oldPreview(), id: 'm-since', content: 'depuis', createdAt: new Date('2026-07-01T00:00:00Z') });

        const reply = makeReply();
        await getListHandler(fastify)(makeRequest({ query: {} }), reply);

        expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { conversationId: { in: [CONV_ID] }, isActive: true, userId: USER_ID },
        }));
        expect(prisma.message.findFirst.mock.calls[0][0].where).toMatchObject({ conversationId: CONV_ID, createdAt: { gte: JOINED } });
        expect(reply._body.data[0].lastMessage.id).toBe('m-since');
      });

      it('vide l’aperçu quand rien n’a été écrit depuis l’arrivée', async () => {
        prisma.conversation.findMany.mockResolvedValue([makeConversation({ messages: [oldPreview()] })]);
        prisma.participant.findMany.mockResolvedValue([readerJoin()]);
        prisma.message.findFirst.mockResolvedValue(null);

        const reply = makeReply();
        await getListHandler(fastify)(makeRequest({ query: {} }), reply);

        expect(reply._body.data[0].lastMessage).toBeNull();
      });

      it('sert l’aperçu global à un administrateur de la conversation', async () => {
        prisma.conversation.findMany.mockResolvedValue([makeConversation({ messages: [oldPreview()] })]);
        prisma.participant.findMany.mockResolvedValue([readerJoin({ role: 'admin' })]);

        const reply = makeReply();
        await getListHandler(fastify)(makeRequest({ query: {} }), reply);

        expect(reply._body.data[0].lastMessage.id).toBe('m-old');
        expect(prisma.message.findFirst).not.toHaveBeenCalled();
      });

      it('cherche la ligne d’un lecteur ANONYME par `id`, pas par `userId`', async () => {
        prisma.conversation.findMany.mockResolvedValue([makeConversation({ messages: [oldPreview()] })]);
        prisma.participant.findMany.mockResolvedValue([]);

        const reply = makeReply();
        await getListHandler(fastify)(makeRequest({
          query: {},
          authContext: { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: PARTICIPANT_ID, participantId: PARTICIPANT_ID },
        }), reply);

        expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { conversationId: { in: [CONV_ID] }, isActive: true, id: PARTICIPANT_ID },
        }));
      });

      it('retire l’aperçu d’une conversation dont le plancher est ILLISIBLE — jamais l’avant-arrivée', async () => {
        prisma.conversation.findMany.mockResolvedValue([makeConversation({ messages: [oldPreview()] })]);
        prisma.participant.findMany.mockResolvedValue([readerJoin({ permissions: {}, shareLinkId: 'sl-1' })]);
        (prisma as any).conversationShareLink.findMany.mockRejectedValue(new Error('mongo down'));

        const reply = makeReply();
        await getListHandler(fastify)(makeRequest({ query: {} }), reply);

        expect(reply._body.data[0].lastMessage).toBeNull();
      });
    });

    it('rend 401 UNAUTHORIZED quand il n’y a pas de session (#4789)', async () => {
      const req = makeRequest({ authContext: { isAuthenticated: false, userId: null } });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String), { code: 'UNAUTHORIZED' });
      expect(mockSendForbidden).not.toHaveBeenCalled();
    });

    // ── memberCount : compté par la base, jamais lu dans la colonne ──────────
    // `Conversation.memberCount` est une colonne dénormalisée que RIEN n'écrit
    // dans le gateway (seule `migrations/migrate-from-legacy.ts` la pose, une
    // fois). La liste la servait telle quelle : `0` pour toute conversation
    // créée depuis. `GET /conversations/:id` servait au même moment le `_count`
    // filtré — deux valeurs sous un même nom de champ, et une ligne de liste
    // iOS qui masque son badge de groupe (`memberCount > 1`) et calcule une
    // couleur d'accent différente de celle du fil ouvert.
    it('sert l\'effectif ACTIF compté par la base, pas la colonne dénormalisée', async () => {
      const conv = makeConversation({ _count: { participants: 7 } });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      prisma.conversation.count.mockResolvedValue(1);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.data[0].memberCount).toBe(7);
    });

    it('demande à Prisma le compte filtré sur les participants ACTIFS', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const select = prisma.conversation.findMany.mock.calls[0][0].select;
      expect(select._count).toEqual({
        select: { participants: { where: { isActive: true } } }
      });
      // Un `select` qui garderait AUSSI la colonne rendrait le défaut
      // réintroductible par un simple spread au retour.
      expect('memberCount' in select).toBe(false);
    });

    it('ne laisse pas l\'agrégat `_count` fuiter dans la réponse', async () => {
      const conv = makeConversation({ _count: { participants: 3 } });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect('_count' in reply._body.data[0]).toBe(false);
    });

    // ── Cap 199+ : l'effectif ENTIER est réservé aux lecteurs autorisés ──────
    // Au-delà de 199 membres, la liste sert `memberCount: 199` +
    // `memberCountCapped: true` ; un lecteur autorisé
    // (`canViewExactMemberCount` : ADMIN/BIGBOSS/MODERATOR plateforme, OU
    // creator/admin de la conversation) reçoit la valeur ENTIÈRE, sans plafond.
    // Le drapeau absent signifie « non plafonné » pour les clients.
    //
    // Le fixture par défaut fait du lecteur le CREATOR de la conversation —
    // exactement le cas que ce lot élargit —, donc le plafond se démontre sur
    // un simple `member`.
    const makeMemberOnlyConversation = (count: number) =>
      makeConversation({
        _count: { participants: count },
        participants: [
          {
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            type: 'user',
            displayName: 'Alice',
            avatar: null,
            role: 'member',
            language: 'fr',
            nickname: null,
            joinedAt: new Date(),
            isActive: true,
            isOnline: true,
            lastActiveAt: null,
            user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: true, lastActiveAt: null },
          },
        ],
      });

    const makeRequestAs = (role: string) =>
      makeRequest({
        authContext: {
          isAuthenticated: true,
          userId: USER_ID,
          registeredUser: { id: USER_ID, role },
          isAnonymous: false,
          sessionToken: null,
        },
        query: {},
      });

    it('plafonne memberCount à 199 avec drapeau pour un simple membre sans rôle plateforme', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        makeMemberOnlyConversation(MEMBER_COUNT_DISPLAY_CAP + 51),
      ]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.data[0].memberCount).toBe(MEMBER_COUNT_DISPLAY_CAP);
      expect(reply._body.data[0].memberCountCapped).toBe(true);
    });

    // Lot 1 — l'élargissement : administrer un groupe de 250 personnes sans
    // jamais pouvoir en lire l'effectif était le défaut. Le rôle de
    // CONVERSATION n'était consulté sur AUCUN site d'effectif.
    it('sert l\'effectif ENTIER, sans plafond, à l\'admin du GROUPE', async () => {
      for (const role of ['creator', 'admin']) {
        prisma.conversation.findMany.mockResolvedValue([
          makeConversation({
            _count: { participants: 250 },
            participants: [
              {
                id: PARTICIPANT_ID,
                userId: USER_ID,
                conversationId: CONV_ID,
                type: 'user',
                displayName: 'Alice',
                avatar: null,
                role,
                language: 'fr',
                nickname: null,
                joinedAt: new Date(),
                isActive: true,
                isOnline: true,
                lastActiveAt: null,
                user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: true, lastActiveAt: null },
              },
            ],
          }),
        ]);

        const reply = makeReply();
        await getListHandler(fastify)(makeRequest({ query: {} }), reply);

        expect(reply._body.data[0].memberCount).toBe(250);
        expect(reply._body.data[0].memberCountCapped).toBeUndefined();
      }
    });

    it('sert l\'effectif ENTIER à un MODERATOR plateforme simple membre', async () => {
      prisma.conversation.findMany.mockResolvedValue([makeMemberOnlyConversation(250)]);

      const reply = makeReply();
      await getListHandler(fastify)(makeRequestAs('MODERATOR'), reply);

      expect(reply._body.data[0].memberCount).toBe(250);
      expect(reply._body.data[0].memberCountCapped).toBeUndefined();
    });

    it('plafonne encore pour AUDIT et ANALYST — lire des journaux n\'est pas lire un annuaire', async () => {
      for (const role of ['AUDIT', 'ANALYST']) {
        prisma.conversation.findMany.mockResolvedValue([makeMemberOnlyConversation(250)]);

        const reply = makeReply();
        await getListHandler(fastify)(makeRequestAs(role), reply);

        expect(reply._body.data[0].memberCount).toBe(MEMBER_COUNT_DISPLAY_CAP);
        expect(reply._body.data[0].memberCountCapped).toBe(true);
      }
    });

    // Le rôle du lecteur vient de `currentUserRoleMap`, qui retombe sur une
    // requête batchée quand il n'est pas dans les 5 participants chargés —
    // c'est-à-dire dans EXACTEMENT le cas qui plafonne (grand groupe).
    it('lit le rôle du lecteur via le repli batché quand il n\'est pas dans le top-5', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        makeConversation({ _count: { participants: 250 }, participants: [] }),
      ]);
      prisma.participant.findMany.mockResolvedValue([
        { id: PARTICIPANT_ID, conversationId: CONV_ID, role: 'admin', joinedAt: new Date() },
      ]);

      const reply = makeReply();
      await getListHandler(fastify)(makeRequest({ query: {} }), reply);

      expect(reply._body.data[0].memberCount).toBe(250);
      expect(reply._body.data[0].memberCountCapped).toBeUndefined();
    });

    // Le fixture DOIT être `makeMemberOnlyConversation` : `makeConversation`
    // fait du lecteur le `creator` de la conversation, donc
    // `canViewExactMemberCount` court-circuite sur la branche CONVERSATION et
    // la boucle sur ADMIN/BIGBOSS ne prouve plus rien. Preuve : commenter la
    // branche plateforme de `canViewExactMemberCount` faisait tomber 7 tests,
    // et celui-ci n'en faisait PAS partie — le seul des six sites d'effectif
    // resté sans garde.
    // A4 — même lecteur, même conversation, deux réponses selon la route.
    // `authContext.userId` porte un `Participant.id` pour un invité de lien
    // partagé (branche anonyme d'`UnifiedAuthService`, documentée dans
    // `utils/access-control.ts`), jamais un `User.id`. La recherche branche
    // déjà la COLONNE sur la nature de la clé (`search.ts` : `id` pour un
    // anonyme, `userId` sinon) ; la liste comparait un id de participant à la
    // colonne `userId` — aucune correspondance, `currentUserRoleMap` vide,
    // donc PLAFONNÉ pour l'admin de groupe anonyme que
    // `canViewExactMemberCount` autorise explicitement (test jumeau dans
    // packages/shared/__tests__/member-visibility.test.ts).
    const makeAnonymousRequest = () =>
      makeRequest({
        authContext: {
          isAuthenticated: true,
          type: 'anonymous',
          isAnonymous: true,
          userId: PARTICIPANT_ID,
          participantId: PARTICIPANT_ID,
          sessionToken: 'sess_tok',
        },
        query: {},
      });

    const anonymousAdminParticipant = {
      id: PARTICIPANT_ID,
      userId: null,
      conversationId: CONV_ID,
      type: 'anonymous',
      displayName: 'Invitée',
      avatar: null,
      role: 'admin',
      language: 'fr',
      nickname: null,
      joinedAt: new Date(),
      isActive: true,
      isOnline: true,
      lastActiveAt: null,
      user: null,
    };

    it('sert l\'effectif ENTIER à un admin de groupe ANONYME présent dans le top-5', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        makeConversation({ _count: { participants: 250 }, participants: [anonymousAdminParticipant] }),
      ]);

      const reply = makeReply();
      await getListHandler(fastify)(makeAnonymousRequest(), reply);

      expect(reply._body.data[0].memberCount).toBe(250);
      expect(reply._body.data[0].memberCountCapped).toBeUndefined();
    });

    it('interroge la COLONNE `id` au repli batché pour un lecteur anonyme', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        makeConversation({ _count: { participants: 250 }, participants: [] }),
      ]);
      // Le double ne rend le rôle QUE si la lecture porte sur `id` : en base,
      // une requête `userId: <Participant.id>` ne matche rien, et un double
      // complaisant rendrait ce test tautologique.
      prisma.participant.findMany.mockImplementation(async (args: any) =>
        args?.where?.id === PARTICIPANT_ID
          ? [{ id: PARTICIPANT_ID, conversationId: CONV_ID, role: 'admin', joinedAt: new Date() }]
          : []
      );

      const reply = makeReply();
      await getListHandler(fastify)(makeAnonymousRequest(), reply);

      expect(prisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: PARTICIPANT_ID }) })
      );
      expect(reply._body.data[0].memberCount).toBe(250);
      expect(reply._body.data[0].memberCountCapped).toBeUndefined();
    });

    it('sert l\'effectif exact sans drapeau à un admin plateforme', async () => {
      for (const role of ['ADMIN', 'BIGBOSS']) {
        prisma.conversation.findMany.mockResolvedValue([
          makeMemberOnlyConversation(MEMBER_COUNT_DISPLAY_CAP + 51),
        ]);

        const reply = makeReply();
        await getListHandler(fastify)(makeRequestAs(role), reply);

        expect(reply._body.data[0].memberCount).toBe(MEMBER_COUNT_DISPLAY_CAP + 51);
        expect(reply._body.data[0].memberCountCapped).toBeUndefined();
      }
    });

    it('ne pose aucun drapeau à 199 membres ou moins', async () => {
      const conv = makeConversation({ _count: { participants: MEMBER_COUNT_DISPLAY_CAP } });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.data[0].memberCount).toBe(MEMBER_COUNT_DISPLAY_CAP);
      expect(reply._body.data[0].memberCountCapped).toBeUndefined();
    });

    it('returns empty list with default pagination', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(0);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply.send).toHaveBeenCalled();
      const body = reply._body;
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('returns conversations with unreadCount merged', async () => {
      const conv = makeConversation();
      prisma.conversation.findMany.mockResolvedValue([conv]);
      prisma.conversation.count.mockResolvedValue(1);

      const req = makeRequest({ query: { includeCount: 'true' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].unreadCount).toBeDefined();
    });

    it('applies typeFilter when query.type is provided', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { type: 'group' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'group' }),
        })
      );
    });

    it('applies withUserId filter when provided', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { withUserId: OTHER_USER_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ AND: expect.any(Array) }),
        })
      );
    });

    it('excludes an empty direct DM from a non-creator participant list', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { type: { not: 'direct' } },
              {
                OR: [
                  { NOT: { firstMessageSentAt: null } },
                  { firstMessageSentAt: { isSet: false } },
                ],
              },
              { participants: { some: { userId: USER_ID, role: 'creator' } } },
              { participants: { none: { role: 'creator' } } },
            ]),
          }),
        })
      );
    });

    // Regression — Prisma-Mongo absent-vs-null (corrigé en revue pré-merge,
    // 2026-08-10). Un `NOT: { firstMessageSentAt: null }` nu exclut aussi les
    // documents où le champ est ABSENT (legacy, jamais backfillé) sur le
    // connecteur MongoDB de Prisma — il faut l'OR explicite avec
    // `isSet: false`. Un client Prisma mocké ne peut pas rejouer la sémantique
    // Mongo (present-et-null vs absent), donc on vérifie la FORME du where
    // (même technique que le `deletedForMe` isSet:false plus haut dans ce
    // fichier / `PostFeedService.test.ts` deletedAt isSet:false) : elle seule
    // prouve que les trois états (absent / null explicite / Date posée) sont
    // couverts par la requête envoyée à Mongo.
    it('builds the firstMessageSentAt visibility branch as an OR of set-or-absent, never a bare NOT', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const where = prisma.conversation.findMany.mock.calls[0][0].where;
      const firstMessageBranch = where.OR.find(
        (branch: any) => branch.OR && branch.OR.some((inner: any) => 'firstMessageSentAt' in inner || inner.NOT?.firstMessageSentAt !== undefined)
      );
      expect(firstMessageBranch).toEqual({
        OR: [
          { NOT: { firstMessageSentAt: null } }, // present-et-non-null (message envoyé) ⇒ visible
          { firstMessageSentAt: { isSet: false } }, // absent (legacy, avant migration) ⇒ visible
        ],
      });
      // Jamais une forme qui exclurait les documents absents.
      expect(where.OR).not.toContainEqual({ NOT: { firstMessageSentAt: null } });
      expect(where.OR).not.toContainEqual({ firstMessageSentAt: null });
    });

    it('applies the same empty-DM visibility gate when withUserId is provided', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { withUserId: OTHER_USER_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.any(Array), // bloc withUserId existant, inchangé
            OR: expect.arrayContaining([
              { participants: { some: { userId: USER_ID, role: 'creator' } } },
            ]),
          }),
        })
      );
    });

    it('handles beforeCursor with valid lastMessageAt', async () => {
      const cursorDate = new Date('2024-01-01');
      prisma.conversation.findFirst.mockResolvedValue({ lastMessageAt: cursorDate });
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { before: CONV_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lastMessageAt: { lt: cursorDate } }),
        })
      );
    });

    it('handles beforeCursor when cursorConversation has null lastMessageAt', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ lastMessageAt: null });
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { before: CONV_ID } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // No lastMessageAt filter applied — just verify findMany was called
      expect(prisma.conversation.findMany).toHaveBeenCalled();
    });

    it('applies updatedSince filter for valid ISO date', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ updatedAt: expect.any(Object) }),
        })
      );
    });

    it('orders a delta page by updatedAt ASC so a truncated page resumes instead of skipping', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // A delta window that touched more than `limit` conversations returns a
      // TRUNCATED page. Sorted by `lastMessageAt desc`, the rows left out bear
      // no relation to the filter, so a client advancing its watermark to the
      // max `updatedAt` it received steps OVER them — permanently, until its
      // next full reconcile (24h on iOS). Sorted by `updatedAt` ascending, the
      // rows left out are exactly those with a HIGHER `updatedAt` than the
      // page's last row: the same watermark that used to skip them now points
      // right at them.
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        })
      );
    });

    it('keeps the recency order for a normal (non-delta) page', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // The list screen reads this route too, and it wants the most recent
      // conversation first. Only the delta consumers trade recency for
      // resumability.
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { lastMessageAt: 'desc' } })
      );
    });

    it('lets the before-cursor keep the recency order it bounds on', async () => {
      const cursorDate = new Date('2024-01-01');
      prisma.conversation.findFirst.mockResolvedValue({ lastMessageAt: cursorDate });
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { before: CONV_ID, updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // `before` bounds on `lastMessageAt`; ordering that page by `updatedAt`
      // would pair a cursor with a sort it has no relation to. No client
      // combines the two — the guard is for the one that tries.
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { lastMessageAt: 'desc' } })
      );
    });

    it('keeps the recency order when updatedSince is unusable', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { updatedSince: 'not-a-date' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // No delta filter was applied, so this is a normal page: ordering it by
      // `updatedAt` would hand the list screen its OLDEST conversations first.
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { lastMessageAt: 'desc' } })
      );
    });

    it('ignores invalid updatedSince date (NaN)', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      const req = makeRequest({ query: { updatedSince: 'not-a-date' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const call = prisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.updatedAt).toBeUndefined();
    });

    // ─── Pierres tombales du delta ────────────────────────────────────────
    //
    // Le delta réutilise le `whereClause` de la liste (conversation
    // `isActive: true`, participant actif sans `deletedForMe`) : il sait
    // servir une ligne, jamais annoncer sa DISPARITION. Une conversation
    // fermée, quittée, supprimée-pour-moi depuis un autre appareil ou dont
    // l'utilisateur a été banni pendant sa coupure restait en cache jusqu'à la
    // réconciliation complète — 24 h sur iOS comme sur le web.
    //
    // La règle du calcul vit dans `utils/delta-tombstones.ts` (testée à part) ;
    // ce qui se vérifie ICI est le CÂBLAGE : présent sur une page delta,
    // totalement absent sinon.
    const tombstoneCalls = (p: ReturnType<typeof makePrisma>) => ({
      closed: p.conversation.findMany.mock.calls.filter((c: any) => c[0]?.where?.closedAt),
      participant: p.participant.findMany.mock.calls.filter(
        (c: any) => c[0]?.where?.deletedForMe || c[0]?.where?.OR
      ),
    });

    it('declares the conversations that LEFT the view on a delta page', async () => {
      prisma.conversation.findMany.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.closedAt ? [{ id: 'c-closed' }] : [])
      );
      prisma.participant.findMany.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.deletedForMe ? [{ conversationId: 'c-dfm' }] : [])
      );

      const req = makeRequest({ query: { updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect([...reply._body.meta.deletedConversationIds].sort()).toEqual(['c-closed', 'c-dfm']);
      expect(reply._body.meta.deletedConversationIdsTruncated).toBe(false);
    });

    it('carries the truncation flag through to the client', async () => {
      // Le drapeau est le SEUL signal qui fait escalader le client vers la
      // relecture complète : le perdre entre le calcul et l'enveloppe rendrait
      // une liste partielle indiscernable d'une liste exhaustive.
      const overflow = Array.from({ length: CONVERSATION_TOMBSTONE_LIMIT + 1 }, (_, n) => ({ id: `c${n}` }));
      prisma.conversation.findMany.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.closedAt ? overflow : [])
      );

      const req = makeRequest({ query: { updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.meta.deletedConversationIdsTruncated).toBe(true);
    });

    it('issues NO tombstone query on a normal (non-delta) page', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const calls = tombstoneCalls(prisma);
      expect(calls.closed).toHaveLength(0);
      expect(calls.participant).toHaveLength(0);
      expect(reply._body.meta).toBeUndefined();
    });

    it('issues NO tombstone query when updatedSince is unusable', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { updatedSince: 'not-a-date' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const calls = tombstoneCalls(prisma);
      expect(calls.closed).toHaveLength(0);
      expect(calls.participant).toHaveLength(0);
      expect(reply._body.meta).toBeUndefined();
    });

    it('bounds the tombstone window on the same `since` as the delta itself', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      const req = makeRequest({ query: { updatedSince: '2024-01-01T00:00:00Z' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      // Deux bornes distinctes ouvriraient un trou entre elles : une
      // conversation fermée dans l'écart ne serait ni servie ni enterrée.
      const closedCall = tombstoneCalls(prisma).closed[0][0];
      expect(closedCall.where.closedAt).toEqual({ gt: new Date('2024-01-01T00:00:00Z') });
    });

    it('returns early (no send) when sendWithETag returns true (304)', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      mockSendWithETag.mockReturnValue(true);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply.send).not.toHaveBeenCalled();
    });

    it('triggers batch participant query for convsMissingCurrentUser', async () => {
      const conv = makeConversation({
        participants: [
          {
            id: 'other-part-id',
            userId: OTHER_USER_ID,
            conversationId: CONV_ID,
            type: 'user',
            displayName: 'Bob',
            avatar: null,
            role: 'member',
            language: 'fr',
            nickname: null,
            joinedAt: new Date(),
            isActive: true,
            isOnline: false,
            lastActiveAt: null,
            user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: null, isOnline: false, lastActiveAt: null },
          },
        ],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      prisma.participant.findMany.mockResolvedValue([
        { conversationId: CONV_ID, role: 'creator', joinedAt: new Date() },
      ]);
      prisma.conversation.count.mockResolvedValue(1);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(prisma.participant.findMany).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalled();
      const body = (reply as any)._body ?? (reply.send as jest.Mock).mock.calls[0]?.[0];
      expect(body).toHaveProperty('success', true);
    });

    it('generates title for group conversation with no title', async () => {
      const conv = makeConversation({ type: 'group', title: '' });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    });

    const makeLastMessage = (content: string) => ({
      id: 'msg-1',
      content,
      createdAt: new Date(),
      senderId: PARTICIPANT_ID,
      messageType: 'text',
      isBlurred: false,
      isViewOnce: false,
      effectFlags: 0,
      expiresAt: null,
      sender: null,
      attachments: [],
      _count: { attachments: 0 },
    });

    it('truncates oversized lastMessage.content to the preview cap', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('x'.repeat(5000))] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.data[0].lastMessage.content.length).toBe(300);
    });

    it('keeps short lastMessage.content intact', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('salut ✋')] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.data[0].lastMessage.content).toBe('salut ✋');
    });

    it('Lot 3 : lastMessage geolocalise restitue `location` (et le contenu vide n est PAS fabrique cote serveur)', async () => {
      const GEO = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };
      const geoLastMessage = { ...makeLastMessage(''), metadata: { location: GEO } };
      const conv = makeConversation({ messages: [geoLastMessage] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const lastMessage = reply._body.data[0].lastMessage;
      expect(lastMessage.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
      // Constat, pas une exigence : un message géolocalisé sans légende a un
      // `content` vide aujourd'hui. Le hoist de `location` ne fabrique aucun
      // texte de repli — au client de décider comment rendre "" + location.
      expect(lastMessage.content).toBe('');
    });

    it('does not split a surrogate pair at the truncation boundary', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('a'.repeat(299) + '😀😀😀')] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const content = reply._body.data[0].lastMessage.content as string;
      expect(content).toBe('a'.repeat(299) + '😀');
      expect(() => encodeURIComponent(content)).not.toThrow();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Prisme Linguistique — l'aperçu de la ligne de liste
    //
    // « Le prisme s'applique à TOUT le contenu — messages texte, transcriptions
    // audio, métadonnées, previews. » La liste était la seule surface où il ne
    // s'appliquait pas : cette route ne transportait NI les traductions du
    // dernier message NI sa langue d'origine, si bien que le résolveur client
    // (`MeeshyConversation.resolvedLastMessagePreview`) — écrit, testé, livré —
    // ne pouvait QUE rendre le texte brut de l'expéditeur.
    // ─────────────────────────────────────────────────────────────────────────

    const makeTranslatedLastMessage = (
      content: string,
      translations: Record<string, unknown>,
      originalLanguage = 'en',
    ) => ({
      ...makeLastMessage(content),
      originalLanguage,
      translations,
    });

    const translationJson = (text: string, extra: Record<string, unknown> = {}) => ({
      text,
      translationModel: 'medium',
      createdAt: new Date(),
      ...extra,
    });

    const frenchViewer = (overrides: any = {}) =>
      makeRequest({
        query: {},
        authContext: {
          isAuthenticated: true,
          userId: USER_ID,
          registeredUser: {
            id: USER_ID,
            role: 'USER',
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
          },
          isAnonymous: false,
          sessionToken: null,
          ...overrides,
        },
      });

    it("expose la traduction du dernier message dans la langue du lecteur", async () => {
      const conv = makeConversation({
        messages: [
          makeTranslatedLastMessage('Hello', {
            fr: translationJson('Bonjour'),
            es: translationJson('Hola'),
          }),
        ],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const reply = makeReply();
      await getListHandler(fastify)(frenchViewer(), reply);

      const row = reply._body.data[0];
      expect(row.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
      expect(row.lastMessageOriginalLanguage).toBe('en');
      expect(row.lastMessage.content).toBe('Hello');
    });

    it("n'expose aucune traduction hors du prisme du lecteur", async () => {
      const conv = makeConversation({
        messages: [makeTranslatedLastMessage('Hello', { es: translationJson('Hola') })],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const reply = makeReply();
      await getListHandler(fastify)(frenchViewer(), reply);

      expect(reply._body.data[0].lastMessageTranslations).toBeNull();
      expect(reply._body.data[0].lastMessageOriginalLanguage).toBe('en');
    });

    it('suit les QUATRE niveaux du prisme, locale appareil comprise', async () => {
      const conv = makeConversation({
        messages: [makeTranslatedLastMessage('Hello', { de: translationJson('Guten Tag') })],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const reply = makeReply();
      await getListHandler(
        fastify,
      )(
        frenchViewer({
          registeredUser: {
            id: USER_ID,
            role: 'USER',
            systemLanguage: null,
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: 'de-DE',
          },
        }),
        reply,
      );

      expect(reply._body.data[0].lastMessageTranslations).toEqual({ de: 'Guten Tag' });
    });

    it('laisse les deux champs à null quand le dernier message n a aucune traduction', async () => {
      const conv = makeConversation({ messages: [makeLastMessage('Hello')] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const reply = makeReply();
      await getListHandler(fastify)(frenchViewer(), reply);

      expect(reply._body.data[0].lastMessageTranslations).toBeNull();
      expect(reply._body.data[0].lastMessageOriginalLanguage).toBeNull();
    });

    it('laisse les deux champs à null quand la conversation n a aucun message', async () => {
      const conv = makeConversation({ messages: [] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const reply = makeReply();
      await getListHandler(fastify)(frenchViewer(), reply);

      expect(reply._body.data[0].lastMessage).toBeNull();
      expect(reply._body.data[0].lastMessageTranslations).toBeNull();
      expect(reply._body.data[0].lastMessageOriginalLanguage).toBeNull();
    });

    it('charge `translations` et `originalLanguage` dans le select du dernier message', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await getListHandler(fastify)(frenchViewer(), makeReply());

      const select = prisma.conversation.findMany.mock.calls[0][0].select.messages.select;
      expect(select.translations).toBe(true);
      expect(select.originalLanguage).toBe(true);
    });

    it('keeps null title for direct conversation', async () => {
      const conv = makeConversation({ type: 'direct', title: null });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(body.data[0].title).toBeNull();
    });

    // L'override LIVE ne se voit que si la loi ACCORDE : une carte vide masque
    // désormais un inscrit non résolu (site unique `presenceFor`), donc le
    // témoin doit passer par la vraie loi — ici le participant est le lecteur.
    it('uses presenceChecker to override isOnline when available', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      mockResolveForTargets.mockImplementation(lawFaithfulResolver());
      const conv = makeConversation();
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const body = reply._body;
      expect(fastify.presenceChecker.isOnline).toHaveBeenCalled();
      expect(body.data[0].participants[0].isOnline).toBe(true);
    });

    it('masks participant presence when showOnlineStatus is hidden, even if live-online', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      mockResolveForTargets.mockResolvedValue(new Map([
        [USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
      ]));
      const conv = makeConversation();
      conv.participants[0].lastActiveAt = new Date();
      conv.participants[0].user.lastActiveAt = new Date();
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const participant = reply._body.data[0].participants[0];
      expect(participant.isOnline).toBe(false);
      expect(participant.lastActiveAt).toBeNull();
      expect(participant.user.isOnline).toBe(false);
      expect(participant.user.lastActiveAt).toBeNull();
    });

    it('masks only lastActiveAt when showLastSeen is hidden but showOnlineStatus is visible', async () => {
      mockResolveForTargets.mockResolvedValue(new Map([
        [USER_ID, { showOnline: true, showLastSeenTimestamp: false }],
      ]));
      const conv = makeConversation();
      conv.participants[0].lastActiveAt = new Date();
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const participant = reply._body.data[0].participants[0];
      expect(participant.isOnline).toBe(true);
      expect(participant.lastActiveAt).toBeNull();
    });

    const makeSentLastMessage = () => ({
      id: 'msg-presence',
      content: 'yo',
      createdAt: new Date(),
      senderId: 'participant-2',
      messageType: 'text',
      isBlurred: false,
      isViewOnce: false,
      effectFlags: 0,
      expiresAt: null,
      sender: {
        id: 'participant-2',
        userId: OTHER_USER_ID,
        displayName: 'Bob',
        avatar: null,
        type: 'user',
        user: {
          id: OTHER_USER_ID,
          username: 'bob',
          displayName: 'Bob',
          avatar: null,
          isOnline: true,
          lastActiveAt: new Date(),
        },
      },
      attachments: [],
      _count: { attachments: 0 },
    });

    it('masks lastMessage sender presence when showOnlineStatus is hidden', async () => {
      mockResolveForTargets.mockResolvedValue(new Map([
        [OTHER_USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
      ]));
      const conv = makeConversation({ messages: [makeSentLastMessage()] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const sender = reply._body.data[0].lastMessage.sender;
      expect(sender.isOnline).toBe(false);
      expect(sender.lastActiveAt).toBeNull();
    });

    it('applies live presence to lastMessage sender when visible', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(false) };
      const conv = makeConversation({ messages: [makeSentLastMessage()] });
      prisma.conversation.findMany.mockResolvedValue([conv]);

      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      const sender = reply._body.data[0].lastMessage.sender;
      expect(fastify.presenceChecker.isOnline).toHaveBeenCalledWith(OTHER_USER_ID);
      expect(sender.isOnline).toBe(false);
    });

    // ── Régime STRICT (2026-08-25) ──────────────────────────────────────────
    // Hors soi-même, ADMIN+ et amitié acceptée, ni `isOnline` ni `lastActiveAt`
    // d'un co-participant ou de l'expéditeur ne sortent — la co-participation
    // n'est pas une relation. Un rang inférieur au premier est le seul qui
    // distingue la règle juste du court-circuit : d'où un co-participant AUTRE
    // que le lecteur.
    describe('présence des co-participants et de l\'expéditeur (régime strict)', () => {
      const LAST_SEEN = new Date('2026-08-22T10:00:00.000Z');
      const otherParticipant = (overrides: any = {}) => ({
        id: 'participant-2',
        userId: OTHER_USER_ID,
        conversationId: CONV_ID,
        type: 'user',
        displayName: 'Bob',
        avatar: null,
        role: 'member',
        language: 'fr',
        nickname: null,
        joinedAt: new Date(),
        isActive: true,
        isOnline: true,
        lastActiveAt: LAST_SEEN,
        user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'Jones', isOnline: true, lastActiveAt: LAST_SEEN },
        ...overrides,
      });
      const anonymousParticipant = () =>
        otherParticipant({ id: 'participant-anon', userId: null, type: 'anonymous', displayName: 'Anon', user: null });

      async function list(req: any, participants: any[] = [otherParticipant()]) {
        prisma.conversation.findMany.mockResolvedValue([
          makeConversation({ participants, messages: [makeSentLastMessage()] }),
        ]);
        const reply = makeReply();
        await getListHandler(fastify)(req, reply);
        return reply._body.data[0];
      }

      beforeEach(() => {
        mockResolveForTargets.mockImplementation(lawFaithfulResolver());
      });

      it('transmet le viewer demandeur (identité + rôle) et les userId des participants et de l\'expéditeur', async () => {
        await list(makeViewerRequest({ role: 'USER' }));

        const [viewer, ids] = mockResolveForTargets.mock.calls[0];
        expect(viewer).toEqual({ userId: USER_ID, role: 'USER' });
        expect(ids).toEqual([OTHER_USER_ID, OTHER_USER_ID]);
      });

      it('soi-même ⇒ présence servie', async () => {
        const row = await list(makeViewerRequest({ role: 'USER' }), makeConversation().participants);

        expect(row.participants[0].isOnline).toBe(true);
      });

      it('ami accepté ⇒ présence du participant ET de l\'expéditeur servie', async () => {
        mockResolveForTargets.mockImplementation(lawFaithfulResolver(new Set([OTHER_USER_ID])));

        const row = await list(makeViewerRequest({ role: 'USER' }));

        expect(row.participants[0].isOnline).toBe(true);
        expect(row.participants[0].lastActiveAt).toEqual(LAST_SEEN);
        expect(row.participants[0].user.isOnline).toBe(true);
        expect(row.lastMessage.sender.isOnline).toBe(true);
        expect(row.lastMessage.sender.lastActiveAt).not.toBeNull();
      });

      it('co-participant NON ami ⇒ isOnline false et lastActiveAt null — participant, son user, et l\'expéditeur', async () => {
        const row = await list(makeViewerRequest({ role: 'USER' }));

        expect(row.participants[0].isOnline).toBe(false);
        expect(row.participants[0].lastActiveAt).toBeNull();
        expect(row.participants[0].user.isOnline).toBe(false);
        expect(row.participants[0].user.lastActiveAt).toBeNull();
        expect(row.lastMessage.sender.isOnline).toBe(false);
        expect(row.lastMessage.sender.lastActiveAt).toBeNull();
      });

      it('ADMIN non ami ⇒ présence servie', async () => {
        const row = await list(makeViewerRequest({ role: 'ADMIN' }));

        expect(row.participants[0].isOnline).toBe(true);
        expect(row.participants[0].lastActiveAt).toEqual(LAST_SEEN);
        expect(row.lastMessage.sender.isOnline).toBe(true);
      });

      it('MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
        const row = await list(makeViewerRequest({ role: 'MODERATOR' }));

        expect(row.participants[0].isOnline).toBe(false);
        expect(row.participants[0].lastActiveAt).toBeNull();
        expect(row.lastMessage.sender.isOnline).toBe(false);
      });

      it('viewer anonyme ⇒ cachée, et le service reçoit un viewer nul', async () => {
        const row = await list(makeViewerRequest('anonymous'));

        expect(row.participants[0].isOnline).toBe(false);
        expect(row.participants[0].lastActiveAt).toBeNull();
        expect(row.lastMessage.sender.isOnline).toBe(false);
        expect(mockResolveForTargets.mock.calls[0][0]).toBeNull();
      });

      // Un participant sans compte n'a pas de `User.id` : le service ne peut
      // pas le résoudre. Régime strict : entrée absente ⇒ masqué, sauf ADMIN+.
      it('participant sans compte ⇒ caché pour un USER, et rien n\'est résolu pour lui', async () => {
        const row = await list(makeViewerRequest({ role: 'USER' }), [anonymousParticipant()]);

        expect(row.participants[0].isOnline).toBe(false);
        expect(row.participants[0].lastActiveAt).toBeNull();
        expect(mockResolveForTargets.mock.calls[0][1]).toEqual([OTHER_USER_ID]);
      });

      it('participant sans compte ⇒ servi à un ADMIN', async () => {
        const row = await list(makeViewerRequest({ role: 'ADMIN' }), [anonymousParticipant()]);

        expect(row.participants[0].isOnline).toBe(true);
        expect(row.participants[0].lastActiveAt).toEqual(LAST_SEEN);
      });

      // Cas (b) : un id INSCRIT que la carte ne porte pas — une anomalie, le
      // résolveur rendant une entrée par id passé. Même réponse que pour une
      // cible sans compte : masqué, sauf ADMIN+. Avant le site unique
      // (`presenceFor`, presence-gate), `presenceVis.get()` rendait `undefined`
      // et `?.showOnline === false` le laissait PASSER — révélé à tout le monde.
      it('inscrit ABSENT de la carte ⇒ caché pour un USER — participant, son user, et l\'expéditeur', async () => {
        mockResolveForTargets.mockResolvedValue(new Map());

        const row = await list(makeViewerRequest({ role: 'USER' }));

        expect(row.participants[0].isOnline).toBe(false);
        expect(row.participants[0].lastActiveAt).toBeNull();
        expect(row.participants[0].user.isOnline).toBe(false);
        expect(row.participants[0].user.lastActiveAt).toBeNull();
        expect(row.lastMessage.sender.isOnline).toBe(false);
        expect(row.lastMessage.sender.lastActiveAt).toBeNull();
      });

      it('inscrit ABSENT de la carte ⇒ servi à un ADMIN', async () => {
        mockResolveForTargets.mockResolvedValue(new Map());

        const row = await list(makeViewerRequest({ role: 'ADMIN' }));

        expect(row.participants[0].isOnline).toBe(true);
        expect(row.participants[0].lastActiveAt).toEqual(LAST_SEEN);
        expect(row.lastMessage.sender.isOnline).toBe(true);
      });
    });

    it('sets hasMore correctly when totalCount > 0 and includeCount=true', async () => {
      const convs = Array.from({ length: 30 }, (_, i) => makeConversation({ id: `conv-${i}` }));
      prisma.conversation.findMany.mockResolvedValue(convs);
      prisma.conversation.count.mockResolvedValue(100);

      const req = makeRequest({ query: { includeCount: 'true', limit: '30' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.pagination.hasMore).toBe(true);
    });

    it('falls back to length===limit for hasMore when totalCount is sentinel 0', async () => {
      const convs = Array.from({ length: 30 }, (_, i) => makeConversation({ id: `conv-${i}` }));
      prisma.conversation.findMany.mockResolvedValue(convs);
      prisma.conversation.count.mockResolvedValue(0);

      const req = makeRequest({ query: { offset: '5', limit: '30' } });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(reply._body.pagination.hasMore).toBe(true);
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.conversation.findMany.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await getListHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations/:id
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations/:id', () => {
    const getDetailHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id');

    const makeFullConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      type: 'direct',
      title: null,
      identifier: 'some-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      participants: [],
      userPreferences: [],
      _count: { participants: 2 },
      ...overrides,
    });

    it('rend 401 UNAUTHORIZED quand il n’y a pas de session (#4789)', async () => {
      const req = makeRequest({ authContext: { isAuthenticated: false, userId: null } });
      const reply = makeReply();
      await getDetailHandler(fastify)(req, reply);
      expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String), { code: 'UNAUTHORIZED' });
      expect(mockSendForbidden).not.toHaveBeenCalled();
    });

    it('returns sendNotFound when resolveConversationId returns null', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: 'unknown-id' } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalled();
    });

    it('returns sendForbidden with CONVERSATION_ACCESS_DENIED when canAccessConversation is false', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.any(String),
        expect.objectContaining({ code: 'CONVERSATION_ACCESS_DENIED' })
      );
    });

    it('returns sendNotFound when conversation not found after access check', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalled();
    });

    it('happy path: returns conversation with unreadCount', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ id: CONV_ID, unreadCount: expect.any(Number) })
      );
    });

    // Même cap 199+ que la liste : le détail servait l'effectif exact au même
    // moment — deux valeurs sous un même nom de champ selon la surface.
    it('plafonne memberCount à 199 avec drapeau pour un lecteur non admin plateforme', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ _count: { participants: MEMBER_COUNT_DISPLAY_CAP + 1 } })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.memberCount).toBe(MEMBER_COUNT_DISPLAY_CAP);
      expect(sent.memberCountCapped).toBe(true);
    });

    it('sert l\'effectif ENTIER à l\'admin du GROUPE sur le détail', async () => {
      for (const role of ['creator', 'admin']) {
        prisma.conversation.findFirst.mockResolvedValue(
          makeFullConversation({ _count: { participants: 250 } })
        );
        prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID, role });

        const reply = makeReply();
        await getDetailHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), reply);

        const sent = mockSendSuccess.mock.calls[mockSendSuccess.mock.calls.length - 1][1];
        expect(sent.memberCount).toBe(250);
        expect(sent.memberCountCapped).toBeUndefined();
      }
    });

    it('sert l\'effectif ENTIER à un MODERATOR plateforme sur le détail', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ _count: { participants: 250 } })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID, role: 'member' });

      const req = makeRequest({
        params: { id: CONV_ID },
        authContext: {
          isAuthenticated: true,
          userId: USER_ID,
          registeredUser: { id: USER_ID, role: 'MODERATOR' },
          isAnonymous: false,
          sessionToken: null,
        },
      });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.memberCount).toBe(250);
      expect(sent.memberCountCapped).toBeUndefined();
    });

    // Le rôle ne peut pas être lu dans `conversation.participants` : cette
    // liste est bornée à 100 (`CONVERSATION_DETAIL_PARTICIPANTS_CAP`), donc
    // aveugle dans le seul cas où le plafond joue. Il vient du participant
    // appelant, résolu une fois — et c'est ce `select` qui doit le porter.
    it('demande le rôle du participant appelant dans le select', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID, role: 'member' });

      await getDetailHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

      const selects = prisma.participant.findFirst.mock.calls.map((call: any[]) => call[0]?.select);
      expect(selects.some((select: any) => select?.role === true)).toBe(true);
    });

    it('sert l\'effectif exact sans drapeau à un admin plateforme sur le détail', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ _count: { participants: MEMBER_COUNT_DISPLAY_CAP + 1 } })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({
        params: { id: CONV_ID },
        authContext: {
          isAuthenticated: true,
          userId: USER_ID,
          registeredUser: { id: USER_ID, role: 'ADMIN' },
          isAnonymous: false,
          sessionToken: null,
        },
      });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.memberCount).toBe(MEMBER_COUNT_DISPLAY_CAP + 1);
      expect(sent.memberCountCapped).toBeUndefined();
    });

    const makeDetailParticipant = (overrides: any = {}) => ({
      id: PARTICIPANT_ID,
      userId: OTHER_USER_ID,
      type: 'user',
      displayName: 'Bob',
      avatar: null,
      role: 'member',
      permissions: null,
      isActive: true,
      isOnline: false,
      lastActiveAt: new Date(),
      joinedAt: new Date(),
      user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'Jones' },
      ...overrides,
    });

    // Même raison que sur la liste : la loi doit ACCORDER (ici, un ami) pour
    // que l'override live se voie — une carte vide masque un inscrit non résolu.
    it('overrides participant isOnline from presenceChecker on detail', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      mockResolveForTargets.mockImplementation(lawFaithfulResolver(new Set([OTHER_USER_ID])));
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ participants: [makeDetailParticipant()] })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(fastify.presenceChecker.isOnline).toHaveBeenCalledWith(OTHER_USER_ID);
      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participants[0].isOnline).toBe(true);
    });

    it('masks participant presence on detail when showOnlineStatus is hidden', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      mockResolveForTargets.mockResolvedValue(new Map([
        [OTHER_USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
      ]));
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ participants: [makeDetailParticipant({ isOnline: true })] })
      );
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participants[0].isOnline).toBe(false);
      expect(sent.participants[0].lastActiveAt).toBeNull();
    });

    // ── Régime STRICT (2026-08-25) — mêmes témoins que la liste ─────────────
    describe('présence des participants sur le détail (régime strict)', () => {
      const LAST_SEEN = new Date('2026-08-22T10:00:00.000Z');
      const servedParticipant = () => makeDetailParticipant({ isOnline: true, lastActiveAt: LAST_SEEN });
      const anonymousParticipant = () =>
        makeDetailParticipant({ id: 'participant-anon', userId: null, type: 'anonymous', displayName: 'Anon', user: null, isOnline: true, lastActiveAt: LAST_SEEN });

      async function detail(req: any, participants: any[] = [servedParticipant()]) {
        prisma.conversation.findFirst.mockResolvedValue(makeFullConversation({ participants }));
        prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
        const reply = makeReply();
        await getDetailHandler(fastify)(req, reply);
        return mockSendSuccess.mock.calls[0][1].participants[0];
      }

      beforeEach(() => {
        mockResolveForTargets.mockImplementation(lawFaithfulResolver());
      });

      it('transmet le viewer demandeur (identité + rôle) et les userId des participants inscrits', async () => {
        await detail(makeViewerRequest({ role: 'USER' }, { params: { id: CONV_ID } }));

        expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'USER' }, [OTHER_USER_ID]);
      });

      it('ami accepté ⇒ présence servie', async () => {
        mockResolveForTargets.mockImplementation(lawFaithfulResolver(new Set([OTHER_USER_ID])));

        const served = await detail(makeViewerRequest({ role: 'USER' }, { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(true);
        expect(served.lastActiveAt).toEqual(LAST_SEEN);
      });

      it('co-participant NON ami ⇒ isOnline false et lastActiveAt null', async () => {
        const served = await detail(makeViewerRequest({ role: 'USER' }, { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(false);
        expect(served.lastActiveAt).toBeNull();
      });

      it('ADMIN non ami ⇒ présence servie', async () => {
        const served = await detail(makeViewerRequest({ role: 'ADMIN' }, { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(true);
        expect(served.lastActiveAt).toEqual(LAST_SEEN);
      });

      it('MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
        const served = await detail(makeViewerRequest({ role: 'MODERATOR' }, { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(false);
        expect(served.lastActiveAt).toBeNull();
      });

      it('viewer anonyme ⇒ cachée, et le service reçoit un viewer nul', async () => {
        const served = await detail(makeViewerRequest('anonymous', { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(false);
        expect(served.lastActiveAt).toBeNull();
        expect(mockResolveForTargets).toHaveBeenCalledWith(null, [OTHER_USER_ID]);
      });

      it('participant sans compte ⇒ caché pour un USER, et rien n\'est résolu pour lui', async () => {
        const served = await detail(makeViewerRequest({ role: 'USER' }, { params: { id: CONV_ID } }), [anonymousParticipant()]);

        expect(served.isOnline).toBe(false);
        expect(served.lastActiveAt).toBeNull();
        expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'USER' }, []);
      });

      it('participant sans compte ⇒ servi à un ADMIN', async () => {
        const served = await detail(makeViewerRequest({ role: 'ADMIN' }, { params: { id: CONV_ID } }), [anonymousParticipant()]);

        expect(served.isOnline).toBe(true);
        expect(served.lastActiveAt).toEqual(LAST_SEEN);
      });

      // Cas (b) — mêmes témoins que la liste : un inscrit absent de la carte
      // est masqué pour un USER, révélé à un ADMIN.
      it('inscrit ABSENT de la carte ⇒ caché pour un USER', async () => {
        mockResolveForTargets.mockResolvedValue(new Map());

        const served = await detail(makeViewerRequest({ role: 'USER' }, { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(false);
        expect(served.lastActiveAt).toBeNull();
      });

      it('inscrit ABSENT de la carte ⇒ servi à un ADMIN', async () => {
        mockResolveForTargets.mockResolvedValue(new Map());

        const served = await detail(makeViewerRequest({ role: 'ADMIN' }, { params: { id: CONV_ID } }));

        expect(served.isOnline).toBe(true);
        expect(served.lastActiveAt).toEqual(LAST_SEEN);
      });
    });

    it('counts unread for a shared-link guest, whose userId carries a Participant id', async () => {
      // La branche anonyme d'`UnifiedAuthService` pose `userId: participant.id`.
      // Le `where: { conversationId, userId, isActive: true }` ecrit a la main
      // comparait donc un id de participant a la colonne `userId` : aucun match,
      // `unreadCount` retombait a 0, et ce 0 ecrasait le badge que le socket
      // venait de pousser juste. `resolveCallerParticipant` resout par
      // `participantId` d'abord — c'est exactement le site pour lequel il existe.
      const readStatusService = {
        getUnreadCount: jest.fn<any>().mockResolvedValue(4),
        getUnreadCountsForUser: jest.fn<any>().mockResolvedValue(new Map()),
      };
      const { MessageReadStatusService } = jest.requireMock('../../../services/MessageReadStatusService') as any;
      MessageReadStatusService.mockImplementationOnce(() => readStatusService);
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      // Le double de base de donnees ne repond QUE sur la colonne interrogee :
      // une clause `{ userId: <participant id> }` ne matche rien, comme en base.
      prisma.participant.findFirst.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.id === PARTICIPANT_ID ? { id: PARTICIPANT_ID } : null)
      );

      const req = makeRequest({
        params: { id: CONV_ID },
        authContext: {
          isAuthenticated: true,
          type: 'anonymous',
          isAnonymous: true,
          userId: PARTICIPANT_ID,
          participantId: PARTICIPANT_ID,
        },
      });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(readStatusService.getUnreadCount).toHaveBeenCalledWith(PARTICIPANT_ID, CONV_ID);
      expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ unreadCount: 4 }));
    });

    it('unreadCount silently fails when participant not found', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ unreadCount: 0 })
      );
    });

    it('generates title for group conversation with no title', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ type: 'group', title: '' })
      );

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    });

    it('keeps title for direct conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(
        makeFullConversation({ type: 'direct', title: null })
      );

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.title).toBeNull();
    });

    it('calls markConversationNotificationsAsRead fire-and-forget when notificationService present', async () => {
      const markRead = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { markConversationNotificationsAsRead: markRead };
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(markRead).toHaveBeenCalledWith(USER_ID, CONV_ID);
    });

    it('notificationService error is swallowed (does not fail route)', async () => {
      fastify.notificationService = {
        markConversationNotificationsAsRead: jest.fn().mockRejectedValue(new Error('notif fail')),
      };
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.conversation.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDetailHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /conversations
  // ───────────────────────────────────────────────────────────────────────────

  describe('POST /conversations', () => {
    const getCreateHandler = (f: any) => getHandler(f, 'POST', '/conversations');

    it('calls sendErrorResponse when validateSchema throws', async () => {
      mockValidateSchema.mockImplementation(() => {
        throw new Error('Validation failed');
      });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendErrorResponse).toHaveBeenCalledWith(reply, expect.any(Error), 'create-conversation');
    });

    it('throws UNAUTHORIZED when no registeredUser', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      const req = makeRequest({
        authContext: { isAuthenticated: false, userId: null, registeredUser: null },
        body: {},
      });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('UNAUTHORIZED', expect.any(String));
      expect(mockSendErrorResponse).toHaveBeenCalled();
    });

    it('throws INVALID_OPERATION when creating direct conversation with self', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [USER_ID] });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('INVALID_OPERATION', expect.any(String));
    });

    it('throws INVALID_OPERATION when userId is included in participantIds', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', participantIds: [USER_ID, OTHER_USER_ID] });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('INVALID_OPERATION', expect.any(String));
    });

    it('returns sendNotFound when communityId provided but community not found', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
      });
      prisma.community.findFirst.mockResolvedValue(null);
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Community not found');
    });

    it('returns sendForbidden when user is not a community member', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: 'someone-else',
        members: [],
      });
      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('uses ensureUniqueConversationIdentifier with mshy_ prefix when identifier provided', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'direct',
        participantIds: [OTHER_USER_ID],
        identifier: 'myconv',
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([{ id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null }]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockEnsureUniqueConversationIdentifier).toHaveBeenCalledWith(
        prisma,
        'mshy_myconv'
      );
    });

    it('uses generateConversationIdentifier when no identifier provided', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      // Une DM emet desormais un identifiant COMPACT et opaque : elle n'a pas
      // de titre a rendre lisible, et son ancien identifiant publiait les
      // ObjectId de ses deux membres. Les conversations TITREES continuent de
      // passer par generateConversationIdentifier.
      expect(mockGenerateCompactConversationIdentifier).toHaveBeenCalled();
      expect(mockGenerateConversationIdentifier).not.toHaveBeenCalled();
    });

    it('throws USER_BLOCKED when direct conversation participants are blocked', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      mockIsBlockedBetween.mockResolvedValue(true);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockCreateError).toHaveBeenCalledWith('USER_BLOCKED');
      expect(mockSendErrorResponse).toHaveBeenCalled();
    });

    it('flips firstMessageSentAt and notifies the creator when the recipient re-initiates a silent empty DM', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      const existingDirect = {
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date('2026-08-01'),
        firstMessageSentAt: null,
        participants: [
          { userId: OTHER_USER_ID, role: 'creator' },
          { userId: USER_ID, role: 'member' },
        ],
      };
      prisma.conversation.findFirst.mockResolvedValue(existingDirect);
      prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

      await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: CONV_ID, firstMessageSentAt: null }),
          data: expect.objectContaining({ firstMessageSentAt: expect.any(Date) }),
        })
      );
      expect(fastify._mockTo).toHaveBeenCalledWith(`user:${OTHER_USER_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith(
        'conversation:new',
        expect.objectContaining({ conversationId: CONV_ID, creatorId: OTHER_USER_ID })
      );
    });

    it('does not flip firstMessageSentAt when the caller is already the creator (re-fetching own empty DM)', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      const existingDirect = {
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date('2026-08-01'),
        firstMessageSentAt: null,
        participants: [
          { userId: USER_ID, role: 'creator' },
          { userId: OTHER_USER_ID, role: 'member' },
        ],
      };
      prisma.conversation.findFirst.mockResolvedValue(existingDirect);

      await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('happy path: creates conversation and broadcasts CONVERSATION_NEW', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', participantIds: [OTHER_USER_ID], title: 'My Group' });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'My Group',
        createdAt: new Date(),
        participants: [{ userId: USER_ID, user: { displayName: 'Alice' } }],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:new', expect.any(Object));
    });

    it('sends invitation notifications when notificationService is present', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      const createInviteNotif = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      // direct sans message : silencieux à la création, voir Prisme design doc 2026-08-04
      expect(createInviteNotif).not.toHaveBeenCalled();
    });

    it('still sends invitation notifications for group conversations', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'Team', participantIds: [OTHER_USER_ID] });
      const createInviteNotif = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'Team', createdAt: new Date(), participants: [],
      });

      await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

      expect(createInviteNotif).toHaveBeenCalled();
    });

    it('uses username fallback for group invite notification when creator.displayName is null', async () => {
      // Couvre la branche `creator.displayName || creator.username` (core.ts
      // ~ligne 1167) : depuis que les directs n'appellent plus jamais
      // createConversationInviteNotification, seul un `group` peut encore
      // exercer ce fallback — voir finding de revue post-implémentation.
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'Team', participantIds: [OTHER_USER_ID] });
      const createInviteNotif = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: null, username: 'alice-username', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'Team', createdAt: new Date(), participants: [],
      });

      await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

      expect(createInviteNotif).toHaveBeenCalledWith(
        expect.objectContaining({ inviterUsername: 'alice-username' })
      );
    });

    it('emits CONVERSATION_NEW only to the creator for a fresh direct conversation', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'direct', title: null, createdAt: new Date(), participants: [],
      });

      await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

      // `createMockFastify()` (ligne 208) route tout `io.to(room).emit(...)` à
      // travers UN SEUL `mockTo`/`mockEmit` partagé (`fastify._mockTo`/
      // `fastify._mockEmit`) — le mock ROOMS de ce fichier (ligne 135) donne
      // `ROOMS.user(id) === 'user:${id}'`. Un seul emit total pour ce test
      // (notificationService est `null` par défaut dans createMockFastify, donc
      // le chemin notification n'émet rien ici) confirme que seul le créateur a
      // reçu conversation:new.
      expect(fastify._mockEmit).toHaveBeenCalledTimes(1);
      expect(fastify._mockTo).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(fastify._mockTo).not.toHaveBeenCalledWith(`user:${OTHER_USER_ID}`);
    });

    it('skips notifications when notificationService is null', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      fastify.notificationService = null;
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('creates communityMember records when communityId is provided', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
        title: 'Community Group',
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: USER_ID,
        members: [{ userId: USER_ID }],
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'Community Group',
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);
      prisma.communityMember.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(prisma.communityMember.createMany).toHaveBeenCalled();
    });

    it('creates broadcast conversation with isAnnouncementChannel and defaultWriteRole:admin', async () => {
      mockValidateSchema.mockReturnValue({ type: 'broadcast', participantIds: [], title: 'Broadcast' });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'broadcast',
        title: 'Broadcast',
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAnnouncementChannel: true,
            defaultWriteRole: 'admin',
          }),
        })
      );
    });

    it('auto-joins every participant (creator included) to the new conversation socket room', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'Room join', participantIds: [OTHER_USER_ID] });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'Room join',
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(fastify._mockJoinRoom).toHaveBeenCalledWith(USER_ID, CONV_ID);
      expect(fastify._mockJoinRoom).toHaveBeenCalledWith(OTHER_USER_ID, CONV_ID);
    });

    it('room auto-join failure is non-blocking', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'Join fail', participantIds: [OTHER_USER_ID] });
      fastify._mockJoinRoom.mockRejectedValue(new Error('join fail'));
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'Join fail',
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('broadcast error is non-blocking', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      fastify.socketIOHandler.getManager.mockReturnValue({
        getIO: jest.fn().mockReturnValue({
          to: jest.fn().mockReturnValue({
            emit: jest.fn().mockImplementation(() => { throw new Error('socket fail'); }),
          }),
        }),
        joinUserToConversationRoom: jest.fn().mockResolvedValue(undefined),
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ body: {} });
      const reply = makeReply();

      await getCreateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PUT /conversations/:id
  // ───────────────────────────────────────────────────────────────────────────

  describe('PUT /conversations/:id', () => {
    const getUpdateHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id');

    it('returns sendForbidden when membership not found and id is not meeshy', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'New Title' } });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns sendForbidden when id is meeshy (global conversation)', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      const req = makeRequest({ params: { id: 'meeshy' }, body: { title: 'New Title' } });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'The global conversation cannot be modified');
    });

    it('returns sendForbidden when moderator tries to set restricted fields', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { defaultWriteRole: 'member' },
      });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('happy path: updates conversation and broadcasts CONVERSATION_UPDATED', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });

      const req = makeRequest({
        params: { id: CONV_ID },
        body: { title: 'Updated Title' },
      });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:updated', expect.any(Object));
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockRejectedValue(new Error('DB fail'));

      const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Title' } });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE /conversations/:id
  // ───────────────────────────────────────────────────────────────────────────

  describe('DELETE /conversations/:id', () => {
    const getDeleteHandler = (f: any) => getHandler(f, 'DELETE', '/conversations/:id');

    it('returns sendForbidden when id is meeshy (global conversation)', async () => {
      const req = makeRequest({ params: { id: 'meeshy' } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'The global conversation cannot be deleted');
    });

    it('returns sendForbidden when resolveConversationId returns null', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: 'unknown-id' } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns sendForbidden when membership not found', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('happy path: soft-deletes conversation and broadcasts CONVERSATION_CLOSED', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator', id: PARTICIPANT_ID });
      // La clôture ramène ses participants DANS son écriture : le fan-out
      // nomme leurs rooms personnelles sans seconde requête. L'auteur de la
      // clôture y figure — il est encore ACTIF à l'instant de l'écriture — et
      // une audience réellement vide est un autre cas, gardé juste en dessous.
      prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        participants: [{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }],
      });

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:closed', expect.any(Object));
    });

    it('éteint les partages de position en cours du fil fermé', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator', id: PARTICIPANT_ID });
      prisma.conversation.update.mockResolvedValue({
        id: CONV_ID,
        participants: [{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }],
      });

      await getDeleteHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

      expect(fastify._mockEndLiveLocations).toHaveBeenCalledWith(CONV_ID);
    });

    it('éteint même quand il ne reste PERSONNE à prévenir', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator', id: PARTICIPANT_ID });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });

      await getDeleteHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

      expect(fastify._mockEndLiveLocations).toHaveBeenCalledWith(CONV_ID);
      expect(fastify._mockEmit).not.toHaveBeenCalledWith('conversation:closed', expect.any(Object));
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockRejectedValue(new Error('DB fail'));

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getDeleteHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /conversations/:id/analysis
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /conversations/:id/analysis', () => {
    const getAnalysisHandler = (f: any) => getHandler(f, 'GET', 'analysis');

    it('returns sendNotFound when resolveConversationId returns null', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: 'unknown' } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns sendForbidden when canAccessConversation is false', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Access denied');
    });

    it('happy path: returns analysis with null summary', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ summary: null, participantProfiles: [], history: [] })
      );
    });

    it('returns summary data when summary exists', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue({
        summary: 'Good conversation',
        currentTopics: ['topic1'],
        overallTone: 'positive',
        messageCount: 42,
        updatedAt: new Date(),
        healthScore: 0.8,
        engagementLevel: 'high',
        conflictLevel: 'low',
        dynamique: null,
        dominantEmotions: ['joy'],
      });
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.summary).not.toBeNull();
      expect(sent.summary.text).toBe('Good conversation');
    });

    it('builds traits correctly for roles with trait fields', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: 'A good communicator',
          tone: 'neutral',
          vocabularyLevel: 'high',
          typicalLength: 'medium',
          emojiUsage: 'low',
          topicsOfExpertise: ['tech'],
          catchphrases: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 100,
          confidence: 0.9,
          dominantEmotions: [],
          relationshipMap: {},
          sentimentScore: 0.5,
          engagementLevel: 'high',
          locked: false,
          traitVerbosity: 'verbose',
          traitVerbosityScore: 0.8,
          traitSocialStyle: 'extrovert',
          traitSocialStyleScore: 0.7,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob', firstName: 'Bob', lastName: 'Smith', avatar: null },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].traits).not.toBeNull();
      expect(sent.participantProfiles[0].traits.communication).toBeDefined();
    });

    it('returns null traits for roles with no trait fields', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null,
          tone: null,
          vocabularyLevel: null,
          typicalLength: null,
          emojiUsage: null,
          topicsOfExpertise: [],
          catchphrases: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 0,
          confidence: null,
          dominantEmotions: [],
          relationshipMap: {},
          sentimentScore: null,
          engagementLevel: null,
          locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].traits).toBeNull();
    });

    it('returns history when snapshots exist', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([
        {
          snapshotDate: new Date('2024-01-01'),
          overallTone: 'positive',
          healthScore: 0.9,
          engagementLevel: 'high',
          conflictLevel: 'low',
          topTopics: ['topic1'],
          dominantEmotions: [],
          messageCountAtSnapshot: 10,
          participantSnapshots: [],
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.history).toHaveLength(1);
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.agentConversationSummary.findUnique.mockRejectedValue(new Error('DB fail'));

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getAnalysisHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ─── Additional branch coverage tests ─────────────────────────────────────

  describe('GET /conversations - additional branch coverage', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    const makeConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      _count: { participants: 2 },
      isAnnouncementChannel: false,
      participants: [
        {
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: false,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: false, lastActiveAt: null },
        },
      ],
      userPreferences: [],
      messages: [],
      ...overrides,
    });

    it('lastMessage is null when messages is empty', async () => {
      const conv = makeConversation({ messages: [] });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage).toBeNull();
    });

    it('lastMessage sender null when sender is null', async () => {
      const conv = makeConversation({
        messages: [{
          id: 'msg-1',
          content: 'Hi',
          createdAt: new Date(),
          senderId: PARTICIPANT_ID,
          messageType: 'text',
          isBlurred: false,
          isViewOnce: false,
          effectFlags: null,
          expiresAt: null,
          sender: null,
          attachments: [],
          _count: { attachments: 0 },
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage.sender).toBeNull();
    });

    it('lastMessage sender with no user property uses sender own fields', async () => {
      const conv = makeConversation({
        messages: [{
          id: 'msg-2',
          content: 'Hello',
          createdAt: new Date(),
          senderId: PARTICIPANT_ID,
          messageType: 'text',
          isBlurred: false,
          isViewOnce: false,
          effectFlags: null,
          expiresAt: null,
          sender: {
            id: PARTICIPANT_ID,
            userId: USER_ID,
            displayName: 'Alice',
            avatar: 'alice.jpg',
            type: 'user',
            // No user property
            user: null,
          },
          attachments: [],
          _count: { attachments: 0 },
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      const lastMsg = reply._body.data[0].lastMessage;
      expect(lastMsg.sender.avatar).toBe('alice.jpg');
      expect(lastMsg.sender.username).toBeNull();
    });

    it('presence checker returns undefined (offline not known) - isOnline unchanged', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(undefined) };
      // Le participant est le lecteur : la loi accorde, et la valeur STOCKÉE
      // doit rester visible quand le live ne sait pas.
      mockResolveForTargets.mockImplementation(lawFaithfulResolver());
      const conv = makeConversation({
        participants: [{
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: true,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: null, isOnline: true, lastActiveAt: null },
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].participants[0].isOnline).toBe(true);
    });

    it('participant with no userId uses participant id for presence', async () => {
      fastify.presenceChecker = { isOnline: jest.fn().mockReturnValue(true) };
      const conv = makeConversation({
        participants: [{
          id: PARTICIPANT_ID,
          userId: null, // Anonymous - no userId
          conversationId: CONV_ID,
          type: 'anonymous',
          displayName: 'Anon',
          avatar: null,
          role: 'member',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: false,
          lastActiveAt: null,
          user: null,
        }],
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(fastify.presenceChecker.isOnline).toHaveBeenCalledWith(PARTICIPANT_ID);
    });

    it('group conversation with non-empty title keeps existing title', async () => {
      const conv = makeConversation({ type: 'group', title: 'My Group' });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      // generateDefaultConversationTitle should NOT be called
      expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
      expect(reply._body.data[0].title).toBe('My Group');
    });

    it('direct conversation with non-null title keeps title', async () => {
      const conv = makeConversation({ type: 'direct', title: 'DM title' });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].title).toBe('DM title');
    });
  });

  describe('GET /conversations/:id - additional branch coverage', () => {
    const getDetailHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id');

    const makeFullConversation = (overrides: any = {}) => ({
      id: CONV_ID,
      type: 'group',
      title: 'My Group',
      identifier: 'some-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      participants: [],
      userPreferences: [],
      _count: { participants: 2 },
      ...overrides,
    });

    it('keeps non-empty group title as-is', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation({
        type: 'group',
        title: 'Existing Group Title',
      }));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getDetailHandler(fastify)(req, reply);
      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.title).toBe('Existing Group Title');
      expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
    });

    it('handles unreadCount error silently when getUnreadCount throws', async () => {
      prisma.conversation.findFirst.mockResolvedValue(makeFullConversation());
      prisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
      const { MessageReadStatusService } = jest.requireMock('../../../services/MessageReadStatusService') as any;
      MessageReadStatusService.mockImplementationOnce(() => ({
        getUnreadCount: jest.fn().mockRejectedValue(new Error('unread error')),
        getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
      }));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getDetailHandler(fastify)(req, reply);
      // Should still respond successfully with unreadCount=0
      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ unreadCount: 0 })
      );
    });
  });

  describe('POST /conversations - additional branch coverage', () => {
    it('community member via members.some() check passes', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
        title: 'Test',
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: 'some-other-creator',
        members: [{ userId: USER_ID }], // user is member via members array
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.communityMember.findMany.mockResolvedValue([{ userId: USER_ID }]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'Test', createdAt: new Date(), participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('notification error is caught and does not fail creation', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Creator', username: 'creator', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Other', username: 'other', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G', createdAt: new Date(), participants: [],
      });
      fastify.notificationService = {
        createConversationInviteNotification: jest.fn().mockRejectedValue(new Error('notif error')),
      };
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      // Should succeed despite notification error
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('group conversation with non-empty title keeps existing title', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        title: 'My Group',
        participantIds: [OTHER_USER_ID],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: 'My Group',
        createdAt: new Date(),
        participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      const sentData = mockSendSuccess.mock.calls[0][1];
      expect(sentData.title).toBe('My Group');
      expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
    });

    it('direct conversation with empty participantIds generates identifier with unknown', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'direct',
        participantIds: [],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'direct',
        title: null,
        createdAt: new Date(),
        participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      // Plus de sentinelle « unknown » : l'identifiant d'une DM ne derive plus
      // d'aucun participant, donc l'absence de participantIds ne se lit plus
      // dans l'identifiant produit.
      expect(mockGenerateCompactConversationIdentifier).toHaveBeenCalled();
      expect(mockGenerateConversationIdentifier).not.toHaveBeenCalledWith(
        expect.stringContaining('unknown')
      );
    });

    it('no notification when creator not in userMap', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      // userMap doesn't include userId
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, displayName: 'Other', username: 'other', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G', createdAt: new Date(), participants: [],
      });
      const notifMock = jest.fn();
      fastify.notificationService = { createConversationInviteNotification: notifMock };
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      // Creator not found → no notifications sent
      expect(notifMock).not.toHaveBeenCalled();
    });

    it('uses username fallback when creator.displayName is null', async () => {
      mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: null, username: 'alice-username', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'direct', title: null, createdAt: new Date(), participants: [],
      });
      const createInviteNotif = jest.fn().mockResolvedValue(undefined);
      fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      // direct sans message : silencieux à la création, voir Prisme design doc 2026-08-04
      expect(createInviteNotif).not.toHaveBeenCalled();
    });

    it('socket io null - CONVERSATION_NEW not broadcast but creation succeeds', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      // Make getManager return null so io is null
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G', createdAt: new Date(), participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('createdAt as string falls back to String() conversion', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', title: 'G', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'G',
        createdAt: '2024-01-01T00:00:00.000Z', // string, not Date
        participants: [],
      });
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('communityMember createMany skipped when all users already exist in community', async () => {
      mockValidateSchema.mockReturnValue({
        type: 'group',
        participantIds: [OTHER_USER_ID],
        communityId: COMMUNITY_ID,
        title: 'CG',
      });
      prisma.community.findFirst.mockResolvedValue({
        id: COMMUNITY_ID,
        createdBy: USER_ID,
        members: [{ userId: USER_ID }],
      });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'group', title: 'CG', createdAt: new Date(), participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);
      // All users are already members — no new ones
      prisma.communityMember.findMany.mockResolvedValue([
        { userId: USER_ID },
        { userId: OTHER_USER_ID },
      ]);
      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);
      expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('PUT /conversations/:id - additional branch coverage', () => {
    const getUpdateHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id');

    it('moderator is blocked by isAnnouncementChannel field', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { isAnnouncementChannel: true },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('moderator is blocked by slowModeSeconds field', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { slowModeSeconds: 30 },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('moderator is blocked by autoTranslateEnabled field', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { autoTranslateEnabled: true },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('modérateurs'));
    });

    it('moderator can update title/description without restriction', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { title: 'New Title', description: 'New desc' },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('update with all optional fields set - changedFields has all entries', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: {
          title: 'T',
          description: 'D',
          avatar: 'a.jpg',
          banner: 'b.jpg',
          defaultWriteRole: 'member',
          isAnnouncementChannel: false,
          slowModeSeconds: 60,
          autoTranslateEnabled: true,
        },
      });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            avatar: 'a.jpg',
            banner: 'b.jpg',
            defaultWriteRole: 'member',
            isAnnouncementChannel: false,
            slowModeSeconds: 60,
            autoTranslateEnabled: true,
          }),
        })
      );
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // ── La police d'écriture n'a pas de sens sur un conteneur SANS hiérarchie ──
    //
    // Dans un tête-à-tête, l'initiateur est `creator` et l'autre `member` — un
    // artefact de « qui a tapé le premier », pas une autorité. Laisser passer
    // ces trois champs permettait à l'initiateur de faire taire son pair
    // (`conversationWriteAdmission` : member 1 < admin 3), sans retour possible
    // pour la victime, à qui ce même PUT répond 403.
    it.each([
      ['isAnnouncementChannel', { isAnnouncementChannel: true }],
      ['defaultWriteRole', { defaultWriteRole: 'admin' }],
      ['slowModeSeconds', { slowModeSeconds: 30 }],
    ])('creator of a direct conversation cannot set %s', async (_field, body) => {
      prisma.participant.findFirst.mockResolvedValue({
        role: 'creator',
        conversation: { type: 'direct' },
      });
      const req = makeRequest({ params: { id: CONV_ID }, body });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('tête-à-tête'));
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(fastify._mockEmit).not.toHaveBeenCalled();
    });

    // La borne : seuls les champs de POLICE sont refusés. Le reste du PUT
    // continue de fonctionner sur un tête-à-tête.
    it('creator of a direct conversation can still update cosmetic fields', async () => {
      prisma.participant.findFirst.mockResolvedValue({
        role: 'creator',
        conversation: { type: 'direct' },
      });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { title: 'T', description: 'D', avatar: 'a.jpg', autoTranslateEnabled: true },
      });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // La borne de l'autre côté : le canal d'annonces reste une fonctionnalité
    // entière sur un groupe.
    it('creator of a group can still turn it into an announcement channel', async () => {
      prisma.participant.findFirst.mockResolvedValue({
        role: 'creator',
        conversation: { type: 'group' },
      });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { isAnnouncementChannel: true, defaultWriteRole: 'admin' },
      });
      const reply = makeReply();

      await getUpdateHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isAnnouncementChannel: true, defaultWriteRole: 'admin' }),
        })
      );
    });

    it('socket io null in PUT - no broadcast but update succeeds', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'T' } });
      const reply = makeReply();
      await getUpdateHandler(fastify)(req, reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('DELETE /conversations/:id - additional branch coverage', () => {
    const getDeleteHandler = (f: any) => getHandler(f, 'DELETE', '/conversations/:id');

    it('socket io null in DELETE - no broadcast but delete succeeds', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator', id: PARTICIPANT_ID });
      // La clôture ramène ses participants DANS son écriture : le fan-out
      // nomme leurs rooms personnelles sans seconde requête.
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getDeleteHandler(fastify)(req, reply);
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('GET /conversations - userId=null branch', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    it('skips participant batch query when userId is null', async () => {
      const convWithParticipants = {
        id: CONV_ID,
        title: null,
        type: 'direct',
        identifier: 'conv-id',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
        banner: null,
        avatar: null,
        communityId: null,
        _count: { participants: 2 },
        isAnnouncementChannel: false,
        participants: [],
        userPreferences: [],
        messages: [],
      };
      prisma.conversation.findMany.mockResolvedValue([convWithParticipants]);
      // Authenticated but with null userId (edge case)
      const req = makeRequest({
        authContext: {
          isAuthenticated: true,
          userId: null,
          registeredUser: null,
          isAnonymous: false,
          sessionToken: null,
        },
        query: {},
      });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      // userId is null, so if(userId) block is skipped
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /conversations - lastMessage sender ?? chains', () => {
    const getListHandler = (f: any) => getHandler(f, 'GET', '/conversations');

    const makeConvWithSender = (senderOverrides: any) => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-id',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      banner: null,
      avatar: null,
      communityId: null,
      _count: { participants: 2 },
      isAnnouncementChannel: false,
      participants: [
        {
          id: PARTICIPANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          type: 'user',
          displayName: 'Alice',
          avatar: null,
          role: 'creator',
          language: 'fr',
          nickname: null,
          joinedAt: new Date(),
          isActive: true,
          isOnline: false,
          lastActiveAt: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: false, lastActiveAt: null },
        },
      ],
      userPreferences: [],
      messages: [{
        id: 'msg-1',
        content: 'Hello',
        createdAt: new Date(),
        senderId: PARTICIPANT_ID,
        messageType: 'text',
        isBlurred: false,
        isViewOnce: false,
        effectFlags: null,
        expiresAt: null,
        attachments: [],
        _count: { attachments: 0 },
        sender: senderOverrides,
      }],
    });

    it('uses sender.user.displayName when sender.displayName is null', async () => {
      const conv = makeConvWithSender({
        id: PARTICIPANT_ID,
        userId: USER_ID,
        displayName: null, // null displayName on sender
        avatar: null,
        type: 'user',
        user: { username: 'alice', displayName: 'Alice From User', avatar: 'user-avatar.jpg', isOnline: false, lastActiveAt: null, firstName: 'Alice', lastName: null },
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage.sender.displayName).toBe('Alice From User');
      expect(reply._body.data[0].lastMessage.sender.avatar).toBe('user-avatar.jpg');
    });

    it('uses null when both sender.displayName and user.displayName are null', async () => {
      const conv = makeConvWithSender({
        id: PARTICIPANT_ID,
        userId: USER_ID,
        displayName: null,
        avatar: null,
        type: 'user',
        user: { username: 'alice', displayName: null, avatar: null, isOnline: false, lastActiveAt: null, firstName: 'Alice', lastName: null },
      });
      prisma.conversation.findMany.mockResolvedValue([conv]);
      const req = makeRequest({ query: {} });
      const reply = makeReply();
      await getListHandler(fastify)(req, reply);
      expect(reply._body.data[0].lastMessage.sender.displayName).toBeNull();
      expect(reply._body.data[0].lastMessage.sender.avatar).toBeNull();
    });
  });

  describe('GET /conversations/:id/analysis - additional branch coverage', () => {
    const getAnalysisHandler = (f: any) => getHandler(f, 'GET', 'analysis');

    it('participant with null firstName and lastName uses username for displayName', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null,
          tone: null,
          vocabularyLevel: null,
          typicalLength: null,
          emojiUsage: null,
          topicsOfExpertise: [],
          catchphrases: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 0,
          confidence: null,
          dominantEmotions: [],
          relationshipMap: {},
          sentimentScore: null,
          engagementLevel: null,
          locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob-user', firstName: null, lastName: null, avatar: 'bob.jpg' },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].displayName).toBe('bob-user');
      expect(sent.participantProfiles[0].avatar).toBe('bob.jpg');
    });

    it('participant with null firstName and non-null lastName trims correctly', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null, tone: null, vocabularyLevel: null, typicalLength: null, emojiUsage: null,
          topicsOfExpertise: [], catchphrases: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 0, confidence: null, dominantEmotions: [], relationshipMap: {},
          sentimentScore: null, engagementLevel: null, locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob', firstName: null, lastName: 'Smith', avatar: null },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].displayName).toBe('Smith');
    });

    it('summary with null optional fields uses ?? null fallbacks', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue({
        summary: 'Test',
        currentTopics: [],
        overallTone: 'neutral',
        messageCount: 5,
        updatedAt: new Date(),
        healthScore: null,
        engagementLevel: null,
        conflictLevel: null,
        dynamique: null,
        dominantEmotions: null, // null → should use ?? []
      });
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.summary.dominantEmotions).toEqual([]);
      expect(sent.summary.healthScore).toBeNull();
    });

    it('participantProfile with null dominantEmotions and null relationshipMap uses ?? fallbacks', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        {
          userId: OTHER_USER_ID,
          personaSummary: null, tone: null, vocabularyLevel: null, typicalLength: null, emojiUsage: null,
          topicsOfExpertise: [], catchphrases: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 0, confidence: null,
          dominantEmotions: null,     // null → ?? []
          relationshipMap: null,      // null → ?? {}
          sentimentScore: null, engagementLevel: null, locked: false,
        },
      ]);
      prisma.agentAnalysisSnapshot.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, username: 'bob', firstName: 'Bob', lastName: null, avatar: null },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();
      await getAnalysisHandler(fastify)(req, reply);

      const sent = mockSendSuccess.mock.calls[0][1];
      expect(sent.participantProfiles[0].dominantEmotions).toEqual([]);
      expect(sent.participantProfiles[0].relationshipMap).toEqual({});
    });
  });

  describe('POST /conversations - participantIds default arg', () => {
    it('uses default participantIds=[] when not provided in validatedData', async () => {
      // validateSchema returns object WITHOUT participantIds → destructuring default [] is used
      mockValidateSchema.mockReturnValue({ type: 'broadcast', title: 'Broadcast' });
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID, type: 'broadcast', title: 'Broadcast', createdAt: new Date(), participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('POST /conversations - group conversation empty title in POST', () => {
    it('group conversation created with empty title triggers generateDefaultConversationTitle', async () => {
      mockValidateSchema.mockReturnValue({ type: 'group', participantIds: [OTHER_USER_ID] });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
        { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
      ]);
      prisma.conversation.create.mockResolvedValue({
        id: CONV_ID,
        type: 'group',
        title: null, // null title for group
        createdAt: new Date(),
        participants: [
          { userId: OTHER_USER_ID, user: { displayName: 'Bob', username: 'bob', firstName: 'Bob', lastName: null } },
        ],
      });
      mockGenerateDefaultConversationTitle.mockReturnValue('Alice, Bob');

      const handler = getHandler(fastify, 'POST', '/conversations');
      const reply = makeReply();
      await handler(makeRequest({ body: {} }), reply);

      expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    });
  });

  describe('PUT /conversations/:id - title undefined in body', () => {
    it('update without title field - title is undefined in changedFields', async () => {
      prisma.participant.findFirst.mockResolvedValue({ role: 'creator' });
      prisma.conversation.update.mockResolvedValue({ id: CONV_ID, participants: [] });

      const req = makeRequest({
        params: { id: CONV_ID },
        body: { description: 'Updated description' }, // No title
      });
      const reply = makeReply();
      const handler = getHandler(fastify, 'PUT', '/conversations/:id');
      await handler(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      // changedFields should NOT have title key
      const updateCall = prisma.conversation.update.mock.calls[0][0];
      expect(updateCall.data.title).toBeUndefined();
    });
  });
});
