import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>, jest.fn<any>()));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  ...jest.requireActual<Record<string, unknown>>('@meeshy/shared/utils/conversation-helpers'),
  isValidMongoId: jest.fn<any>((id: string) => /^[0-9a-fA-F]{24}$/.test(id)) }));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
    CONVERSATION_JOINED: 'conversation:joined',
    CONVERSATION_PARTICIPANT_JOINED: 'conversation:participant-joined',
    CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationParticipantSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// Gate de présence — régime STRICT (2026-08-25) : la co-participation n'ouvre
// rien, seul le viewer (soi / ADMIN+ / ami accepté) voit `isOnline` et
// `lastActiveAt` d'un co-participant. `resolveForTargets` sert la LISTE,
// `resolveForTarget` les routes à cible unique (profil, rôle). Défauts neutres
// pour les témoins qui ne parlent pas de présence ; ceux du régime strict
// installent `lawFaithful*`, qui appliquent la VRAIE loi partagée à un ensemble
// d'amis piloté par le test.
const mockResolveForTargets = jest.fn<any>(async () => new Map());
const mockResolveForTarget = jest.fn<any>(async () => ({ showOnline: false, showLastSeenTimestamp: false }));
// `acceptedFriendIds` nomme l'audience d'un filtre `onlineOnly` AVANT la
// sélection : sans amis déclarés, un viewer ordinaire ne peut sélectionner
// que lui-même.
const mockAcceptedFriendIds = jest.fn<any>(async () => new Set());
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
    resolveForTarget: (...args: any[]) => mockResolveForTarget(...args),
    acceptedFriendIds: (...args: any[]) => mockAcceptedFriendIds(...args),
  }),
}));

jest.mock('@meeshy/shared/types', () => ({
  UserRoleEnum: {},
}));

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer, PresenceTarget } from '../../../services/PresenceVisibilityService';
import { canAccessConversation } from '../../../routes/conversations/utils/access-control';
import { memberRoleCasings } from '@meeshy/shared/types/role-types';
import { registerParticipantsRoutes } from '../../../routes/conversations/participants';
import { cacheParticipant, getCachedParticipant } from '../../../utils/participant-lookup-cache';

const VALID_CONV_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f1f77bcf86cd799439022';
const TARGET_USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const TARGET_PARTICIPANT_ID = '507f1f77bcf86cd799439055';
const IDENTIFIER = 'test-convo';

const mockedCanAccess = canAccessConversation as jest.MockedFunction<typeof canAccessConversation>;

const PRESENCE_HIDDEN = { showOnline: false, showLastSeenTimestamp: false } as const;

const lawFaithfulVisibility = (viewer: PresenceViewer, id: string, friendsOfViewer: ReadonlySet<string>) =>
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
    : PRESENCE_HIDDEN;

const lawFaithfulResolver =
  (friendsOfViewer: ReadonlySet<string> = new Set()) =>
  async (viewer: PresenceViewer, ids: readonly string[]) =>
    new Map(ids.map((id) => [id, lawFaithfulVisibility(viewer, id, friendsOfViewer)]));

const lawFaithfulTargetResolver =
  (friendsOfViewer: ReadonlySet<string> = new Set()) =>
  async (viewer: PresenceViewer, target: PresenceTarget) =>
    lawFaithfulVisibility(viewer, target.id, friendsOfViewer);

// `type: 'user'` est la forme RÉELLE que pose `createUnifiedAuthMiddleware`
// pour un inscrit : c'est sur elle que `viewerFromRequest` construit le viewer
// de présence. Un visiteur de lien partagé porte `type: 'anonymous'` et un
// `Participant.id` — jamais de rôle plateforme.
const viewerAuthContext = (viewer: { role: string } | 'anonymous') =>
  viewer === 'anonymous'
    ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: PARTICIPANT_ID, participantId: PARTICIPANT_ID, registeredUser: null }
    : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: VALID_USER_ID, registeredUser: { id: VALID_USER_ID, role: viewer.role } };

function createMockPrisma() {
  return {
    conversation: {
      findFirst: jest.fn<any>(),
      // L'état terminal que la porte d'ajout doit désormais opposer à
      // `resolveConversationEntry`. Vivante par défaut : c'est le conteneur dans
      // lequel tous les cas ci-dessous se placent, et le dire ici évite de le
      // répéter partout.
      findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null }),
    },
    participant: {
      findFirst: jest.fn<any>(),
      // Vide par défaut : `resolveConversationEntry` lit ici TOUTES les lignes
      // de la paire (conversation, utilisateur) — y compris celles qu'un départ
      // ou un bannissement a laissées inactives — donc « aucune ligne » =
      // primo-arrivant.
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findFirst: jest.fn<any>(),
    },
    conversationMessageStats: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

function createMockReply() {
  const reply: any = {
    status: jest.fn<any>(),
    send: jest.fn<any>(),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function createMockNotificationService() {
  return {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createRemovedFromConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRemovedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRoleChangedNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

/**
 * `.to()` rend un émetteur CHAÎNABLE, comme le vrai : `io.to(a).to(b).emit()`
 * est la forme qu'utilise `emitToConversationParticipants` pour ne livrer
 * qu'UNE copie par socket. Un `.to()` qui rend `{ emit }` sans `.to` faisait
 * planter le second maillon — et un mock qui casse sur la forme de production
 * est un témoin qui décrit un autre programme.
 *
 * `_roomsFor` rend les rooms de la chaîne qui a émis un événement donné :
 * c'est la seule façon de prouver « la room personnelle a été adressée », que
 * `expect(io.to).toHaveBeenCalledWith(...)` ne peut pas distinguer d'un simple
 * appel isolé.
 */
function createMockIO() {
  const mockEmit = jest.fn<any>();
  const mockLeave = jest.fn<any>();
  const mockFetchSockets = jest.fn<any>().mockResolvedValue([{ leave: mockLeave }]);
  const sent: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: unknown) => {
      sent.push({ rooms, event, payload });
      mockEmit(event, payload);
    },
  });
  const io = {
    to: jest.fn<any>((room: string) => chain([room])),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: mockFetchSockets }),
    _emit: mockEmit,
    _leave: mockLeave,
    _fetchSockets: mockFetchSockets,
    _roomsFor: (event: string) => sent.filter((s) => s.event === event).flatMap((s) => s.rooms),
    _payloadFor: (event: string) => sent.find((s) => s.event === event)?.payload,
  };
  return io;
}

type RouteHandler = (request: any, reply: any) => Promise<any>;
type RouteRegistration = {
  method: string;
  path: string;
  handler: RouteHandler;
  options: any;
};

function createMockFastify() {
  const routes: RouteRegistration[] = [];
  return {
    routes,
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    delete: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
  };
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathPattern: string) {
  return fastify.routes.find(r => r.method === method && r.path.includes(pathPattern))!;
}

// The mutating routes resolve Socket.IO and the notification service from the
// Fastify instance (`fastify.socketIOHandler?.getManager()?.getIO()` and
// `fastify.notificationService`), not from `request.server`. Mirror whatever a
// test wires onto `request.server` onto the registered Fastify instance so the
// route's closure observes it.
function wireServerToFastify(
  fastify: any,
  server?: { io?: unknown; notificationService?: unknown }
) {
  const invalidateParticipantCache = jest.fn<any>();
  const endLiveLocationForDepartedMember = jest.fn<any>();
  fastify.socketIOHandler = server?.io
    ? {
        getManager: () => ({
          getIO: () => server.io,
          invalidateParticipantCache,
          endLiveLocationForDepartedMember,
        }),
      }
    : undefined;
  fastify.notificationService = server?.notificationService;
  fastify._invalidateParticipantCache = invalidateParticipantCache;
  fastify._endLiveLocationForDepartedMember = endLiveLocationForDepartedMember;
}

function createParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANT_ID,
    conversationId: VALID_CONV_ID,
    userId: VALID_USER_ID,
    type: 'user',
    displayName: 'TestUser',
    avatar: null,
    role: 'member',
    language: 'en',
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true },
    joinedAt: new Date('2026-01-01'),
    isOnline: true,
    isActive: true,
    lastActiveAt: new Date('2026-01-02'),
    user: {
      id: VALID_USER_ID,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      avatar: 'avatar.png',
      email: 'test@test.com',
      role: 'USER',
      isOnline: true,
      lastActiveAt: new Date('2026-01-02'),
      systemLanguage: 'en',
      regionalLanguage: 'fr',
      customDestinationLanguage: 'es',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    },
    ...overrides,
  };
}

