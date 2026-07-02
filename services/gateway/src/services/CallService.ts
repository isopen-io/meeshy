/**
 * CallService - Business logic for video/audio calls (Phase 1A: P2P MVP)
 *
 * Handles:
 * - Call initiation (P2P mode only)
 * - Participant joining/leaving
 * - Call state management
 * - Validation (DIRECT/GROUP conversations only)
 *
 * Unified Participant model: all calls use participantId
 */

import { PrismaClient, CallMode, CallStatus, CallEndReason, ParticipantRole, Prisma } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { buildCallSummaryWithMetadata, callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { TURNCredentialService } from './TURNCredentialService';
import {
  buildCallHistoryItem,
  type CallHistoryItem,
  type CallHistoryPeer,
  type CallHistoryRow
} from './callHistory';

/** Call journal sliding window: 3 months. */
const CALL_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Floor a finite, non-negative byte counter; anything else → null. */
const clampNonNegativeInt = (value?: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

const TERMINAL_STATUSES: CallStatus[] = [
  CallStatus.ended,
  CallStatus.missed,
  CallStatus.rejected,
  CallStatus.failed
];

const ACTIVE_STATUSES: CallStatus[] = [
  CallStatus.initiated,
  CallStatus.ringing,
  CallStatus.connecting,
  CallStatus.active,
  CallStatus.reconnecting
];

// P3 — sender include for the call-summary system message, mirroring the
// `message:new` broadcast shape produced by the normal message path so iOS/web
// can render it like any other message.
const CALL_SUMMARY_MESSAGE_INCLUDE = {
  sender: {
    select: {
      id: true,
      displayName: true,
      avatar: true,
      type: true,
      nickname: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          avatar: true
        }
      }
    }
  },
  attachments: true
} as const satisfies Prisma.MessageInclude;

// Type for CallSession with populated participants
type CallSessionWithParticipants = Prisma.CallSessionGetPayload<{
  include: {
    participants: {
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true;
                username: true;
                displayName: true;
                avatar: true;
              };
            };
          };
        };
      };
    };
    initiator: {
      select: {
        id: true;
        username: true;
        displayName: true;
        avatar: true;
      };
    };
    conversation: {
      select: {
        id: true;
        identifier: true;
        type: true;
      };
    };
  };
}>;

const callSessionInclude = {
  participants: {
    include: {
      participant: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      }
    }
  },
  initiator: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true
    }
  },
  conversation: {
    select: {
      id: true,
      identifier: true,
      type: true
    }
  }
} as const;

interface InitiateCallData {
  conversationId: string;
  initiatorId: string;
  participantId: string;
  type: 'video' | 'audio';
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    screenShareEnabled?: boolean;
  };
}

interface JoinCallData {
  callId: string;
  userId: string;
  participantId: string;
  isAnonymous?: boolean;
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

interface LeaveCallData {
  callId: string;
  userId: string;
  participantId: string;
}

export class CallService {
  private turnCredentialService: TURNCredentialService;
  private heartbeats: Map<string, Map<string, number>> = new Map();
  private ringingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatDbWriteTimers: Map<string, NodeJS.Timeout> = new Map();
  // Participants that signalled call:backgrounded; they receive an extended
  // heartbeat grace period so CallKit audio calls survive iOS socket suspension.
  private backgroundedParticipants: Map<string, Set<string>> = new Map();
  private readonly RINGING_TIMEOUT_MS = 60_000;   // Phase 1 fix P2 — FaceTime parity
  private readonly RINGING_REHYDRATE_FLOOR_MS = 5_000; // item H — min budget after boot rehydration
  private readonly HEARTBEAT_DB_DEBOUNCE_MS = 30_000; // Write at most every 30s per participant
  // iOS suspends the socket after ~45s in background; CallKit keeps the RTP
  // stream alive. Give backgrounded participants 5 min before timing them out.
  private readonly BACKGROUND_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(private prisma: PrismaClient) {
    this.turnCredentialService = new TURNCredentialService();
  }

  /**
   * Phase 1 fix P2 — Schedule a 60s timeout for a ringing call. If no answer
   * arrives in time, the callback is invoked (caller will transition the call
   * to `missed`). Replaces any previously scheduled timeout for this callId.
   *
   * NOTE: Phase 1 uses in-process setTimeout. Multi-instance gateway deployments
   * may race on the timeout; Phase 4 introduces optimistic-locked transitions
   * which are idempotent against this race.
   *
   * Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.5
   */
  scheduleRingingTimeout(
    callId: string,
    onTimeout: () => void,
    delayMs: number = this.RINGING_TIMEOUT_MS
  ): void {
    this.clearRingingTimeout(callId);
    const handle = setTimeout(() => {
      this.ringingTimeouts.delete(callId);
      onTimeout();
    }, delayMs);
    this.ringingTimeouts.set(callId, handle);
  }

  /**
   * CALL-RESILIENCE (item H) — re-arm a ringing timer lost to a process
   * restart. Fires at `startedAt + RINGING_TIMEOUT_MS`, as if the in-process
   * timer had never been wiped; when that budget is already exhausted the
   * short floor still gives just-rebooted clients a beat to answer or cancel
   * before the call resolves to missed.
   */
  rescheduleRingingTimeout(callId: string, startedAt: Date, onTimeout: () => void): void {
    const elapsedMs = Date.now() - startedAt.getTime();
    const remainingMs = Math.max(
      this.RINGING_REHYDRATE_FLOOR_MS,
      this.RINGING_TIMEOUT_MS - elapsedMs
    );
    this.scheduleRingingTimeout(callId, onTimeout, remainingMs);
  }

  clearRingingTimeout(callId: string): void {
    const handle = this.ringingTimeouts.get(callId);
    if (handle) {
      clearTimeout(handle);
      this.ringingTimeouts.delete(callId);
    }
  }

  /**
   * Generate ICE servers with per-user TURN credentials
   */
  generateIceServers(userId: string): any[] {
    return this.turnCredentialService.generateCredentials(userId);
  }

  getIceServerTtl(): number {
    return this.turnCredentialService.getStatus().credentialTTL;
  }

  /**
   * Record a heartbeat from a participant. Updates in-memory immediately and
   * schedules a debounced write to MongoDB (30s) so liveness data survives restarts.
   */
  recordHeartbeat(callId: string, participantId: string): void {
    if (!this.heartbeats.has(callId)) {
      this.heartbeats.set(callId, new Map());
    }
    this.heartbeats.get(callId)!.set(participantId, Date.now());

    const key = `${callId}:${participantId}`;
    if (!this.heartbeatDbWriteTimers.has(key)) {
      const timer = setTimeout(() => {
        this.heartbeatDbWriteTimers.delete(key);
        void this.persistHeartbeatToDb(callId, participantId);
      }, this.HEARTBEAT_DB_DEBOUNCE_MS);
      this.heartbeatDbWriteTimers.set(key, timer);
    }
  }

