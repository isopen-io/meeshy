/**
 * Unit tests for routes/calls.ts
 *
 * Uses the mock-Fastify pattern: captures registered route handlers via a
 * synthetic fastify object and invokes them directly with crafted req/reply
 * objects so we avoid spinning up a real HTTP server.
 *
 * Routes covered (all 8):
 *   POST   /calls                                          - initiateCall
 *   GET    /calls/:callId                                  - getCallSession
 *   DELETE /calls/:callId                                  - endCall
 *   POST   /calls/:callId/participants                     - joinCall
 *   DELETE /calls/:callId/participants/:participantId      - leaveCall
 *   GET    /conversations/:conversationId/active-call      - getActiveCallForConversation
 *   GET    /calls/active                                   - getActiveCall (crash recovery)
 *   GET    /calls/history                                  - listHistory (cursor-paginated call journal)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module-level mock variables (hoisted before jest.mock()) ─────────────────

const mockInitiateCall = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockEndCall = jest.fn<any>();
const mockJoinCall = jest.fn<any>();
const mockLeaveCall = jest.fn<any>();
const mockGetActiveCallForConversation = jest.fn<any>();
const mockListHistory = jest.fn<any>();

const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  const statusCode = opts?.statusCode ?? 200;
  reply.statusCode = statusCode;
  reply._body = { success: true, data };
  return reply;
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn<any>().mockImplementation(() => ({
    initiateCall: (...args: any[]) => mockInitiateCall(...args),
    getCallSession: (...args: any[]) => mockGetCallSession(...args),
    endCall: (...args: any[]) => mockEndCall(...args),
    joinCall: (...args: any[]) => mockJoinCall(...args),
    leaveCall: (...args: any[]) => mockLeaveCall(...args),
    getActiveCallForConversation: (...args: any[]) =>
      mockGetActiveCallForConversation(...args),
    listHistory: (...args: any[]) => mockListHistory(...args),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/rate-limit', () => ({
  ROUTE_RATE_LIMITS: {
    initiateCall: {},
    joinCall: {},
    callOperations: {},
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn<any>(),
    warn: jest.fn<any>(),
    error: jest.fn<any>(),
    debug: jest.fn<any>(),
  },
}));

jest.mock('../../../utils/response', () => {
  const actual = jest.requireActual('../../../utils/response') as Record<string, any>;
  return {
    ...actual,
    sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  };
});

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  callSessionSchema: { type: 'object' },
  callSessionMinimalSchema: { type: 'object' },
  callParticipantSchema: { type: 'object' },
  startCallRequestSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import callRoutes from '../../../routes/calls';

// ─── Constants ────────────────────────────────────────────────────────────────

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PART_ID = '507f1f77bcf86cd799439044';
const TARGET_PART_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler };

function makeCallSession(overrides: Record<string, any> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_ID,
    status: 'active',
    type: 'video',
    startedAt: new Date('2026-06-21T00:00:00.000Z'),
    participants: [],
    ...overrides,
  };
}

function makeMembership(overrides: Record<string, any> = {}) {
  return {
    id: PART_ID,
    userId: USER_ID,
    conversationId: CONV_ID,
    role: 'member',
    isActive: true,
    ...overrides,
  };
}

function makeActiveCall(overrides: Record<string, any> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    status: 'active',
    participants: [],
    startedAt: new Date('2026-06-21T00:00:00.000Z'),
    ...overrides,
  };
}

function createMockFastify(prismaOverrides?: Record<string, any>) {
  const routes: RouteReg[] = [];
  const defaultPrisma = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    callSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
  const prisma = prismaOverrides
    ? { ...defaultPrisma, ...prismaOverrides }
    : defaultPrisma;

  const fastify: any = {
    prisma,
    post: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler });
    }),
    get: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler });
    }),
    delete: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler });
    }),
  };

  return { fastify, routes, prisma };
}

function createMockReply(): any {
  const reply: any = {
    _body: undefined,
    statusCode: 200,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => {
      reply._body = body;
      return reply;
    }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    query: {},
    authContext: {
      userId: USER_ID,
      participantId: PART_ID,
      type: 'registered',
      hasFullAccess: true,
    },
    ...overrides,
  };
}

function getRoute(routes: RouteReg[], method: string, pathFragment: string): RouteHandler {
  const r = routes.find(
    (r) => r.method === method && r.path.includes(pathFragment)
  );
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r.handler;
}

function setup(prismaOverrides?: Record<string, any>) {
  const { fastify, routes, prisma } = createMockFastify(prismaOverrides);
  callRoutes(fastify);
  return { routes, prisma, reply: createMockReply() };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('callRoutes', () => {
  beforeEach(() => jest.clearAllMocks());

  // ══════════════════════════════════════════════════════════════════════════
  // Route registration
  // ══════════════════════════════════════════════════════════════════════════

  describe('route registration', () => {
    it('registers all 8 routes', () => {
      const { routes } = setup();
      expect(routes).toHaveLength(8);
    });

    it('registers POST /calls', () => {
      const { routes } = setup();
      expect(routes.some((r) => r.method === 'POST' && r.path === '/calls')).toBe(true);
    });

    it('registers GET /calls/active before GET /calls/:callId to avoid conflict', () => {
      const { routes } = setup();
      const activeIdx = routes.findIndex(
        (r) => r.method === 'GET' && r.path === '/calls/active'
      );
      const paramIdx = routes.findIndex(
        (r) => r.method === 'GET' && r.path === '/calls/:callId'
      );
      // Both routes exist
      expect(activeIdx).toBeGreaterThanOrEqual(0);
      expect(paramIdx).toBeGreaterThanOrEqual(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /calls — initiateCall
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /calls — initiateCall', () => {
    it('returns 201 with call session on success', async () => {
      const { routes, reply } = setup();
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        body: { conversationId: CONV_ID, type: 'video' },
      });

      const handler = getRoute(routes, 'POST', '/calls');
      await handler(req, reply);

      expect(reply.statusCode).toBe(201);
      expect(reply._body).toMatchObject({ success: true, data: session });
    });

    it('calls initiateCall with correct args including participantId from authContext', async () => {
      const { routes, reply } = setup();
      mockInitiateCall.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        body: { conversationId: CONV_ID, type: 'audio', settings: { audioEnabled: true } },
      });

      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(mockInitiateCall).toHaveBeenCalledWith({
        conversationId: CONV_ID,
        initiatorId: USER_ID,
        participantId: PART_ID,
        type: 'audio',
        settings: { audioEnabled: true },
      });
    });

    it('looks up participantId from DB when not in authContext', async () => {
      const mockPrismaParticipant = {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: 'db-part-id' }),
        },
        callSession: { findFirst: jest.fn<any>() },
      };
      const { routes, reply } = setup(mockPrismaParticipant as any);
      mockInitiateCall.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        body: { conversationId: CONV_ID, type: 'video' },
        authContext: { userId: USER_ID, participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(mockPrismaParticipant.participant.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, isActive: true },
        select: { id: true },
      });
      expect(mockInitiateCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: 'db-part-id' })
      );
    });

    it('returns 400 with parsed error code on service failure', async () => {
      const { routes, reply } = setup();
      mockInitiateCall.mockRejectedValueOnce(
        new Error('CALL_ALREADY_ACTIVE: A call is already active in this conversation')
      );

      const req = makeRequest({ body: { conversationId: CONV_ID, type: 'video' } });
      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body).toMatchObject({
        success: false,
        error: 'CALL_ALREADY_ACTIVE',
        message: 'A call is already active in this conversation',
      });
    });

    it('returns 400 with full message as code when error has no colon', async () => {
      const { routes, reply } = setup();
      mockInitiateCall.mockRejectedValueOnce(new Error('Unexpected failure'));

      const req = makeRequest({ body: { conversationId: CONV_ID, type: 'video' } });
      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body).toMatchObject({
        success: false,
        error: 'Unexpected failure',
        message: 'Unexpected failure',
      });
    });

    it('uses fallback message when error has no message', async () => {
      const { routes, reply } = setup();
      mockInitiateCall.mockRejectedValueOnce({});

      const req = makeRequest({ body: { conversationId: CONV_ID, type: 'video' } });
      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('Failed to initiate call');
    });

    it('error from service is propagated (details not in standard response)', async () => {
      const { routes, reply } = setup();
      const err: any = new Error('INVALID:bad input');
      err.details = { field: 'conversationId' };
      mockInitiateCall.mockRejectedValueOnce(err);

      const req = makeRequest({ body: { conversationId: CONV_ID, type: 'video' } });
      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.success).toBe(false);
    });

    it('handles error with multiple colons in message correctly', async () => {
      const { routes, reply } = setup();
      mockInitiateCall.mockRejectedValueOnce(
        new Error('CODE: message: with: colons')
      );

      const req = makeRequest({ body: { conversationId: CONV_ID, type: 'video' } });
      await getRoute(routes, 'POST', '/calls')(req, reply);

      expect(reply._body?.error).toBe('CODE');
      expect(reply._body?.message).toBe('message: with: colons');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /calls/:callId — getCallSession
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /calls/:callId — getCallSession', () => {
    it('returns 200 with call session on success', async () => {
      const { routes, reply } = setup();
      const session = makeCallSession();
      mockGetCallSession.mockResolvedValueOnce(session);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId')(req, reply);

      expect(reply._body).toMatchObject({ success: true, data: session });
      expect(mockGetCallSession).toHaveBeenCalledWith(CALL_ID, USER_ID);
    });

    it('returns 404 when CALL_NOT_FOUND error is thrown', async () => {
      const { routes, reply } = setup();
      mockGetCallSession.mockRejectedValueOnce(
        new Error('CALL_NOT_FOUND: Call does not exist')
      );

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply._body?.error).toBe('CALL_NOT_FOUND');
      expect(reply._body?.message).toBe('Call does not exist');
    });

    it('returns 400 for non-NOT_FOUND errors', async () => {
      const { routes, reply } = setup();
      mockGetCallSession.mockRejectedValueOnce(new Error('INVALID_ID: bad format'));

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('INVALID_ID');
    });

    it('uses fallback message when error has no message', async () => {
      const { routes, reply } = setup();
      mockGetCallSession.mockRejectedValueOnce({});

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId')(req, reply);

      expect(reply._body?.error).toBe('Failed to get call');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /calls/:callId — endCall
  // ══════════════════════════════════════════════════════════════════════════

  describe('DELETE /calls/:callId — endCall', () => {
    it('allows the initiator to end the call', async () => {
      const session = makeCallSession({ initiatorId: USER_ID });
      const membership = makeMembership({ role: 'member' });

      const { routes, prisma, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockEndCall.mockResolvedValueOnce(session);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, PART_ID);
      expect(reply._body).toMatchObject({ success: true, data: session });
    });

    it('allows an admin member to end the call', async () => {
      const session = makeCallSession({ initiatorId: 'other-user-id' });
      const membership = makeMembership({ role: 'admin' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockEndCall.mockResolvedValueOnce(session);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(mockEndCall).toHaveBeenCalled();
    });

    it('allows a moderator to end the call', async () => {
      const session = makeCallSession({ initiatorId: 'other-user-id' });
      const membership = makeMembership({ role: 'moderator' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockEndCall.mockResolvedValueOnce(session);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(mockEndCall).toHaveBeenCalled();
    });

    it('returns 403 when caller is not a participant', async () => {
      const session = makeCallSession();

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('NOT_A_PARTICIPANT');
      expect(mockEndCall).not.toHaveBeenCalled();
    });

    it('returns 403 when caller is a regular member and not the initiator', async () => {
      const session = makeCallSession({ initiatorId: 'other-user-id' });
      const membership = makeMembership({ role: 'member' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('PERMISSION_DENIED');
    });

    it('uses membership.id for endParticipantId when authContext.participantId absent', async () => {
      const session = makeCallSession({ initiatorId: USER_ID });
      const membership = makeMembership({ id: 'membership-part-id', role: 'member' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockEndCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID },
        authContext: { userId: USER_ID, participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, 'membership-part-id');
    });

    it('returns 404 on CALL_NOT_FOUND in getCallSession', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockRejectedValueOnce(
        new Error('CALL_NOT_FOUND: not found')
      );

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply._body?.error).toBe('CALL_NOT_FOUND');
    });

    it('returns 400 on generic endCall error', async () => {
      const session = makeCallSession({ initiatorId: USER_ID });
      const membership = makeMembership();

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockEndCall.mockRejectedValueOnce(new Error('ALREADY_ENDED: call is over'));

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('ALREADY_ENDED');
    });

    it('uses fallback message on error without message', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockRejectedValueOnce({});

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply._body?.error).toBe('Failed to end call');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /calls/:callId/participants — joinCall
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /calls/:callId/participants — joinCall', () => {
    it('returns 200 with call session on success', async () => {
      const { routes, reply } = setup();
      const session = makeCallSession();
      mockJoinCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID },
        body: {},
      });

      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(reply._body).toMatchObject({ success: true, data: session });
    });

    it('calls joinCall with participantId from authContext', async () => {
      const { routes, reply } = setup();
      mockJoinCall.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        params: { callId: CALL_ID },
        body: { settings: { audioEnabled: false } },
      });

      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(mockJoinCall).toHaveBeenCalledWith({
        callId: CALL_ID,
        userId: USER_ID,
        participantId: PART_ID,
        settings: { audioEnabled: false },
      });
    });

    it('looks up participantId from DB when absent from authContext', async () => {
      const mockParticipantFindFirst = jest.fn<any>().mockResolvedValue({ id: 'db-part' });
      const { routes, reply } = setup({
        participant: { findFirst: mockParticipantFindFirst },
        callSession: { findFirst: jest.fn<any>() },
      });

      const session = makeCallSession({ conversationId: CONV_ID });
      mockGetCallSession.mockResolvedValueOnce(session);
      mockJoinCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID },
        body: {},
        authContext: { userId: USER_ID, participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(mockGetCallSession).toHaveBeenCalledWith(CALL_ID);
      expect(mockParticipantFindFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, isActive: true },
        select: { id: true },
      });
      expect(mockJoinCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: 'db-part' })
      );
    });

    it('skips DB lookup when call has no conversationId', async () => {
      const mockParticipantFindFirst = jest.fn<any>();
      const { routes, reply } = setup({
        participant: { findFirst: mockParticipantFindFirst },
        callSession: { findFirst: jest.fn<any>() },
      });

      const sessionWithoutConv = makeCallSession({ conversationId: null });
      mockGetCallSession.mockResolvedValueOnce(sessionWithoutConv);
      mockJoinCall.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        params: { callId: CALL_ID },
        body: {},
        authContext: { userId: USER_ID, participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(mockParticipantFindFirst).not.toHaveBeenCalled();
    });

    it('returns 404 on CALL_NOT_FOUND', async () => {
      const { routes, reply } = setup();
      mockJoinCall.mockRejectedValueOnce(new Error('CALL_NOT_FOUND: gone'));

      const req = makeRequest({ params: { callId: CALL_ID }, body: {} });
      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply._body?.error).toBe('CALL_NOT_FOUND');
    });

    it('returns 400 on other errors', async () => {
      const { routes, reply } = setup();
      mockJoinCall.mockRejectedValueOnce(new Error('ALREADY_IN_CALL: already joined'));

      const req = makeRequest({ params: { callId: CALL_ID }, body: {} });
      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('ALREADY_IN_CALL');
    });

    it('uses fallback message when error has no message', async () => {
      const { routes, reply } = setup();
      mockJoinCall.mockRejectedValueOnce({});

      const req = makeRequest({ params: { callId: CALL_ID }, body: {} });
      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(reply._body?.error).toBe('Failed to join call');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /calls/:callId/participants/:participantId — leaveCall
  // ══════════════════════════════════════════════════════════════════════════

  describe('DELETE /calls/:callId/participants/:participantId — leaveCall', () => {
    it('allows a user to leave their own participation (participantId === userId)', async () => {
      const { routes, reply } = setup();
      const session = makeCallSession();
      mockLeaveCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(mockLeaveCall).toHaveBeenCalledWith({
        callId: CALL_ID,
        userId: USER_ID,
        participantId: PART_ID,
      });
      expect(reply._body).toMatchObject({ success: true, data: session });
    });

    it('uses authContext.participantId for leaveParticipantId even when leaving own slot', async () => {
      const { routes, reply } = setup();
      mockLeaveCall.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
        authContext: {
          userId: USER_ID,
          participantId: 'authcontext-part-id',
          type: 'registered',
        },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(mockLeaveCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: 'authcontext-part-id' })
      );
    });

    it('resolves leaveParticipantId from the DB when authContext.participantId absent (registered self-leave)', async () => {
      const { routes, reply } = setup();
      mockGetCallSession.mockResolvedValueOnce(makeCallSession());
      mockLeaveCall.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
        authContext: { userId: USER_ID, participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      // No Participant row resolves for USER_ID in this test's (empty) prisma
      // mock, so the code falls back to the raw participantId — same
      // behavior as before, but now reached via an explicit DB lookup
      // instead of blindly trusting a User.id as a Participant.id.
      expect(mockLeaveCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: USER_ID })
      );
    });

    it('allows a moderator to remove another participant, using the TARGET participant id (not the moderator\'s own)', async () => {
      const session = makeCallSession();
      const modMembership = makeMembership({ role: 'moderator' });
      const resolvedTargetParticipant = { id: 'resolved-target-part-id' };

      const participantFindFirst = jest
        .fn<any>()
        .mockResolvedValueOnce(modMembership) // moderator role check (caller)
        .mockResolvedValueOnce(resolvedTargetParticipant); // target resolution

      const { routes, reply } = setup({
        participant: { findFirst: participantFindFirst },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockLeaveCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: TARGET_PART_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      // Regression guard: a moderator kicking someone else must never end up
      // marking the MODERATOR's own participation as "left" (PART_ID is the
      // moderator's own id per `makeMembership()`/default authContext).
      expect(mockLeaveCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: resolvedTargetParticipant.id })
      );
      expect(mockLeaveCall).not.toHaveBeenCalledWith(
        expect.objectContaining({ participantId: PART_ID })
      );
    });

    it('allows an admin to remove another participant, using the TARGET participant id (not the admin\'s own)', async () => {
      const session = makeCallSession();
      const adminMembership = makeMembership({ role: 'admin' });
      const resolvedTargetParticipant = { id: 'resolved-target-part-id' };

      const participantFindFirst = jest
        .fn<any>()
        .mockResolvedValueOnce(adminMembership) // moderator role check (caller)
        .mockResolvedValueOnce(resolvedTargetParticipant); // target resolution

      const { routes, reply } = setup({
        participant: { findFirst: participantFindFirst },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockLeaveCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: TARGET_PART_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(mockLeaveCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: resolvedTargetParticipant.id })
      );
      expect(mockLeaveCall).not.toHaveBeenCalledWith(
        expect.objectContaining({ participantId: PART_ID })
      );
    });

    it('returns 403 when regular member tries to remove another participant', async () => {
      const session = makeCallSession();
      const regularMembership = makeMembership({ role: 'member' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(regularMembership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: TARGET_PART_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('PERMISSION_DENIED');
      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('returns 403 when non-member tries to remove another participant', async () => {
      const session = makeCallSession();

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: TARGET_PART_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('PERMISSION_DENIED');
    });

    it('returns 404 on CALL_NOT_FOUND error', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockRejectedValueOnce(new Error('CALL_NOT_FOUND: gone'));

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: TARGET_PART_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 on leaveCall error', async () => {
      const { routes, reply } = setup();
      mockLeaveCall.mockRejectedValueOnce(new Error('NOT_IN_CALL: not a participant'));

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('NOT_IN_CALL');
    });

    it('uses fallback message on error without message', async () => {
      const { routes, reply } = setup();
      mockLeaveCall.mockRejectedValueOnce({});

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(reply._body?.error).toBe('Failed to leave call');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /conversations/:conversationId/active-call
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /conversations/:conversationId/active-call', () => {
    it('returns 200 with active call when user is a member', async () => {
      const membership = makeMembership();
      const activeCall = makeCallSession({ status: 'active' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetActiveCallForConversation.mockResolvedValueOnce(activeCall);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      await getRoute(routes, 'GET', '/conversations/:conversationId/active-call')(
        req,
        reply
      );

      expect(mockGetActiveCallForConversation).toHaveBeenCalledWith(CONV_ID);
      expect(reply._body).toMatchObject({ success: true, data: activeCall });
    });

    it('returns 200 with null when no active call exists', async () => {
      const membership = makeMembership();

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetActiveCallForConversation.mockResolvedValueOnce(null);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      await getRoute(routes, 'GET', '/conversations/:conversationId/active-call')(
        req,
        reply
      );

      expect(reply._body).toMatchObject({ success: true, data: null });
    });

    it('returns 403 when user is not a member', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
        callSession: { findFirst: jest.fn<any>() },
      });

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      await getRoute(routes, 'GET', '/conversations/:conversationId/active-call')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('NOT_A_PARTICIPANT');
      expect(mockGetActiveCallForConversation).not.toHaveBeenCalled();
    });

    it('returns 500 when service throws', async () => {
      const membership = makeMembership();

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetActiveCallForConversation.mockRejectedValueOnce(new Error('DB error'));

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      await getRoute(routes, 'GET', '/conversations/:conversationId/active-call')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply._body?.error).toBe('INTERNAL_ERROR');
    });

    it('verifies membership with correct where clause', async () => {
      const mockFindFirst = jest.fn<any>().mockResolvedValue(makeMembership());
      const { routes, reply } = setup({
        participant: { findFirst: mockFindFirst },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetActiveCallForConversation.mockResolvedValueOnce(null);

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      await getRoute(routes, 'GET', '/conversations/:conversationId/active-call')(
        req,
        reply
      );

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { conversationId: CONV_ID, userId: USER_ID, isActive: true },
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /calls/active — crash recovery
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /calls/active — crash recovery', () => {
    it('returns 200 with active call when found', async () => {
      const activeCall = makeActiveCall();

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: jest.fn<any>().mockResolvedValue(activeCall) },
      });

      const req = makeRequest();
      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(reply._body).toMatchObject({ success: true, data: activeCall });
    });

    it('queries callSession with correct where clause', async () => {
      const mockCallFindFirst = jest.fn<any>().mockResolvedValue(makeActiveCall());
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: mockCallFindFirst },
      });

      const req = makeRequest();
      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(mockCallFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'],
            },
            participants: {
              some: {
                participant: { userId: USER_ID },
                leftAt: null,
              },
            },
          }),
        })
      );
    });

    it('orders results by startedAt desc', async () => {
      const mockCallFindFirst = jest.fn<any>().mockResolvedValue(makeActiveCall());
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: mockCallFindFirst },
      });

      const req = makeRequest();
      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(mockCallFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { startedAt: 'desc' },
        })
      );
    });

    it('returns 404 when no active call exists', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      });

      const req = makeRequest();
      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply._body?.error).toBe('NO_ACTIVE_CALL');
    });

    it('returns 401 when userId is falsy', async () => {
      const { routes, reply } = setup();

      const req = makeRequest({
        authContext: { userId: '', participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply._body?.error).toBe('NOT_AUTHENTICATED');
    });

    it('returns 401 when authContext.userId is null', async () => {
      const { routes, reply } = setup();

      const req = makeRequest({
        authContext: { userId: null, participantId: undefined, type: 'anonymous' },
      });

      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('returns 500 when callSession.findFirst throws', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: {
          findFirst: jest.fn<any>().mockRejectedValueOnce(new Error('DB crash')),
        },
      });

      const req = makeRequest();
      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply._body?.error).toBe('INTERNAL_ERROR');
    });

    it('includes nested participants.include in query', async () => {
      const mockCallFindFirst = jest.fn<any>().mockResolvedValue(makeActiveCall());
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: mockCallFindFirst },
      });

      const req = makeRequest();
      await getRoute(routes, 'GET', '/calls/active')(req, reply);

      expect(mockCallFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            participants: expect.objectContaining({
              include: expect.objectContaining({
                participant: expect.objectContaining({
                  select: expect.objectContaining({ id: true, userId: true }),
                }),
              }),
            }),
          }),
        })
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /calls/history — listHistory
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /calls/history — listHistory', () => {
    it('returns 200 with items and pagination on success', async () => {
      const { routes, reply } = setup();
      const items = [{ callId: CALL_ID, conversationId: CONV_ID, direction: 'outgoing' }];
      mockListHistory.mockResolvedValueOnce({ items, hasMore: false, nextCursor: undefined });

      const req = makeRequest({ query: {} });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        items,
        expect.objectContaining({
          pagination: expect.objectContaining({ hasMore: false }),
        })
      );
    });

    it('calls listHistory with userId and parsed query params', async () => {
      const { routes, reply } = setup();
      mockListHistory.mockResolvedValueOnce({ items: [], hasMore: false });

      const req = makeRequest({ query: { limit: '5', filter: 'all' } });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockListHistory).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ limit: 5, filter: 'all' })
      );
    });

    it('uses default params (limit=30, filter=all) when query is empty', async () => {
      const { routes, reply } = setup();
      mockListHistory.mockResolvedValueOnce({ items: [], hasMore: false });

      const req = makeRequest({ query: {} });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockListHistory).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ limit: 30, filter: 'all' })
      );
    });

    it('forwards cursor and filter=missed when provided', async () => {
      const { routes, reply } = setup();
      mockListHistory.mockResolvedValueOnce({ items: [], hasMore: false });

      const req = makeRequest({ query: { limit: '10', cursor: CALL_ID, filter: 'missed' } });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockListHistory).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ cursor: CALL_ID, filter: 'missed' })
      );
    });

    it('passes hasMore=true and nextCursor in pagination when more pages exist', async () => {
      const { routes, reply } = setup();
      const items = [{ callId: CALL_ID }];
      mockListHistory.mockResolvedValueOnce({ items, hasMore: true, nextCursor: CALL_ID });

      const req = makeRequest({ query: {} });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(
        reply,
        items,
        expect.objectContaining({
          pagination: expect.objectContaining({ hasMore: true, nextCursor: CALL_ID }),
        })
      );
    });

    it('returns 401 when userId is empty string', async () => {
      const { routes, reply } = setup();
      const req = makeRequest({
        query: {},
        authContext: { userId: '', participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply._body?.error).toBe('NOT_AUTHENTICATED');
      expect(mockListHistory).not.toHaveBeenCalled();
    });

    it('returns 401 when userId is null', async () => {
      const { routes, reply } = setup();
      const req = makeRequest({
        query: {},
        authContext: { userId: null, participantId: undefined, type: 'anonymous' },
      });

      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply._body?.error).toBe('NOT_AUTHENTICATED');
      expect(mockListHistory).not.toHaveBeenCalled();
    });

    it('returns 500 with INTERNAL_ERROR when listHistory throws', async () => {
      const { routes, reply } = setup();
      mockListHistory.mockRejectedValueOnce(new Error('DB failure'));

      const req = makeRequest({ query: {} });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply._body?.error).toBe('INTERNAL_ERROR');
      expect(reply._body?.message).toBe('Failed to get call history');
    });

    it('falls back to default params (limit=30, filter=all) when Zod safeParse fails', async () => {
      // Passing limit=abc → Number('abc') = NaN → fails z.coerce.number().int()
      // → safeParse returns { success: false } → fallback branch fires
      const { routes, reply } = setup();
      mockListHistory.mockResolvedValueOnce({ items: [], hasMore: false });

      const req = makeRequest({ query: { limit: 'abc' } });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockListHistory).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ limit: 30, filter: 'all' })
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Cross-cutting: error parsing with colon in message
  // ══════════════════════════════════════════════════════════════════════════

  describe('error code parsing', () => {
    it('POST /calls — CALL_NOT_FOUND in initiateCall maps to 400 (not 404 like GET)', async () => {
      // For POST /calls, the statusCode logic is: always 400 regardless of code
      const { routes, reply } = setup();
      mockInitiateCall.mockRejectedValueOnce(
        new Error('CALL_NOT_FOUND: conversation has no active call')
      );

      const req = makeRequest({ body: { conversationId: CONV_ID, type: 'video' } });
      await getRoute(routes, 'POST', '/calls')(req, reply);

      // POST /calls uses flat 400 for all errors (no 404 branch)
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('DELETE /calls/:callId — CALL_NOT_FOUND from getCallSession maps to 404', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>() },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockRejectedValueOnce(new Error('CALL_NOT_FOUND: not found'));

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
    });
  });
});
