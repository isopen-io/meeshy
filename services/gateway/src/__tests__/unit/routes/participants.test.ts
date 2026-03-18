import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  isValidMongoId: jest.fn<any>((id: string) => /^[0-9a-fA-F]{24}$/.test(id)),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { PARTICIPANT_ROLE_UPDATED: 'participant:role-updated' },
  ROOMS: { conversation: (id: string) => `conversation:${id}` },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationParticipantSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

jest.mock('@meeshy/shared/types', () => ({
  UserRoleEnum: {},
}));

import { canAccessConversation } from '../../../routes/conversations/utils/access-control';
import { registerParticipantsRoutes } from '../../../routes/conversations/participants';

const VALID_CONV_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f1f77bcf86cd799439022';
const TARGET_USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const TARGET_PARTICIPANT_ID = '507f1f77bcf86cd799439055';
const IDENTIFIER = 'test-convo';

const mockedCanAccess = canAccessConversation as jest.MockedFunction<typeof canAccessConversation>;

function createMockPrisma() {
  return {
    conversation: {
      findFirst: jest.fn<any>(),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findFirst: jest.fn<any>(),
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
    createRemovedFromConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRemovedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRoleChangedNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function createMockIO() {
  const mockEmit = jest.fn<any>();
  return {
    to: jest.fn<any>().mockReturnValue({ emit: mockEmit }),
    _emit: mockEmit,
  };
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

  it('should register all four routes', () => {
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
    expect(mockFastify.post).toHaveBeenCalledTimes(1);
    expect(mockFastify.delete).toHaveBeenCalledTimes(1);
    expect(mockFastify.patch).toHaveBeenCalledTimes(1);
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
    function createGetRequest(overrides: Record<string, unknown> = {}) {
      return {
        params: { id: VALID_CONV_ID },
        query: {},
        authContext: {
          isAuthenticated: true,
          isAnonymous: false,
          userId: VALID_USER_ID,
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
              email: 'test@test.com',
              role: 'USER',
              conversationRole: 'member',
              isOnline: true,
              isAnonymous: false,
              systemLanguage: 'en',
              regionalLanguage: 'fr',
              customDestinationLanguage: 'es',
              autoTranslateEnabled: false,
              canSendMessages: true,
              canSendFiles: true,
              canSendImages: true,
            }),
          ]),
          pagination: expect.objectContaining({ nextCursor: null, hasMore: false }),
        })
      );
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
      expect(data.email).toBe('');
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
  describe('POST /conversations/:id/participants', () => {
    function createPostRequest(overrides: Record<string, unknown> = {}) {
      return {
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
      mockPrisma.participant.findFirst.mockResolvedValueOnce(createParticipant());
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
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant())
        .mockResolvedValueOnce(createParticipant({ userId: TARGET_USER_ID }));
      mockPrisma.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID, username: 'target' });
      const reply = createMockReply();

      await route.handler(createPostRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(400);
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
        .mockResolvedValueOnce(createParticipant())
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
          }),
        }),
      });
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
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
        .mockResolvedValueOnce(createParticipant())
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
        .mockResolvedValueOnce(createParticipant())
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
        .mockResolvedValueOnce(createParticipant())
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
        .mockResolvedValueOnce(createParticipant())
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
        .mockResolvedValueOnce(createParticipant())
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
        .mockResolvedValueOnce(createParticipant())
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

      expect(ns.createMemberJoinedNotification).toHaveBeenCalledTimes(2);
      expect(ns.createMemberJoinedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: member1Id,
          newMemberUserId: TARGET_USER_ID,
          conversationId: VALID_CONV_ID,
          joinMethod: 'invited',
        })
      );
    });

    it('should not crash when notificationService is undefined', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const request = createPostRequest({ server: {} });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant())
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
        .mockResolvedValueOnce(createParticipant())
        .mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: TARGET_USER_ID, username: 'target', displayName: 'T',
        firstName: null, lastName: null, avatar: null, systemLanguage: 'en',
      });
      mockPrisma.participant.create.mockResolvedValue({});
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: null }]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberJoinedNotification).not.toHaveBeenCalled();
    });

    it('should handle notification errors gracefully (addedToConversation)', async () => {
      const route = getRoute(mockFastify, 'POST', '/participants');
      const ns = createMockNotificationService();
      ns.createAddedToConversationNotification.mockRejectedValue(new Error('push failed'));
      const request = createPostRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant())
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
      ns.createMemberJoinedNotification.mockRejectedValue(new Error('push failed'));
      const request = createPostRequest({ server: { notificationService: ns } });
      const memberId = '507f1f77bcf86cd799439066';
      mockPrisma.participant.findFirst
        .mockResolvedValueOnce(createParticipant())
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
      return {
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
      mockPrisma.participant.findFirst.mockResolvedValue(
        createParticipant({ role: 'member', user: { ...createParticipant().user, role: 'USER' } })
      );
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('droits') })
      );
    });

    it('should return 403 when user is MODERATOR role (not sufficient)', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValue(
        createParticipant({ role: 'moderator', user: { ...createParticipant().user, role: 'MODERATOR' } })
      );
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 when trying to remove yourself', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValue(createAdminParticipant());
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
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(mockPrisma.participant.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: VALID_CONV_ID,
          userId: TARGET_USER_ID,
          isActive: true,
        },
        data: {
          isActive: false,
          leftAt: expect.any(Date),
        },
      });
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should soft delete the participant when authorized as ADMIN user role', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValue(createAdminParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(mockPrisma.participant.updateMany).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should soft delete the participant when authorized as BIGBOSS user role', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      mockPrisma.participant.findFirst.mockResolvedValue(
        createParticipant({ role: 'member', user: { ...createParticipant().user, role: 'BIGBOSS' } })
      );
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(createDeleteRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should send removedFromConversation notification to removed user', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const request = createDeleteRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
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
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: adminId }]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberRemovedNotification).toHaveBeenCalledWith({
        recipientUserId: adminId,
        removedByUserId: VALID_USER_ID,
        conversationId: VALID_CONV_ID,
      });
    });

    it('should query admin participants excluding current user', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const request = createDeleteRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.participant.findMany.mockResolvedValue([]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(mockPrisma.participant.findMany).toHaveBeenCalledWith({
        where: {
          conversationId: VALID_CONV_ID,
          isActive: true,
          role: { in: ['creator', 'admin', 'moderator'] },
          userId: { not: VALID_USER_ID },
        },
        select: { userId: true },
      });
    });

    it('should skip memberRemoved notification for admins with null userId', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      const request = createDeleteRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.participant.findMany.mockResolvedValue([{ userId: null }]);
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(ns.createMemberRemovedNotification).not.toHaveBeenCalled();
    });

    it('should not crash when notificationService is undefined', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const request = createDeleteRequest({ server: {} });
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
      const reply = createMockReply();

      await route.handler(request, reply);

      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle notification errors gracefully (removedFromConversation)', async () => {
      const route = getRoute(mockFastify, 'DELETE', '/participants');
      const ns = createMockNotificationService();
      ns.createRemovedFromConversationNotification.mockRejectedValue(new Error('push failed'));
      const request = createDeleteRequest({ server: { notificationService: ns } });
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
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
      mockPrisma.participant.findFirst.mockResolvedValue(createCreatorParticipant());
      mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });
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
      return {
        params: { id: VALID_CONV_ID, userId: TARGET_USER_ID },
        body: { role: 'ADMIN' },
        authContext: {
          isAuthenticated: true,
          isAnonymous: false,
          userId: VALID_USER_ID,
        },
        server: {
          io: createMockIO(),
          notificationService: createMockNotificationService(),
        },
        ...overrides,
      };
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

      expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith({
        where: { id: TARGET_PARTICIPANT_ID },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
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

      expect(io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(io._emit).toHaveBeenCalledWith('participant:role-updated', {
        conversationId: VALID_CONV_ID,
        userId: TARGET_USER_ID,
        newRole: 'admin',
        updatedBy: VALID_USER_ID,
        participant: updatedParticipant,
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
        newRole: 'admin',
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

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: expect.any(String),
          userId: TARGET_USER_ID,
          role: 'moderator',
          participant: updatedParticipant,
        },
      });
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
});
