import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (must be hoisted before imports) ────────────────────────────

const mockResolveConversationId = jest.fn<any>();
const mockGenerateInitialLinkId = jest.fn<any>().mockReturnValue('initial-link-id');
const mockGenerateFinalLinkId = jest.fn<any>().mockReturnValue('final-link-id');
const mockEnsureUniqueShareLinkIdentifier = jest.fn<any>().mockResolvedValue('mshy_unique');

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => {
  reply._body = { success: false, status, error: msg };
  return reply;
});

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../routes/conversations/utils/identifier-generator', () => ({
  generateInitialLinkId: (...args: any[]) => mockGenerateInitialLinkId(...args),
  generateFinalLinkId: (...args: any[]) => mockGenerateFinalLinkId(...args),
  ensureUniqueShareLinkIdentifier: (...args: any[]) => mockEnsureUniqueShareLinkIdentifier(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(),
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn<any>(),
  sendErrorResponse: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationSchema: { type: 'object' },
  conversationParticipantSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerSharingRoutes } from '../../../routes/conversations/sharing';

// ─── IDs ──────────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const INVITEE_ID = '507f1f77bcf86cd799439033';
const PART_ID = '507f1f77bcf86cd799439044';
const LINK_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockFastify() {
  const routes: RouteReg[] = [];
  const authenticate = jest.fn<any>();
  const notificationService = {
    createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
  const mentionService = {
    invalidateCacheForConversation: jest.fn<any>().mockResolvedValue(undefined),
  };
  const prismaOnFastify = {
    conversation: { findUnique: jest.fn<any>() },
    user: { findUnique: jest.fn<any>() },
    participant: { create: jest.fn<any>() },
  };
  const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
  const socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom }),
  };
  return {
    routes,
    authenticate,
    notificationService,
    mentionService,
    socketIOHandler,
    joinUserToConversationRoom,
    prisma: prismaOnFastify,
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
  };
}

function createMockPrisma() {
  return {
    conversation: {
      findUnique: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, title: 'Updated', participants: [] }),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
    },
    user: {
      findUnique: jest.fn<any>(),
    },
    conversationShareLink: {
      create: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as any;
}

