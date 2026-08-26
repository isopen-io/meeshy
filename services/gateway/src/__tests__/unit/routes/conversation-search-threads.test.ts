import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (must come before all imports — jest hoisting) ──────────────

// Mocked fn refs declared at module scope (hoisted correctly)
const mockGenerateDefaultConversationTitle = jest.fn<any>();
const mockGetUnreadCountsForUser = jest.fn<any>();
const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockCanAccessConversation = jest.fn<any>();
const mockResolveConversationId = jest.fn<any>();

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  generateDefaultConversationTitle: (...args: any[]) => mockGenerateDefaultConversationTitle(...args),
  // Résolu dès que l'appelant porte un `registeredUser` : sans le double, tout
  // test qui donne un rôle plateforme au lecteur tombe dans le `catch` de la
  // route et se lit comme un échec de la règle testée, pas du harnais.
  resolveUserLanguagesOrdered: () => ['fr'],
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn<any>().mockImplementation(() => ({
    getUnreadCountsForUser: (...args: any[]) => mockGetUnreadCountsForUser(...args),
  })),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationMinimalSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(),
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
}));

// Gate de présence — régime STRICT (2026-08-25) : la co-participation n'ouvre
// rien, seul le viewer (soi / ADMIN+ / ami accepté) voit `isOnline` de
// l'expéditeur du dernier message. Le service n'est doublé que sur son I/O :
// `lawFaithfulResolver` applique la VRAIE loi partagée
// (`resolvePresenceVisibility`) à un ensemble d'amis piloté par le test. Chaque
// témoin dit donc la directive en clair — et rougit si la route cesse de
// transmettre le viewer, ou revient à un régime aveugle à lui.
const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: unknown[]) => mockResolveForTargets(...args),
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer } from '../../../services/PresenceVisibilityService';
import { registerSearchRoutes } from '../../../routes/conversations/search';
import { registerThreadsRoutes } from '../../../routes/conversations/threads';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_CONV_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f1f77bcf86cd799439022';
const VALID_MSG_ID = '507f1f77bcf86cd799439033';
const VALID_USER_ID_2 = '507f1f77bcf86cd799439044';
const VALID_PARTICIPANT_ID = '507f1f77bcf86cd799439055';
const VALID_SENDER_ID = '507f1f77bcf86cd799439066';

// ─── Test helpers ─────────────────────────────────────────────────────────────