  private async persistHeartbeatToDb(callId: string, participantId: string): Promise<void> {
    try {
      await this.prisma.callParticipant.updateMany({
        where: { callSessionId: callId, participantId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
        data: { lastHeartbeatAt: new Date() }
      });
    } catch (err) {
      logger.warn('Failed to persist heartbeat to DB', { callId, participantId, err });
    }
  }

  /**
   * Get last heartbeat timestamp for a participant
   */
  getLastHeartbeat(callId: string, participantId: string): number | undefined {
    return this.heartbeats.get(callId)?.get(participantId);
  }

  /**
   * Returns true when at least one heartbeat has been recorded in-memory for
   * this call. Used by CallCleanupService to distinguish "no data yet" (post-restart)
   * from "data exists but no stale entries".
   */
  hasHeartbeatData(callId: string): boolean {
    return (this.heartbeats.get(callId)?.size ?? 0) > 0;
  }

  /**
   * Clear heartbeat tracking for a call and cancel any pending DB write timers.
   */
  clearHeartbeats(callId: string): void {
    this.heartbeats.delete(callId);
    this.backgroundedParticipants.delete(callId);
    for (const [key, timer] of this.heartbeatDbWriteTimers) {
      if (key.startsWith(`${callId}:`)) {
        clearTimeout(timer);
        this.heartbeatDbWriteTimers.delete(key);
      }
    }
  }

  /**
   * Mark a participant as backgrounded, granting them an extended heartbeat
   * grace period (BACKGROUND_HEARTBEAT_TIMEOUT_MS) so CallKit audio calls
   * survive iOS socket suspension (~45s after backgrounding).
   */
  recordParticipantBackgrounded(callId: string, participantId: string): void {
    if (!this.backgroundedParticipants.has(callId)) {
      this.backgroundedParticipants.set(callId, new Set());
    }
    this.backgroundedParticipants.get(callId)!.add(participantId);
  }

  /**
   * Remove a participant from the backgrounded set. Called on call:foregrounded
   * or when the participant leaves the call.
   */
  clearParticipantBackgrounded(callId: string, participantId: string): void {
    this.backgroundedParticipants.get(callId)?.delete(participantId);
  }

  /**
   * Get all participants with stale heartbeats (> maxAge ms ago).
   * Backgrounded participants use the extended BACKGROUND_HEARTBEAT_TIMEOUT_MS
   * grace period instead of maxAgeMs to survive iOS socket suspension.
   */
  getStaleHeartbeats(callId: string, maxAgeMs: number): string[] {
    const callHeartbeats = this.heartbeats.get(callId);
    if (!callHeartbeats) return [];

    const now = Date.now();
    const backgrounded = this.backgroundedParticipants.get(callId);
    const stale: string[] = [];
    for (const [participantId, lastBeat] of callHeartbeats) {
      const effectiveMaxAge = backgrounded?.has(participantId)
        ? this.BACKGROUND_HEARTBEAT_TIMEOUT_MS
        : maxAgeMs;
      if (now - lastBeat > effectiveMaxAge) {
        stale.push(participantId);
      }
    }
    return stale;
  }

  /**
   * Release the conversation's active-call claim taken by `initiateCall`'s
   * atomic claim step, so a future `initiateCall` on this conversation is no
   * longer blocked. Scoped to `activeCallId: callId` (compare-and-clear) so a
   * call that never held the claim — or one that already lost it to a newer
   * call — can never clobber someone else's live claim. Best-effort: a
   * failure here is logged, not thrown, since the call's own status write is
   * always the source of truth and the claim self-heals the next time a call
   * is attempted for this conversation and finds this one already terminal.
   */
  private async releaseActiveCallClaim(conversationId: string, callId: string): Promise<void> {
    try {
      await this.prisma.conversation.updateMany({
        where: { id: conversationId, activeCallId: callId },
        data: { activeCallId: null }
      });
    } catch (error) {
      logger.error('Failed to release active-call claim', { conversationId, callId, error });
    }
  }

  /**
   * Update call status with validation (state machine transition)
   */
  async updateCallStatus(callId: string, newStatus: CallStatus, endReason?: CallEndReason): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId }
    });

    if (!call) {
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.warn('Call already in terminal state', { callId, currentStatus: call.status, requestedStatus: newStatus });
      return this.getCallSession(callId);
    }

    const updateData: Prisma.CallSessionUpdateInput = { status: newStatus };

    if (TERMINAL_STATUSES.includes(newStatus)) {
      const now = new Date();
      updateData.endedAt = now;
      updateData.duration = Math.floor((now.getTime() - call.startedAt.getTime()) / 1000);
      if (endReason) {
        updateData.endReason = endReason;
      }
    }

    if (newStatus === CallStatus.active && !call.answeredAt) {
      updateData.answeredAt = new Date();
    }

    // Version-guarded write: the plain `update` this replaced could blind-write
    // over a concurrent terminal transition (e.g. endCall()/leaveCall() resolving
    // the call to `missed`/`ended` between our `findUnique` above and this write),
    // resurrecting an already-ended call back to a non-terminal status. Scoping
    // to the version we read makes a losing writer's update a no-op instead —
    // same optimistic-lock pattern as joinCallAttempt().
    const lock = await this.prisma.callSession.updateMany({
      where: { id: callId, version: call.version },
      data: { ...updateData, version: { increment: 1 } }
    });

    if (lock.count === 0) {
      logger.warn('⚠️ Call status update lost race to a concurrent write — no-op', {
        callId, requestedStatus: newStatus
      });
      return this.getCallSession(callId);
    }

    if (TERMINAL_STATUSES.includes(newStatus)) {
      await this.releaseActiveCallClaim(call.conversationId, callId);
    }

    logger.info('Call status updated', { callId, from: call.status, to: newStatus, endReason });

    return this.getCallSession(callId);
  }

  /**
   * Initiate a new video call
   * - Validates conversation exists and type is DIRECT or GROUP
   * - Creates CallSession with mode='p2p' and status='initiated'
   * - Creates CallParticipant for initiator
   * - Returns CallSession with participants
   */
  async initiateCall(data: InitiateCallData): Promise<CallSessionWithParticipants> {
    const { conversationId, initiatorId, participantId, type, settings } = data;

    logger.info('📞 Initiating call', { conversationId, initiatorId, type });

    // Validate conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true, identifier: true }
    });

    if (!conversation) {
      logger.error('❌ Conversation not found', { conversationId });
      throw new Error(`${CALL_ERROR_CODES.CONVERSATION_NOT_FOUND}: Conversation not found`);
    }

    // Validate conversation type (only DIRECT and GROUP support video calls)
    if (conversation.type !== 'direct' && conversation.type !== 'group') {
      logger.error('❌ Video calls not supported for this conversation type', {
        conversationId,
        type: conversation.type
      });
      throw new Error(
        `${CALL_ERROR_CODES.VIDEO_CALLS_NOT_SUPPORTED}: Video calls are only supported for DIRECT and GROUP conversations`
      );
    }

    // Check if user is participant of conversation. `participantId` MUST be
    // checked explicitly before hitting Prisma: passing `id: undefined` in a
    // `where` clause makes Prisma treat the field as omitted rather than
    // "match nothing", so the query silently degrades to "does this
    // conversation have ANY active participant" — true for virtually every
    // real conversation. Without this guard a caller whose participantId
    // failed to resolve (e.g. genuinely not a member) would sail through the
    // membership check for a conversation they have no access to.
    if (!participantId) {
      logger.error('❌ Missing participantId — cannot verify conversation membership', {
        conversationId,
        initiatorId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    const membership = await this.prisma.participant.findFirst({
      where: {
        conversationId,
        id: participantId,
        isActive: true
      }
    });

    if (!membership) {
      logger.error('❌ User is not a participant in conversation', {
        conversationId,
        initiatorId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    // PHANTOM CLEANUP (2026-06-05) — every initiate force-ends ANY non-ended call
    // the INITIATOR is still a live participant of (across ALL conversations).
    // The iOS long-poll transport churns (transport close/error) and frequently
    // leaves the initiator as a leftAt:null participant in a stale call whose
    // leave/end never processed; that stale call then makes the next initiate
    // throw CALL_ALREADY_ACTIVE and surfaces as a stuck "phantom" call on the
    // device. Clearing the initiator's phantoms here guarantees a fresh start on
    // every call. We end the WHOLE stale session (all remaining participants
    // marked left + status ended) so it can never block the conversation either.
    const initiatorStaleParticipations = await this.prisma.callParticipant.findMany({
      where: {
        // Audit C5 (2026-07-02) — `{leftAt: null}` alone misses Mongo docs
        // whose leftAt field was never written (pre-C5 participants).
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
        participant: { userId: initiatorId },
        callSession: { status: { in: ACTIVE_STATUSES } }
      },
      include: { callSession: { select: { id: true, startedAt: true, conversationId: true } } }
    });

    if (initiatorStaleParticipations.length > 0) {
      const now = new Date();
      const staleCalls = Array.from(
        new Map(
          initiatorStaleParticipations.map(p => [p.callSessionId, p.callSession])
        ).entries()
      );
      logger.warn('🔬 [CALL-DIAG] phantom-cleanup on initiate — force-ending initiator stale calls', {
        initiatorId,
        conversationId,
        staleCallIds: staleCalls.map(([id]) => id)
      });
      for (const [staleCallId, staleSession] of staleCalls) {
        const startedAt = staleSession?.startedAt ? new Date(staleSession.startedAt) : now;
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.callParticipant.updateMany({
              where: { callSessionId: staleCallId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
              data: { leftAt: now }
            });
            await tx.callSession.updateMany({
              where: { id: staleCallId, status: { in: ACTIVE_STATUSES } },
              data: {
                status: CallStatus.ended,
                endedAt: now,
                duration: Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000)),
                endReason: CallEndReason.garbageCollected
              }
            });
          });
          this.clearHeartbeats(staleCallId);
          this.clearRingingTimeout(staleCallId);
          await this.releaseActiveCallClaim(staleSession?.conversationId ?? conversationId, staleCallId);
        } catch (cleanupErr) {
          logger.error('phantom-cleanup failed for stale call', { staleCallId, error: cleanupErr });
        }
      }
    }

    // IMPROVEMENT: Clean up any zombie calls before initiating new call
    // This prevents orphan calls from blocking new calls
    const activeCall = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: ACTIVE_STATUSES }
      },
      include: {
        participants: true
      }
    });

    if (activeCall) {
      // Check if all participants have left (zombie call)
      const activeParticipants = activeCall.participants.filter(p => !p.leftAt);

      if (activeParticipants.length === 0) {
        // Zombie call - force cleanup before starting new call
        logger.warn('⚠️ Found zombie call, cleaning up before new call', {
          conversationId,
          zombieCallId: activeCall.id,
          callStatus: activeCall.status
        });

        const now = new Date();
        const duration = Math.floor((now.getTime() - activeCall.startedAt.getTime()) / 1000);

        // Scoped to status still in ACTIVE_STATUSES (mirrors the
        // initiatorStaleParticipations cleanup above): if the last
        // participant reconnected/rejoined between the `activeParticipants`
        // read above and this write, this becomes a no-op instead of
        // force-ending a call that just resumed.
        await this.prisma.callSession.updateMany({
          where: { id: activeCall.id, status: { in: ACTIVE_STATUSES } },
          data: {
            status: CallStatus.ended,
            endedAt: now,
            duration,
            endReason: CallEndReason.garbageCollected
          }
        });

        this.clearHeartbeats(activeCall.id);
        await this.releaseActiveCallClaim(conversationId, activeCall.id);

        logger.info('Zombie call cleaned up', { zombieCallId: activeCall.id });
      } else {
        // Real active call with participants
        logger.error('❌ Call already active', { conversationId, callId: activeCall.id });
        throw new Error(`${CALL_ERROR_CODES.CALL_ALREADY_ACTIVE}: A call is already active in this conversation`);
      }
    }

    // Create call session with participant in a transaction
    const callSession = await this.prisma.$transaction(async (tx) => {
      // Create call session
      const session = await tx.callSession.create({
        data: {
          conversationId,
          initiatorId,
          mode: CallMode.p2p, // Phase 1A: P2P only
          status: CallStatus.initiated,
          metadata: {
            type, // 'video' or 'audio'
            ...settings
          }
        }
      });

      // Create participant for initiator
      // Audit C5 (2026-07-02): `leftAt` must be written explicitly as `null`
      // — MongoDB has no NULL-vs-missing-field distinction at the storage
      // layer, but Prisma's query engine treats them differently: a field
      // omitted from `data` at create time is never written to the document,
      // so a later `findFirst({ where: { leftAt: null } })` (used throughout
      // this service, e.g. updateParticipantMedia) never matches it. That
      // caused 100% of media-toggle DB writes to silently no-op in prod.
      await tx.callParticipant.create({
        data: {
          callSessionId: session.id,
          participantId,
          role: ParticipantRole.initiator,
          leftAt: null,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: type === 'video' ? (settings?.videoEnabled ?? true) : false
        }
      });

      return session;
    });

    // TOCTOU close (audit 2026-07-02): the zombie/active-call check above is a
    // plain read that ran BEFORE this session was created — two near-
    // simultaneous `initiateCall` calls for the same conversation (mutual
    // calling, or a client double-tap racing its own UI's disable-button)
    // can both pass that read and each create a `CallSession`. MongoDB
    // guarantees single-document writes are atomic even without a
    // transaction, so this conditional `updateMany` against `Conversation`
    // deterministically lets exactly one of two concurrent callers win the
    // claim; the loser observes `count === 0` and unwinds its own orphaned
    // session instead of leaving two live sessions for one conversation.
    // Prisma-on-MongoDB null semantics: `activeCallId: null` matches ONLY
    // documents where the field is explicitly null — NOT documents missing
    // the field entirely (every conversation created before this claim was
    // introduced, plus any new conversation Prisma creates while omitting
    // unset optionals). Without the `isSet: false` arm the claim can NEVER
    // succeed on those documents and every initiateCall fails
    // CALL_ALREADY_ACTIVE (prod incident 2026-07-02: 211/211 conversations
    // lacked the field; hot-fixed by backfilling `activeCallId: null`).
    const claim = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }]
      },
      data: { activeCallId: callSession.id }
    });

    if (claim.count === 0) {
      logger.error('❌ Call already active (lost race to claim conversation)', {
        conversationId,
        orphanedCallId: callSession.id
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.callParticipant.deleteMany({ where: { callSessionId: callSession.id } });
        await tx.callSession.delete({ where: { id: callSession.id } });
      });
      throw new Error(`${CALL_ERROR_CODES.CALL_ALREADY_ACTIVE}: A call is already active in this conversation`);
    }

    logger.info('✅ Call initiated successfully', {
      callId: callSession.id,
      conversationId,
      initiatorId
    });

    // Fetch and return complete call session with participants
    return this.getCallSession(callSession.id);
  }

  /**
   * Join an existing call
   * - Validates call exists and status is 'initiated' or 'active'
   * - Validates user is participant of conversation
   * - Creates CallParticipant for joiner
   * - Updates call status to 'active' if was 'initiated'
   * - CVE-005: Returns dynamic TURN credentials via TURNCredentialService
   * - Returns updated CallSession with ICE servers
   */
  async joinCall(data: JoinCallData): Promise<{
    callSession: CallSessionWithParticipants;
    iceServers: RTCIceServer[]
  }> {
    return this.joinCallAttempt(data, 0);
  }

  /**
   * TOCTOU close (audit 2026-07-02): `activeParticipants.length >= 2` below
   * reads a snapshot fetched before this method's own write, so two callers
   * racing to join the same call (a third party racing the intended callee,
   * or the same user answering from two devices within milliseconds) could
   * both read `< 2` and both insert a `CallParticipant`, exceeding the P2P
   * cap every downstream consumer assumes. The join transaction now also
   * does a version-guarded conditional update on the shared `CallSession`
   * document — MongoDB detects the write conflict when two transactions
   * touch that same document concurrently, so at most one caller's
   * transaction commits. The loser retries once against freshly-read state,
   * where the cap check above will correctly reject it if the winner took
   * the last slot.
   */
  private async joinCallAttempt(data: JoinCallData, attempt: number): Promise<{
    callSession: CallSessionWithParticipants;
    iceServers: RTCIceServer[]
  }> {
    const { callId, userId, participantId, settings } = data;

    logger.info('📞 User joining call', { callId, userId });

    // Validate call exists
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { conversation: true, participants: true }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Validate call is not in a terminal state (ended/missed/rejected/failed)
    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.error('❌ Call is in terminal state', { callId, status: call.status });
      throw new Error(`${CALL_ERROR_CODES.CALL_ENDED}: This call has already ended`);
    }

    // Check if user is participant of conversation. See the matching guard in
    // `initiateCall` for why `participantId` must be checked before the
    // Prisma query: `id: undefined` is treated as an omitted field, not
    // "match nothing", which would otherwise let a non-member's join sail
    // through as long as the conversation has any active participant.
    if (!participantId) {
      logger.error('❌ Missing participantId — cannot verify conversation membership', {
        conversationId: call.conversationId,
        userId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    const membership = await this.prisma.participant.findFirst({
      where: {
        conversationId: call.conversationId,
        id: participantId,
        isActive: true
      }
    });

    if (!membership) {
      logger.error('❌ User is not a participant in conversation', {
        conversationId: call.conversationId,
        userId
      });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not a participant in this conversation`);
    }

    // Check if user is already in the call
    const existingParticipant = call.participants.find(
      (p) => p.participantId === participantId && !p.leftAt
    );

    if (existingParticipant) {
      logger.warn('⚠️ User already in call', { callId, userId });
      // CVE-005: Return current state with dynamic ICE servers
      const iceServers = this.turnCredentialService.generateCredentials(userId);
      const callSession = await this.getCallSession(callId);
      return {
        callSession,
        iceServers
      };
    }

    // Phase 1A: Enforce P2P mode (max 2 participants)
    const activeParticipants = call.participants.filter((p) => !p.leftAt);
    if (activeParticipants.length >= 2) {
      logger.error('❌ Max participants reached for P2P call', {
        callId,
        activeParticipants: activeParticipants.length
      });
      throw new Error(
        `${CALL_ERROR_CODES.MAX_PARTICIPANTS_REACHED}: Maximum participants (2) reached for P2P calls`
      );
    }

    // Join call in transaction, guarded by an optimistic-lock claim on
    // CallSession.version so a concurrent joiner can't silently slip past
    // the cap check above (see joinCallAttempt's doc comment).
    const versionConflict = Symbol('versionConflict');
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Create participant. See the C5 note on the initiator's `create` above
      // — `leftAt: null` must be explicit or later `findFirst({ leftAt: null })`
      // lookups (e.g. updateParticipantMedia) never match this row.
      await tx.callParticipant.create({
        data: {
          callSessionId: callId,
          participantId,
          role: ParticipantRole.participant,
          leftAt: null,
          isAudioEnabled: settings?.audioEnabled ?? true,
          isVideoEnabled: settings?.videoEnabled ?? true
        }
      });

      // Item F (chaos-test 2, callId 6a4690a2…) — the callee EARLY-joins while
      // still ringing (the SDP offer must flow during the ring), so this
      // transition means "it is ringing on their device", NOT "they answered".
      // Stamping connecting+answeredAt here made `ringing` invisible
      // server-side, gave the boot rehydration (initiated/ringing) nothing to
      // re-arm after a mid-ring restart (the call decayed to failed/91s via
      // the connecting GC tier instead of resolving missed), and inflated
      // `duration` with the ringing time. The real pick-up already stamps
      // active+answeredAt via updateCallStatus on the SDP answer.
      // Server FSM: initiated → ringing → active.
      const statusChange =
        call.status === CallStatus.initiated || call.status === CallStatus.ringing
          ? { status: CallStatus.ringing }
          : {};

      // Conditional update scoped to the version we read at the top of this
      // attempt: if a concurrent joiner already committed a change to this
      // CallSession, `count` is 0 and we roll back (including the
      // CallParticipant just created above) by throwing.
      const lock = await tx.callSession.updateMany({
        where: { id: callId, version: call.version },
        data: { version: { increment: 1 }, ...statusChange }
      });

      if (lock.count === 0) {
        throw versionConflict;
      }
    }).then(
      () => 'joined' as const,
      (error) => {
        if (error === versionConflict) {
          return 'conflict' as const;
        }
        throw error;
      }
    );

    if (outcome === 'conflict') {
      if (attempt >= 1) {
        logger.error('❌ Call state conflict persisted after retry', { callId, userId });
        throw new Error(`${CALL_ERROR_CODES.CALL_STATE_CONFLICT}: Call state changed concurrently, please retry`);
      }
      logger.warn('⚠️ Call state conflict on join — retrying with fresh state', { callId, userId });
      return this.joinCallAttempt(data, attempt + 1);
    }

    logger.info('✅ User joined call successfully', { callId, userId });

    // CVE-005: Generate dynamic TURN credentials for this user
    const iceServers = this.turnCredentialService.generateCredentials(userId);

    const callSession = await this.getCallSession(callId);

    return {
      callSession,
      iceServers
    };
  }

  /**
   * Leave a call
   * - Updates CallParticipant.leftAt
   * - If last participant, end call (status='ended', endedAt=now)
   * - Returns updated CallSession
   */
  async leaveCall(data: LeaveCallData): Promise<CallSessionWithParticipants> {
    const { callId, userId, participantId } = data;

    logger.info('📞 User leaving call', { callId, userId });

    // Find the call participant. Audit C5 (2026-07-02) — match both explicit
    // null and never-written leftAt (pre-C5 Mongo docs).
    const callParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        participantId,
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
      }
    });

    if (!callParticipant) {
      // CALL-FIX 2026-06-06 — IDEMPOTENT LEAVE. The leaver's active (leftAt:null)
      // CallParticipant row is missing: either a racing path stamped it first
      // (socket `disconnect` auto-leave, a double `call:leave`), OR the handler
      // passed a fallback `participantId` (a User.id, when resolveParticipantId
      // returned null) that can never match `CallParticipant.participantId`
      // (a Participant.id). A legitimate hang-up must NEVER throw here — throwing
      // made the handler skip the `call:ended` broadcast, so the OTHER party
      // stayed "in call" until CallCleanupService force-FAILED the call 30s later.
      // Instead, ensure the call is terminal and RETURN it so the handler still
      // broadcasts `call:ended` cleanly.
      const existing = await this.prisma.callSession.findUnique({
        where: { id: callId },
        include: { participants: true }
      });

      if (!existing) {
        logger.error('❌ Call not found on idempotent leave', { callId, userId });
        throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
      }

      // Already ended by the racing path → return as-is; the handler still
      // broadcasts call:ended. (`endedAt != null` is the terminal signal.)
      if (existing.endedAt) {
        logger.info('ℹ️ Idempotent leave — call already ended, returning session', {
          callId, userId, status: existing.status
        });
        return this.getCallSession(callId);
      }

      // Mirror the normal direct/last-participant decision below.
      const idemConversation = await this.prisma.conversation.findUnique({
        where: { id: existing.conversationId },
        select: { type: true }
      });
      const idemIsDirect = idemConversation?.type === 'direct';
      const idemRemaining = existing.participants.filter((p) => !p.leftAt).length;
      if (!idemIsDirect && idemRemaining > 1) {
        // Group call with others still active and this leaver already gone:
        // nothing to end. Return the live session unchanged.
        logger.info('ℹ️ Idempotent leave — leaver gone, group call continues', { callId, userId });
        return this.getCallSession(callId);
      }

      // Direct call (or last participant): end it so the OTHER party is notified.
      const idemNow = new Date();
      const idemPreAnswered =
        existing.status === CallStatus.initiated ||
        existing.status === CallStatus.ringing ||
        existing.status === CallStatus.connecting;
      // Version-guarded (see endCall()'s doc comment): a racing terminal
      // writer (call:end, force-end) could resolve this same call between
      // the `existing` read above and this write; scope to `existing.version`
      // so the losing writer no-ops instead of clobbering the winner's
      // duration/endReason.
      const idemVersionConflict = Symbol('idemVersionConflict');
      const idemOutcome = await this.prisma.$transaction(async (tx) => {
        await tx.callParticipant.updateMany({
          where: { callSessionId: callId, OR: [{ leftAt: null }, { leftAt: { isSet: false } }] },
          data: { leftAt: idemNow }
        });
        const lock = await tx.callSession.updateMany({
          where: { id: callId, version: existing.version },
          data: {
            status: idemPreAnswered ? CallStatus.missed : CallStatus.ended,
            endReason: idemPreAnswered ? CallEndReason.missed : CallEndReason.completed,
            endedAt: idemNow,
            duration: Math.max(0, Math.floor((idemNow.getTime() - existing.startedAt.getTime()) / 1000)),
            version: { increment: 1 }
          }
        });
        if (lock.count === 0) {
          throw idemVersionConflict;
        }
      }).then(
        () => 'ended' as const,
        (error) => {
          if (error === idemVersionConflict) {
            return 'conflict' as const;
          }
          throw error;
        }
      );

      if (idemOutcome === 'conflict') {
        logger.warn('⚠️ Idempotent leave lost race to a concurrent terminal write — returning current session', {
          callId, userId
        });
        return this.getCallSession(callId);
      }

      this.clearHeartbeats(callId);
      this.clearRingingTimeout(callId);
      await this.releaseActiveCallClaim(existing.conversationId, callId);
      logger.info('✅ Idempotent leave — call force-ended for absent participant', {
        callId, userId, wasPreAnswered: idemPreAnswered
      });
      return this.getCallSession(callId);
    }

    // Get call with all participants
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: { participants: true }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    const leftAt = new Date();

    // CALL-FIX 2026-06-06 — a DIRECT (1:1) call cannot continue with a single
    // remaining participant, so ANY leave (callee decline, caller cancel, hangup)
    // must END the call so the OTHER party is notified (call:ended broadcast) and
    // stops ringing. Previously only the LAST participant leaving ended the call:
    // when the callee declined, the caller remained (isLastParticipant=false), the
    // call stayed open, no call:ended was broadcast, and the caller's ringback kept
    // playing until they manually hung up. GROUP calls still continue until the
    // last participant leaves.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: call.conversationId },
      select: { type: true }
    });
    const isDirectCall = conversation?.type === 'direct';

    // Check if this is the last active participant
    const activeParticipants = call.participants.filter((p) => !p.leftAt && p.id !== callParticipant.id);
    const isLastParticipant = activeParticipants.length === 0 || isDirectCall;

    // Audit P1-29 — distinguish "leave during ringing/connecting" (callee
    // declined or initiator cancelled before media negotiation completed)
    // from "leave during an active call". The pre-answer case must map to
    // `missed` (with `endReason: missed`) so:
    //   - the iOS UI surfaces a missed-call banner on the OTHER device,
    //   - Recents shows "Missed" / "Cancelled" instead of "Ended",
    //   - the gateway emits `call:missed` in addition to `call:ended` and
    //     can create missed-call push notifications for offline callees.
    const wasPreAnswered =
      call.status === CallStatus.initiated ||
      call.status === CallStatus.ringing ||
      call.status === CallStatus.connecting;
    const targetEndedStatus = wasPreAnswered ? CallStatus.missed : CallStatus.ended;
    const targetEndReason = wasPreAnswered ? CallEndReason.missed : CallEndReason.completed;

    // Update in transaction. Version-guarded on the terminal write (see
    // endCall()'s doc comment): a racing terminal writer for this same call
    // (e.g. a retried call:end, or the OTHER participant's own leave landing
    // concurrently) could resolve it between the `call` read above and this
    // write; scoping to `call.version` makes the losing writer's terminal
    // write a no-op instead of clobbering the winner's duration/endReason.
    const leaveVersionConflict = Symbol('leaveVersionConflict');
    const leaveOutcome = await this.prisma.$transaction(async (tx) => {
      // Update participant left time
      await tx.callParticipant.update({
        where: { id: callParticipant.id },
        data: { leftAt }
      });

      // If last participant, end the call (status depends on pre/post-answer).
      if (isLastParticipant) {
        const duration = Math.floor(
          (leftAt.getTime() - call.startedAt.getTime()) / 1000
        );

        const lock = await tx.callSession.updateMany({
          where: { id: callId, version: call.version },
          data: {
            status: targetEndedStatus,
            endReason: targetEndReason,
            endedAt: leftAt,
            duration,
            version: { increment: 1 }
          }
        });

        if (lock.count === 0) {
          throw leaveVersionConflict;
        }

        logger.info('✅ Call closed - last participant left', {
          callId,
          duration,
          status: targetEndedStatus,
          endReason: targetEndReason,
          wasPreAnswered
        });
      }
    }).then(
      () => 'left' as const,
      (error) => {
        if (error === leaveVersionConflict) {
          return 'conflict' as const;
        }
        throw error;
      }
    );

    if (leaveOutcome === 'conflict') {
      logger.warn('⚠️ Leave-triggered call end lost race to a concurrent terminal write — returning current session', {
        callId, userId
      });
      return this.getCallSession(callId);
    }

    if (isLastParticipant) {
      this.clearHeartbeats(callId);
      this.clearRingingTimeout(callId);
      await this.releaseActiveCallClaim(call.conversationId, callId);
    } else {
      // Mid-call leave: clear only this participant's backgrounded state and
      // heartbeat entry. clearHeartbeats() handles the full call cleanup when
      // the last participant leaves; for mid-call leaves we must clean up
      // individually, or the departed participant's stale heartbeat lingers
      // in memory for the rest of the call.
      this.clearParticipantBackgrounded(callId, participantId);
      this.heartbeats.get(callId)?.delete(participantId);
    }

    logger.info('✅ User left call successfully', { callId, userId, wasPreAnswered });

    return this.getCallSession(callId);
  }

  /**
   * Get call session details with participants
   * CVE-003: Added authorization check — the requesting USER must be an active
   * member of the call's conversation (or already a call participant).
   *
   * @param callId - Call session ID
   * @param requestingUserId - Optional `User.id` requesting access. The REST route
   *   `GET /calls/:callId` passes `authContext.userId`. Authorization MUST be
   *   resolved by user (`Participant.userId`), NOT by `Participant.id`: a callee
   *   fetching an incoming call to answer it is not yet a `CallParticipant` and
   *   never has a `Participant` row whose `id` equals their `userId` — the old
   *   `id:` lookup 403'd every legitimate callee (regression from the Participant
   *   migration), which left incoming calls unjoinable.
   */
  async getCallSession(callId: string, requestingUserId?: string): Promise<CallSessionWithParticipants> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: callSessionInclude
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // CVE-003: Authorization check if a requesting user is provided.
    if (requestingUserId) {
      // Fast path: the user is already a participant of this call.
      const isCallParticipant = call.participants.some((p) => p.participant?.userId === requestingUserId);

      // Otherwise, authorize by active membership of the call's conversation.
      if (!isCallParticipant) {
        const isMember = await this.prisma.participant.findFirst({
          where: {
            conversationId: call.conversationId,
            userId: requestingUserId,
            isActive: true
          }
        });

        if (!isMember) {
          logger.warn('❌ Unauthorized call access attempt', {
            callId,
            userId: requestingUserId,
            conversationId: call.conversationId
          });
          throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You do not have access to this call`);
        }
      }
    }

    return call;
  }

  /**
   * End call (force end by moderator or system)
   * CVE-004: Added authorization check - only initiator or moderators can end calls
   *
   * @param callId - Call session ID
   * @param endedBy - User ID attempting to end the call
   * @param participantId - Participant ID of the user ending the call
   * @param isAnonymous - Whether the user is anonymous (anonymous users CANNOT end calls)
   */
  async endCall(callId: string, endedBy: string, participantId: string, isAnonymous?: boolean, reason?: string): Promise<CallSessionWithParticipants> {
    logger.info('Ending call', { callId, endedBy, isAnonymous, reason });

    // CVE-004: Anonymous users cannot end calls for everyone
    if (isAnonymous) {
      logger.warn('⚠️ Anonymous user attempted to end call', { callId, userId: endedBy });
      throw new Error(`${CALL_ERROR_CODES.PERMISSION_DENIED}: Anonymous users cannot end calls. Use leave instead.`);
    }

    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });

    if (!call) {
      logger.error('❌ Call not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Idempotency: `updateCallStatus`/`leaveCall` already short-circuit on
    // ANY terminal status, not just `ended` — this guard only checked
    // `ended`, so a call already resolved to `missed`/`rejected`/`failed`
    // by another path (e.g. the ringing-timeout's `markCallAsMissed`, which
    // never touches participant rows) could still be re-processed by a
    // delayed/retried `call:end` and get silently overwritten back to
    // `ended`/`completed` — reopening the exact "phantom completed call"
    // bug the C3/C4 pre-answer fix above was meant to close.
    if (TERMINAL_STATUSES.includes(call.status)) {
      logger.warn('⚠️ Call already in terminal state', { callId, currentStatus: call.status });
      return this.getCallSession(callId);
    }

    // CVE-004: Verify user has permission to end the call (initiator or moderator role)
    const userParticipant = call.participants.find(p => p.participantId === participantId && !p.leftAt);

    if (!userParticipant) {
      logger.error('❌ User not in call', { callId, endedBy });
      throw new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not in this call`);
    }

    // P2P: ANY active participant can end the call (spec C4 fix)
    // SFU (Phase 2): only initiator/moderator can end for everyone

    const endedAt = new Date();
    const duration = call.answeredAt
      ? Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000)
      : 0;

    // Audit C3/C4 (2026-07-02 prod audit) — mirror leaveCall()'s pre-answer
    // handling: a call ended before it was ever answered (still initiated/
    // ringing/connecting) must resolve to `missed`, never `completed`.
    // Without this, `call:end` fired before the callee's `call:join` (a race
    // observed in prod) persisted status='ended'/duration=0/reason='completed'
    // — a phantom "completed" call in history that never triggered a
    // missed-call notification for the other party. An explicit non-default
    // reason (rejected/failed/...) is preserved as endReason; only the status
    // is normalized to `missed` so history/Recents filters stay consistent
    // with leaveCall().
    const wasPreAnswered =
      call.status === CallStatus.initiated ||
      call.status === CallStatus.ringing ||
      call.status === CallStatus.connecting;
    const resolvedReason = this.resolveEndReason(reason);
    const endReason = wasPreAnswered && resolvedReason === CallEndReason.completed
      ? CallEndReason.missed
      : resolvedReason;
    const targetStatus = wasPreAnswered ? CallStatus.missed : CallStatus.ended;

    // Version-guarded: a plain read-modify-write here raced with any other
    // terminal writer touching this same call (a retried `call:end`, a
    // concurrent `leaveCall`/force-end from CallCleanupService/disconnect
    // handling) — both read the same pre-terminal snapshot, both pass the
    // `TERMINAL_STATUSES` guard above, and whichever writes last silently
    // clobbers the other's `duration`/`endReason`. Scoping the final write to
    // `version: call.version` (same optimistic-lock field `joinCallAttempt`
    // uses) makes the losing writer's update a no-op and roll back its
    // participant `leftAt` stamps too, instead of corrupting the record.
    const versionConflict = Symbol('versionConflict');
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.callParticipant.updateMany({
        where: {
          callSessionId: callId,
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
        },
        data: { leftAt: endedAt }
      });

      const lock = await tx.callSession.updateMany({
        where: { id: callId, version: call.version },
        data: {
          status: targetStatus,
          endedAt,
          duration,
          endReason,
          metadata: {
            ...(call.metadata as Record<string, unknown>),
            endedBy
          },
          version: { increment: 1 }
        }
      });

      if (lock.count === 0) {
        throw versionConflict;
      }
    }).then(
      () => 'ended' as const,
      (error) => {
        if (error === versionConflict) {
          return 'conflict' as const;
        }
        throw error;
      }
    );

    if (outcome === 'conflict') {
      logger.warn('⚠️ Call end lost race to a concurrent terminal write — returning current session', {
        callId, endedBy
      });
      return this.getCallSession(callId);
    }

    this.clearHeartbeats(callId);
    this.clearRingingTimeout(callId);
    await this.releaseActiveCallClaim(call.conversationId, callId);

    logger.info('Call ended successfully', { callId, duration, endedBy, endReason, wasPreAnswered });

    return this.getCallSession(callId);
  }

  /**
   * Get active call for conversation
   */
  async getActiveCallForConversation(conversationId: string): Promise<CallSessionWithParticipants | null> {
    const call = await this.prisma.callSession.findFirst({
      where: {
        conversationId,
        status: { in: ACTIVE_STATUSES }
      },
      include: callSessionInclude
    });

    return call;
  }

  /**
   * Paginated call journal for a user: the terminal (ended/missed/rejected/
   * failed) calls in conversations they belong to, newest first, over a 3-month
   * sliding window. Cursor-paginated by call id.
   *
   * Peer resolution: for a direct (P2P) conversation the "other party" is the
   * conversation's other member — resolved from the conversation roster, not the
   * call participants — so a missed outgoing call (callee never joined) still
   * shows who was dialed. Group calls carry no peer (the conversation
   * name/avatar identifies them).
   */
  async listHistory(
    userId: string,
    options: { limit: number; cursor?: string; filter: 'all' | 'missed' }
  ): Promise<{ items: CallHistoryItem[]; hasMore: boolean; nextCursor?: string }> {
    const { limit, cursor, filter } = options;
    const windowStart = new Date(Date.now() - CALL_HISTORY_WINDOW_MS);

    const where: Prisma.CallSessionWhereInput = {
      startedAt: { gte: windowStart },
      status: { in: TERMINAL_STATUSES },
      conversation: { participants: { some: { userId, isActive: true } } }
    };
    if (filter === 'missed') {
      // A missed call: an incoming call that rang out unanswered. Keyed on the
      // distinct `missed` status so calls the user actively rejected
      // (status `rejected`) and the user's own unanswered outgoing calls are
      // excluded.
      where.status = CallStatus.missed;
      where.initiatorId = { not: userId };
    }

    const rows = await this.prisma.callSession.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        conversationId: true,
        mode: true,
        status: true,
        endReason: true,
        initiatorId: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        duration: true,
        bytesSent: true,
        bytesReceived: true,
        metadata: true,
        conversation: { select: { type: true, title: true, avatar: true } }
      }
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

    // Resolve all direct-call peers in a single batched roster query.
    const directConvIds = Array.from(
      new Set(page.filter((r) => r.conversation.type === 'direct').map((r) => r.conversationId))
    );
    const peerByConv = new Map<string, CallHistoryPeer>();
    if (directConvIds.length > 0) {
      const members = await this.prisma.participant.findMany({
        where: { conversationId: { in: directConvIds }, userId: { not: userId } },
        select: {
          conversationId: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              phoneNumber: true,
              isOnline: true
            }
          }
        }
      });
      for (const m of members) {
        if (m.user && !peerByConv.has(m.conversationId)) {
          peerByConv.set(m.conversationId, {
            userId: m.user.id,
            username: m.user.username,
            displayName: m.user.displayName ?? null,
            avatar: m.user.avatar ?? null,
            phoneNumber: m.user.phoneNumber ?? null,
            isOnline: m.user.isOnline
          });
        }
      }
    }

    const items = page.map((row) =>
      buildCallHistoryItem(
        row as CallHistoryRow,
        userId,
        row.conversation.type === 'direct' ? peerByConv.get(row.conversationId) ?? null : null
      )
    );

    return { items, hasMore, nextCursor };
  }

  /**
   * Update participant media state (audio/video toggle)
   */
  async updateParticipantMedia(
    callId: string,
    participantId: string,
    mediaType: 'audio' | 'video',
    enabled: boolean
  ): Promise<CallSessionWithParticipants> {
    logger.info('📞 Updating participant media state', {
      callId,
      participantId,
      mediaType,
      enabled
    });

    // Find the call participant. Audit C5 (2026-07-02) — the `{leftAt: null}`
    // filter alone never matched docs whose leftAt field was never written,
    // making this lookup (and the DB media flag below) a 100% no-op in prod.
    const callParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        participantId,
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
      }
    });

    // CALL-FIX 2026-06-06 — TOLERANT media toggle. The DB media flag
    // (isAudioEnabled/isVideoEnabled) is bookkeeping; what actually matters is
    // that the handler BROADCASTS call:media-toggled to the peer (avatar
    // placeholder). When the resolved `participantId` doesn't match an active
    // CallParticipant row (participantId↔Participant.id resolution drift, or a
    // racing leave), THROWING aborted the whole toggle — the peer never learned
    // the camera turned off, and the error bubbled back to the toggling client.
    // Skip the bookkeeping update best-effort instead of throwing so the toggle
    // still propagates.
    if (!callParticipant) {
      logger.warn('⚠️ updateParticipantMedia — no active CallParticipant, skipping DB flag (toggle still broadcast)', {
        callId, participantId, mediaType, enabled
      });
      return this.getCallSession(callId);
    }

    // Update media state
    await this.prisma.callParticipant.update({
      where: { id: callParticipant.id },
      data:
        mediaType === 'audio'
          ? { isAudioEnabled: enabled }
          : { isVideoEnabled: enabled }
    });

    logger.info('✅ Participant media state updated', {
      callId,
      participantId,
      mediaType,
      enabled
    });

    return this.getCallSession(callId);
  }

  /**
   * Marquer un appel comme manqué
   * À appeler quand un appel n'est pas répondu après un timeout
   */
  async markCallAsMissed(callId: string): Promise<CallSessionWithParticipants> {
    logger.info('📞 Marking call as missed', { callId });

    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
        initiator: true
      }
    });

    if (!callSession) {
      logger.error('❌ Call session not found', { callId });
      throw new Error(`${CALL_ERROR_CODES.CALL_NOT_FOUND}: Call session not found`);
    }

    // Audit P2-GW-3 — guard against non-ringing states. The ringing
    // timeout callback already performs an atomic `updateMany` scoped to
    // `[initiated, ringing]`, so when this path runs the row is typically
    // already `missed`. Unconditionally re-writing it drifts `endedAt`
    // (+a few ms) and `duration` (+a few seconds) on every retry.
    if (callSession.status !== CallStatus.initiated && callSession.status !== CallStatus.ringing) {
      logger.info('Call already in non-ringing state — skipping markCallAsMissed write', {
        callId,
        currentStatus: callSession.status
      });
      // Audit 2026-07-02 — if the status write already landed via another
      // path (the ringing-timeout handler's own atomic `updateMany`), that
      // path only touches CallSession.status: it never stamps participant
      // rows, clears in-memory heartbeats/timers, or releases the
      // conversation's active-call claim. Skipping those here left the claim
      // locked forever (every future `call:initiate` on the conversation
      // failed CALL_ALREADY_ACTIVE) and left `call:signal` still relaying
      // SDP/ICE between "missed" participants (their `leftAt` was never
      // set). Only run this for genuinely terminal statuses — an `active`/
      // `connecting`/`reconnecting` call must never be torn down here.
      // Idempotent: a no-op if another terminal path already did it.
      if (TERMINAL_STATUSES.includes(callSession.status)) {
        await this.finalizeMissedCallCleanup(callSession.conversationId, callId);
      }
      return this.getCallSession(callId);
    }

    // Mettre à jour le statut de l'appel
    const now = new Date();
    const duration = Math.floor((now.getTime() - callSession.startedAt.getTime()) / 1000);

    await this.prisma.callSession.update({
      where: { id: callId },
      data: {
        status: CallStatus.missed,
        endedAt: now,
        duration,
        endReason: CallEndReason.missed
      }
    });

    await this.finalizeMissedCallCleanup(callSession.conversationId, callId);

    logger.info('Call marked as missed', { callId, duration });

    return this.getCallSession(callId);
  }

  /**
   * Shared terminal cleanup for a call resolved to `missed` — stamps any
   * still-open participant rows so `call:signal` stops relaying between them,
   * clears in-memory heartbeat/ringing-timer state, and releases the
   * conversation's active-call claim. Safe to call more than once: every
   * write here is scoped/idempotent.
   */
  private async finalizeMissedCallCleanup(conversationId: string, callId: string): Promise<void> {
    await this.prisma.callParticipant.updateMany({
      where: {
        callSessionId: callId,
        OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
      },
      data: { leftAt: new Date() }
    });
    this.clearHeartbeats(callId);
    this.clearRingingTimeout(callId);
    await this.releaseActiveCallClaim(conversationId, callId);
  }

  /**
   * Récupérer les participants d'un appel qui n'ont pas rejoint
   */
  async getUnrespondedParticipants(callId: string): Promise<string[]> {
    const callSession = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
        conversation: {
          include: {
            participants: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                userId: true
              }
            }
          }
        }
      }
    });

    if (!callSession) {
      return [];
    }

    // Récupérer les IDs des participants qui ont déjà rejoint l'appel
    const joinedParticipantIds = callSession.participants.map(p => p.participantId);

    // Récupérer tous les membres de la conversation
    const conversationParticipantIds = callSession.conversation.participants.map(m => m.userId).filter(Boolean) as string[];

    // Exclure l'initiateur et ceux qui ont rejoint
    const unrespondedUserIds = conversationParticipantIds.filter(
      userId => userId !== callSession.initiatorId && !callSession.conversation.participants
        .filter(p => joinedParticipantIds.includes(p.id))
        .some(p => p.userId === userId)
    );

    return unrespondedUserIds;
  }

  /**
   * Resolve a string reason to a Prisma CallEndReason enum
   */
  private resolveEndReason(reason?: string): CallEndReason {
    switch (reason) {
      case 'missed': return CallEndReason.missed;
      case 'rejected': return CallEndReason.rejected;
      case 'failed': return CallEndReason.failed;
      case 'connectionLost': return CallEndReason.connectionLost;
      case 'heartbeatTimeout': return CallEndReason.heartbeatTimeout;
      case 'garbageCollected': return CallEndReason.garbageCollected;
      default: return CallEndReason.completed;
    }
  }

  /**
   * Persist the latest client-reported call statistics onto the CallSession so
   * the call-summary message can surface "data spent" + network quality.
   *
   * WebRTC `bytesSent`/`bytesReceived` are cumulative monotonic counters, so we
   * keep the MAX seen (defensive against out-of-order/duplicate reports); the
   * last report before teardown therefore yields the call totals. The quality
   * tier is overwritten with the most recent non-empty value. Best-effort and
   * never throws — a failed stats write must not break call signaling.
   */
  async persistCallStats(
    callId: string,
    stats: { bytesSent?: number | null; bytesReceived?: number | null; level?: string | null }
  ): Promise<void> {
    const data: Prisma.CallSessionUpdateInput = {};
    const current = await this.prisma.callSession
      .findUnique({ where: { id: callId }, select: { bytesSent: true, bytesReceived: true } })
      .catch(() => null);
    if (current === null) {
      return;
    }
    // "Data spent" is a per-DEVICE figure. Each participant reports its OWN
    // cumulative sent/received, so maxing the two fields independently across
    // participants would mix endpoints and over-count asymmetric calls (e.g.
    // one side sends video). Instead, keep the (sent, received) pair from the
    // single report with the largest TOTAL — a coherent one-device view that is
    // also monotonic across a given participant's growing counters.
    const reportSent = clampNonNegativeInt(stats.bytesSent);
    const reportReceived = clampNonNegativeInt(stats.bytesReceived);
    if (reportSent !== null || reportReceived !== null) {
      const nextSent = reportSent ?? current.bytesSent ?? 0;
      const nextReceived = reportReceived ?? current.bytesReceived ?? 0;
      const currentTotal = (current.bytesSent ?? 0) + (current.bytesReceived ?? 0);
      if (nextSent + nextReceived > currentTotal) {
        data.bytesSent = nextSent;
        data.bytesReceived = nextReceived;
      }
    }
    if (stats.level === 'excellent' || stats.level === 'good' || stats.level === 'fair' || stats.level === 'poor') {
      data.networkQuality = stats.level;
    }
    if (Object.keys(data).length === 0) {
      return;
    }
    await this.prisma.callSession.update({ where: { id: callId }, data }).catch((error) => {
      logger.warn('Failed to persist call stats', {
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  /**
   * P3 — post the call-summary system message into the conversation when a
   * call reaches a terminal state ("Appel vidéo · 04:32", "Appel audio
   * manqué", "Appel refusé").
   *
   * Idempotent by construction: the message's `clientMessageId` is derived
   * deterministically from the callId, and the partial unique index on
   * `Message(conversationId, clientMessageId)` guarantees exactly one summary
   * per call even though several gateway terminal paths (ringing timeout,
   * participant leave, force cleanup) may all call this. A duplicate insert
   * raises Prisma P2002 and is swallowed as a no-op.
   *
   * Returns the created `Message` (with sender populated for Socket.IO
   * broadcast) or `null` when nothing should be posted: the call is not
   * terminal, the end reason is housekeeping (garbage collection), the message
   * already exists, or the initiator has no participant row to attribute it to.
   * The pure status/reason → label mapping lives in
   * `@meeshy/shared/utils/call-summary`.
   */
  async createCallSummaryMessage(
    callId: string
  ): Promise<Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }> | null> {
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      select: {
        id: true,
        conversationId: true,
        initiatorId: true,
        status: true,
        endReason: true,
        duration: true,
        metadata: true,
        bytesSent: true,
        bytesReceived: true,
        networkQuality: true
      }
    });
    if (!call) {
      return null;
    }

    const metadataType = (call.metadata as Record<string, unknown> | null)?.type;
    const callType = typeof metadataType === 'string' ? metadataType : null;
    // Compute the human-readable label AND the structured call facts the client
    // renders into a rich, actionable bubble (direction resolved per-viewer from
    // initiatorId, media glyph, outcome tint, and the "duration · data · quality"
    // line) in a single pass. Persisted on `Message.metadata`; survives both the
    // socket broadcast and REST history.
    const built = buildCallSummaryWithMetadata({
      status: call.status,
      endReason: call.endReason,
      callType,
      durationSeconds: call.duration,
      callId: call.id,
      initiatorId: call.initiatorId,
      bytesSent: call.bytesSent,
      bytesReceived: call.bytesReceived,
      networkQuality: call.networkQuality
    });
    if (!built) {
      return null;
    }
    const { summary, metadata: callMetadata } = built;

    // `Message.senderId` references a Participant (not a User); resolve the
    // initiator's participant row in this conversation to attribute the
    // summary. iOS/web center system messages regardless of sender, so the
    // attribution is bookkeeping, not a visible "from".
    const initiatorParticipant = await this.prisma.participant.findFirst({
      where: { userId: call.initiatorId, conversationId: call.conversationId },
      select: { id: true }
    });
    if (!initiatorParticipant) {
      logger.warn('Cannot attribute call summary: initiator has no participant row', {
        callId,
        conversationId: call.conversationId,
        initiatorId: call.initiatorId
      });
      return null;
    }

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId: call.conversationId,
          senderId: initiatorParticipant.id,
          content: summary.content,
          originalLanguage: 'fr',
          messageType: 'system',
          messageSource: 'system',
          metadata: (callMetadata ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
          clientMessageId: callSummaryClientMessageId(call.id)
        },
        include: CALL_SUMMARY_MESSAGE_INCLUDE
      });
      logger.info('Call summary message posted', {
        callId,
        conversationId: call.conversationId,
        outcome: summary.outcome,
        callType: summary.callType
      });
      return message;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A concurrent terminal path already posted the summary — idempotent.
        return null;
      }
      throw error;
    }
  }
}
