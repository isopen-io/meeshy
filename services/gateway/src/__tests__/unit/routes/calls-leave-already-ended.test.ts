/**
 * Unit test for routes/calls.ts — DELETE /calls/:callId/participants/:participantId
 *
 * Vague 182 (#4202/Vague 181 follow-up) — mirrors the already-covered
 * CallAlreadyEndedError idempotency test on the END route
 * (`calls-routes.test.ts`, "DELETE /calls/:callId — endCall"). leaveCall()
 * throws CallAlreadyEndedError when this leave/kick lost the race to a
 * concurrent terminal write, not when it genuinely failed — the caller's
 * intent already holds, so the route must respond 200 with the call's
 * current (terminal) session, not a 400/404 error, and must NOT touch
 * broadcastParticipantLeft or invalidateSignalCache for a leave this request
 * did not actually perform.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module-level mock variables (hoisted before jest.mock()) ─────────────────

const mockGetCallSession = jest.fn<any>();
const mockLeaveCall = jest.fn<any>();
const mockFinalizeCallSummary = jest.fn<any>();
const mockBroadcastCallEndedIfTerminal = jest.fn<any>();
const mockInvalidateSignalCache = jest.fn<any>();
const mockBroadcastParticipantLeft = jest.fn<any>();

const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  const statusCode = opts?.statusCode ?? 200;
  reply.statusCode = statusCode;
  reply._body = { success: true, data };
  return reply;
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../services/CallService', () => ({
  // Real CallAlreadyEndedError, not a hand-rolled lookalike — the catch
  // block under test does `error instanceof CallAlreadyEndedError`.
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn<any>().mockImplementation(() => ({
    getCallSession: (...args: any[]) => mockGetCallSession(...args),
    leaveCall: (...args: any[]) => mockLeaveCall(...args),
    finalizeCallSummary: (...args: any[]) => mockFinalizeCallSummary(...args),
    broadcastCallEndedIfTerminal: (...args: any[]) => mockBroadcastCallEndedIfTerminal(...args),
    invalidateSignalCache: (...args: any[]) => mockInvalidateSignalCache(...args),
    broadcastParticipantLeft: (...args: any[]) => mockBroadcastParticipantLeft(...args),
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
  startCallRequestSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import callRoutes from '../../../routes/calls';
import { CallAlreadyEndedError } from '../../../services/CallService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PART_ID = '507f1f77bcf86cd799439044';

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

function makeCurrentEndedSession() {
  return makeCallSession({ status: 'ended', endReason: 'completed', endedAt: new Date() });
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
  const prisma = prismaOverrides ? { ...defaultPrisma, ...prismaOverrides } : defaultPrisma;

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
      type: 'user',
      hasFullAccess: true,
      registeredUser: { id: USER_ID, role: 'USER' },
    },
    ...overrides,
  };
}

function getRoute(routes: RouteReg[], method: string, pathFragment: string): RouteHandler {
  const r = routes.find((r) => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r.handler;
}

function setup(prismaOverrides?: Record<string, any>) {
  const { fastify, routes, prisma } = createMockFastify(prismaOverrides);
  callRoutes(fastify);
  return { routes, prisma, reply: createMockReply() };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('DELETE /calls/:callId/participants/:participantId — leaveCall idempotency (CallAlreadyEndedError)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the current session with 200 when the leave already ended (idempotent, mirrors call:leave socket handler)', async () => {
    const membership = makeMembership();
    const { routes, reply } = setup({
      participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
      callSession: { findFirst: jest.fn<any>() },
    });
    mockGetCallSession.mockResolvedValueOnce(makeCallSession());
    mockLeaveCall.mockRejectedValueOnce(new CallAlreadyEndedError('completed'));
    mockGetCallSession.mockResolvedValueOnce(makeCurrentEndedSession());

    const req = makeRequest({ params: { callId: CALL_ID, participantId: USER_ID } });

    await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply._body).toMatchObject({ success: true, data: { status: 'ended' } });
  });

  it('does NOT re-broadcast participant-left or touch the signal cache for a leave it did not actually perform', async () => {
    const membership = makeMembership();
    const { routes, reply } = setup({
      participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
      callSession: { findFirst: jest.fn<any>() },
    });
    mockGetCallSession.mockResolvedValueOnce(makeCallSession());
    mockLeaveCall.mockRejectedValueOnce(new CallAlreadyEndedError('completed'));
    mockGetCallSession.mockResolvedValueOnce(makeCurrentEndedSession());

    const req = makeRequest({ params: { callId: CALL_ID, participantId: USER_ID } });

    await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

    expect(mockBroadcastParticipantLeft).not.toHaveBeenCalled();
    expect(mockInvalidateSignalCache).not.toHaveBeenCalled();
    expect(mockBroadcastCallEndedIfTerminal).not.toHaveBeenCalled();
  });
});
