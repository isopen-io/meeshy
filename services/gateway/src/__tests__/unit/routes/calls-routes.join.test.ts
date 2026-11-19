/**
 * POST /calls/:callId/participants — joinCall : les témoins du join, séparés de
 * `calls-routes.test.ts` (budget de taille des suites, #4531) quand #19778 y a
 * ajouté les témoins « un join refusé CALL_ENDED finalise la carte ». Même
 * montage de doubles que la suite d'origine (`helpers/calls-routes-harness.ts`).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module-level mock variables (hoisted before jest.mock()) ─────────────────

const mockInitiateCall = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockGetCallTranscript = jest.fn<any>();
const mockEndCall = jest.fn<any>();
const mockJoinCall = jest.fn<any>();
const mockLeaveCall = jest.fn<any>();
const mockGetActiveCallForConversation = jest.fn<any>();
const mockListHistory = jest.fn<any>();
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

jest.mock('../../../services/CallService', () => {
  // Mirrors the real CallAlreadyEndedError (services/CallService.ts) — same
  // message shape `parseCallHandlerError` splits on, plus the `endReason`
  // the production class carries on top of it. Issue #3581: endCall() now
  // throws this on a call already in a terminal state instead of returning
  // silently — the route must treat it as an idempotent 200, not an error.
  class CallAlreadyEndedError extends Error {
    readonly endReason: string;
    constructor(endReason: string) {
      super('CALL_ENDED: This call has already ended');
      this.name = 'CallAlreadyEndedError';
      this.endReason = endReason;
    }
  }
  return {
    CallService: jest.fn<any>().mockImplementation(() => ({
      initiateCall: (...args: any[]) => mockInitiateCall(...args),
      getCallSession: (...args: any[]) => mockGetCallSession(...args),
      getCallTranscript: (...args: any[]) => mockGetCallTranscript(...args),
      endCall: (...args: any[]) => mockEndCall(...args),
      joinCall: (...args: any[]) => mockJoinCall(...args),
      leaveCall: (...args: any[]) => mockLeaveCall(...args),
      getActiveCallForConversation: (...args: any[]) =>
        mockGetActiveCallForConversation(...args),
      listHistory: (...args: any[]) => mockListHistory(...args),
      finalizeCallSummary: (...args: any[]) => mockFinalizeCallSummary(...args),
      broadcastCallEndedIfTerminal: (...args: any[]) => mockBroadcastCallEndedIfTerminal(...args),
      invalidateSignalCache: (...args: any[]) => mockInvalidateSignalCache(...args),
      broadcastParticipantLeft: (...args: any[]) => mockBroadcastParticipantLeft(...args),
    })),
    CallAlreadyEndedError,
  };
});

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/rate-limit', () => ({
  ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {}, activeCallProbe: {} },
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

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import callRoutes from '../../../routes/calls';
import { CallAlreadyEndedError } from '../../../services/CallService';
import {
  CALL_ID,
  CONV_ID,
  PART_ID,
  USER_ID,
  createMockFastify,
  createMockReply,
  getRoute,
  makeCallSession,
  
  makeRequest,
} from '../../helpers/calls-routes-harness';

function setup(prismaOverrides?: Record<string, any>) {
  const { fastify, routes, prisma } = createMockFastify(prismaOverrides);
  callRoutes(fastify);
  return { routes, prisma, reply: createMockReply() };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('callRoutes — joinCall', () => {
  beforeEach(() => jest.clearAllMocks());

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

    it('#19778 — un join refusé CALL_ENDED finalise la carte de cet appel et répond 400 CALL_ENDED', async () => {
      const { routes, reply } = setup();
      mockJoinCall.mockRejectedValueOnce(new CallAlreadyEndedError('completed'));

      const req = makeRequest({ params: { callId: CALL_ID }, body: {} });
      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('CALL_ENDED');
      expect(mockFinalizeCallSummary).toHaveBeenCalledWith(CALL_ID);
    });

    it('#19778 — un autre échec de join ne finalise rien', async () => {
      const { routes, reply } = setup();
      mockJoinCall.mockRejectedValueOnce(new Error('CALL_NOT_FOUND: gone'));

      const req = makeRequest({ params: { callId: CALL_ID }, body: {} });
      await getRoute(routes, 'POST', '/calls/:callId/participants')(req, reply);

      expect(mockFinalizeCallSummary).not.toHaveBeenCalled();
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
});