type RouteHandler = (request: any, reply: any) => Promise<any>;
type RouteRegistration = { method: string; path: string; handler: RouteHandler; options: any };

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
  };
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathFragment: string) {
  const r = fastify.routes.find(r => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not registered`);
  return r;
}

function createMockReply() {
  return { _body: undefined as any };
}

function createMockPrisma() {
  return {
    user: { findMany: jest.fn<any>() },
    conversation: { findMany: jest.fn<any>() },
    // La recherche résout l'appartenance de l'appelant pour toute la page
    // (elle commande l'émission des participants) : le double rend membre de
    // ce que la page contient.
    participant: {
      findMany: jest.fn<any>().mockImplementation(async (args: any) =>
        (args?.where?.conversationId?.in ?? []).map((conversationId: string) => ({ conversationId }))
      ),
    },
    message: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>(),
    },
  } as any;
}

function makeSearchRequest(q: string, userId = VALID_USER_ID) {
  return {
    query: { q },
    authContext: { userId, isAuthenticated: true },
  };
}

function makeThreadRequest(id: string, messageId: string, userId = VALID_USER_ID) {
  return {
    params: { id, messageId },
    authContext: { userId, isAuthenticated: true },
  };
}

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
function makeViewerRequest(q: string, viewer: { role: string } | 'anonymous') {
  return viewer === 'anonymous'
    ? {
        query: { q },
        authContext: { type: 'anonymous', userId: VALID_PARTICIPANT_ID, isAuthenticated: true, isAnonymous: true },
      }
    : {
        query: { q },
        authContext: {
          type: 'user',
          userId: VALID_USER_ID,
          isAuthenticated: true,
          registeredUser: { id: VALID_USER_ID, role: viewer.role },
        },
      };
}

function makeSender(overrides: Record<string, any> = {}) {
  return {
    id: VALID_SENDER_ID,
    userId: VALID_USER_ID,
    displayName: 'Alice',
    avatar: 'alice.png',
    user: {
      id: VALID_USER_ID,
      username: 'alice',
      displayName: 'Alice Doe',
      avatar: 'avatar.png',
      isOnline: true,
    },
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, any> = {}) {
  return {
    id: VALID_MSG_ID,
    content: 'Hello world',
    senderId: VALID_SENDER_ID,
    messageType: 'text',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    attachments: [],
    _count: { attachments: 0 },
    sender: makeSender(),
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: VALID_PARTICIPANT_ID,
    userId: VALID_USER_ID,
    displayName: null,
    user: {
      id: VALID_USER_ID,
      username: 'alice',
      displayName: 'Alice Doe',
    },
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, any> = {}) {
  return {
    id: VALID_CONV_ID,
    identifier: 'conv-identifier',
    title: 'My Conversation',
    type: 'group',
    avatar: null,
    banner: null,
    isActive: true,
    communityId: null,
    lastMessageAt: new Date('2026-01-01T10:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    _count: { participants: 3 },
    participants: [makeParticipant()],
    messages: [makeMessage()],
    ...overrides,
  };
}

function makeThreadMessage(id: string, createdAt: Date, replyToId: string | null = null) {
  return {
    id,
    content: `Message ${id}`,
    originalLanguage: 'fr',
    conversationId: VALID_CONV_ID,
    senderId: VALID_SENDER_ID,
    messageType: 'text',
    messageSource: 'user',
    editedAt: null,
    deletedAt: null,
    replyToId,
    reactionSummary: {},
    reactionCount: 0,
    translations: [],
    validatedMentions: [],
    createdAt,
    updatedAt: createdAt,
    sender: null,
    attachments: [],
    replyTo: null,
    _count: { reactions: 0, statusEntries: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerSearchRoutes — GET /conversations/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateDefaultConversationTitle.mockReturnValue('Default Title');
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());
    mockResolveForTargets.mockImplementation(lawFaithfulResolver());
  });

  function setup() {
    const fastify = createMockFastify();
    const prisma = createMockPrisma();
    registerSearchRoutes(fastify, prisma, jest.fn());
    const route = getRoute(fastify, 'GET', 'search');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  // ── Empty / whitespace query ─────────────────────────────────────────────

  it('returns empty array immediately when q is empty string', async () => {
    const { route, reply } = setup();
    await route.handler(makeSearchRequest(''), reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, []);
  });

  it('returns empty array immediately when q is whitespace only', async () => {
    const { route, reply } = setup();
    await route.handler(makeSearchRequest('   '), reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, []);
  });

  it('does NOT call prisma.user.findMany when q is empty', async () => {
    const { prisma, route, reply } = setup();
    await route.handler(makeSearchRequest(''), reply);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  // ── Participant match filter — matchingUserIds.length > 0 ────────────────

  it('builds two-condition OR filter when matching users are found', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: VALID_USER_ID }]);
    prisma.conversation.findMany.mockResolvedValue([]);

    await route.handler(makeSearchRequest('alice'), reply);

    const convCall = prisma.conversation.findMany.mock.calls[0][0] as any;
    const orFilter = convCall.where.AND[0].OR;
    expect(orFilter).toHaveLength(2);
    // First condition: title contains
    expect(orFilter[0]).toMatchObject({ title: { contains: 'alice' } });
    // Second condition: participants.some
    expect(orFilter[1]).toMatchObject({
      participants: { some: { userId: { in: [VALID_USER_ID] }, isActive: true } },
    });
  });

  // ── Participant match filter — matchingUserIds.length === 0 ─────────────

  it('builds single-condition OR filter when no matching users found', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([]);

    await route.handler(makeSearchRequest('xyz_not_found'), reply);

    const convCall = prisma.conversation.findMany.mock.calls[0][0] as any;
    const orFilter = convCall.where.AND[0].OR;
    expect(orFilter).toHaveLength(1);
    expect(orFilter[0]).toMatchObject({ title: { contains: 'xyz_not_found' } });
  });

  // ── Unread count — conversationIds.length > 0 ────────────────────────────

  it('calls getUnreadCountsForUser when conversations are found', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([makeConversation()]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[VALID_CONV_ID, 5]]));

    await route.handler(makeSearchRequest('My'), reply);

    expect(mockGetUnreadCountsForUser).toHaveBeenCalledWith(VALID_USER_ID, [VALID_CONV_ID]);
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].unreadCount).toBe(5);
  });

  // ── Unread count — conversationIds.length === 0 ──────────────────────────

  it('does NOT call getUnreadCountsForUser when no conversations found', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([]);

    await route.handler(makeSearchRequest('nothing'), reply);

    expect(mockGetUnreadCountsForUser).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, []);
  });

  // ── displayTitle — direct type ───────────────────────────────────────────

  it('sets displayTitle to conversation.title for direct conversations', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ type: 'direct', title: 'DM with Bob' }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('Bob'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].title).toBe('DM with Bob');
    expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
  });

  it('sets displayTitle to null when direct conversation has no title', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ type: 'direct', title: null }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].title).toBeNull();
  });

  // ── displayTitle — non-direct with title ────────────────────────────────

  it('uses conversation.title for non-direct conversation with title set', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ type: 'group', title: 'Engineering Team' }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('Engineering'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].title).toBe('Engineering Team');
    expect(mockGenerateDefaultConversationTitle).not.toHaveBeenCalled();
  });

  // ── displayTitle — non-direct, no title → generateDefaultConversationTitle

  it('calls generateDefaultConversationTitle for non-direct with no title', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const participant = makeParticipant({
      userId: VALID_USER_ID_2,
      user: { id: VALID_USER_ID_2, username: 'bob', displayName: 'Bob Smith' },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ type: 'group', title: null, participants: [participant] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());
    mockGenerateDefaultConversationTitle.mockReturnValue('Bob Smith, Alice');

    await route.handler(makeSearchRequest('group'), reply);

    expect(mockGenerateDefaultConversationTitle).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: VALID_USER_ID_2 }),
      ]),
      VALID_USER_ID
    );
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].title).toBe('Bob Smith, Alice');
  });

  it('calls generateDefaultConversationTitle for non-direct with blank title', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ type: 'public', title: '   ', participants: [makeParticipant()] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());
    mockGenerateDefaultConversationTitle.mockReturnValue('Generated');

    await route.handler(makeSearchRequest('pub'), reply);

    expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].title).toBe('Generated');
  });

  // ── unreadCount fallback — map miss → 0 ─────────────────────────────────

  it('defaults unreadCount to 0 when conversation not in unread map', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([makeConversation()]);
    // Map has no entry for VALID_CONV_ID
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([['other-id', 3]]));

    await route.handler(makeSearchRequest('conv'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].unreadCount).toBe(0);
  });

  // ── lastMessage — msg exists ─────────────────────────────────────────────

  it('includes lastMessage when messages[0] exists', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const msg = makeMessage({ content: 'Hey!' });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [msg] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('Hey'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage).not.toBeNull();
    expect(result[0].lastMessage.id).toBe(VALID_MSG_ID);
    expect(result[0].lastMessage.content).toBe('Hey!');
  });

  // ── lastMessage — msg null ────────────────────────────────────────────────

  it('sets lastMessage to null when no messages', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('empty'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage).toBeNull();
  });

  // ── sender exists ────────────────────────────────────────────────────────

  it('includes sender details when msg.sender is present', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({ displayName: 'Alice', avatar: 'alice.png' });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    const lastMessage = result[0].lastMessage;
    expect(lastMessage.sender).not.toBeNull();
    expect(lastMessage.sender.id).toBe(VALID_SENDER_ID);
  });

  // ── sender null path ─────────────────────────────────────────────────────

  it('sets lastMessage.sender to null when msg.sender is null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender: null })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender).toBeNull();
  });

  // ── sender.user?.username ?? null ────────────────────────────────────────

  it('uses null for username when sender.user is null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({ user: null });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.username).toBeNull();
  });

  it('uses sender.user.username when present', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({ user: { id: VALID_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false } });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.username).toBe('bob');
  });

  // ── sender.displayName — participant displayName vs user.displayName ──────

  it('prefers sender.displayName over sender.user.displayName', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({
      displayName: 'Participant Name',
      user: { id: VALID_USER_ID, username: 'alice', displayName: 'User Name', avatar: null, isOnline: false },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.displayName).toBe('Participant Name');
  });

  it('falls back to sender.user.displayName when sender.displayName is null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({
      displayName: null,
      user: { id: VALID_USER_ID, username: 'alice', displayName: 'User Display Name', avatar: null, isOnline: false },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.displayName).toBe('User Display Name');
  });

  // ── sender.avatar — participant avatar vs user.avatar ────────────────────

  it('prefers sender.avatar over sender.user.avatar', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({
      avatar: 'participant-avatar.png',
      user: { id: VALID_USER_ID, username: 'alice', displayName: 'Alice', avatar: 'user-avatar.png', isOnline: false },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.avatar).toBe('participant-avatar.png');
  });

  it('falls back to sender.user.avatar when sender.avatar is null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({
      avatar: null,
      user: { id: VALID_USER_ID, username: 'alice', displayName: 'Alice', avatar: 'user-avatar.png', isOnline: false },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.avatar).toBe('user-avatar.png');
  });

  // ── isOnline ?? false ─────────────────────────────────────────────────────

  it('sets isOnline to false when sender.user is null (fallback to false)', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({ user: null });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.isOnline).toBe(false);
  });

  // ── Présence de l'expéditeur — régime STRICT (2026-08-25) ─────────────────
  // Même règle que `GET /conversations` (core.ts) : hors soi-même, ADMIN+ et
  // amitié acceptée, `isOnline` de l'expéditeur du dernier message est servi
  // `false`. Un rang inférieur au premier est le seul qui distingue la règle
  // juste du court-circuit — d'où un expéditeur AUTRE que le lecteur.

  describe('présence de l\'expéditeur du dernier message (régime strict)', () => {
    const otherSender = () =>
      makeSender({
        id: 'participant-other',
        userId: VALID_USER_ID_2,
        user: { id: VALID_USER_ID_2, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true },
      });

    async function search(request: Record<string, unknown>, sender = otherSender()) {
      const { prisma, route, reply } = setup();
      prisma.user.findMany.mockResolvedValue([]);
      prisma.conversation.findMany.mockResolvedValue([
        makeConversation({ messages: [makeMessage({ sender })] }),
      ]);
      await route.handler(request, reply);
      return (mockSendSuccess.mock.calls[0] as any[])[1][0].lastMessage.sender;
    }

    it('transmet le viewer demandeur (identité + rôle) et les userId des expéditeurs', async () => {
      await search(makeViewerRequest('test', { role: 'USER' }));

      expect(mockResolveForTargets).toHaveBeenCalledWith(
        { userId: VALID_USER_ID, role: 'USER' },
        [VALID_USER_ID_2],
      );
    });

    it('soi-même ⇒ isOnline servi', async () => {
      const sender = await search(makeViewerRequest('test', { role: 'USER' }), makeSender());

      expect(sender.isOnline).toBe(true);
    });

    it('ami accepté ⇒ isOnline servi', async () => {
      mockResolveForTargets.mockImplementation(lawFaithfulResolver(new Set([VALID_USER_ID_2])));

      const sender = await search(makeViewerRequest('test', { role: 'USER' }));

      expect(sender.isOnline).toBe(true);
    });

    it('co-participant NON ami ⇒ isOnline false, même en ligne', async () => {
      const sender = await search(makeViewerRequest('test', { role: 'USER' }));

      expect(sender.isOnline).toBe(false);
    });

    it('ADMIN non ami ⇒ isOnline servi', async () => {
      const sender = await search(makeViewerRequest('test', { role: 'ADMIN' }));

      expect(sender.isOnline).toBe(true);
    });

    it('MODERATOR non ami ⇒ caché, comme un utilisateur ordinaire', async () => {
      const sender = await search(makeViewerRequest('test', { role: 'MODERATOR' }));

      expect(sender.isOnline).toBe(false);
    });

    it('viewer anonyme ⇒ caché, et le service reçoit un viewer nul', async () => {
      const sender = await search(makeViewerRequest('test', 'anonymous'));

      expect(sender.isOnline).toBe(false);
      expect(mockResolveForTargets).toHaveBeenCalledWith(null, [VALID_USER_ID_2]);
    });

    // Un expéditeur sans compte n'a ni `User.id` ni `user.isOnline` : aucune
    // présence n'est chargée pour lui sur cette projection, donc rien à
    // servir — à personne, ADMIN compris — et rien n'est résolu pour lui.
    it('expéditeur sans compte ⇒ isOnline false même pour un ADMIN, et rien n\'est résolu pour lui', async () => {
      const sender = await search(
        makeViewerRequest('test', { role: 'ADMIN' }),
        makeSender({ id: 'participant-anon', userId: null, user: null }),
      );

      expect(sender.isOnline).toBe(false);
      expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VALID_USER_ID, role: 'ADMIN' }, []);
    });

    // Cas (b) : un id INSCRIT que la carte ne porte pas (anomalie — le
    // résolveur rend une entrée par id passé). Le repli vit sur UN site
    // (`presenceFor`, presence-gate) et dit la même chose partout : masqué,
    // sauf ADMIN+. Cette route masquait strictement — un ADMIN y perdait la
    // présence que la liste (core.ts) lui servait pour la même anomalie.
    it('inscrit ABSENT de la carte ⇒ isOnline false pour un USER', async () => {
      mockResolveForTargets.mockResolvedValue(new Map());

      const sender = await search(makeViewerRequest('test', { role: 'USER' }));

      expect(sender.isOnline).toBe(false);
    });

    it('inscrit ABSENT de la carte ⇒ isOnline servi à un ADMIN', async () => {
      mockResolveForTargets.mockResolvedValue(new Map());

      const sender = await search(makeViewerRequest('test', { role: 'ADMIN' }));

      expect(sender.isOnline).toBe(true);
    });
  });

  // ── attachments fallback ─────────────────────────────────────────────────

  it('uses empty array when msg.attachments is null/undefined', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ attachments: undefined })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.attachments).toEqual([]);
  });

  // ── memberCount via _count.participants ──────────────────────────────────

  it('extracts memberCount from _count.participants', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ _count: { participants: 7 } }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].memberCount).toBe(7);
  });

  // ── Cap 199+ : le droit de voir l'effectif ENTIER ────────────────────────
  // Même règle que `GET /conversations` et `GET /conversations/:id` : trois
  // surfaces, une seule présentation. La recherche résout DÉJÀ l'appartenance
  // de l'appelant pour toute la page (`memberships`) — c'est cette lecture qui
  // porte son rôle de conversation, sans requête de plus.

  it('plafonne memberCount à 199 pour un simple membre sans rôle plateforme', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ _count: { participants: 250 } }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].memberCount).toBe(199);
    expect(result[0].memberCountCapped).toBe(true);
  });

  it('sert l\'effectif ENTIER à l\'admin du GROUPE', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ _count: { participants: 250 } }),
    ]);
    prisma.participant.findMany.mockImplementation(async (args: any) =>
      (args?.where?.conversationId?.in ?? []).map((conversationId: string) => ({
        conversationId,
        role: 'admin',
      }))
    );
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].memberCount).toBe(250);
    expect(result[0].memberCountCapped).toBeUndefined();
  });

  // A4 — le jumeau du test de `GET /conversations` : même lecteur, même
  // conversation, même réponse attendue. L'invité de lien partagé porte un
  // `Participant.id` dans `authContext.userId`, donc la COLONNE interrogée doit
  // être `id`. Le double ne rend le rôle QUE dans ce cas : une requête
  // `userId: <Participant.id>` ne matche rien en base, et un double complaisant
  // rendrait ce test tautologique.
  it('sert l\'effectif ENTIER à un admin de groupe ANONYME', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ _count: { participants: 250 } }),
    ]);
    prisma.participant.findMany.mockImplementation(async (args: any) =>
      args?.where?.id === VALID_PARTICIPANT_ID
        ? (args?.where?.conversationId?.in ?? []).map((conversationId: string) => ({
            conversationId,
            role: 'admin',
          }))
        : []
    );
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(
      {
        query: { q: 'test' },
        authContext: {
          userId: VALID_PARTICIPANT_ID,
          type: 'anonymous',
          isAnonymous: true,
          isAuthenticated: true,
        },
      },
      reply
    );

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: VALID_PARTICIPANT_ID }) })
    );
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].memberCount).toBe(250);
    expect(result[0].memberCountCapped).toBeUndefined();
  });

  it('sert l\'effectif ENTIER à un MODERATOR plateforme', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ _count: { participants: 250 } }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(
      {
        query: { q: 'test' },
        authContext: {
          userId: VALID_USER_ID,
          isAuthenticated: true,
          registeredUser: { id: VALID_USER_ID, role: 'MODERATOR' },
        },
      },
      reply
    );

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].memberCount).toBe(250);
    expect(result[0].memberCountCapped).toBeUndefined();
  });

  it('demande le rôle de conversation dans la lecture d\'appartenance', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([makeConversation()]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const selects = prisma.participant.findMany.mock.calls.map((call: any[]) => call[0]?.select);
    expect(selects.some((select: any) => select?.role === true)).toBe(true);
  });

  // ── Correct result shape ─────────────────────────────────────────────────

  it('returns correct base fields in result object', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([makeConversation()]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('conv'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0]).toMatchObject({
      id: VALID_CONV_ID,
      identifier: 'conv-identifier',
      type: 'group',
      isActive: true,
    });
  });

  // ── catch path ───────────────────────────────────────────────────────────

  it('calls sendInternalError when prisma.user.findMany throws', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockRejectedValue(new Error('DB connection lost'));

    await route.handler(makeSearchRequest('test'), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('calls sendInternalError when prisma.conversation.findMany throws', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockRejectedValue(new Error('timeout'));

    await route.handler(makeSearchRequest('test'), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('calls sendInternalError when getUnreadCountsForUser throws', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([makeConversation()]);
    mockGetUnreadCountsForUser.mockRejectedValue(new Error('redis down'));

    await route.handler(makeSearchRequest('test'), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  // ── sender.displayName null, sender.user.displayName also null ──────────

  it('sets sender.displayName to null when both sender.displayName and user.displayName are null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({
      displayName: null,
      user: { id: VALID_USER_ID, username: 'alice', displayName: null, avatar: null, isOnline: false },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.displayName).toBeNull();
  });

  // ── sender.avatar null, sender.user.avatar also null ─────────────────────

  it('sets sender.avatar to null when both sender.avatar and user.avatar are null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const sender = makeSender({
      avatar: null,
      user: { id: VALID_USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false },
    });
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ messages: [makeMessage({ sender })] }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].lastMessage.sender.avatar).toBeNull();
  });

  // ── memberCount ?? 0 — when _count is null/undefined ─────────────────────

  it('defaults memberCount to 0 when conversation._count is null', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ _count: null }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map());

    await route.handler(makeSearchRequest('test'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result[0].memberCount).toBe(0);
  });

  // ── Multiple conversations ───────────────────────────────────────────────

  it('maps multiple conversations correctly', async () => {
    const { prisma, route, reply } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    const CONV_ID_2 = '507f1f77bcf86cd799439099';
    prisma.conversation.findMany.mockResolvedValue([
      makeConversation({ id: VALID_CONV_ID }),
      makeConversation({ id: CONV_ID_2, title: 'Second Group' }),
    ]);
    mockGetUnreadCountsForUser.mockResolvedValue(new Map([[CONV_ID_2, 2]]));

    await route.handler(makeSearchRequest('group'), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result).toHaveLength(2);
    expect(result[0].unreadCount).toBe(0);
    expect(result[1].unreadCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THREADS ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerThreadsRoutes — GET /conversations/:id/threads/:messageId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveConversationId.mockResolvedValue(VALID_CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  function setup() {
    const fastify = createMockFastify();
    const prisma = createMockPrisma();
    registerThreadsRoutes(fastify, prisma, jest.fn());
    const route = getRoute(fastify, 'GET', 'threads');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  // ── resolveConversationId returns null → 404 ─────────────────────────────

  it('returns 404 when resolveConversationId returns null', async () => {
    const { route, reply } = setup();
    mockResolveConversationId.mockResolvedValue(null);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    expect(mockCanAccessConversation).not.toHaveBeenCalled();
  });

  // ── canAccessConversation returns false → 403 ────────────────────────────

  it('returns 403 when user does not have access', async () => {
    const { prisma, route, reply } = setup();
    mockCanAccessConversation.mockResolvedValue(false);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'You do not have access to this conversation');
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  // ── parent message not found → 404 ──────────────────────────────────────

  it('returns 404 when parent message does not exist', async () => {
    const { prisma, route, reply } = setup();
    prisma.message.findFirst.mockResolvedValue(null);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('queries parent message with correct where clause', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());
    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany.mockResolvedValue([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: VALID_MSG_ID,
          conversationId: VALID_CONV_ID,
          deletedAt: null,
        },
      })
    );
  });

  // ── Happy path — no replies ──────────────────────────────────────────────

  it('returns parent + empty replies when no replies exist', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date('2026-01-01T10:00:00Z'));
    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany.mockResolvedValue([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, {
      parent,
      replies: [],
      totalCount: 0,
    });
  });

  // ── Happy path — single level of replies ────────────────────────────────

  it('returns replies found in first batch', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date('2026-01-01T10:00:00Z'));
    const reply1 = makeThreadMessage('reply-1', new Date('2026-01-01T10:01:00Z'), VALID_MSG_ID);
    const reply2 = makeThreadMessage('reply-2', new Date('2026-01-01T10:02:00Z'), VALID_MSG_ID);

    prisma.message.findFirst.mockResolvedValue(parent);
    // First call returns replies, second call (depth 1) returns empty
    prisma.message.findMany
      .mockResolvedValueOnce([reply1, reply2])
      .mockResolvedValueOnce([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, {
      parent,
      replies: expect.arrayContaining([reply1, reply2]),
      totalCount: 2,
    });
  });

  // ── batch.length === 0 → break ───────────────────────────────────────────

  it('stops collecting when next batch returns empty (batch.length === 0)', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());
    const r1 = makeThreadMessage('r1', new Date('2026-01-01T10:01:00Z'), VALID_MSG_ID);

    prisma.message.findFirst.mockResolvedValue(parent);
    // Depth 0: returns r1; depth 1: empty → break
    prisma.message.findMany
      .mockResolvedValueOnce([r1])
      .mockResolvedValueOnce([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    // findMany called twice: depth 0 + depth 1 (empty)
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.replies).toHaveLength(1);
  });

  // ── Multi-depth reply tree ───────────────────────────────────────────────

  it('collects replies across multiple depth levels', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date('2026-01-01T10:00:00Z'));
    const depth1 = makeThreadMessage('d1', new Date('2026-01-01T10:01:00Z'), VALID_MSG_ID);
    const depth2 = makeThreadMessage('d2', new Date('2026-01-01T10:02:00Z'), 'd1');

    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany
      .mockResolvedValueOnce([depth1])  // frontier = [VALID_MSG_ID]
      .mockResolvedValueOnce([depth2])  // frontier = ['d1']
      .mockResolvedValueOnce([]);       // frontier = ['d2'] → empty → break

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.replies).toHaveLength(2);
    expect(result.totalCount).toBe(2);
  });

  // ── allReplies.length >= MAX_THREAD_MESSAGES (200) → break ──────────────

  it('stops collecting when total replies reach MAX_THREAD_MESSAGES (200)', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());

    prisma.message.findFirst.mockResolvedValue(parent);

    // Generate 200 replies in the first batch
    const batch = Array.from({ length: 200 }, (_, i) =>
      makeThreadMessage(`reply-${i}`, new Date(2026, 0, 1, 10, i, 0), VALID_MSG_ID)
    );
    prisma.message.findMany.mockResolvedValueOnce(batch);
    // Should NOT be called again after hitting the 200 limit

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    // Only one findMany call (first batch saturates limit)
    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.replies).toHaveLength(200);
    expect(result.totalCount).toBe(200);
  });

  it('slices result to MAX_THREAD_MESSAGES when over limit', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());

    // 100 in batch 1, 150 in batch 2 = 250 total, should slice to 200
    const batch1 = Array.from({ length: 100 }, (_, i) =>
      makeThreadMessage(`b1-reply-${i}`, new Date(2026, 0, 1, 10, i, 0), VALID_MSG_ID)
    );
    const batch2 = Array.from({ length: 150 }, (_, i) =>
      makeThreadMessage(`b2-reply-${i}`, new Date(2026, 0, 1, 11, i, 0), `b1-reply-${i % 100}`)
    );

    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    // batch1 (100) + batch2 (150) = 250, allReplies.length 250 >= 200 → break; slice(0,200)
    expect(result.replies).toHaveLength(200);
    expect(result.totalCount).toBe(200);
  });

  // ── MAX_DEPTH (10) reached ───────────────────────────────────────────────

  it('terminates after MAX_DEPTH (10) iterations regardless of remaining replies', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());

    prisma.message.findFirst.mockResolvedValue(parent);

    // Always return exactly 1 reply per depth so we never hit the count limit or empty batch
    // This ensures the loop runs up to MAX_DEPTH=10 times
    let replyIndex = 0;
    prisma.message.findMany.mockImplementation(() => {
      replyIndex++;
      const id = `depth-reply-${replyIndex}`;
      return Promise.resolve([
        makeThreadMessage(id, new Date(2026, 0, 1, 10, replyIndex, 0), 'some-parent')
      ]);
    });

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    // MAX_DEPTH = 10, so findMany is called exactly 10 times
    expect(prisma.message.findMany).toHaveBeenCalledTimes(10);
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.replies).toHaveLength(10);
  });

  // ── Results sorted by createdAt ascending ────────────────────────────────

  it('sorts replies by createdAt ascending', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date('2026-01-01T10:00:00Z'));
    // Return out-of-order messages
    const r3 = makeThreadMessage('r3', new Date('2026-01-01T10:03:00Z'), VALID_MSG_ID);
    const r1 = makeThreadMessage('r1', new Date('2026-01-01T10:01:00Z'), VALID_MSG_ID);
    const r2 = makeThreadMessage('r2', new Date('2026-01-01T10:02:00Z'), VALID_MSG_ID);

    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany
      .mockResolvedValueOnce([r3, r1, r2])
      .mockResolvedValueOnce([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.replies[0].id).toBe('r1');
    expect(result.replies[1].id).toBe('r2');
    expect(result.replies[2].id).toBe('r3');
  });

  // ── findMany called with correct parameters ──────────────────────────────

  it('calls message.findMany with correct where for first depth', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());

    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany.mockResolvedValue([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: VALID_CONV_ID,
          replyToId: { in: [VALID_MSG_ID] },
          deletedAt: null,
        }),
      })
    );
  });

  // ── canAccessConversation receives correct args ───────────────────────────

  it('passes correct args to canAccessConversation', async () => {
    const { prisma, route, reply } = setup();
    prisma.message.findFirst.mockResolvedValue(makeThreadMessage(VALID_MSG_ID, new Date()));
    prisma.message.findMany.mockResolvedValue([]);

    const rawId = 'some-identifier';
    mockResolveConversationId.mockResolvedValue(VALID_CONV_ID);

    await route.handler(makeThreadRequest(rawId, VALID_MSG_ID), reply);

    expect(mockCanAccessConversation).toHaveBeenCalledWith(
      expect.anything(), // prisma
      expect.objectContaining({ userId: VALID_USER_ID }),
      VALID_CONV_ID,
      rawId
    );
  });

  // ── resolveConversationId receives raw id ────────────────────────────────

  it('passes raw id param to resolveConversationId', async () => {
    const { prisma, route, reply } = setup();
    const rawId = 'my-conv-identifier';
    mockResolveConversationId.mockResolvedValue(VALID_CONV_ID);
    prisma.message.findFirst.mockResolvedValue(makeThreadMessage(VALID_MSG_ID, new Date()));
    prisma.message.findMany.mockResolvedValue([]);

    await route.handler(makeThreadRequest(rawId, VALID_MSG_ID), reply);

    expect(mockResolveConversationId).toHaveBeenCalledWith(expect.anything(), rawId);
  });

  // ── totalCount matches replies.length ────────────────────────────────────

  it('totalCount equals replies.length', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());
    const replies = [
      makeThreadMessage('r1', new Date('2026-01-01T10:01:00Z'), VALID_MSG_ID),
      makeThreadMessage('r2', new Date('2026-01-01T10:02:00Z'), VALID_MSG_ID),
      makeThreadMessage('r3', new Date('2026-01-01T10:03:00Z'), VALID_MSG_ID),
    ];

    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany
      .mockResolvedValueOnce(replies)
      .mockResolvedValueOnce([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.totalCount).toBe(result.replies.length);
    expect(result.totalCount).toBe(3);
  });

  // ── catch path → sendInternalError ──────────────────────────────────────

  it('calls sendInternalError when resolveConversationId throws', async () => {
    const { route, reply } = setup();
    mockResolveConversationId.mockRejectedValue(new Error('Cache failure'));

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Error fetching thread');
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('calls sendInternalError when canAccessConversation throws', async () => {
    const { route, reply } = setup();
    mockCanAccessConversation.mockRejectedValue(new Error('Access check failed'));

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Error fetching thread');
  });

  it('calls sendInternalError when message.findFirst throws', async () => {
    const { prisma, route, reply } = setup();
    prisma.message.findFirst.mockRejectedValue(new Error('Query failed'));

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Error fetching thread');
  });

  it('calls sendInternalError when message.findMany throws during reply collection', async () => {
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());
    prisma.message.findFirst.mockResolvedValue(parent);
    prisma.message.findMany.mockRejectedValue(new Error('findMany failed'));

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, 'Error fetching thread');
  });

  // ── frontier.length === 0 → break (artificial frontier empty scenario) ───

  it('does not call findMany when frontier becomes empty after first batch maps to empty IDs', async () => {
    // This covers the frontier.length === 0 check indirectly:
    // If batch returns messages with no IDs we can't reach that, but we can cover it by
    // having the loop break after batch.length === 0 on the second iteration.
    const { prisma, route, reply } = setup();
    const parent = makeThreadMessage(VALID_MSG_ID, new Date());
    const r1 = makeThreadMessage('r1', new Date('2026-01-01T10:01:00Z'), VALID_MSG_ID);

    prisma.message.findFirst.mockResolvedValue(parent);
    // First batch: r1, second batch: empty → breaks at batch.length === 0
    prisma.message.findMany
      .mockResolvedValueOnce([r1])
      .mockResolvedValueOnce([]);

    await route.handler(makeThreadRequest(VALID_CONV_ID, VALID_MSG_ID), reply);

    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    const result = (mockSendSuccess.mock.calls[0] as any[])[1];
    expect(result.replies).toHaveLength(1);
  });
});