describe('registerParticipantsRoutes', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockFastify: ReturnType<typeof createMockFastify>;
  let mockNotificationService: ReturnType<typeof createMockNotificationService>;
  let mockIO: ReturnType<typeof createMockIO>;
  const mockOptionalAuth = jest.fn<any>();
  const mockRequiredAuth = jest.fn<any>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockFastify = createMockFastify();
    mockNotificationService = createMockNotificationService();
    mockIO = createMockIO();
    registerParticipantsRoutes(mockFastify as any, mockPrisma, mockOptionalAuth, mockRequiredAuth);
  });

  // Deux GET : la LISTE des participants, et la FICHE de l'un d'eux — cette
  // dernière ajoutée pour les visiteurs sans compte, qui n'ont pas de page
  // `/u/{pseudo}` où présenter ce qu'ils ont fourni en entrant.
  // Neuf depuis #4167 : `registerLinkAdmissionRoutes` s'enregistre depuis ce
  // même point d'entrée (`POST /links/:key/members`, `PATCH|DELETE
  // /guest-sessions/me` — la loi d'admission UNIQUE d'un lien de partage),
  // exactement comme `participant-removal.ts`/`participant-role.ts` avant
  // elle : `route-registration.ts` n'a rien à savoir de la découpe.
  it('should register all nine routes', () => {
    expect(mockFastify.get).toHaveBeenCalledTimes(2);
    expect(mockFastify.post).toHaveBeenCalledTimes(2);
    expect(mockFastify.delete).toHaveBeenCalledTimes(2);
    expect(mockFastify.patch).toHaveBeenCalledTimes(3);
  });

  it('should use optionalAuth for GET and requiredAuth for POST, DELETE, PATCH', () => {
    const getRoute = mockFastify.routes.find(r => r.method === 'GET')!;
    const postRoute = mockFastify.routes.find(r => r.method === 'POST')!;
    const deleteRoute = mockFastify.routes.find(r => r.method === 'DELETE')!;
    const patchRoute = mockFastify.routes.find(r => r.method === 'PATCH')!;

    expect(getRoute.options.preValidation).toContain(mockOptionalAuth);
    expect(postRoute.options.preValidation).toContain(mockRequiredAuth);
    expect(deleteRoute.options.preValidation).toContain(mockRequiredAuth);
    expect(patchRoute.options.preValidation).toContain(mockRequiredAuth);
  });

  // =========================================================================
  // GET /conversations/:id/participants
  // =========================================================================
  describe('GET /conversations/:id/participants', () => {
    // MODERATOR plateforme par défaut : un lecteur EXEMPT de la restriction
    // top-99, pour que les témoins historiques du listing complet (tri id asc,
    // pagination curseur) gardent leur chemin. Les témoins de la restriction
    // fournissent leur propre contexte USER/member.
    function createGetRequest(overrides: Record<string, unknown> = {}) {
      return {
        params: { id: VALID_CONV_ID },
        query: {},
        authContext: {
          isAuthenticated: true,
          isAnonymous: false,
          userId: VALID_USER_ID,
          registeredUser: { id: VALID_USER_ID, role: 'MODERATOR' },
        },
        ...overrides,
      };
    }

    it('should return 403 when conversation ID cannot be resolved', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      const request = createGetRequest({ params: { id: 'nonexistent' } });
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Unauthorized access to this conversation' })
      );
    });

    it('should return 403 when canAccessConversation returns false', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      const request = createGetRequest();
      mockedCanAccess.mockResolvedValue(false);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'CONVERSATION_ACCESS_DENIED' })
      );
    });

    it('should return participants with default pagination', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      const participant = createParticipant();
      // Ce témoin affirme `isOnline: true` : la carte doit l ACCORDER — une carte
      // vide masque désormais (régime strict), elle ne révèle plus par défaut.
      mockResolveForTargets.mockResolvedValueOnce(
        new Map([[participant.userId, { showOnline: true, showLastSeenTimestamp: true }]]),
      );
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([participant]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: PARTICIPANT_ID,
              participantId: PARTICIPANT_ID,
              userId: VALID_USER_ID,
              type: 'user',
              username: 'testuser',
              firstName: 'Test',
              lastName: 'User',
              displayName: 'TestUser',
              avatar: 'avatar.png',
              role: 'USER',
              conversationRole: 'member',
              isOnline: true,
              isAnonymous: false,
              systemLanguage: 'en',
              regionalLanguage: 'fr',
              customDestinationLanguage: 'es',
              autoTranslateEnabled: true,
              canSendMessages: true,
              canSendFiles: true,
              canSendImages: true,
            }),
          ]),
          pagination: expect.objectContaining({ nextCursor: null, hasMore: false }),
        })
      );
      // PII: l'email des co-participants n'est jamais exposé dans la liste des
      // participants (aucun client ne l'affiche ; les modos ont les endpoints admin).
      const participantData = reply.send.mock.calls[0][0].data[0];
      expect(participantData.email).toBeUndefined();
    });

    it('should use default limit of 20 when not provided', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 21 })
      );
    });

    it('should clamp limit to max 100', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { limit: '500' } }), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 })
      );
    });

    it('should use provided limit when within bounds', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { limit: '50' } }), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 })
      );
    });

    it('should filter by onlineOnly=true', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { onlineOnly: 'true' } }), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isOnline: true }),
        })
      );
    });

    it('should not filter online when onlineOnly is not "true"', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { onlineOnly: 'false' } }), reply);

      const callArgs = mockPrisma.participant.findMany.mock.calls[0][0];
      expect(callArgs.where.isOnline).toBeUndefined();
    });

    it('should filter by role (lowercased)', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { role: 'ADMIN' } }), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'admin' }),
        })
      );
    });

    it('should filter by search term case-insensitively', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { search: '  Alice  ' } }), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            displayName: { contains: 'Alice', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should not filter by search when search is empty/whitespace', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { search: '   ' } }), reply);

      const callArgs = mockPrisma.participant.findMany.mock.calls[0][0];
      expect(callArgs.where.displayName).toBeUndefined();
    });

    it('should apply cursor-based pagination', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      const cursorId = '507f1f77bcf86cd799439099';
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ query: { cursor: cursorId } }), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursorId },
          skip: 1,
          orderBy: { id: 'asc' },
        })
      );
    });

    it('should indicate hasMore=true and provide nextCursor when there are more results', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      const participants = Array.from({ length: 21 }, (_, i) =>
        createParticipant({ id: `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}` })
      );
      mockPrisma.participant.findMany.mockResolvedValue(participants);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.pagination.hasMore).toBe(true);
      expect(response.pagination.nextCursor).toBe('507f1f77bcf86cd799439019');
      expect(response.data).toHaveLength(20);
    });

    it('should indicate hasMore=false when results fit in page', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([createParticipant()]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.pagination.hasMore).toBe(false);
      expect(response.pagination.nextCursor).toBeNull();
    });

    it('should handle participant with no user data (anonymous)', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      const anonParticipant = createParticipant({
        type: 'anonymous',
        user: null,
        displayName: 'AnonUser',
        avatar: null,
        language: 'de',
      });
      mockPrisma.participant.findMany.mockResolvedValue([anonParticipant]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const data = reply.send.mock.calls[0][0].data[0];
      expect(data.username).toBe('AnonUser');
      expect(data.firstName).toBe('AnonUser');
      expect(data.lastName).toBe('');
      expect(data.avatar).toBeNull();
      expect(data.email).toBeUndefined();
      expect(data.role).toBe('USER');
      expect(data.systemLanguage).toBe('de');
      expect(data.regionalLanguage).toBe('de');
      expect(data.customDestinationLanguage).toBe('de');
      expect(data.isAnonymous).toBe(true);
    });

    it('should map permissions for admin users', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      const adminParticipant = createParticipant({
        user: { ...createParticipant().user, role: 'ADMIN' },
      });
      mockPrisma.participant.findMany.mockResolvedValue([adminParticipant]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const data = reply.send.mock.calls[0][0].data[0];
      expect(data.permissions.canAccessAdmin).toBe(true);
      expect(data.permissions.canManageUsers).toBe(true);
      expect(data.permissions.canManageGroups).toBe(true);
    });

    it('should map permissions for BIGBOSS users', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      const bbParticipant = createParticipant({
        user: { ...createParticipant().user, role: 'BIGBOSS' },
      });
      mockPrisma.participant.findMany.mockResolvedValue([bbParticipant]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const data = reply.send.mock.calls[0][0].data[0];
      expect(data.permissions.canAccessAdmin).toBe(true);
      expect(data.permissions.canManageTranslations).toBe(true);
    });

    it('should set permissions to false for regular users', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([createParticipant()]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const data = reply.send.mock.calls[0][0].data[0];
      expect(data.permissions.canAccessAdmin).toBe(false);
      expect(data.permissions.canManageUsers).toBe(false);
    });

    it('should use participant avatar when user avatar is null', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      const p = createParticipant({
        avatar: 'participant-avatar.png',
        user: { ...createParticipant().user, avatar: null },
      });
      mockPrisma.participant.findMany.mockResolvedValue([p]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      expect(reply.send.mock.calls[0][0].data[0].avatar).toBe('participant-avatar.png');
    });

    it('should default canSend permissions to true when permissions object is missing', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      const p = createParticipant({ permissions: null });
      mockPrisma.participant.findMany.mockResolvedValue([p]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const data = reply.send.mock.calls[0][0].data[0];
      expect(data.canSendMessages).toBe(true);
      expect(data.canSendFiles).toBe(true);
      expect(data.canSendImages).toBe(true);
    });

    it('should resolve conversation by identifier when id is not a valid MongoId', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: VALID_CONV_ID, identifier: IDENTIFIER });
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest({ params: { id: IDENTIFIER } }), reply);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { identifier: IDENTIFIER },
        select: { id: true },
      });
    });

    it('should order by isOnline desc, displayName asc, id asc', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { id: 'asc' },
        })
      );
    });

    // ── Cap 199+ du totalCount : l'effectif ENTIER va aux lecteurs autorisés ─
    // `canViewExactMemberCount` : ADMIN/BIGBOSS/MODERATOR plateforme, OU
    // creator/admin de la conversation. Le plafond se démontre donc sur un
    // simple USER simple membre — le défaut de `createGetRequest` est MODERATOR.
    function simpleMemberContext() {
      return {
        isAuthenticated: true,
        isAnonymous: false,
        userId: VALID_USER_ID,
        registeredUser: { id: VALID_USER_ID, role: 'USER' },
      };
    }

    it('plafonne pagination.totalCount à 199 avec drapeau pour un simple membre', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: PARTICIPANT_ID,
        role: 'member',
        userId: VALID_USER_ID,
      });
      mockPrisma.participant.findMany.mockResolvedValue([]);
      mockPrisma.participant.count.mockResolvedValue(500);
      const reply = createMockReply();

      await route.handler(createGetRequest({ authContext: simpleMemberContext() }), reply);

      const pagination = reply.send.mock.calls[0][0].pagination;
      expect(pagination.totalCount).toBe(199);
      expect(pagination.totalCountCapped).toBe(true);
    });

    it('sert le totalCount ENTIER à l\'admin du GROUPE, sans rôle plateforme', async () => {
      for (const role of ['creator', 'admin']) {
        const route = getRoute(mockFastify, 'GET', '/participants');
        mockedCanAccess.mockResolvedValue(true);
        mockPrisma.participant.findFirst.mockResolvedValue({
          id: PARTICIPANT_ID,
          role,
          userId: VALID_USER_ID,
        });
        mockPrisma.participant.findMany.mockResolvedValue([]);
        mockPrisma.participant.count.mockResolvedValue(500);
        const reply = createMockReply();

        await route.handler(createGetRequest({ authContext: simpleMemberContext() }), reply);

        const pagination = reply.send.mock.calls[0][0].pagination;
        expect(pagination.totalCount).toBe(500);
        expect(pagination.totalCountCapped).toBeUndefined();
      }
    });

    it('sert le totalCount ENTIER à un MODERATOR plateforme', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      mockPrisma.participant.count.mockResolvedValue(500);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const pagination = reply.send.mock.calls[0][0].pagination;
      expect(pagination.totalCount).toBe(500);
      expect(pagination.totalCountCapped).toBeUndefined();
    });

    it('sert le totalCount exact sans drapeau à un admin plateforme', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      mockPrisma.participant.count.mockResolvedValue(500);
      const reply = createMockReply();

      await route.handler(
        createGetRequest({
          authContext: {
            isAuthenticated: true,
            isAnonymous: false,
            userId: VALID_USER_ID,
            registeredUser: { id: VALID_USER_ID, role: 'ADMIN' },
          },
        }),
        reply
      );

      const pagination = reply.send.mock.calls[0][0].pagination;
      expect(pagination.totalCount).toBe(500);
      expect(pagination.totalCountCapped).toBeUndefined();
    });

    // ── Restriction top-99 : un USER simple membre ne voit que les plus actifs
    describe('restriction top-99 pour un USER simple membre', () => {
      const U1 = '61a000000000000000000001';
      const U2 = '61a000000000000000000002';
      const U3 = '61a000000000000000000003';
      const P1 = '61b000000000000000000001';
      const P2 = '61b000000000000000000002';
      const P3 = '61b000000000000000000003';
      const COMMUNITY_ID = '61c000000000000000000001';

      function restrictedContext() {
        return {
          isAuthenticated: true,
          isAnonymous: false,
          userId: VALID_USER_ID,
          registeredUser: { id: VALID_USER_ID, role: 'USER' },
        };
      }

      function primeRestrictedViewer() {
        mockedCanAccess.mockResolvedValue(true);
        // La résolution du rôle du lecteur dans la conversation : simple member.
        mockPrisma.participant.findFirst.mockResolvedValue({
          id: PARTICIPANT_ID,
          role: 'member',
          userId: VALID_USER_ID,
        });
      }

      it('sert les plus actifs d\'abord (stats), puis le complément, jamais l\'annuaire', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        mockPrisma.conversationMessageStats.findUnique.mockResolvedValue({
          participantStats: {
            [U1]: { messageCount: 5, lastMessageAt: '2026-08-01T00:00:00Z' },
            [U2]: { messageCount: 10, lastMessageAt: '2026-08-02T00:00:00Z' },
          },
        });
        const p1 = createParticipant({ id: P1, userId: U1, displayName: 'Uno' });
        const p2 = createParticipant({ id: P2, userId: U2, displayName: 'Dos' });
        const p3 = createParticipant({ id: P3, userId: U3, displayName: 'Tres', isOnline: false });
        mockPrisma.participant.findMany
          .mockResolvedValueOnce([p1, p2])
          .mockResolvedValueOnce([p3]);
        mockPrisma.participant.count.mockResolvedValue(3);
        const reply = createMockReply();

        await route.handler(createGetRequest({ authContext: restrictedContext() }), reply);

        const response = reply.send.mock.calls[0][0];
        expect(response.data.map((d: any) => d.id)).toEqual([P2, P1, P3]);
        expect(response.pagination.hasMore).toBe(false);
      });

      it('borne la liste restreinte à 99 même quand la page demandée est plus large', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        const stats: Record<string, { messageCount: number; lastMessageAt: string }> = {};
        const actives = Array.from({ length: 120 }, (_, i) => {
          const userId = `61d0000000000000000${String(i).padStart(5, '0')}`;
          const id = `61e0000000000000000${String(i).padStart(5, '0')}`;
          stats[userId] = { messageCount: 200 - i, lastMessageAt: '2026-08-01T00:00:00Z' };
          return createParticipant({ id, userId, displayName: `User${i}` });
        });
        mockPrisma.conversationMessageStats.findUnique.mockResolvedValue({ participantStats: stats });
        mockPrisma.participant.findMany.mockResolvedValueOnce(actives);
        mockPrisma.participant.count.mockResolvedValue(500);
        const reply = createMockReply();

        await route.handler(
          createGetRequest({ authContext: restrictedContext(), query: { limit: '100' } }),
          reply
        );

        const response = reply.send.mock.calls[0][0];
        expect(response.data).toHaveLength(99);
        expect(response.pagination.hasMore).toBe(false);
      });

      it('cherche dans le top-99 en mémoire — jamais par displayName en base', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        mockPrisma.conversationMessageStats.findUnique.mockResolvedValue({
          participantStats: {
            [U1]: { messageCount: 5, lastMessageAt: null },
            [U2]: { messageCount: 3, lastMessageAt: null },
          },
        });
        const p1 = createParticipant({ id: P1, userId: U1, displayName: 'Alice' });
        const p2 = createParticipant({ id: P2, userId: U2, displayName: 'Bob' });
        mockPrisma.participant.findMany
          .mockResolvedValueOnce([p1, p2])
          .mockResolvedValueOnce([]);
        mockPrisma.participant.count.mockResolvedValue(2);
        const reply = createMockReply();

        await route.handler(
          createGetRequest({ authContext: restrictedContext(), query: { search: 'bob' } }),
          reply
        );

        const response = reply.send.mock.calls[0][0];
        expect(response.data.map((d: any) => d.id)).toEqual([P2]);
        for (const call of mockPrisma.participant.findMany.mock.calls) {
          expect(call[0].where.displayName).toBeUndefined();
        }
      });

      it('exempte un admin de la communauté qui héberge la conversation', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        mockPrisma.conversation.findUnique.mockResolvedValue({ communityId: COMMUNITY_ID });
        mockPrisma.communityMember.findFirst.mockResolvedValue({ role: 'admin' });
        mockPrisma.participant.findMany.mockResolvedValue([]);
        const reply = createMockReply();

        await route.handler(createGetRequest({ authContext: restrictedContext() }), reply);

        expect(mockPrisma.conversationMessageStats.findUnique).not.toHaveBeenCalled();
        expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: { id: 'asc' } })
        );
      });

      it('restreint un lecteur anonyme (aucun rôle plateforme)', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        mockedCanAccess.mockResolvedValue(true);
        mockPrisma.participant.findFirst.mockResolvedValue({
          id: TARGET_PARTICIPANT_ID,
          role: 'member',
          userId: null,
        });
        mockPrisma.participant.findMany.mockResolvedValue([]);
        const reply = createMockReply();

        await route.handler(
          createGetRequest({
            authContext: {
              isAuthenticated: true,
              isAnonymous: true,
              userId: TARGET_PARTICIPANT_ID,
              participantId: TARGET_PARTICIPANT_ID,
            },
          }),
          reply
        );

        expect(mockPrisma.conversationMessageStats.findUnique).toHaveBeenCalled();
      });

      it('laisse le listing complet à un rôle de conversation au-dessus de member', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        mockedCanAccess.mockResolvedValue(true);
        mockPrisma.participant.findFirst.mockResolvedValue({
          id: PARTICIPANT_ID,
          role: 'moderator',
          userId: VALID_USER_ID,
        });
        mockPrisma.participant.findMany.mockResolvedValue([]);
        const reply = createMockReply();

        await route.handler(createGetRequest({ authContext: restrictedContext() }), reply);

        expect(mockPrisma.conversationMessageStats.findUnique).not.toHaveBeenCalled();
        expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: { id: 'asc' } })
        );
      });

      // ── L'ORDRE du complément obéit à la loi du CHAMP ─────────────────────
      // Le fill était lu `orderBy: [{ isOnline: 'desc' }, { joinedAt: 'asc' }]`
      // pour TOUT lecteur restreint, puis la porte masquait `isOnline` : les
      // en-ligne remontaient en tête et leur POSITION disait ce que le champ
      // taisait. Ce chemin ne sert JAMAIS un viewer privilégié — tout rang
      // plateforme au-dessus de USER est exempté du top-99 — donc la clé de
      // présence n'y a aucun ayant droit et sort SANS condition. Le classement
      // reste celui de l'activité (stats) puis de l'ancienneté (`joinedAt`) :
      // aucune stabilisation par la présence servie ici, elle briserait le
      // rang d'activité qui est la raison d'être de cette liste.
      const orderByKeys = (call: { orderBy?: unknown }): string[] =>
        [call.orderBy ?? []].flat().flatMap((clause) => Object.keys(clause as object));

      it('USER restreint : le complément (« fill ») ne trie que par ancienneté — aucune clé de présence', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        mockPrisma.conversationMessageStats.findUnique.mockResolvedValue({
          participantStats: { [U1]: { messageCount: 5, lastMessageAt: null } },
        });
        mockPrisma.participant.findMany
          .mockResolvedValueOnce([createParticipant({ id: P1, userId: U1, displayName: 'Uno' })])
          .mockResolvedValueOnce([createParticipant({ id: P3, userId: U3, displayName: 'Tres', isOnline: false })]);
        mockPrisma.participant.count.mockResolvedValue(2);
        const reply = createMockReply();

        await route.handler(createGetRequest({ authContext: restrictedContext() }), reply);

        expect(mockPrisma.participant.findMany).toHaveBeenCalledTimes(2);
        expect(orderByKeys(mockPrisma.participant.findMany.mock.calls[1][0])).toEqual(['joinedAt']);
        expect(reply.send.mock.calls[0][0].data.map((d: any) => d.id)).toEqual([P1, P3]);
      });

      it('USER restreint sans stats : le fill est la SEULE lecture — même règle', async () => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        mockPrisma.participant.findMany.mockResolvedValueOnce([createParticipant({ id: P3, userId: U3, displayName: 'Tres' })]);
        mockPrisma.participant.count.mockResolvedValue(1);
        const reply = createMockReply();

        await route.handler(createGetRequest({ authContext: restrictedContext() }), reply);

        expect(mockPrisma.participant.findMany).toHaveBeenCalledTimes(1);
        expect(orderByKeys(mockPrisma.participant.findMany.mock.calls[0][0])).toEqual(['joinedAt']);
      });

      it.each(['ADMIN', 'BIGBOSS'])('%s simple member ⇒ jamais restreint : listing complet trié par id, le fill ne le sert pas', async (role) => {
        const route = getRoute(mockFastify, 'GET', '/participants');
        primeRestrictedViewer();
        mockPrisma.participant.findMany.mockResolvedValue([]);
        const reply = createMockReply();

        await route.handler(
          createGetRequest({ authContext: { ...restrictedContext(), registeredUser: { id: VALID_USER_ID, role } } }),
          reply
        );

        expect(mockPrisma.conversationMessageStats.findUnique).not.toHaveBeenCalled();
        expect(mockPrisma.participant.findMany).toHaveBeenCalledTimes(1);
        expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: { id: 'asc' } })
        );
      });
    });

    it('should return 500 on unexpected error', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockRejectedValue(new Error('DB down'));
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(createGetRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Error retrieving participants' })
      );
      consoleSpy.mockRestore();
    });

    it('should handle empty results gracefully', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createGetRequest(), reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.data).toEqual([]);
      expect(response.pagination.hasMore).toBe(false);
      expect(response.pagination.nextCursor).toBeNull();
    });

    it('should combine multiple filters simultaneously', async () => {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(
        createGetRequest({
          query: { onlineOnly: 'true', role: 'MODERATOR', search: 'bob', limit: '10', cursor: PARTICIPANT_ID },
        }),
        reply
      );

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: VALID_CONV_ID,
            isActive: true,
            isOnline: true,
            role: 'moderator',
            displayName: { contains: 'bob', mode: 'insensitive' },
          }),
          cursor: { id: PARTICIPANT_ID },
          skip: 1,
          orderBy: { id: 'asc' },
          take: 11,
        })
      );
    });
  });

  // =========================================================================
  // POST /conversations/:id/participants
  // =========================================================================
  // ── Régime STRICT (2026-08-25) ────────────────────────────────────────────
  // Hors soi-même, ADMIN+ et amitié acceptée, ni `isOnline` ni `lastActiveAt`
  // d'un co-participant ne sortent — la co-participation n'est pas une
  // relation. Un rang inférieur au premier est le seul qui distingue la règle
  // juste du court-circuit : d'où un co-participant AUTRE que le lecteur.
  describe('GET /conversations/:id/participants — présence des co-participants (régime strict)', () => {
    const LAST_SEEN = new Date('2026-08-22T10:00:00.000Z');
    const otherRow = (over: Record<string, unknown> = {}) =>
      createParticipant({
        id: TARGET_PARTICIPANT_ID,
        userId: TARGET_USER_ID,
        isOnline: true,
        lastActiveAt: LAST_SEEN,
        user: { ...createParticipant().user, id: TARGET_USER_ID, username: 'bob' },
        ...over,
      });
    const anonymousRow = () =>
      otherRow({ id: 'anon-part', userId: null, type: 'anonymous', displayName: 'Anon', user: null });

    async function list(viewer: { role: string } | 'anonymous', rows: unknown[] = [otherRow()]) {
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      // Le lecteur tient un rang qui l'exempte du top-99 : ces témoins parlent
      // de présence, pas de la restriction du listing.
      mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID, role: 'admin', userId: VALID_USER_ID });
      mockPrisma.participant.findMany.mockResolvedValue(rows);
      const reply = createMockReply();

      await route.handler({ params: { id: VALID_CONV_ID }, query: {}, authContext: viewerAuthContext(viewer) }, reply);

      return reply.send.mock.calls.at(-1)?.[0]?.data as Array<{ isOnline: boolean; lastActiveAt: Date | null }>;
    }

    beforeEach(() => {
      mockResolveForTargets.mockImplementation(lawFaithfulResolver());
    });

    it('transmet le viewer demandeur (identité + rôle) et les userId des participants inscrits', async () => {
      await list({ role: 'USER' }, [createParticipant(), otherRow(), anonymousRow()]);

      expect(mockResolveForTargets).toHaveBeenCalledWith(
        { userId: VALID_USER_ID, role: 'USER' },
        [VALID_USER_ID, TARGET_USER_ID],
      );
    });

    it('soi-même ⇒ présence servie', async () => {
      const [self] = await list({ role: 'USER' }, [createParticipant()]);

      expect(self.isOnline).toBe(true);
      expect(self.lastActiveAt).toEqual(new Date('2026-01-02'));
    });

    it('ami accepté ⇒ présence servie', async () => {
      mockResolveForTargets.mockImplementation(lawFaithfulResolver(new Set([TARGET_USER_ID])));

      const [other] = await list({ role: 'USER' });

      expect(other.isOnline).toBe(true);
      expect(other.lastActiveAt).toEqual(LAST_SEEN);
    });

    it('co-participant NON ami ⇒ isOnline false et lastActiveAt null', async () => {
      const [other] = await list({ role: 'USER' });

      expect(other.isOnline).toBe(false);
      expect(other.lastActiveAt).toBeNull();
    });

    it('ADMIN non ami ⇒ présence servie', async () => {
      const [other] = await list({ role: 'ADMIN' });

      expect(other.isOnline).toBe(true);
      expect(other.lastActiveAt).toEqual(LAST_SEEN);
    });

    it('MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
      const [other] = await list({ role: 'MODERATOR' });

      expect(other.isOnline).toBe(false);
      expect(other.lastActiveAt).toBeNull();
    });

    it('viewer anonyme ⇒ cachée, et le service reçoit un viewer nul', async () => {
      const [other] = await list('anonymous');

      expect(other.isOnline).toBe(false);
      expect(other.lastActiveAt).toBeNull();
      expect(mockResolveForTargets).toHaveBeenCalledWith(null, [TARGET_USER_ID]);
    });

    // Un participant sans compte n'a pas de `User.id` : le service ne peut pas
    // le résoudre. Régime strict : entrée absente ⇒ masqué, sauf ADMIN+.
    it('participant sans compte ⇒ caché pour un USER, et rien n\'est résolu pour lui', async () => {
      const [anon] = await list({ role: 'USER' }, [anonymousRow()]);

      expect(anon.isOnline).toBe(false);
      expect(anon.lastActiveAt).toBeNull();
      expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VALID_USER_ID, role: 'USER' }, []);
    });

    it('participant sans compte ⇒ servi à un ADMIN', async () => {
      const [anon] = await list({ role: 'ADMIN' }, [anonymousRow()]);

      expect(anon.isOnline).toBe(true);
      expect(anon.lastActiveAt).toEqual(LAST_SEEN);
    });

    // Un inscrit ABSENT de la carte (id réel jamais résolu) est une anomalie :
    // `resolveForTargets` rend une entrée par id passé. Une anomalie ne révèle
    // pas — même règle que la cible sans compte, un seul site : `presenceFor`.
    it('inscrit ABSENT de la carte ⇒ caché pour un USER', async () => {
      mockResolveForTargets.mockImplementation(async () => new Map());

      const [other] = await list({ role: 'USER' });

      expect(other.isOnline).toBe(false);
      expect(other.lastActiveAt).toBeNull();
    });

    it('inscrit ABSENT de la carte ⇒ révélé à un ADMIN', async () => {
      mockResolveForTargets.mockImplementation(async () => new Map());

      const [other] = await list({ role: 'ADMIN' });

      expect(other.isOnline).toBe(true);
      expect(other.lastActiveAt).toEqual(LAST_SEEN);
    });
  });

  // ── `onlineOnly` : la SÉLECTION obéit à la loi du CHAMP ────────────────────
  // La porte de présence ne gouvernait que la VALEUR servie. `?onlineOnly=true`
  // filtrait AVANT elle — en base sur `Participant.isOnline` (listing complet),
  // en mémoire sur la valeur brute (top-99) — si bien qu'un non-ami recevait
  // exactement les membres en ligne, chacun masqué `isOnline:false` :
  // l'APPARTENANCE à la liste était la fuite. Le prédicat « en ligne » ne peut
  // porter que sur ce que le viewer a le droit de voir : soi-même et ses
  // amitiés acceptées (`acceptedFriendIds`), rien pour un anonyme, tout pour
  // ADMIN/BIGBOSS ; puis ce que la porte a MASQUÉ (préférence, blocage) sort
  // de la page — quitte à la rendre plus courte que `limit`.
  describe('GET /conversations/:id/participants?onlineOnly=true — la sélection obéit à la loi de la présence', () => {
    const FRIEND_USER_ID = '61f000000000000000000001';
    const FRIEND_PARTICIPANT_ID = '61f100000000000000000001';
    const STRANGER_USER_ID = '61f000000000000000000002';
    const STRANGER_PARTICIPANT_ID = '61f100000000000000000002';
    const SECOND_FRIEND_USER_ID = '61f000000000000000000003';
    const SECOND_FRIEND_PARTICIPANT_ID = '61f100000000000000000003';
    const THIRD_USER_ID = '61f000000000000000000009';
    const THIRD_PARTICIPANT_ID = '61f100000000000000000009';
    const friendsOfViewer: ReadonlySet<string> = new Set([FRIEND_USER_ID, SECOND_FRIEND_USER_ID]);

    const row = (id: string, userId: string, over: Record<string, unknown> = {}) =>
      createParticipant({
        id,
        userId,
        isOnline: true,
        user: { ...createParticipant().user, id: userId, username: `u-${id.slice(-2)}` },
        ...over,
      });
    const selfRow = () => createParticipant({ isOnline: true });
    const friendRow = (over: Record<string, unknown> = {}) => row(FRIEND_PARTICIPANT_ID, FRIEND_USER_ID, over);
    const strangerRow = () => row(STRANGER_PARTICIPANT_ID, STRANGER_USER_ID);

    type ViewerSpec = { role: string } | 'anonymous';
    const served = (reply: any) => reply.send.mock.calls.at(-1)?.[0]?.data as Array<{ id: string; isOnline: boolean }>;
    const servedIds = (reply: any) => served(reply).map((d) => d.id);
    const findManyWhere = () => mockPrisma.participant.findMany.mock.calls[0][0].where;

    // Le rang de CONVERSATION choisit le chemin : `admin` exempte du top-99
    // (sélection en BASE, `where`), `member` y soumet un USER ou un anonyme
    // (sélection en MÉMOIRE sur la liste bornée). Le mock de `findMany` sert
    // les MÊMES lignes aux deux — y compris un inconnu en ligne, comme le
    // ferait une base que la requête n'aurait pas bornée : la page servie doit
    // le retirer quoi qu'il en soit.
    async function list(opts: {
      viewer: ViewerSpec;
      conversationRole: 'admin' | 'member';
      rows: unknown[];
      query?: Record<string, string>;
    }) {
      const { viewer, conversationRole, rows, query = { onlineOnly: 'true' } } = opts;
      const route = getRoute(mockFastify, 'GET', '/participants');
      mockedCanAccess.mockResolvedValue(true);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: PARTICIPANT_ID,
        role: conversationRole,
        userId: viewer === 'anonymous' ? null : VALID_USER_ID,
      });
      mockPrisma.participant.findMany.mockResolvedValue(rows);
      const reply = createMockReply();

      await route.handler({ params: { id: VALID_CONV_ID }, query, authContext: viewerAuthContext(viewer) }, reply);

      return reply;
    }
    const listUnrestricted = (viewer: ViewerSpec, rows: unknown[], query?: Record<string, string>) =>
      list({ viewer, conversationRole: 'admin', rows, query });
    const listRestricted = (viewer: ViewerSpec, rows: unknown[], query?: Record<string, string>) =>
      list({ viewer, conversationRole: 'member', rows, query });

    beforeEach(() => {
      mockResolveForTargets.mockImplementation(lawFaithfulResolver(friendsOfViewer));
      mockAcceptedFriendIds.mockImplementation(async () => new Set(friendsOfViewer));
    });

    afterEach(() => {
      mockResolveForTargets.mockImplementation(async () => new Map());
      mockAcceptedFriendIds.mockImplementation(async () => new Set());
    });

    it('USER non ami ⇒ la requête ne porte que sur soi et ses amis, et aucun inconnu en ligne ne sort', async () => {
      const reply = await listUnrestricted({ role: 'USER' }, [selfRow(), friendRow(), strangerRow()]);

      expect(mockAcceptedFriendIds).toHaveBeenCalledWith(VALID_USER_ID);
      expect(findManyWhere().isOnline).toBe(true);
      expect(findManyWhere().userId).toEqual({
        in: expect.arrayContaining([VALID_USER_ID, FRIEND_USER_ID, SECOND_FRIEND_USER_ID]),
      });
      expect(findManyWhere().userId.in).toHaveLength(3);
      expect(servedIds(reply)).toEqual([PARTICIPANT_ID, FRIEND_PARTICIPANT_ID]);
    });

    it('ami en ligne ⇒ présent ; ami hors ligne ⇒ absent', async () => {
      const reply = await listUnrestricted({ role: 'USER' }, [
        friendRow(),
        row(SECOND_FRIEND_PARTICIPANT_ID, SECOND_FRIEND_USER_ID, { isOnline: false }),
      ]);

      expect(servedIds(reply)).toEqual([FRIEND_PARTICIPANT_ID]);
    });

    it.each(['ADMIN', 'BIGBOSS'])('%s ⇒ requête sans borne d\'ids, liste complète, amitiés jamais consultées', async (role) => {
      const reply = await listUnrestricted({ role }, [selfRow(), friendRow(), strangerRow()]);

      expect(mockAcceptedFriendIds).not.toHaveBeenCalled();
      expect(findManyWhere().isOnline).toBe(true);
      expect(findManyWhere().userId).toBeUndefined();
      expect(servedIds(reply)).toEqual([PARTICIPANT_ID, FRIEND_PARTICIPANT_ID, STRANGER_PARTICIPANT_ID]);
      expect(served(reply).every((d) => d.isOnline === true)).toBe(true);
    });

    it.each(['MODERATOR', 'AUDIT', 'ANALYST'])('%s ⇒ comme un USER : borné à soi et ses amis', async (role) => {
      const reply = await listUnrestricted({ role }, [selfRow(), friendRow(), strangerRow()]);

      expect(mockAcceptedFriendIds).toHaveBeenCalledWith(VALID_USER_ID);
      expect(findManyWhere().userId).toEqual({ in: expect.arrayContaining([VALID_USER_ID, FRIEND_USER_ID]) });
      expect(servedIds(reply)).toEqual([PARTICIPANT_ID, FRIEND_PARTICIPANT_ID]);
    });

    it('anonyme ⇒ page vide et aucune amitié consultée — chemin non restreint (ensemble autorisé VIDE en base)', async () => {
      const reply = await listUnrestricted('anonymous', [friendRow(), strangerRow()]);

      expect(mockAcceptedFriendIds).not.toHaveBeenCalled();
      expect(findManyWhere().userId).toEqual({ in: [] });
      expect(servedIds(reply)).toEqual([]);
    });

    it('anonyme ⇒ page vide — chemin restreint (simple member)', async () => {
      const reply = await listRestricted('anonymous', [friendRow(), strangerRow()]);

      expect(mockPrisma.conversationMessageStats.findUnique).toHaveBeenCalled();
      expect(mockAcceptedFriendIds).not.toHaveBeenCalled();
      expect(servedIds(reply)).toEqual([]);
    });

    it('chemin RESTREINT — USER simple member : le top-N est borné en mémoire à soi et ses amis en ligne', async () => {
      const reply = await listRestricted({ role: 'USER' }, [
        selfRow(),
        friendRow(),
        row(SECOND_FRIEND_PARTICIPANT_ID, SECOND_FRIEND_USER_ID, { isOnline: false }),
        strangerRow(),
      ]);

      expect(mockPrisma.conversationMessageStats.findUnique).toHaveBeenCalled();
      expect(mockAcceptedFriendIds).toHaveBeenCalledWith(VALID_USER_ID);
      expect(servedIds(reply)).toEqual([PARTICIPANT_ID, FRIEND_PARTICIPANT_ID]);
    });

    it('ami dont la présence SERVIE est masquée (préférence, blocage) ⇒ sélectionné, puis retiré de la page', async () => {
      const FULL = { showOnline: true, showLastSeenTimestamp: true } as const;
      mockResolveForTargets.mockImplementation(async (_viewer: PresenceViewer, ids: readonly string[]) =>
        new Map(ids.map((id) => [id, id === VALID_USER_ID ? FULL : PRESENCE_HIDDEN])),
      );

      const reply = await listUnrestricted({ role: 'USER' }, [selfRow(), friendRow()]);

      expect(findManyWhere().userId.in).toContain(FRIEND_USER_ID);
      expect(servedIds(reply)).toEqual([PARTICIPANT_ID]);
    });

    it('une page peut sortir plus COURTE que limit : hasMore et nextCursor restent ceux de la page lue en base', async () => {
      const reply = await listUnrestricted(
        { role: 'USER' },
        [friendRow(), strangerRow(), row(THIRD_PARTICIPANT_ID, THIRD_USER_ID)],
        { onlineOnly: 'true', limit: '2' },
      );

      const response = reply.send.mock.calls.at(-1)?.[0];
      expect(response.data.map((d: any) => d.id)).toEqual([FRIEND_PARTICIPANT_ID]);
      expect(response.pagination).toEqual(expect.objectContaining({ hasMore: true, nextCursor: STRANGER_PARTICIPANT_ID }));
    });

    it('sans onlineOnly ⇒ ni borne d\'ids ni lecture d\'amitié : la porte seule masque, la page garde tout le monde', async () => {
      const reply = await listUnrestricted({ role: 'USER' }, [selfRow(), strangerRow()], {});

      expect(mockAcceptedFriendIds).not.toHaveBeenCalled();
      expect(findManyWhere().userId).toBeUndefined();
      expect(findManyWhere().isOnline).toBeUndefined();
      expect(servedIds(reply)).toEqual([PARTICIPANT_ID, STRANGER_PARTICIPANT_ID]);
      expect(served(reply).map((d) => d.isOnline)).toEqual([true, false]);
    });
  });

  describe('POST /conversations/:id/participants', () => {
    function createPostRequest(overrides: Record<string, unknown> = {}) {
      const request = {
        params: { id: VALID_CONV_ID },
        body: { userId: TARGET_USER_ID },
        authContext: {
          isAuthenticated: true,
          isAnonymous: false,
          userId: VALID_USER_ID,
        },
        server: {
          notificationService: createMockNotificationService(),
        },
        ...overrides,
      };
      wireServerToFastify(mockFastify, request.server as any);
      return request;
    }

    it('should return 403 when conversation ID cannot be resolved', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const request = createPostRequest({ params: { id: 'nonexistent' } });
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should return 403 when current user is not an active participant', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 when target user does not exist', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValueOnce(createParticipant({ role: 'admin' }));
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'User not found' })
      );
    });

    it('should return 400 when user is already an active participant', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValueOnce(createParticipant({ role: 'admin' }));
      mockPrisma.participant.findMany.mockResolvedValueOnce([
        createParticipant({ userId: TARGET_USER_ID, isActive: true, bannedAt: null }),
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID, username: 'target' });
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    // Fermer une conversation n'écrit sur AUCUNE ligne `Participant` : le rang
    // de l'appelant survit intact à la clôture, et l'autorisation par le rang —
    // la seule que cette route pratiquait — ne pouvait donc pas la refuser.
    it('n\'ÉCRIT AUCUNE ligne `Participant` quand la conversation est close', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValueOnce(createParticipant({ role: 'admin' }));
      mockPrisma.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID, username: 'target' });
      mockPrisma.conversation.findUnique.mockResolvedValue({ isActive: false, closedAt: new Date('2026-03-01') });
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).not.toHaveBeenCalled();
      expect(mockPrisma.participant.update).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(410);
    });

    it('refuse aussi sur `isActive: false` seul — les lignes fermées par l\'ancien `leave.ts` n\'ont pas de `closedAt`', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValueOnce(createParticipant({ role: 'creator' }));
      mockPrisma.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID, username: 'target' });
      mockPrisma.conversation.findUnique.mockResolvedValue({ isActive: false, closedAt: null });
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(410);
    });

    it('ne RÉINTÈGRE pas non plus un ancien membre dans un fil terminé', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValueOnce(createParticipant({ role: 'admin' }));
      mockPrisma.participant.findMany.mockResolvedValueOnce([
        createParticipant({ userId: TARGET_USER_ID, isActive: false, bannedAt: null }),
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID, username: 'target' });
      mockPrisma.conversation.findUnique.mockResolvedValue({ isActive: false, closedAt: new Date('2026-03-01') });
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.update).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(410);
    });

    it('should create participant with correct data on success', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const targetUser = {
        id: TARGET_USER_ID,
        username: 'targetuser',
        displayName: 'Target User',
        firstName: 'Target',
        lastName: 'User',
        avatar: 'target-avatar.png',
        systemLanguage: 'fr',
      };
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: 'admin' }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue(targetUser);
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: VALID_CONV_ID,
          userId: TARGET_USER_ID,
          type: 'user',
          displayName: 'Target User',
          avatar: 'target-avatar.png',
          role: 'member',
          language: 'fr',
          permissions: expect.objectContaining({
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true,
            canSendAudios: true,
            canSendVideos: true,
            canSendLocations: false,
            canSendLinks: false,
            // Un membre ajouté après coup lit depuis son arrivée — écrit
            // EXPLICITEMENT, jamais laissé au défaut du schéma.
            canViewHistory: false,
          }),
        }),
      });
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should broadcast conversation:joined to the room on success (R6-1)', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const io = createMockIO();
      const request = createPostRequest({ server: { io, notificationService: createMockNotificationService() } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: 'admin' }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'Target',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(io._emit).toHaveBeenCalledWith('conversation:joined', {
        conversationId: VALID_CONV_ID,
        userId: TARGET_USER_ID,
      });
    });

    it('should not crash when io is undefined (R6-1 graceful)', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const request = createPostRequest({ server: { notificationService: createMockNotificationService() } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: 'admin' }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'Target',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should use username when displayName is null', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const targetUser = {
        id: TARGET_USER_ID,
        username: 'fallbackname',
        displayName: null,
        firstName: null,
        lastName: null,
        avatar: null,
        systemLanguage: null,
      };
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue(targetUser);
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          displayName: 'fallbackname',
          language: 'en',
        }),
      });
    });

    it('should fall back to firstName lastName when displayName and username are null', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const targetUser = {
        id: TARGET_USER_ID,
        username: null,
        displayName: null,
        firstName: 'John',
        lastName: 'Doe',
        avatar: null,
        systemLanguage: 'es',
      };
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue(targetUser);
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          displayName: 'John Doe',
        }),
      });
    });

    it('should fall back to firstName only when lastName is null and both displayName and username are null', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const targetUser = {
        id: TARGET_USER_ID,
        username: null,
        displayName: null,
        firstName: 'Alice',
        lastName: null,
        avatar: null,
        systemLanguage: 'en',
      };
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue(targetUser);
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ displayName: 'Alice' }),
      });
    });

    it('should fall back to empty string when all name fields are null', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const targetUser = {
        id: TARGET_USER_ID,
        username: null,
        displayName: null,
        firstName: null,
        lastName: null,
        avatar: null,
        systemLanguage: null,
      };
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue(targetUser);
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(mockPrisma.participant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ displayName: '' }),
      });
    });

    it('should send addedToConversation notification to the added user', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const ns = createMockNotificationService();
      const request = createPostRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'Target',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createAddedToConversationNotification).toHaveBeenCalledWith({
        recipientUserId: TARGET_USER_ID,
        addedByUserId: VALID_USER_ID,
        conversationId: VALID_CONV_ID,
      });
    });

    it('should send memberJoined notifications to existing members', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const ns = createMockNotificationService();
      const request = createPostRequest({ server: { notificationService: ns } });
      const member1Id = '507f1f77bcf86cd799439066';
      const member2Id = '507f1f77bcf86cd799439077';
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'Target',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([
        { userId: member1Id },
        { userId: member2Id },
      ]);
      const reply = createMockReply();

      await route.handler(request, reply);

      // Une arrivée, un appel : le profil du nouveau membre, le titre de la
      // conversation et l'effectif sont identiques pour tous les destinataires.
      expect(ns.createMemberJoinedNotificationsBatch).toHaveBeenCalledTimes(1);
      expect(ns.createMemberJoinedNotificationsBatch).toHaveBeenCalledWith(
        [member1Id, member2Id],
        {
          newMemberUserId: TARGET_USER_ID,
          conversationId: VALID_CONV_ID,
          joinMethod: 'invited',
        }
      );
      expect(ns.createMemberJoinedNotification).not.toHaveBeenCalled();
    });

    it('should not crash when notificationService is undefined', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const request = createPostRequest({ server: {} });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'T',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should skip memberJoined notification for members with null userId', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const ns = createMockNotificationService();
      const request = createPostRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'T',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: null }]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberJoinedNotificationsBatch).not.toHaveBeenCalled();
    });

    it('should handle notification errors gracefully (addedToConversation)', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const ns = createMockNotificationService();
      ns.createAddedToConversationNotification.mockRejectedValue(new Error('push failed'));
      const request = createPostRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'T',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(request, reply);
      await new Promise(r => setTimeout(r, 10));

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      consoleSpy.mockRestore();
    });

    it('should handle notification errors gracefully (memberJoined)', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const ns = createMockNotificationService();
      ns.createMemberJoinedNotificationsBatch.mockRejectedValue(new Error('push failed'));
      const request = createPostRequest({ server: { notificationService: ns } });
      const memberId = '507f1f77bcf86cd799439066';
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: "admin" }))
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'T',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: memberId }]);
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(request, reply);
      await new Promise(r => setTimeout(r, 10));

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      consoleSpy.mockRestore();
    });

    it('should return 500 on unexpected error', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      mockPrisma.participant.findFirst.mockRejectedValue(new Error('DB error'));
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(createPostRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // DELETE /conversations/:id/participants/:userId
  // =========================================================================
  describe('DELETE /conversations/:id/participants/:userId', () => {
    function createDeleteRequest(overrides: Record<string, unknown> = {}) {
      const request = {
        params: { id: VALID_CONV_ID, userId: TARGET_USER_ID },
        authContext: {
          isAuthenticated: true,
          isAnonymous: false,
          userId: VALID_USER_ID,
        },
        server: {
          notificationService: createMockNotificationService(),
        },
        ...overrides,
      };
      wireServerToFastify(mockFastify, request.server as any);
      return request;
    }

    function createCreatorParticipant() {
      return createParticipant({
        role: 'creator',
        user: { ...createParticipant().user, role: 'USER' },
      });
    }

    function createAdminParticipant() {
      return createParticipant({
        role: 'admin',
        user: { ...createParticipant().user, role: 'ADMIN' },
      });
    }

    /** La CIBLE du retrait — une autre personne que l'appelant. */
    function createTargetParticipant(overrides: Record<string, unknown> = {}) {
      return {
        id: TARGET_PARTICIPANT_ID,
        conversationId: VALID_CONV_ID,
        userId: TARGET_USER_ID,
        role: 'member',
        isActive: true,
        leftAt: null,
        bannedAt: null,
        displayName: 'Target',
        shareLinkId: null,
        ...overrides,
      };
    }

    /**
     * Le handler interroge DEUX participants — l'appelant, puis la cible — et la
     * cible se résout sous les DEUX colonnes (`userId`, ou `Participant.id` qui
     * est la seule identité d'un visiteur venu par un lien partagé).
     *
     * Un double qui rend la MÊME ligne aux deux questions fait croire au handler
     * que l'appelant se retire lui-même. Celui-ci répond au `where`, comme la
     * vraie requête.
     */
    function stubParticipantLookups(caller: any, target: any = createTargetParticipant()) {
      mockPrisma.participant.findFirst.mockImplementation((async (args: any) => {
        const where = args?.where ?? {};
        if (where.userId === VALID_USER_ID) return caller;
        if (target && where.userId !== undefined && where.userId === target.userId) return target;
        if (target && where.id !== undefined && where.id === target.id) return target;
        return null;
      }) as any);
      mockPrisma.participant.update.mockResolvedValue(target ?? {});
      return target;
    }

    it('should return 403 when conversation ID cannot be resolved', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const request = createDeleteRequest({ params: { id: 'bad-id', userId: TARGET_USER_ID } });
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when current user is not a participant', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when current user is neither admin nor creator', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(
        createParticipant({ role: 'member', user: { ...createParticipant().user, role: 'USER' } })
      );
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('droits') })
      );
    });

    it('should allow MODERATOR role to remove participants', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(
        createParticipant({ role: 'moderator', user: { ...createParticipant().user, role: 'MODERATOR' } })
      );
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should return 400 when trying to remove yourself', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(createAdminParticipant());
      const request = createDeleteRequest({ params: { id: VALID_CONV_ID, userId: VALID_USER_ID } });
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('supprimer') })
      );
    });

    it('should soft delete the participant when authorized as creator', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      // `update` sur la ligne RÉSOLUE, plus `updateMany` : une écriture qui ne
      // trouve pas sa cible doit échouer, pas répondre 200 en silence.
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: TARGET_PARTICIPANT_ID },
        data: {
          isActive: false,
          leftAt: expect.any(Date),
        },
      });
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should broadcast conversation:participant-left to the room on removal (R6-2)', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const io = createMockIO();
      const request = createDeleteRequest({ server: { io, notificationService: createMockNotificationService() } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(io._emit).toHaveBeenCalledWith('conversation:participant-left', expect.objectContaining({
        conversationId: VALID_CONV_ID,
        userId: TARGET_USER_ID,
        displayName: 'Target',
        leftAt: expect.any(String),
      }));
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should evict removed user socket from conversation room and invalidate participant cache', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const io = createMockIO();
      const request = createDeleteRequest({ server: { io, notificationService: createMockNotificationService() } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(io.in).toHaveBeenCalledWith(`user:${TARGET_USER_ID}`);
      expect(io._leave).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(mockFastify._invalidateParticipantCache).toHaveBeenCalledWith(TARGET_USER_ID, VALID_CONV_ID);
      // Le retrait met fin à l'appartenance sans fermer le fil, et
      // `location:live-stop` la résout avant tout (`isActive: true`) : sans
      // cette extinction, la position réelle du retiré reste affichée au groupe
      // qui vient de l'exclure, et lui n'a plus aucun moyen de la retirer.
      expect(mockFastify._endLiveLocationForDepartedMember).toHaveBeenCalledWith(
        VALID_CONV_ID,
        TARGET_USER_ID
      );
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should evict the removed participant from the message-send lookup cache', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();
      // C'est la ligne de la CIBLE qui est évincée — celle que le handler vient
      // de résoudre, pas celle de l'appelant.
      cacheParticipant(TARGET_PARTICIPANT_ID, VALID_CONV_ID, {
        id: TARGET_PARTICIPANT_ID,
        conversationId: VALID_CONV_ID,
        isActive: true,
      });

      await route.handler(createDeleteRequest(), reply);

      expect(getCachedParticipant(TARGET_PARTICIPANT_ID, VALID_CONV_ID)).toBeUndefined();
    });

    it('should soft delete the participant when authorized as ADMIN user role', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(createAdminParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(mockPrisma.participant.update).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should soft delete the participant when authorized as BIGBOSS user role', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      stubParticipantLookups(
        createParticipant({ role: 'member', user: { ...createParticipant().user, role: 'BIGBOSS' } })
      );
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should send removedFromConversation notification to removed user', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const request = createDeleteRequest({ server: { notificationService: ns } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createRemovedFromConversationNotification).toHaveBeenCalledWith({
        recipientUserId: TARGET_USER_ID,
        removedByUserId: VALID_USER_ID,
        conversationId: VALID_CONV_ID,
      });
    });

    it('should send memberRemoved notifications to admins/moderators/creators', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const adminId = '507f1f77bcf86cd799439066';
      const request = createDeleteRequest({ server: { notificationService: ns } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: adminId }]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberRemovedNotification).toHaveBeenCalledWith({
        recipientUserId: adminId,
        removedByUserId: VALID_USER_ID,
        conversationId: VALID_CONV_ID,
      });
    });

    // La requête porte les DEUX graphies de chaque rang (#4008) : un `where`
    // Prisma ne replie pas la casse, et les hôtes du salon global — écrits en
    // majuscules par l'ancien `InitService` — n'étaient prévenus d'aucun
    // retrait. `memberRoleCasings` est le site unique de cette énumération.
    it('should query admin participants excluding current user', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const request = createDeleteRequest({ server: { notificationService: ns } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith({
        where: {
          conversationId: VALID_CONV_ID,
          isActive: true,
          role: { in: memberRoleCasings(['creator', 'admin', 'moderator']) },
          userId: { not: VALID_USER_ID },
        },
        select: { userId: true },
      });
    });

    it('should skip memberRemoved notification for admins with null userId', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const request = createDeleteRequest({ server: { notificationService: ns } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: null }]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberRemovedNotification).not.toHaveBeenCalled();
    });

    it('should not crash when notificationService is undefined', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const request = createDeleteRequest({ server: {} });
      stubParticipantLookups(createCreatorParticipant());
      
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle notification errors gracefully (removedFromConversation)', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      ns.createRemovedFromConversationNotification.mockRejectedValue(new Error('push failed'));
      const request = createDeleteRequest({ server: { notificationService: ns } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(request, reply);
      await new Promise(r => setTimeout(r, 10));

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      consoleSpy.mockRestore();
    });

    it('should handle notification errors gracefully (memberRemoved)', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      ns.createMemberRemovedNotification.mockRejectedValue(new Error('push failed'));
      const adminId = '507f1f77bcf86cd799439066';
      const request = createDeleteRequest({ server: { notificationService: ns } });
      stubParticipantLookups(createCreatorParticipant());
      
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: adminId }]);
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(request, reply);
      await new Promise(r => setTimeout(r, 10));

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      consoleSpy.mockRestore();
    });

    it('should return 500 on unexpected error', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      mockPrisma.participant.findFirst.mockRejectedValue(new Error('DB error'));
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(createDeleteRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // PATCH /conversations/:id/participants/:userId/role
  // =========================================================================
  describe('PATCH /conversations/:id/participants/:userId/role', () => {
    function createPatchRequest(overrides: Record<string, unknown> = {}) {
      const request = {
        params: { id: VALID_CONV_ID, userId: TARGET_USER_ID },
        body: { role: 'ADMIN' },
        authContext: viewerAuthContext({ role: 'USER' }),
        server: {
          io: createMockIO(),
          notificationService: createMockNotificationService(),
        },
        ...overrides,
      };
      wireServerToFastify(mockFastify, request.server as any);
      return request;
    }

    function createCreatorParticipant() {
      return createParticipant({
        role: 'creator',
        user: { ...createParticipant().user, role: 'USER' },
      });
    }

    function createAdminParticipant() {
      return createParticipant({
        role: 'admin',
        user: { ...createParticipant().user, role: 'ADMIN' },
      });
    }

    // ── Cycle 92 : la seule des cinq surfaces à publier un rang BRUT ──────────
    //
    // Les trois routes qui LISTENT des participants construisent leur projection
    // et gardent la présence ; cette route-ci passait `updatedParticipant` — un
    // rang Prisma lu en `include`, donc tous les scalaires — directement sous la
    // clé `participant` que déclare `conversationParticipantSchema`.
    //
    // Comme le schéma DÉCLARE `isOnline` et `lastActiveAt`, le sérialiseur les
    // laissait passer : la présence de la personne dont on changeait le rang
    // sortait sans que sa préférence `showOnlineStatus` soit consultée. Le
    // jumeau `POST …/invite` faisait exactement la même chose et ne fuyait pas,
    // par le seul accident d'une clé mal nommée (`member` vs `membership`).
    //
    // La diffusion Socket.IO est le chemin le plus exposé : elle ne passe par
    // AUCUN sérialiseur, donc le rang y partait entier — état privé par paire
    // compris — à toute la salle.
    describe('la charge utile du participant promu', () => {
      const targetRow = (over: Record<string, unknown> = {}) =>
        createParticipant({
          id: TARGET_PARTICIPANT_ID,
          userId: TARGET_USER_ID,
          role: 'admin',
          nickname: 'surnom privé',
          shareLinkId: 'lnk-1',
          bannedAt: null,
          leftAt: null,
          deletedForMe: null,
          ...over,
        });

      async function promote(row: Record<string, unknown>, viewerRole: string = 'USER') {
        const route = getRoute(mockFastify, 'PATCH', '/role');
        const io = createMockIO();
        const request = createPatchRequest({
          server: { io, notificationService: createMockNotificationService() },
          authContext: viewerAuthContext({ role: viewerRole }),
        });
        mockPrisma.participant.findFirst
          .mockResolvedValueOnce(createCreatorParticipant())
          .mockResolvedValueOnce(createParticipant({
            id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member',
          }));
        mockPrisma.participant.update.mockResolvedValue({});
        mockPrisma.participant.findUnique.mockResolvedValue(row);
        const reply = createMockReply();

        await route.handler(request, reply);

        return {
          payload: reply.send.mock.calls.at(-1)?.[0]?.data,
          broadcast: io._emit.mock.calls.at(-1)?.[1],
        };
      }

      it('masque la présence de la cible quand elle refuse de montrer son statut', async () => {
        mockResolveForTarget.mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

        const { payload } = await promote(targetRow());

        expect(payload.participant.isOnline).toBe(false);
        expect(payload.participant.lastActiveAt).toBeNull();
      });

      // Régime STRICT (2026-08-25) : la réponse REST au demandeur est gatée
      // sur la CIBLE du changement de rang, pour le viewer DEMANDEUR — identité
      // ET rôle. Sans le rôle, ADMIN et USER seraient indiscernables ; sans
      // l'identité, l'amitié le serait.
      it('consulte le gate sur la CIBLE du changement de rang, pour le viewer demandeur', async () => {
        mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

        await promote(targetRow());

        expect(mockResolveForTarget).toHaveBeenCalledWith(
          { userId: VALID_USER_ID, role: 'USER' },
          { id: TARGET_USER_ID, deactivatedAt: null },
        );
      });

      it('ami accepté ⇒ présence de la cible servie', async () => {
        mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver(new Set([TARGET_USER_ID])));

        const { payload } = await promote(targetRow());

        expect(payload.participant.isOnline).toBe(true);
        expect(payload.participant.lastActiveAt).toEqual(new Date('2026-01-02'));
      });

      it('cible NON amie ⇒ isOnline false et lastActiveAt null', async () => {
        mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());

        const { payload } = await promote(targetRow());

        expect(payload.participant.isOnline).toBe(false);
        expect(payload.participant.lastActiveAt).toBeNull();
      });

      it('ADMIN non ami ⇒ présence de la cible servie', async () => {
        mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());

        const { payload } = await promote(targetRow(), 'ADMIN');

        expect(payload.participant.isOnline).toBe(true);
        expect(payload.participant.lastActiveAt).toEqual(new Date('2026-01-02'));
      });

      it('MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
        mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());

        const { payload } = await promote(targetRow(), 'MODERATOR');

        expect(payload.participant.isOnline).toBe(false);
        expect(payload.participant.lastActiveAt).toBeNull();
      });

      it('sépare le rang de conversation du rôle global', async () => {
        mockResolveForTarget.mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

        const { payload } = await promote(targetRow());

        expect(payload.participant.conversationRole).toBe('admin');
        expect(payload.participant.role).toBe('USER');
        expect(payload.participant.participantId).toBe(TARGET_PARTICIPANT_ID);
      });

      // La diffusion Socket.IO n'a pas de destinataire nommé — elle ne peut
      // pas être gatée par lecteur — donc elle ne transporte plus du tout
      // isOnline/lastActiveAt (régime strict, 2026-08-25), quelle que soit la
      // visibilité résolue pour la réponse REST.
      it('ne diffuse plus isOnline/lastActiveAt du tout, contrairement à la réponse REST', async () => {
        mockResolveForTarget.mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

        const { payload, broadcast } = await promote(targetRow());

        expect(payload.participant.isOnline).toBe(false);
        expect(broadcast.participant).not.toHaveProperty('isOnline');
        expect(broadcast.participant).not.toHaveProperty('lastActiveAt');
        const { isOnline: _isOnline, lastActiveAt: _lastActiveAt, ...restOfPayload } = payload.participant;
        expect(broadcast.participant).toEqual(restOfPayload);
      });

      // La diffusion n'a pas de sérialiseur pour l'arrêter : ce qui n'est pas
      // retiré à la SOURCE part sur le fil.
      it('ne diffuse pas l\'état privé par paire du rang Prisma', async () => {
        mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

        const { broadcast } = await promote(targetRow());

        expect(broadcast.participant).not.toHaveProperty('nickname');
        expect(broadcast.participant).not.toHaveProperty('shareLinkId');
        expect(broadcast.participant).not.toHaveProperty('bannedAt');
        expect(broadcast.participant).not.toHaveProperty('deletedForMe');
        expect(broadcast.participant).not.toHaveProperty('conversationId');
      });
    });

    it('should return 400 for invalid role', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ body: { role: 'SUPERUSER' } });
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid role') })
      );
    });

    it('should accept ADMIN role', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ body: { role: 'ADMIN' } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should accept MODERATOR role', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ body: { role: 'MODERATOR' } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'moderator' }));
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should accept MEMBER role', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ body: { role: 'MEMBER' } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'admin' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'member' }));
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should return 403 when conversation ID cannot be resolved', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ params: { id: 'bad-id', userId: TARGET_USER_ID } });
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when current user is not a participant', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when current user is neither admin nor creator', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst.mockResolvedValue(
        createParticipant({ role: 'member', user: { ...createParticipant().user, role: 'USER' } })
      );
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 when trying to change own role', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ params: { id: VALID_CONV_ID, userId: VALID_USER_ID } });
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'You cannot modify your own role' })
      );
    });

    it('should return 404 when target participant is not found or inactive', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(null);
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Participant not found or inactive' })
      );
    });

    it('should return 403 when trying to change creator role', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createAdminParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'creator' }));
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('creator') })
      );
    });

    it('should update role to lowercased value', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: TARGET_PARTICIPANT_ID },
        data: { role: 'admin' },
      });
    });

    it('should fetch updated participant with user select after update', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      // Le `select` s'aligne sur celui de la LISTE : la fabrique partagée sert
      // `role` global, les trois langues et les horodatages de compte, qu'un
      // select court aurait fait retomber sur des valeurs par défaut.
      expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith({
        where: { id: TARGET_PARTICIPANT_ID },
        include: {
          user: {
            select: expect.objectContaining({
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
              systemLanguage: true,
            }),
          },
        },
      });
    });

    it('should emit Socket.IO event with correct payload', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const io = createMockIO();
      const request = createPatchRequest({ server: { io, notificationService: createMockNotificationService() } });
      const updatedParticipant = createParticipant({ id: TARGET_PARTICIPANT_ID, role: 'admin' });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(updatedParticipant);
      const reply = createMockReply();

      await route.handler(request, reply);

      // Ce témoin assertait l'identité du RANG PRISMA (`participant:
      // updatedParticipant`) : il tenait pour correct que la diffusion parte
      // brute, sur un chemin qui n'a AUCUN sérialiseur pour l'arrêter. Repointé
      // sur la forme de fil — ce que la salle a le droit de recevoir.
      expect(io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(io._emit).toHaveBeenCalledWith('participant:role-updated', {
        conversationId: VALID_CONV_ID,
        userId: TARGET_USER_ID,
        newRole: 'admin',
        updatedBy: VALID_USER_ID,
        participant: expect.objectContaining({
          participantId: TARGET_PARTICIPANT_ID,
          conversationRole: 'admin',
          role: 'USER',
        }),
      });
    });

    it('should send memberRoleChanged notification', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const ns = createMockNotificationService();
      const request = createPatchRequest({ server: { io: createMockIO(), notificationService: ns } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberRoleChangedNotification).toHaveBeenCalledWith({
        recipientUserId: TARGET_USER_ID,
        changedByUserId: VALID_USER_ID,
        conversationId: VALID_CONV_ID,
        // createMemberRoleChangedNotification expects the role as an uppercase
        // enum ('ADMIN' | 'MODERATOR' | 'MEMBER'); the route uppercases newRole
        // for the notification while the socket payload keeps the stored case.
        newRole: 'ADMIN',
        previousRole: 'member',
      });
    });

    it('should include userId, role, and participant in success response', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const updatedParticipant = createParticipant({ id: TARGET_PARTICIPANT_ID, role: 'moderator' });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(updatedParticipant);
      const request = createPatchRequest({ body: { role: 'MODERATOR' } });
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            message: expect.any(String),
            userId: TARGET_USER_ID,
            role: 'moderator',
            participant: expect.objectContaining({
              participantId: TARGET_PARTICIPANT_ID,
              conversationRole: 'moderator',
            }),
          }),
        })
      );
    });

    it('should not crash when io is undefined', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ server: { notificationService: createMockNotificationService() } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should not crash when notificationService is undefined', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const request = createPatchRequest({ server: { io: createMockIO() } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should allow BIGBOSS user role to change participant roles', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant({ role: 'member', user: { ...createParticipant().user, role: 'BIGBOSS' } }))
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();

      await route.handler(createPatchRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle notification errors gracefully (memberRoleChanged)', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      const ns = createMockNotificationService();
      ns.createMemberRoleChangedNotification.mockRejectedValue(new Error('push failed'));
      const request = createPatchRequest({ server: { io: createMockIO(), notificationService: ns } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createCreatorParticipant())
        .mockResolvedValueOnce(createParticipant({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member' }));
      mockPrisma.participant.update.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue(createParticipant({ role: 'admin' }));
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(request, reply);
      await new Promise(r => setTimeout(r, 10));

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      consoleSpy.mockRestore();
    });

    it('should return 500 on unexpected error', async () => {
      const route = getRoute(mockFastify, 'PATCH', '/role');
      mockPrisma.participant.findFirst.mockRejectedValue(new Error('DB error'));
      const reply = createMockReply();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await route.handler(createPatchRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Error updating participant role' })
      );
      consoleSpy.mockRestore();
    });
  });
  // =========================================================================
  // #4008 — la casse du rang de conversation ne décide de rien
  // =========================================================================
  //
  // `Participant.role` s'écrit en minuscules depuis #3875, mais la migration
  // des lignes historiques n'est pas passée en production. Les seules lignes
  // privilégiées écrites en MAJUSCULES sont celles des comptes `meeshy`/`admin`
  // du salon global, que l'ancien `InitService` posait en `CREATOR`/`ADMIN`.
  //
  // #4008 range ces lecteurs parmi les défauts « fail-closed ». **La famille se
  // sépare en deux selon le SENS de la garde** : celle qui ACCORDE un pouvoir
  // échoue fermée (l'admin perd ses droits) ; celle qui REFUSE une action
  // échoue OUVERTE (la protection du créateur ne tire pas). Les deux sont ici.
  describe('Le rang de conversation se lit quelle que soit sa casse (#4008)', () => {
    const conversationAdmin = () =>
      createParticipant({ role: 'admin', user: { ...createParticipant().user, role: 'USER' } });

    describe('PATCH /conversations/:id/participants/:userId/role', () => {
      function patchRequest() {
        const request = {
          params: { id: VALID_CONV_ID, userId: TARGET_USER_ID },
          body: { role: 'ADMIN' },
          authContext: viewerAuthContext({ role: 'USER' }),
          server: { io: createMockIO(), notificationService: createMockNotificationService() },
        };
        wireServerToFastify(mockFastify, request.server as any);
        return request;
      }

      it('protège le créateur dont la ligne est écrite CREATOR', async () => {
        const route = getRoute(mockFastify, 'PATCH', '/role');
        mockPrisma.participant.findFirst
          .mockResolvedValueOnce(conversationAdmin())
          .mockResolvedValueOnce(createParticipant({
            id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'CREATOR',
          }));
        const reply = createMockReply();

        await route.handler(patchRequest(), reply);

        expect(reply.status).toHaveBeenCalledWith(403);
        expect(mockPrisma.participant.update).not.toHaveBeenCalled();
      });

      it('laisse agir un admin de conversation dont la ligne est écrite ADMIN', async () => {
        const route = getRoute(mockFastify, 'PATCH', '/role');
        mockPrisma.participant.findFirst
          .mockResolvedValueOnce(createParticipant({
            role: 'ADMIN', user: { ...createParticipant().user, role: 'USER' },
          }))
          .mockResolvedValueOnce(null);
        const reply = createMockReply();

        await route.handler(patchRequest(), reply);

        // 404 (cible absente) et non 403 : la porte d'autorisation est franchie.
        expect(reply.status).toHaveBeenCalledWith(404);
        expect(reply.status).not.toHaveBeenCalledWith(403);
      });
    });

    describe('DELETE /conversations/:id/participants/:userId', () => {
      it('laisse retirer un participant à un admin dont la ligne est écrite ADMIN', async () => {
        const route = getRoute(mockFastify, 'DELETE', '/participants');
        mockPrisma.participant.findFirst
          .mockResolvedValueOnce(createParticipant({
            role: 'ADMIN', user: { ...createParticipant().user, role: 'USER' },
          }))
          .mockResolvedValue(null);
        const reply = createMockReply();

        await route.handler(
          {
            params: { id: VALID_CONV_ID, userId: TARGET_USER_ID },
            authContext: viewerAuthContext({ role: 'USER' }),
            server: { io: createMockIO(), notificationService: createMockNotificationService() },
          },
          reply,
        );

        expect(reply.status).toHaveBeenCalledWith(404);
        expect(reply.status).not.toHaveBeenCalledWith(403);
      });
    });

    describe('POST /conversations/:id/participants', () => {
      it('laisse ajouter un membre à un modérateur dont la ligne est écrite MODERATOR', async () => {
        const route = getRoute(mockFastify, 'POST', '/participants');
        mockPrisma.participant.findFirst.mockResolvedValueOnce(
          createParticipant({ role: 'MODERATOR', user: { ...createParticipant().user, role: 'USER' } }),
        );
        mockPrisma.user.findFirst.mockResolvedValue(null);
        const reply = createMockReply();

        await route.handler(
          {
            params: { id: VALID_CONV_ID },
            body: { userId: TARGET_USER_ID },
            authContext: viewerAuthContext({ role: 'USER' }),
            server: { io: createMockIO(), notificationService: createMockNotificationService() },
          },
          reply,
        );

        expect(reply.status).not.toHaveBeenCalledWith(403);
      });
    });
  });
});