function createMockReply() {
  const reply: any = {
    _body: undefined,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => { reply._body = body; return reply; }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathFragment: string) {
  const r = fastify.routes.find(r => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r;
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER' } },
    ...overrides,
  };
}

function makeShareLink(overrides: Record<string, any> = {}) {
  return {
    id: LINK_ID,
    linkId: 'old-link-id',
    identifier: 'mshy_test',
    conversationId: CONV_ID,
    isActive: true,
    expiresAt: null,
    currentUses: 0,
    conversation: { id: CONV_ID, title: 'Test', type: 'group' },
    name: null,
    description: null,
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: PART_ID,
    userId: USER_ID,
    conversationId: CONV_ID,
    role: 'member',
    displayName: 'Alice',
    isActive: true,
    user: { id: USER_ID, role: 'USER' },
    ...overrides,
  };
}

function setup() {
  const fastify = createMockFastify();
  const prisma = createMockPrisma();
  const optionalAuth = jest.fn<any>();
  const requiredAuth = jest.fn<any>();
  registerSharingRoutes(fastify as any, prisma, optionalAuth, requiredAuth);
  return { fastify, prisma, reply: createMockReply(), optionalAuth, requiredAuth };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/new-link — Create share link
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/:id/new-link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateInitialLinkId.mockReturnValue('initial-link-id');
    mockGenerateFinalLinkId.mockReturnValue('final-link-id');
    mockEnsureUniqueShareLinkIdentifier.mockResolvedValue('mshy_unique');
  });

  function getNewLinkRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'new-link');
    return { prisma, reply, route };
  }

  function stubSuccess(prisma: any, overrides: Record<string, any> = {}) {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    prisma.conversationShareLink.create.mockResolvedValue({
      id: LINK_ID,
      name: null,
      description: null,
      maxUses: null,
      expiresAt: null,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: true,
      requireNickname: true,
      requireEmail: false,
      ...overrides,
    });
  }

  it('returns 403 when resolveConversationId returns null', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 404 when conversation not found', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue(null);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user is not a member', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user record not found', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 for direct conversation type', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'direct', title: 'DM' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 for global conversation when user is not BIGBOSS', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('allows BIGBOSS to create link for global conversation', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    prisma.user.findUnique.mockResolvedValue({ role: 'BIGBOSS' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
    expect(reply._body?.data).toMatchObject({ code: 'final-link-id' });
  });

  it('creates link with name-based identifier', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'My Group' } });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      'mshy_my-group'
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('creates link with description-based identifier when no name', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { description: 'A public room' } });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      'mshy_a-public-room'
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('creates link with timestamp-based identifier when no name or description', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^mshy_link-\d+-.+/)
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('response includes shareLink details and inviteLink URL', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma, { name: 'Test Link', maxUses: 10 });
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'Test Link', maxUses: 10 } });
    await route.handler(req, reply);
    expect(reply._body?.data).toMatchObject({
      code: 'final-link-id',
      link: expect.stringContaining('/join/final-link-id'),
      shareLink: expect.objectContaining({ linkId: 'final-link-id' }),
    });
  });

  it('handles name with special characters', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'My Room!! 2024' } });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      'mshy_my-room-2024'
    );
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockRejectedValue(new Error('DB down'));
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /conversations/:id — Update conversation
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /conversations/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  function getPatchRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'PATCH', '/conversations/:id');
    return { prisma, reply, route };
  }

  function stubMembership(prisma: any, membershipOverrides: Record<string, any> = {}) {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.participant.findFirst.mockResolvedValue(
      makeParticipant({ role: 'member', ...membershipOverrides })
    );
  }

  it('returns 401 when not authenticated', async () => {
    const { prisma, reply, route } = getPatchRoute();
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { title: 'New Title' },
      authContext: { userId: USER_ID, isAuthenticated: false, registeredUser: null },
    });
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when resolveConversationId returns null', async () => {
    const { prisma, reply, route } = getPatchRoute();
    mockResolveConversationId.mockResolvedValue(null);
    const req = makeRequest({
      params: { id: 'unknown-slug' },
      body: { title: 'New' },
      authContext: { userId: USER_ID, isAuthenticated: true },
    });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user is not a member', async () => {
    const { prisma, reply, route } = getPatchRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.participant.findFirst.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'New' } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('allows any member to update title', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'New Title' } });
    await route.handler(req, reply);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'New Title' }) })
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('allows any member to update description', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { description: 'New desc' } });
    await route.handler(req, reply);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: 'New desc' }) })
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 403 when non-admin/non-creator tries to change type', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma, { role: 'member', user: { id: USER_ID, role: 'USER' } });
    const req = makeRequest({ params: { id: CONV_ID }, body: { type: 'public' } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('allows creator to change type', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma, { role: 'creator', user: { id: USER_ID, role: 'USER' } });
    const req = makeRequest({ params: { id: CONV_ID }, body: { type: 'public' } });
    await route.handler(req, reply);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'public' }) })
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('allows ADMIN to change type', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma, { role: 'member', user: { id: USER_ID, role: 'ADMIN' } });
    const req = makeRequest({ params: { id: CONV_ID }, body: { type: 'group' } });
    await route.handler(req, reply);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'group' }) })
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('allows BIGBOSS to change type', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma, { role: 'member', user: { id: USER_ID, role: 'BIGBOSS' } });
    const req = makeRequest({ params: { id: CONV_ID }, body: { type: 'public' } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('handles P2002 (duplicate name) with conflict response', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    prisma.conversation.update.mockRejectedValue({ code: 'P2002' });
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Taken' } });
    await route.handler(req, reply);
    expect(mockSendConflict).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('handles P2025 (not found) with not-found response', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    prisma.conversation.update.mockRejectedValue({ code: 'P2025' });
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Any' } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('handles P2003 (bad ref) with bad-request response', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    prisma.conversation.update.mockRejectedValue({ code: 'P2003' });
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Any' } });
    await route.handler(req, reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('handles ValidationError with bad-request response', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    prisma.conversation.update.mockRejectedValue({ name: 'ValidationError', message: 'bad data' });
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Any' } });
    await route.handler(req, reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('handles unexpected error with internal error response', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    prisma.conversation.update.mockRejectedValue(new Error('network timeout'));
    const req = makeRequest({ params: { id: CONV_ID }, body: { title: 'Any' } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('does not include title in update if undefined', async () => {
    const { prisma, reply, route } = getPatchRoute();
    stubMembership(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { description: 'Only desc' } });
    await route.handler(req, reply);
    const updateCall = prisma.conversation.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('title');
    expect(updateCall.data).toHaveProperty('description', 'Only desc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /conversations/:conversationId/links — Get share links
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /conversations/:conversationId/links', () => {
  beforeEach(() => jest.clearAllMocks());

  function getLinksRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'GET', '/links');
    return { prisma, reply, route };
  }

  it('returns 403 when user is not a member', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(null);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('moderator sees all links (no creatorId filter)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'moderator' }));
    const mockLinks = [{ id: 'link1', currentUses: 5 }, { id: 'link2', currentUses: 2 }];
    prisma.conversationShareLink.findMany.mockResolvedValue(mockLinks);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('creatorId');
    expect(reply._body).toMatchObject({
      success: true,
      isModerator: true,
      data: [
        expect.objectContaining({ id: 'link1', participantCount: 5 }),
        expect.objectContaining({ id: 'link2', participantCount: 2 }),
      ],
    });
  });

  it('admin role also gets all links', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'admin' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('creatorId');
    expect(reply._body).toMatchObject({ isModerator: true });
  });

  it('creator role also gets all links', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('creatorId');
  });

  it('regular member sees only own links (creatorId filter applied)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([{ id: 'link1', currentUses: 1 }]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).toHaveProperty('creatorId', USER_ID);
    expect(reply._body).toMatchObject({ isModerator: false });
  });

  it('maps currentUses to participantCount in response', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([{ id: 'l1', currentUses: 7 }]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(reply._body.data[0]).toMatchObject({ id: 'l1', currentUses: 7, participantCount: 7 });
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockRejectedValue(new Error('DB error'));
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/join/:linkId — Join via share link
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId', () => {
  beforeEach(() => jest.clearAllMocks());

  function getJoinRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    return { fastify, prisma, reply, route };
  }

  it('returns 401 when authContext is absent', async () => {
    const { prisma, reply, route } = getJoinRoute();
    const req = { params: { linkId: LINK_ID }, authContext: undefined };
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 404 when share link not found', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    const req = makeRequest({ params: { linkId: 'nonexistent' } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 410 when share link is not active', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ isActive: false }));
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, expect.any(String));
  });

  it('returns 410 when share link is expired', async () => {
    const { prisma, reply, route } = getJoinRoute();
    const pastDate = new Date(Date.now() - 1000);
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ expiresAt: pastDate }));
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, expect.any(String));
  });

  it('does not expire when expiresAt is in the future', async () => {
    const { prisma, reply, route } = getJoinRoute();
    const futureDate = new Date(Date.now() + 86400000);
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ expiresAt: futureDate }));
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Alice', username: 'alice' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: CONV_ID }));
  });

  it('returns success when user is already a member', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({
      conversationId: CONV_ID,
    }));
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('joins successfully and increments usage counter', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    fastify.notificationService.createMemberJoinedNotification.mockResolvedValue(undefined);
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_ID },
        data: { currentUses: { increment: 1 } },
      })
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: CONV_ID }));
  });

  it('auto-joins the joining user\'s connected sockets to the conversation room', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(fastify.joinUserToConversationRoom).toHaveBeenCalledWith(USER_ID, CONV_ID);
  });

  it('uses username as displayName when displayName is null', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: null, username: 'bob' })
      .mockResolvedValueOnce(null);
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(prisma.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'bob' }) })
    );
  });

  it('uses User as fallback displayName when both are null', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: null, username: null })
      .mockResolvedValueOnce(null);
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(prisma.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'User' }) })
    );
  });

  it('notifies admins when they exist', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: 'Carol', username: 'carol' })
      .mockResolvedValueOnce({ username: 'admin', displayName: 'Admin', avatar: null });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const adminParticipant = { userId: '507f1f77bcf86cd799439099' };
    prisma.participant.findMany.mockResolvedValue([adminParticipant]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(fastify.notificationService.createMemberJoinedNotification).toHaveBeenCalledTimes(2);
    expect(fastify.notificationService.createMemberJoinedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: adminParticipant.userId })
    );
  });

  it('does not block join when notification service is absent', async () => {
    const { fastify, prisma, reply } = setup();
    (fastify as any).notificationService = undefined;
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Dave', username: 'dave' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('does not block join when notification throws', async () => {
    const { fastify, prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: 'Eve', username: 'eve' })
      .mockRejectedValue(new Error('notif DB error'));
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB down'));
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('accepts identifier as linkId (iOS share link format)', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const req = makeRequest({ params: { linkId: 'mshy_test' } });
    await route.handler(req, reply);
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ linkId: 'mshy_test' }, { identifier: 'mshy_test' }] },
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/invite — Invite user
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/:id/invite', () => {
  beforeEach(() => jest.clearAllMocks());

  function getInviteRoute() {
    const fastify = createMockFastify();
    const prisma = createMockPrisma();
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'invite');
    const reply = createMockReply();
    return { fastify, prisma, reply, route };
  }

  function makeConversation(participants: any[] = []) {
    return {
      id: CONV_ID,
      title: 'Test',
      type: 'group',
      participants,
    };
  }

  function makeInviterParticipant(role = 'admin') {
    return { id: PART_ID, userId: USER_ID, role, user: { id: USER_ID, username: 'alice', role: 'USER' } };
  }

  function makeTargetUser() {
    return { id: INVITEE_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B' };
  }

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: null, isAuthenticated: false, registeredUser: null },
    });
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is missing', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: null },
    });
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 404 when conversation not found', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when inviter is not a member', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([]));
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when inviter is a member but without invite permission', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('member');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER' } },
    });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('allows admin member to invite', async () => {
    const { fastify, prisma, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({
      id: 'new-part',
      user: makeTargetUser(),
      userId: INVITEE_ID,
    });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('allows creator member to invite', async () => {
    const { fastify, prisma, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('creator');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('auto-joins the invited user\'s connected sockets to the conversation room', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser(), userId: INVITEE_ID });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(fastify.joinUserToConversationRoom).toHaveBeenCalledWith(INVITEE_ID, CONV_ID);
  });

  it('allows ADMIN user role (not participant role) to invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('member');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'ADMIN' } },
    });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('allows BIGBOSS user role to invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('member');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'BIGBOSS' } },
    });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 404 when user to invite not found', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 400 when user is already a member', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    const existingMember = { id: 'existing', userId: INVITEE_ID, role: 'member', user: { id: INVITEE_ID, username: 'bob', role: 'USER' } };
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter, existingMember]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('sends notification after successful invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce({ username: 'alice', displayName: 'Alice', avatar: null });
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(fastify.notificationService.createConversationInviteNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedUserId: INVITEE_ID,
        inviterId: USER_ID,
        conversationId: CONV_ID,
      })
    );
  });

  it('does not block invite when notification service is absent', async () => {
    const fastify = createMockFastify();
    (fastify as any).notificationService = undefined;
    const prisma = createMockPrisma();
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'invite');
    const reply = createMockReply();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('does not block invite when notification throws', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockRejectedValue(new Error('notif error'));
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('does not block invite when mention cache invalidation throws', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    fastify.mentionService.invalidateCacheForConversation.mockRejectedValue(new Error('cache error'));
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('invalidates mention cache after invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(fastify.mentionService.invalidateCacheForConversation).toHaveBeenCalledWith(CONV_ID);
  });

  it('does not block invite when mention service is absent', async () => {
    const fastify = createMockFastify();
    (fastify as any).mentionService = undefined;
    const prisma = createMockPrisma();
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'invite');
    const reply = createMockReply();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('sends internal error on unexpected exception', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockRejectedValue(new Error('DB crash'));
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('response includes new member and confirmation message', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    const targetUser = makeTargetUser();
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: targetUser });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(reply._body?.data).toMatchObject({
      member: expect.objectContaining({ id: 'new-part' }),
      message: expect.stringContaining('Bob'),
    });
  });

  it('uses username in message when displayName is null', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce({ id: INVITEE_ID, username: 'charlie', displayName: null, firstName: null, lastName: null })
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'np', user: { displayName: null, username: 'charlie' } });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(reply._body?.data?.message).toContain('charlie');
  });
});
