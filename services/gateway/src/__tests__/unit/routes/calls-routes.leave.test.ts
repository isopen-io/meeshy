/**
 * DELETE /calls/:callId/participants/:participantId — leaveCall : les témoins du
 * retrait (soi-même, l'éviction selon la hiérarchie des rôles, la diffusion
 * PARTICIPANT_LEFT), séparés de `calls-routes.test.ts` (budget de taille des
 * suites, #4531). Même montage de doubles que la suite d'origine
 * (`helpers/calls-routes-harness.ts`).
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
import {
  CALL_ID,
  PART_ID,
  TARGET_PART_ID,
  USER_ID,
  createMockFastify,
  createMockReply,
  getRoute,
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

describe('callRoutes — leaveCall', () => {
  beforeEach(() => jest.clearAllMocks());

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /calls/:callId/participants/:participantId — leaveCall
  // ══════════════════════════════════════════════════════════════════════════

  describe('DELETE /calls/:callId/participants/:participantId — leaveCall', () => {
    it('allows a user to leave their own participation (participantId === userId)', async () => {
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });
      const session = makeCallSession();
      mockGetCallSession.mockResolvedValueOnce(session);
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
      // Parité socket call:leave — call:ended diffusé si le leave a terminé l'appel
      // (broadcastCallEndedIfTerminal auto-gardé sur le statut terminal).
      expect(mockBroadcastCallEndedIfTerminal).toHaveBeenCalledWith(session, USER_ID);
      // Parité socket call:leave — le cache de session `call:signal` (TTL 2s)
      // est invalidé immédiatement après l'écriture de `leftAt` par leaveCall().
      expect(mockInvalidateSignalCache).toHaveBeenCalledWith(CALL_ID);
    });

    it('invalidates the signal cache even when the call stays non-terminal (group call continues)', async () => {
      // Unlike broadcastCallEndedIfTerminal (auto-guarded on terminal status),
      // invalidateSignalCache must fire unconditionally: a group-call leave
      // that does NOT end the session still writes `leftAt` for the departing
      // participant, and the stale cached snapshot could still let call:signal
      // relay ICE/SDP targeting them within the 2s TTL.
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });
      const session = makeCallSession({ status: 'active', endedAt: null });
      mockGetCallSession.mockResolvedValueOnce(session);
      mockLeaveCall.mockResolvedValueOnce(session);

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(mockInvalidateSignalCache).toHaveBeenCalledWith(CALL_ID);
    });

    it('uses authContext.participantId for leaveParticipantId even when leaving own slot', async () => {
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });
      mockGetCallSession.mockResolvedValueOnce(makeCallSession());
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

    it('resolves leaveParticipantId from the caller\'s own membership when authContext.participantId absent (registered self-leave)', async () => {
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });
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

      expect(mockLeaveCall).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: membership.id })
      );
    });

    it('returns 403 when a non-member self-leaves a call they have no relation to', async () => {
      // Security regression guard (2026-07-10): a caller with no Participant
      // row in this call's conversation must be rejected outright, never
      // silently resolved to their raw userId and passed into
      // CallService.leaveCall() — that fallback previously let ANY
      // authenticated user end an arbitrary direct call by targeting their
      // own userId as `participantId`, with zero conversation relationship
      // required.
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
        callSession: { findFirst: jest.fn<any>() },
      });
      mockGetCallSession.mockResolvedValueOnce(makeCallSession());

      const req = makeRequest({
        params: { callId: CALL_ID, participantId: USER_ID },
        authContext: { userId: USER_ID, participantId: undefined, type: 'registered' },
      });

      await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(
        req,
        reply
      );

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('NOT_A_PARTICIPANT');
      expect(mockLeaveCall).not.toHaveBeenCalled();
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

    // Root cause: the route passed the URL's `:participantId` (the KICKED
    // target's identifier) as `userId` to `leaveCall()` and as the actor to
    // `broadcastCallEndedIfTerminal()` — everywhere else in the codebase
    // (the socket `call:leave`/`call:end`/`call:force-leave` handlers, this
    // same route's self-leave path) `endedBy`/`userId` names the AUTHENTICATED
    // CALLER performing the action, never the party being removed. For a
    // self-leave the two coincide, which is why this went unnoticed; a
    // moderator kick makes them diverge. Downstream, `CallSession.metadata
    // .endedBy` feeds `wasCancelledByInitiator()` (packages/shared/utils/
    // call-summary.ts) — a pre-answer call ended this way could mislabel who
    // "cancelled" it — and `CallEndedEvent.endedBy` is broadcast to every
    // client (`call:ended`) as the party who ended the call.
    it('attributes the call end to the MODERATOR who kicked, not the kicked target', async () => {
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
      const session = makeCallSession();

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
        expect.objectContaining({ userId: USER_ID })
      );
      expect(mockLeaveCall).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: TARGET_PART_ID })
      );
      expect(mockBroadcastCallEndedIfTerminal).toHaveBeenCalledWith(session, USER_ID);
    });

    it('allows a moderator to remove an anonymous participant, falling back to resolving the target by Participant.id when the userId lookup misses', async () => {
      // Anonymous (shared-link) participants have `Participant.userId: null`
      // (schema.prisma) — the roster key the client sends for them is their
      // own `Participant.id`, never a `User.id`. The `userId:` lookup below
      // can therefore never match an anonymous target, and previously that
      // meant this route rejected EVERY kick of an anonymous guest with
      // NOT_A_PARTICIPANT, unconditionally. The fallback must resolve them by
      // `id` directly, still scoped to this call's conversation + isActive so
      // it stays exactly as safe as the (unresolved-fallback-forbidding)
      // guard this mirrors.
      const session = makeCallSession();
      const modMembership = makeMembership({ role: 'moderator' });
      const anonymousTargetParticipant = { id: TARGET_PART_ID };

      const participantFindFirst = jest
        .fn<any>()
        .mockResolvedValueOnce(modMembership) // moderator role check (caller)
        .mockResolvedValueOnce(null) // target resolution by userId — misses (anonymous)
        .mockResolvedValueOnce(anonymousTargetParticipant); // target resolution by id — hits

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
        expect.objectContaining({ participantId: anonymousTargetParticipant.id })
      );
      expect(reply._body).toMatchObject({ success: true, data: session });
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

    // Vague 155 — the moderator-rights check above only asked "is the CALLER
    // at least a moderator?" and never asked "does the caller outrank the
    // TARGET?". A conversation moderator (rank 20) could therefore remove a
    // conversation admin (rank 30) — or even the conversation creator (rank
    // 40) — from an active call, the inverse of every other role-gated
    // mutation in this codebase (PermissionsService.canManage,
    // conversations/participants.ts role-update's `creator` guard). Same
    // family as the socket-side gap Vague 154 closed for anonymous callers:
    // an authorization check present at one layer, absent at its sibling.
    describe('role hierarchy — caller must outrank the TARGET, not just meet a floor', () => {
      it('returns 403 when a moderator tries to remove an admin', async () => {
        const session = makeCallSession();
        const modMembership = makeMembership({ role: 'moderator' });
        const adminTarget = { id: TARGET_PART_ID, role: 'admin' };

        const participantFindFirst = jest
          .fn<any>()
          .mockResolvedValueOnce(modMembership) // caller
          .mockResolvedValueOnce(adminTarget); // target resolution by userId

        const { routes, reply } = setup({
          participant: { findFirst: participantFindFirst },
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

      it('returns 403 when an admin tries to remove the conversation creator', async () => {
        const session = makeCallSession();
        const adminMembership = makeMembership({ role: 'admin' });
        const creatorTarget = { id: TARGET_PART_ID, role: 'creator' };

        const participantFindFirst = jest
          .fn<any>()
          .mockResolvedValueOnce(adminMembership)
          .mockResolvedValueOnce(creatorTarget);

        const { routes, reply } = setup({
          participant: { findFirst: participantFindFirst },
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

      it('returns 403 when a moderator tries to remove a peer moderator (equal rank does not outrank)', async () => {
        const session = makeCallSession();
        const modMembership = makeMembership({ role: 'moderator' });
        const peerModTarget = { id: TARGET_PART_ID, role: 'moderator' };

        const participantFindFirst = jest
          .fn<any>()
          .mockResolvedValueOnce(modMembership)
          .mockResolvedValueOnce(peerModTarget);

        const { routes, reply } = setup({
          participant: { findFirst: participantFindFirst },
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

      it('allows a moderator to remove a plain member (moderator outranks member)', async () => {
        const session = makeCallSession();
        const modMembership = makeMembership({ role: 'moderator' });
        const memberTarget = { id: TARGET_PART_ID, role: 'member' };

        const participantFindFirst = jest
          .fn<any>()
          .mockResolvedValueOnce(modMembership)
          .mockResolvedValueOnce(memberTarget);

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
          expect.objectContaining({ participantId: memberTarget.id })
        );
      });

      // The pre-existing `isModerator` check (`role === 'admin' ||
      // role === 'moderator'`) never included `'creator'` — the highest
      // conversation rank — so a group call's creator got PERMISSION_DENIED
      // removing anyone at all. Folding the floor check into the same
      // shared rank table that now guards the target fixes both bugs with
      // one source of truth instead of leaving the floor's own gap open.
      it('allows the conversation creator to remove an admin', async () => {
        const session = makeCallSession();
        const creatorMembership = makeMembership({ role: 'creator' });
        const adminTarget = { id: TARGET_PART_ID, role: 'admin' };

        const participantFindFirst = jest
          .fn<any>()
          .mockResolvedValueOnce(creatorMembership)
          .mockResolvedValueOnce(adminTarget);

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
          expect.objectContaining({ participantId: adminTarget.id })
        );
      });
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

      // The unconditional caller-membership gate (added 2026-07-10) now
      // rejects with NOT_A_PARTICIPANT before ever reaching the
      // moderator-role check below it.
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply._body?.error).toBe('NOT_A_PARTICIPANT');
      expect(mockLeaveCall).not.toHaveBeenCalled();
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
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });
      mockGetCallSession.mockResolvedValueOnce(makeCallSession());
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
      const membership = makeMembership();
      const { routes, reply } = setup({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
        callSession: { findFirst: jest.fn<any>() },
      });
      mockGetCallSession.mockResolvedValueOnce(makeCallSession());
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

    // Bug fix — this route (self-leave AND moderator kick) never broadcast
    // CALL_EVENTS.PARTICIPANT_LEFT at all, unlike the socket `call:leave`
    // handler: other peers of a group call that keeps going never learned a
    // member left/was removed until the ~120s GC swept the stale row.
    describe('PARTICIPANT_LEFT broadcast (parité socket call:leave)', () => {
      it('broadcasts using the CallParticipant ROW id from the pre-leave snapshot, not leaveParticipantId', async () => {
        const membership = makeMembership();
        const { routes, reply } = setup({
          participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
          callSession: { findFirst: jest.fn<any>() },
        });
        // `participantId` on the CallParticipant row is the conversation
        // Participant.id (== authContext.participantId here); `id` is the
        // row's OWN id — the two must never be conflated in the broadcast.
        const session = makeCallSession({
          mode: 'p2p',
          participants: [{ id: 'call-participant-row-id', participantId: PART_ID, leftAt: null }],
        });
        mockGetCallSession.mockResolvedValueOnce(session);
        mockLeaveCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID, participantId: USER_ID } });

        await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

        expect(mockBroadcastParticipantLeft).toHaveBeenCalledWith(
          CALL_ID,
          'call-participant-row-id',
          USER_ID,
          'p2p'
        );
      });

      it('broadcasts the TARGET\'s userId (not the moderator\'s) when a moderator kicks another participant', async () => {
        const modMembership = makeMembership({ role: 'moderator' });
        const resolvedTargetParticipant = { id: 'resolved-target-part-id' };

        const participantFindFirst = jest
          .fn<any>()
          .mockResolvedValueOnce(modMembership)
          .mockResolvedValueOnce(resolvedTargetParticipant);

        const { routes, reply } = setup({
          participant: { findFirst: participantFindFirst },
          callSession: { findFirst: jest.fn<any>() },
        });
        const session = makeCallSession({
          mode: 'p2p',
          participants: [
            { id: 'target-row-id', participantId: resolvedTargetParticipant.id, leftAt: null },
          ],
        });
        mockGetCallSession.mockResolvedValueOnce(session);
        mockLeaveCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID, participantId: TARGET_PART_ID } });

        await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

        expect(mockBroadcastParticipantLeft).toHaveBeenCalledWith(
          CALL_ID,
          'target-row-id',
          TARGET_PART_ID,
          'p2p'
        );
      });

      it('broadcasts even when the call stays non-terminal (group call continues) — unconditional, unlike call:ended', async () => {
        const membership = makeMembership();
        const { routes, reply } = setup({
          participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
          callSession: { findFirst: jest.fn<any>() },
        });
        const session = makeCallSession({
          status: 'active',
          endedAt: null,
          mode: 'p2p',
          participants: [{ id: 'row-1', participantId: PART_ID, leftAt: null }],
        });
        mockGetCallSession.mockResolvedValueOnce(session);
        mockLeaveCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID, participantId: USER_ID } });

        await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

        expect(mockBroadcastParticipantLeft).toHaveBeenCalledTimes(1);
      });

      it('does not broadcast when no matching pre-leave participant row is found (defensive no-op)', async () => {
        const membership = makeMembership();
        const { routes, reply } = setup({
          participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
          callSession: { findFirst: jest.fn<any>() },
        });
        // `participants: []` (default makeCallSession) — no row matches.
        const session = makeCallSession();
        mockGetCallSession.mockResolvedValueOnce(session);
        mockLeaveCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID, participantId: USER_ID } });

        await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

        expect(mockBroadcastParticipantLeft).not.toHaveBeenCalled();
      });

      it('ignores an already-left row with a matching participantId (leftAt already set)', async () => {
        const membership = makeMembership();
        const { routes, reply } = setup({
          participant: { findFirst: jest.fn<any>().mockResolvedValue(membership) },
          callSession: { findFirst: jest.fn<any>() },
        });
        const session = makeCallSession({
          participants: [
            { id: 'stale-row', participantId: PART_ID, leftAt: new Date('2026-01-01') },
          ],
        });
        mockGetCallSession.mockResolvedValueOnce(session);
        mockLeaveCall.mockResolvedValueOnce(session);

        const req = makeRequest({ params: { callId: CALL_ID, participantId: USER_ID } });

        await getRoute(routes, 'DELETE', '/calls/:callId/participants/:participantId')(req, reply);

        expect(mockBroadcastParticipantLeft).not.toHaveBeenCalled();
      });
    });
  });
});
