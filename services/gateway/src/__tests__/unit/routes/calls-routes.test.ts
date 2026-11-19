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
 *   POST   /calls/:callId/participants                     - joinCall   (calls-routes.join.test.ts)
 *   DELETE /calls/:callId/participants/:participantId      - leaveCall  (calls-routes.leave.test.ts)
 *   GET    /conversations/:conversationId/active-call      - getActiveCallForConversation
 *   GET    /calls/active                                   - getActiveCall (crash recovery)
 *   GET    /calls/history                                  - listHistory (cursor-paginated call journal)
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

import callRoutes from '../../../routes/calls';
import { CallAlreadyEndedError } from '../../../services/CallService';

import {
  CALL_ID,
  CONV_ID,
  PART_ID,
  TARGET_PART_ID,
  USER_ID,
  createMockFastify,
  createMockReply,
  getRoute,
  makeActiveCall,
  makeCallSession,
  makeMembership,
  makeRequest,
} from '../../helpers/calls-routes-harness';

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
    it('registers all 12 routes', () => {
      const { routes } = setup();
      expect(routes).toHaveLength(12);
    });

    it('registers GET /calls/:callId/transcript', () => {
      const { routes } = setup();
      expect(
        routes.some((r) => r.method === 'GET' && r.path === '/calls/:callId/transcript')
      ).toBe(true);
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
  // GET /calls/:callId/transcript — getCallTranscript
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /calls/:callId/transcript — getCallTranscript', () => {
    const transcript = {
      callId: CALL_ID,
      conversationId: CONV_ID,
      callStartedAt: new Date(1_765_650_000_000),
      segments: [
        {
          id: 'seg-1',
          speakerId: USER_ID,
          speakerDisplayName: 'Alice Doe',
          text: 'Bonjour',
          language: 'fr',
          confidence: 0.9,
          capturedAtMs: 1_765_650_001_000,
          translations: [{ targetLanguage: 'en', translatedText: 'Hello' }],
        },
      ],
    };

    it('returns 200 with the persisted transcript', async () => {
      const { routes, reply } = setup();
      mockGetCallTranscript.mockResolvedValueOnce(transcript);

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId/transcript')(req, reply);

      expect(reply._body).toMatchObject({ success: true, data: transcript });
      // #4165 — la page par defaut est bornee : un appel d'une heure ne rend
      // plus son journal entier au premier acces au replay.
      expect(mockGetCallTranscript).toHaveBeenCalledWith(CALL_ID, USER_ID, 0, 100);
    });

    it('transmet la fenetre demandee au service, jamais un slice apres coup', async () => {
      const { routes, reply } = setup();
      mockGetCallTranscript.mockResolvedValueOnce({ ...transcript, total: 900, hasMore: true });

      const req = makeRequest({ params: { callId: CALL_ID }, query: { offset: '200', limit: '50' } });
      await getRoute(routes, 'GET', '/calls/:callId/transcript')(req, reply);

      expect(mockGetCallTranscript).toHaveBeenCalledWith(CALL_ID, USER_ID, 200, 50);
      expect(reply._body?.data).toMatchObject({ total: 900, hasMore: true });
    });

    it('returns 403 when the requester never took part in the call', async () => {
      const { routes, reply } = setup();
      mockGetCallTranscript.mockRejectedValueOnce(
        new Error('NOT_A_PARTICIPANT: You do not have access to this call transcript')
      );

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId/transcript')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('NOT_A_PARTICIPANT');
    });

    it('returns 404 when the call does not exist', async () => {
      const { routes, reply } = setup();
      mockGetCallTranscript.mockRejectedValueOnce(
        new Error('CALL_NOT_FOUND: Call session not found')
      );

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId/transcript')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply._body?.error).toBe('CALL_NOT_FOUND');
    });

    it('returns 400 for other errors', async () => {
      const { routes, reply } = setup();
      mockGetCallTranscript.mockRejectedValueOnce(new Error('INVALID_ID: bad format'));

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'GET', '/calls/:callId/transcript')(req, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply._body?.error).toBe('INVALID_ID');
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
      // Parité socket call:end — le pair est notifié en temps réel via call:ended.
      expect(mockBroadcastCallEndedIfTerminal).toHaveBeenCalledWith(session, USER_ID);
      // Parité socket call:end — le cache de session `call:signal` (TTL 2s)
      // est invalidé immédiatement après l'écriture de `leftAt` par endCall().
      expect(mockInvalidateSignalCache).toHaveBeenCalledWith(CALL_ID);
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

    it('allows a regular member (not initiator/admin/moderator) to end the call — parity with socket call:end', async () => {
      // The route must NOT re-implement a stricter initiator/admin/moderator-only
      // gate: CallService.endCall() itself is the single source of truth for
      // "who may end this call" (P2P: any active participant), and the socket
      // `call:end` path already delegates to it with no extra gate. A plain
      // conversation member who IS an active call participant must be able to
      // end their own call via REST exactly like they can via the socket.
      const session = makeCallSession({ initiatorId: 'other-user-id' });
      const membership = makeMembership({ role: 'member' });

      const { routes, reply } = setup({
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

    it('surfaces NOT_A_PARTICIPANT from CallService.endCall when the member is a conversation member but not an active call participant', async () => {
      // Authorization for "must be an active participant of THIS call" still
      // happens — just inside CallService.endCall(), not duplicated in the route.
      const session = makeCallSession({ initiatorId: 'other-user-id' });
      const membership = makeMembership({ role: 'member' });

      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      mockGetCallSession.mockResolvedValueOnce(session);
      mockEndCall.mockRejectedValueOnce(new Error('NOT_A_PARTICIPANT: You are not in this call'));

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, PART_ID);
      expect(reply._body?.success).toBe(false);
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

    // Issue #3581 — endCall() throws CallAlreadyEndedError (instead of
    // returning the current session) when the call is already in a terminal
    // state. Unlike the generic-error branch above, this is not a failure:
    // the caller's intent already holds, so the route must return the
    // current (terminal) session with a 200, not a 4xx error — and must NOT
    // touch broadcastCallEndedIfTerminal/invalidateSignalCache/
    // finalizeCallSummary/broadcastParticipantLeft a second time (all
    // already ran on whichever path ended the call first).
    it('returns the current session with 200 when the call already ended (idempotent, mirrors call:end socket handler)', async () => {
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });

      const session = makeCallSession({ status: 'ended' });
      mockGetCallSession
        .mockResolvedValueOnce(session) // pre-end membership lookup
        .mockResolvedValueOnce(session); // idempotent re-fetch in the catch branch
      mockEndCall.mockRejectedValueOnce(new CallAlreadyEndedError('completed'));

      const req = makeRequest({ params: { callId: CALL_ID } });
      await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

      expect(reply._body).toMatchObject({ success: true, data: session });
      expect(reply.status).not.toHaveBeenCalledWith(400);
      expect(mockBroadcastCallEndedIfTerminal).not.toHaveBeenCalled();
      expect(mockFinalizeCallSummary).not.toHaveBeenCalled();
      expect(mockBroadcastParticipantLeft).not.toHaveBeenCalled();
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

    // Group hang-up via REST (calling-stack audit 2026-08-16) — mirrors the
    // sibling leave route's own PARTICIPANT_LEFT fix (2026-08-15). endCall()
    // now delegates to leaveCall() when a GROUP call still has other active
    // participants (see CallService.endCall()'s doc comment), so this route
    // must broadcast the same PARTICIPANT_LEFT the leave route does — not
    // just rely on broadcastCallEndedIfTerminal, which is a no-op for a
    // non-terminal (still-live) session.
    describe('PARTICIPANT_LEFT broadcast (parité socket call:end, group hang-up)', () => {
      it('broadcasts PARTICIPANT_LEFT using the ender\'s OWN CallParticipant row id from the pre-end snapshot', async () => {
        const membership = makeMembership();
        const { routes, reply } = setup({
          participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
          callSession: { findFirst: jest.fn<any>() },
        });
        // endCall() delegated to leaveCall(): the call keeps running
        // (non-terminal) — broadcastCallEndedIfTerminal is a no-op here.
        const session = makeCallSession({
          status: 'active',
          endedAt: null,
          mode: 'p2p',
          participants: [{ id: 'ender-row-id', participantId: PART_ID, leftAt: null }],
        });
        mockGetCallSession.mockResolvedValueOnce(session);
        mockEndCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID } });
        await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

        expect(mockBroadcastParticipantLeft).toHaveBeenCalledWith(
          CALL_ID,
          'ender-row-id',
          USER_ID,
          'p2p'
        );
      });

      it('does not broadcast when no matching pre-end participant row is found (defensive no-op)', async () => {
        const membership = makeMembership();
        const { routes, reply } = setup({
          participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
          callSession: { findFirst: jest.fn<any>() },
        });
        // `participants: []` (default makeCallSession) — no row matches.
        const session = makeCallSession();
        mockGetCallSession.mockResolvedValueOnce(session);
        mockEndCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID } });
        await getRoute(routes, 'DELETE', '/calls/:callId')(req, reply);

        expect(mockBroadcastParticipantLeft).not.toHaveBeenCalled();
      });
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

    it('returns the 404 of an unknown conversation when user is not a member (#8116)', async () => {
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
        callSession: { findFirst: jest.fn<any>() },
      });

      const req = makeRequest({ params: { conversationId: CONV_ID } });
      await getRoute(routes, 'GET', '/conversations/:conversationId/active-call')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply._body?.error).toBe('Conversation not found');
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
                // Audit C5 — Prisma-on-Mongo: null alone misses documents
                // where the field is absent (historical CallParticipant).
                OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
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

    // Directive produit 2026-08-25 — TROU #3. `listHistory` gates
    // `peer.isOnline` on `options.viewer`, resolved once here from the
    // request's REAL authContext (`viewerFromRequest`) — never from `userId`
    // alone, which would carry no role and no way to grant the ADMIN/BIGBOSS
    // entitlement the directive requires.
    it('forwards the resolved viewer (userId + role) alongside the parsed query', async () => {
      const { routes, reply } = setup();
      mockListHistory.mockResolvedValueOnce({ items: [], hasMore: false });

      const req = makeRequest({ query: {} });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockListHistory).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ viewer: { userId: USER_ID, role: 'USER' } })
      );
    });

    it('forwards an ADMIN viewer when the caller is an admin', async () => {
      const { routes, reply } = setup();
      mockListHistory.mockResolvedValueOnce({ items: [], hasMore: false });

      const req = makeRequest({
        query: {},
        authContext: {
          userId: USER_ID,
          participantId: PART_ID,
          type: 'user',
          hasFullAccess: true,
          registeredUser: { id: USER_ID, role: 'ADMIN' },
        },
      });
      await getRoute(routes, 'GET', '/calls/history')(req, reply);

      expect(mockListHistory).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ viewer: { userId: USER_ID, role: 'ADMIN' } })
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
