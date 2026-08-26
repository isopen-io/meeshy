/**
 * CALL MANAGER COMPONENT
 * Orchestrates call lifecycle: incoming calls, joining, leaving, signaling
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { CallNotification } from './CallNotification';
import { CallWaitingBanner } from './CallWaitingBanner';
import { VideoCallInterface } from '@/components/video-calls/VideoCallInterface';
import { CallErrorBoundary } from '@/components/video-calls/CallErrorBoundary';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import type {
  CallInitiatedEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
  CallError,
  CallSession,
  CallJoinAck,
} from '@meeshy/shared/types/video-call';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { TypedSocket } from '@/services/socketio/types';
import { getCallMediaConstraints, stopPreauthorizedStream } from '@/lib/calls/call-media-constraints';
import { callsService } from '@/services/calls.service';
import { isRetryableCallFailure } from '@/lib/calls/call-retry-policy';

// Caller/callee no-answer timeout. The gateway has its own 60s server-side
// ringing timeout (CallService.RINGING_TIMEOUT_MS), and iOS deliberately
// rings for 45s client-side (WebRTCTypes.outgoingRingTimeoutSeconds — "15s
// headroom under the gateway's hard cap"). Web used to cut off at 30s, 15s
// tighter than iOS for the exact same call: a callee who would have answered
// between 30s-45s connects fine from an iOS caller but gets hung up on by a
// web caller. Aligned to 45s (2026-07-11, Vague 38) to match that convention.
const CALL_TIMEOUT_MS = 45000; // 45 seconds

// call:join ack timeout (Vague 88, 2026-08-10). Socket.IO client 4.8 does NOT
// auto-reject a pending ack callback when the transport drops between the
// emit and the response — mirrors the existing SOCKET_ACK_TIMEOUT_MS pattern
// in use-post-mutations.ts / use-comment-mutations.ts. Without this, a
// dropped ack (transient disconnect right after the emit, gateway restart
// mid-request, mobile flakiness) left acceptOrJoinCall's promise pending
// forever: acceptingCallIdRef never released (Accept became permanently
// inert), the pre-authorized mic/camera stream never stopped, and no error
// ever surfaced to the user.
const CALL_JOIN_ACK_TIMEOUT_MS = 10_000;

export function CallManager() {
  const { t } = useI18n('calls');
  const { user, isChecking } = useAuth();
  const {
    currentCall,
    isInCall,
    setCurrentCall,
    setInCall,
    setIceServers,
    addParticipant,
    removeParticipant,
    updateParticipant,
    reset,
    startHeartbeat,
    stopHeartbeat,
    joinRequest,
    clearJoinRequest,
  } = useCallStore();

  const [incomingCall, setIncomingCall] = useState<CallInitiatedEvent | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Call-waiting (busy-path): a SECOND incoming call arriving while already in
  // an active call. Kept separate from `incomingCall` so it renders a compact
  // CallWaitingBanner (Decline / End & answer) OVER the live call instead of the
  // full-screen fresh-incoming CallNotification. Parity iOS/Android.
  const [waitingCall, setWaitingCall] = useState<CallInitiatedEvent | null>(null);
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Re-entrancy guard: `incomingCall` (and the Accept button it renders)
  // isn't cleared until the getUserMedia + call:join ack round-trip settles,
  // so a double-click/double-tap on Accept before then reaches
  // handleAcceptCall twice concurrently — each acquiring its own
  // MediaStream. Both overwrite `window.__preauthorizedMediaStream`; the
  // loser's stream is never referenced again and its tracks are never
  // stopped, leaving a mic/camera hot with nothing consuming it.
  const acceptingCallIdRef = useRef<string | null>(null);
  // CALL-RESILIENCE — tracks whether we've already observed this effect's
  // first `connect`. Any subsequent `connect` is a genuine reconnect
  // (network blip or gateway restart) that must re-enter the call room —
  // see rejoinActiveCallAfterReconnect below.
  const hasConnectedRef = useRef(false);

  /**
   * Clear call timeout
   */
  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
      logger.debug('[CallManager]', 'Call timeout cleared');
    }
  }, []);

  /**
   * Start call timeout - auto-cleanup after 45s if no one joins
   */
  const startCallTimeout = useCallback((callId: string) => {
    // Clear any existing timeout
    clearCallTimeout();

    // Start new timeout
    callTimeoutRef.current = setTimeout(() => {
      // Bug fix (2026-07-09, sibling of the 2026-07-06 initiator-timeout fix,
      // Vague 30): the callee branch of `handleIncomingCall` only calls
      // `setIncomingCall` + `startCallTimeout` — it never sets
      // `currentCall`/`isInCall` (those are only set by `handleAcceptCall`).
      // The guard below can therefore never see an unanswered incoming call,
      // and previously left the ringing banner stuck forever whenever the
      // server's own `call:ended`/`call:missed` broadcast didn't reach this
      // socket (e.g. a reconnect gap). Clear the callee's own stale banner
      // here, independent of that guard — a no-op for the initiator (whose
      // `incomingCall` is never set in the first place).
      setIncomingCall((current) => (current?.callId === callId ? null : current));

      const { currentCall, isInCall } = useCallStore.getState();

      // Only cleanup if:
      // 1. Still in a call
      // 2. Same call ID
      // 3. Call is still in 'initiated' state (no one joined)
      if (!isInCall || !currentCall || currentCall.id !== callId) {
        logger.debug('[CallManager]', 'Call already ended, skipping timeout cleanup');
        return;
      }

      if (currentCall.status === 'initiated') {
        logger.warn('[CallManager]', `Call timeout - no answer after ${CALL_TIMEOUT_MS/1000}s`);

        // Emit leave event to server
        const socket = meeshySocketIOService.getSocket();
        if (socket) {
          socket.emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
        }

        // Reset local state
        reset();
        setIncomingCall(null);

        // Toast métier désactivé - utiliser le système de notifications v2
      }
    }, CALL_TIMEOUT_MS);

    logger.debug('[CallManager]', `Call timeout started - ${CALL_TIMEOUT_MS/1000}s`);
  }, [clearCallTimeout, reset]);

  const clearWaitingTimeout = useCallback(() => {
    if (waitingTimeoutRef.current) {
      clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    }
  }, []);

  /**
   * Decline the waiting call: end it on the wire (keyed by ITS own callId, so
   * the active call is untouched) and dismiss the banner. Mirrors iOS
   * `rejectWaiting` / the gateway's callee-busy semantics — a call:end
   * reason=rejected frees the second caller immediately.
   */
  const rejectWaitingCall = useCallback((callId: string) => {
    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      socket.emit(CLIENT_EVENTS.CALL_END, {
        callId,
        reason: 'rejected',
      });
    }
  }, []);

  /**
   * Auto-decline the waiting call if the user ignores the banner for the full
   * ring window — same duration as a normal no-answer (the second caller's own
   * ring times out around then). Without this the banner could linger after the
   * caller already gave up.
   */
  const startWaitingTimeout = useCallback((callId: string) => {
    if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
    waitingTimeoutRef.current = setTimeout(() => {
      logger.info('[CallManager]', 'Call-waiting banner timed out — auto-declining ' + callId);
      rejectWaitingCall(callId);
      setWaitingCall((w) => (w?.callId === callId ? null : w));
    }, CALL_TIMEOUT_MS);
  }, [rejectWaitingCall]);

  const handleRejectWaiting = useCallback(() => {
    if (!waitingCall) return;
    logger.debug('[CallManager]', 'Rejecting waiting call - callId: ' + waitingCall.callId);
    clearWaitingTimeout();
    rejectWaitingCall(waitingCall.callId);
    setWaitingCall(null);
  }, [waitingCall, clearWaitingTimeout, rejectWaitingCall]);

  /**
   * Bug fix (2026-07-06, follow-up to the 682c35279 P0 fix) — the initiator's
   * own outgoing call never reaches this component via `call:initiated`: the
   * gateway deliberately never re-emits that event back to the initiator's
   * own socket, so `startCall`'s ack handler (use-video-call.ts) sets
   * `currentCall` directly instead. That path has no reference to
   * `startCallTimeout`, so the initiator's 45s no-answer auto-cleanup never
   * armed for the caller — only the callee (via `handleIncomingCall`) had
   * one. Arm it here, reactively, the moment the initiator's own call
   * becomes current in `initiated` status; the sibling effect below clears
   * it the instant the call genuinely answers.
   */
  useEffect(() => {
    if (!user || !currentCall) return;
    if (currentCall.status !== 'initiated') return;
    if (currentCall.initiatorId !== user.id) return;
    startCallTimeout(currentCall.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.id, currentCall?.status, currentCall?.initiatorId, user?.id]);

  /**
   * Vague 114 (2026-08-12) — clear the no-answer timeout on a genuine
   * answer, not on room-join. `handleParticipantJoined` used to call
   * `clearCallTimeout()` directly on `call:participant-joined`, which fires
   * on iOS the instant the callee's device auto-early-joins the call room
   * while still ringing (`CallManager.swift` `joinCallRoomReliably` — see
   * Vague 113). That disarmed the caller's 45s no-answer auto-hangup the
   * moment an iOS callee's phone started ringing, not when they picked up:
   * an iOS callee who never answered left the caller ringing forever, with
   * only the gateway's own 60s server-side ringing timeout as a backstop.
   * `status` only flips to `'active'` on a genuine answer (`useWebRTCP2P`'s
   * `handleAnswer`, or the callee's own local Accept in `acceptOrJoinCall`)
   * — clearing here instead tracks that real signal for both sides.
   */
  useEffect(() => {
    if (currentCall?.status === 'active') {
      clearCallTimeout();
    }
  }, [currentCall?.status, clearCallTimeout]);

  /**
   * CALL-RESILIENCE — client heartbeat liveness contract (audit Vague 26,
   * sibling drift). `CallCleanupService`'s gateway GC tier force-ends any
   * call whose participants show no fresh heartbeat for >120s, using
   * `call:heartbeat` (15s interval, `startHeartbeat`/`stopHeartbeat` in
   * call-store.ts) as the liveness signal — iOS emits it for every call via
   * `CallManager.startHeartbeat()`. This component never called the store's
   * `startHeartbeat` action anywhere: a web↔web call had zero heartbeat
   * entries from either side, which the GC's post-restart DB fallback
   * treats identically to a genuine zombie once the one-time boot grace
   * window passes — a healthy P2P call longer than ~2 minutes would be
   * force-ended server-side with `endReason: heartbeatTimeout`. Starts the
   * moment a call becomes active, stops the moment it ends (both driven by
   * `isInCall`, which `setCurrentCall`/`reset` already toggle).
   */
  useEffect(() => {
    if (!isInCall || !currentCall?.id) return;
    startHeartbeat(currentCall.id);
    return () => stopHeartbeat();
  }, [isInCall, currentCall?.id, startHeartbeat, stopHeartbeat]);

  /**
   * Handle incoming call
   */
  const handleIncomingCall = useCallback(async (event: CallInitiatedEvent) => {
    console.log('🔔 [CallManager] call:initiated event received', {
      callId: event.callId,
      initiator: event.initiator,
      participants: event.participants,
      conversationId: event.conversationId,
      currentUser: user?.id,
      userLoaded: !!user
    });

    // Wait for user to be loaded
    if (!user) {
      console.error('❌ [CallManager] User not loaded yet - ignoring call:initiated');
      logger.warn('[CallManager]', 'User not loaded yet - ignoring call:initiated');
      // Toast métier désactivé - utiliser le système de notifications v2
      return;
    }

    logger.info('[CallManager]', 'Incoming call - callId: ' + event.callId, {
      callId: event.callId,
      initiatorId: event.initiator.userId,
      currentUserId: user.id,
      conversationId: event.conversationId
    });

    // Check if current user is the initiator
    const isInitiator = user.id === event.initiator.userId;
    console.log('🔍 [CallManager] isInitiator check:', {
      currentUserId: user.id,
      initiatorId: event.initiator.userId,
      isInitiator
    });

    if (isInitiator) {
      // I am the initiator - check if already in call to avoid duplicate
      if (isInCall && currentCall?.id === event.callId) {
        logger.debug('[CallManager]', 'Already in call - ignoring duplicate call:initiated');
        return;
      }

      // I am the initiator - automatically start the call
      logger.info('[CallManager]', 'I am the initiator - auto-starting call');

      // Set call as current
      setCurrentCall({
        id: event.callId,
        conversationId: event.conversationId,
        mode: event.mode,
        status: 'initiated',
        initiatorId: event.initiator.userId,
        startedAt: new Date(),
        participants: event.participants,
        metadata: { type: event.type },
      });

      // Set call as active - CallInterface will initialize local stream
      setInCall(true);

      // Start timeout to auto-cleanup if no one joins
      startCallTimeout(event.callId);

      // Toast métier désactivé - utiliser le système de notifications v2
    } else {
      // Vague 163 (2026-08-23) — `call:check-active` replays the SAME
      // ringing call:initiated on every socket reconnect during the 60s
      // gateway ringing window (see CallEventsHandler.ts `call:check-active`
      // comment: "the client dedups by callId") — but this branch never
      // actually deduped: a replay for the callId already showing as
      // `incomingCall` fell straight through to `setIncomingCall` +
      // `startCallTimeout`, which RE-ARMS a fresh 45s window on every
      // reconnect instead of leaving the original deadline alone. A callee
      // on a flaky connection — the exact case this replay exists to cover —
      // could see the ringing banner outlive the caller's own 45s no-answer
      // timeout indefinitely, one reconnect at a time. A true duplicate
      // replay for an unanswered call already showing is a no-op.
      if (incomingCall && incomingCall.callId === event.callId) {
        logger.debug('[CallManager]', 'Duplicate call:initiated replay for already-showing call ' + event.callId + ' — ignoring (no timer re-arm)');
        return;
      }

      // Busy-path parity (iOS CallManager busy-path, Android onIncomingOffer):
      // a second incoming call while already in a DIFFERENT active call must not
      // naively setIncomingCall. The render mounts CallNotification and
      // VideoCallInterface independently, so an ungated notification renders
      // OVER the live call and tapping Accept runs setCurrentCall(secondCall),
      // clobbering the active call and orphaning its RTCPeerConnection. Surface a
      // compact CallWaitingBanner (Decline / End & answer) instead — the user
      // stays in control of the live call and can either free the second caller
      // or swap to them. Auto-declines on timeout if ignored (busy for real).
      const { isInCall: busyInCall, currentCall: busyCall } = useCallStore.getState();
      if (busyInCall && busyCall && busyCall.id !== event.callId) {
        // A THIRD caller arriving while a SECOND is already showing in the
        // waiting banner must not silently bump it out of local state — that
        // orphans the second caller's ring with no decline signal until its
        // own timeout eventually fires. Explicitly decline it first (same
        // call:end reason=rejected path as the Decline button/auto-timeout),
        // then let the third caller take over the banner.
        if (waitingCall && waitingCall.callId !== event.callId) {
          logger.info('[CallManager]', 'Third caller bumping waiting call ' + waitingCall.callId + ' — declining it for ' + event.callId);
          clearWaitingTimeout();
          rejectWaitingCall(waitingCall.callId);
        }
        logger.info('[CallManager]', 'Busy in another call — showing call-waiting banner for ' + event.callId);
        setWaitingCall(event);
        startWaitingTimeout(event.callId);
        return;
      }

      // A SECOND caller ringing in while the first `incomingCall` is still
      // unanswered (not busy — isInCall is false, so the busy-path branch
      // above never runs) used to fall straight through to setIncomingCall
      // below, silently overwriting `incomingCall` and its shared
      // `callTimeoutRef` with zero decline signal for the first caller — the
      // same class of bug the busy-path fix above (third caller bumping the
      // waiting banner) already closed, left open on this sibling branch.
      // Explicitly decline the bumped call first, same call:end
      // reason=rejected path Decline/auto-timeout already use.
      if (incomingCall && incomingCall.callId !== event.callId) {
        // Vague 90 (2026-08-10) — an Accept is already in flight for
        // `incomingCall` (getUserMedia + call:join ack, up to
        // CALL_JOIN_ACK_TIMEOUT_MS = 10s). isInCall/currentCall don't
        // reflect that yet — acceptOrJoinCall's setInCall(true) is its LAST
        // statement — so the busyInCall branch above hasn't triggered. Left
        // unguarded, this branch would reject the very call the user just
        // committed to accepting, racing a call:end against its own pending
        // call:join for the SAME callId — the caller sees a spurious reject
        // moments before the callee actually joins. Queue the new caller as
        // a waiting call instead, same as the already-busy case — including
        // the same "don't silently bump an existing waiting call" guard
        // Vague 59 added to the sibling branch above.
        if (acceptingCallIdRef.current === incomingCall.callId) {
          if (waitingCall && waitingCall.callId !== event.callId) {
            logger.info('[CallManager]', 'Third caller bumping waiting call ' + waitingCall.callId + ' — declining it for ' + event.callId + ' (accept in flight for ' + incomingCall.callId + ')');
            clearWaitingTimeout();
            rejectWaitingCall(waitingCall.callId);
          }
          logger.info('[CallManager]', 'Accept already in flight for ' + incomingCall.callId + ' — queuing ' + event.callId + ' as a waiting call instead of bumping it');
          setWaitingCall(event);
          startWaitingTimeout(event.callId);
          return;
        }
        logger.info('[CallManager]', 'Second incoming call bumping unanswered call ' + incomingCall.callId + ' — declining it for ' + event.callId);
        clearCallTimeout();
        rejectWaitingCall(incomingCall.callId);
      }

      // I am being called - show notification
      console.log('📞 [CallManager] Setting incomingCall state - should show CallNotification', {
        callId: event.callId,
        from: event.initiator.username
      });
      logger.info('[CallManager]', 'Incoming call from ' + event.initiator.username);
      setIncomingCall(event);

      // Start timeout for incoming call too
      startCallTimeout(event.callId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, setCurrentCall, setInCall, isInCall, currentCall, startCallTimeout, startWaitingTimeout, waitingCall, clearWaitingTimeout, rejectWaitingCall, incomingCall, clearCallTimeout]);

  /**
   * Handle participant joined
   */
  const handleParticipantJoined = useCallback(
    (event: CallParticipantJoinedEvent) => {
      // Vague 160 — a call:ended for an unrelated callId already has this
      // guard (see the stale-callId comment on handleCallEnded below); this
      // event is the sibling that never got it, even though it carries the
      // same callId field for the same reason. The call-waiting "End &
      // Answer" swap (handleEndAndAnswerWaiting) emits call:leave for the
      // outgoing call WITHOUT awaiting an ack, then synchronously moves
      // currentCall to the waiting call — the left call keeps running for
      // its other participants (group call) until the server processes the
      // leave, so a participant-joined for the OLD call can still reach this
      // socket after currentCall already points at the NEW one. Only skip
      // when a DIFFERENT call is genuinely tracked — `currentCall` is still
      // null before this client's own join ack lands, and addParticipant's
      // pendingParticipantsByCallId buffer (call-store.ts) exists precisely
      // to hold those pre-ack events, so this must not block that case.
      const { currentCall: trackedCallForJoin } = useCallStore.getState();
      if (trackedCallForJoin && trackedCallForJoin.id !== event.callId) {
        return;
      }

      logger.info('[CallManager]', 'Participant joined - callId: ' + event.callId + ', participantId: ' + event.participant.id);

      // Apply the per-user ICE servers (STUN + time-limited TURN) the gateway
      // attaches to participant-joined, so the initiator's RTCPeerConnection is
      // built with TURN credentials before the SDP offer is created.
      if (event.iceServers?.length) {
        setIceServers(event.iceServers);
      }

      // Add participant to call
      addParticipant(event.participant);

      // Vague 113 (2026-08-12, supersedes Vague 110's stamp here) — this
      // event fires on room-JOIN, not on answer: iOS deliberately
      // auto-early-joins the call room the instant it receives an incoming
      // call (CallManager.swift `joinCallRoomReliably`), specifically to
      // receive the SDP offer while still ringing. Treating this as the
      // caller's "answered" moment meant the visible call-duration clock
      // started (and status flipped to 'active') the instant an iOS
      // callee's phone started ringing, not when they picked up — for
      // every call to an iOS callee. The genuine pickup signal is the SDP
      // *answer*, which only a real Accept sends: `useWebRTCP2P`'s
      // `handleAnswer` now stamps `status`/`answeredAt` there instead (same
      // 'initiated' guard, so a later participant joining a group call
      // still never re-stamps it).
      //
      // Vague 114 (2026-08-12) — the no-answer timeout used to be cleared
      // right here too, for the same wrong reason: an early room-join isn't
      // an answer. It's now cleared reactively off `currentCall.status`
      // turning 'active' (see the effect above), the same real signal
      // Vague 113 moved the stamp to.

      // Note: CallInterface will handle creating the WebRTC offer
      // based on currentCall.initiatorId check

      // Toast métier désactivé - utiliser le système de notifications v2
    },
    [addParticipant, setIceServers]
  );

  /**
   * Handle participant left
   */
  const handleParticipantLeft = useCallback(
    (event: CallParticipantLeftEvent) => {
      // Vague 160 — sibling of the handleParticipantJoined guard above: a
      // participant-left for a call this client already moved away from
      // (currentCall now points elsewhere) must not remove an entry from
      // the CURRENT call's roster, even on an identity collision (the same
      // participantId can legitimately belong to a stale AND a current
      // call's roster entry after a rejoin).
      const { currentCall: trackedCallForLeft } = useCallStore.getState();
      if (trackedCallForLeft && trackedCallForLeft.id !== event.callId) {
        return;
      }

      // `CallParticipantLeftEvent` has no `anonymousId` field (see
      // packages/shared/types/video-call.ts) — VideoCallInterface's own
      // handler dropped the same dead lookup at Vague 133; this sibling
      // listener carried an unfixed duplicate that always logged `undefined`.
      logger.info('[CallManager]', 'Participant left - callId: ' + event.callId + ', participantId: ' + event.participantId, {
        userId: event.userId,
        mode: event.mode
      });

      // WebRTC-level teardown (peer connection, remote stream, and
      // use-webrtc-p2p's per-participant maps) is owned exclusively by
      // VideoCallInterface's own CALL_PARTICIPANT_LEFT listener — it delays
      // 2s and snapshots the connection at leave-time to detect a
      // same-session rejoin within that grace window, and clears the
      // WebRTCService/remoteDescriptionSetRef/iceCandidateQueueRef/
      // offerInFlightRef entries `useWebRTCP2P.removeParticipant` owns, not
      // just the store's peer connection object. CallManager's listener is
      // attached unconditionally on mount (before any call is active) and
      // therefore always fires FIRST — closing the RTCPeerConnection here
      // too raced ahead of that grace window: a rejoin's fresh offer
      // arriving within it found `use-webrtc-p2p.ts`'s maps still stale
      // (pointing at the connection just closed here) and got misrouted
      // through the renegotiation branch against an already-closed
      // connection, permanently failing the reconnect. This handler now
      // only updates the participant list (database-participantId-keyed).
      removeParticipant(event.participantId);

      // Toast métier désactivé - utiliser le système de notifications v2
    },
    [removeParticipant]
  );

  /**
   * Handle call ended
   */
  const handleCallEnded = useCallback(
    (event: CallEndedEvent) => {
      logger.info('[CallManager]', 'Call ended - callId: ' + event.callId + ', duration: ' + event.duration);

      // Call-waiting: the SECOND (waiting) call ended — its caller cancelled or
      // it timed out. Dismiss the banner ONLY; the active call and its retry
      // policy are untouched. This guard MUST run before the reset() below,
      // which is otherwise callId-agnostic and would tear down the healthy
      // active call on a waiting call's teardown.
      if (waitingCall && waitingCall.callId === event.callId) {
        clearWaitingTimeout();
        setWaitingCall(null);
        return;
      }

      // A call:ended for a callId this client isn't tracking as its current
      // session is stale/unrelated — e.g. the server force-ending a phantom
      // call session (CallService.initiateCall's reaped-call cleanup) fires an
      // async call:ended for THAT callId, which can arrive after this client
      // has already moved on to a brand-new call. Without this guard the
      // unconditional reset() below (and the waiting-call promotion further
      // down) would tear down a healthy, unrelated active call.
      const { currentCall: trackedCall } = useCallStore.getState();
      if (trackedCall && trackedCall.id !== event.callId) {
        return;
      }

      // Same guard, pre-accept: before the user has answered anything,
      // `trackedCall` is still null, so the guard above short-circuits and
      // falls through — even though a DIFFERENT call is ringing
      // (`incomingCall`, local state, distinct from the store). The gateway's
      // call:ended fan-out reaches every conversation member's user room, not
      // just call participants (so a still-ringing callee can learn a call it
      // was never near ended — `callEndedFanout.ts`'s `resolveCallEndedRooms`),
      // so this is a realistic delivery, not a contrived one. Mirrors how
      // `handleAnsweredElsewhere` already scopes itself to
      // `incomingCall?.callId === event.callId`.
      if (!trackedCall && incomingCall && incomingCall.callId !== event.callId) {
        return;
      }

      // Clear timeout
      clearCallTimeout();

      // A call ending in a TRANSIENT failure (failed/connectionLost) gets a
      // « Réessayer » offer — same policy VideoCallInterface's connect
      // watchdog already applies to the narrower never-connected case, now
      // also covering the server-authoritative call:ended path (the majority
      // real-world drop scenario for an already-established call). Read from
      // the store BEFORE reset() wipes currentCall/controls.
      // Any OTHER end reason clears a stale unconsumed offer left behind by an
      // earlier failed call on the SAME conversation: that offer is superseded
      // the moment a later call attempt on this conversation actually resolves
      // (successfully or not) — otherwise it can resurface, e.g. via
      // useCallRetryToast on a later visit, prompting a retry for a failure the
      // user already worked around.
      // …unless a call is WAITING: it is about to be promoted to a fresh
      // incoming ring (below), which is the user's next action. Stacking a
      // « Réessayer » offer for the just-dropped active call behind that ring
      // is conflicting UI, so the promotion path owns the teardown and neither
      // branch below runs.
      if (!waitingCall) {
        const { currentCall, controls, offerCallRetry, clearCallRetry } = useCallStore.getState();
        if (currentCall?.conversationId) {
          if (isRetryableCallFailure(event.reason)) {
            offerCallRetry({
              conversationId: currentCall.conversationId,
              // `metadata.type` is the authoritative call-nature source — a
              // manual mid-call camera toggle must not flip what "retry"
              // means. Fall back to `controls.videoEnabled` only for a call
              // session that predates `metadata.type` being wired.
              type: currentCall.metadata?.type ?? (controls.videoEnabled ? 'video' : 'audio'),
            });
          } else {
            clearCallRetry(currentCall.conversationId);
          }
        }
      }

      // The ACTIVE call ended while a call was WAITING: promote the waiting call
      // to a normal incoming ring (parity iOS re-present-after-teardown) instead
      // of leaving a stale banner floating with no active call behind it.
      if (waitingCall) {
        clearWaitingTimeout();
        reset();
        const promoted = waitingCall;
        setWaitingCall(null);
        setIncomingCall(promoted);
        startCallTimeout(promoted.callId);
        return;
      }

      // Reset call state - CallInterface will handle WebRTC cleanup
      reset();

      // Clear incoming call notification
      setIncomingCall(null);

      // Toast métier désactivé - utiliser le système de notifications v2
    },
    [reset, clearCallTimeout, clearWaitingTimeout, startCallTimeout, waitingCall, incomingCall]
  );

  /**
   * Handle "answered elsewhere" (multi-device ring-stop)
   */
  const handleAnsweredElsewhere = useCallback(
    (event: { callId: string }) => {
      // Un autre device de CE user a décroché : le serveur passe l'appel en
      // `active` (jamais `ended` à cet instant) et émet call:already-answered
      // vers les user-rooms — sans ce listener, la carte d'appel entrant du
      // tab sonnait indéfiniment (audit appels 2026-07-11, finding #1).
      // Scopé au callId qui sonne : ne touche ni le ring d'un autre appel ni
      // un appel déjà établi sur CE tab.
      if (incomingCall?.callId === event.callId) {
        logger.info('[CallManager]', 'Call answered on another device - dismissing ring - callId: ' + event.callId);

        import('@/utils/ringtone').then(({ stopRingtone }) => {
          stopRingtone();
        });
        clearCallTimeout();
        setIncomingCall(null);
        return;
      }

      // Same multi-device race, but for the BUSY-path call-waiting banner
      // (routine calling-feature, Vague 55, 2026-08-05): a second call rang
      // in while already on an active call, showing `waitingCall` instead of
      // `incomingCall`. Without this branch, answering that second call on
      // another device left the banner AND its 45s auto-decline timer
      // (`startWaitingTimeout`) running unattended here — the orphaned timer
      // would fire `rejectWaitingCall` (a real `call:end reason=rejected`)
      // for a call the user is now actively on elsewhere, silently killing
      // it from a stale banner nobody is looking at.
      if (waitingCall?.callId === event.callId) {
        logger.info('[CallManager]', 'Waiting call answered on another device - dismissing banner - callId: ' + event.callId);
        clearWaitingTimeout();
        setWaitingCall(null);
      }
    },
    [incomingCall, waitingCall, clearCallTimeout, clearWaitingTimeout]
  );

  /**
   * Handle media toggle (remote participant)
   */
  const handleMediaToggle = useCallback(
    (event: CallMediaToggleEvent) => {
      logger.debug('[CallManager]', 'Media toggle - participantId: ' + event.participantId + ', type: ' + event.mediaType + ', enabled: ' + event.enabled);

      // Vague 140 — `event.participantId` is `CallParticipant.participantId`
      // (a `Participant.id` FK), never the roster entry's own `.id`
      // (`CallParticipant.id`, what `updateParticipant` matches against —
      // same key `removeParticipant` uses for `call:participant-left`,
      // whose `participantId` field genuinely IS that PK). Passing it
      // straight through silently no-op'd every remote mute/camera toggle.
      // Resolve the roster entry the SAME way every other remote-peer
      // lookup already does (`p.userId || p.participantId`,
      // VideoCallInterface.tsx / useRemoteCallAlerts, Vague 132), then
      // update it by its actual `.id`.
      const identity = event.userId || event.participantId;
      const { currentCall } = useCallStore.getState();
      // Vague 160 — same stale-callId guard as handleParticipantJoined/Left
      // above: without it, a media-toggle for a call this client already
      // left (currentCall now points at a different, newer call) can still
      // flip a roster entry's mute/camera flag on the CURRENT call whenever
      // the identity happens to resolve to one of its participants (e.g.
      // redialing the same peer).
      if (currentCall && currentCall.id !== event.callId) {
        return;
      }
      const participant = currentCall?.participants.find(
        (p) => (p.userId || p.participantId) === identity
      );
      if (!participant) return;

      // Update participant state
      if (event.mediaType === 'audio') {
        updateParticipant(participant.id, {
          isAudioEnabled: event.enabled,
        });
      } else if (event.mediaType === 'video') {
        updateParticipant(participant.id, {
          isVideoEnabled: event.enabled,
        });
      }
    },
    [updateParticipant]
  );

  /**
   * Handle call error
   */
  const handleCallError = useCallback((error: CallError) => {
    // Defensive: handle cases where error might not have proper structure
    const errorMessage = error?.message || String(error) || 'Call error occurred';

    // Ignore "You are not in this call" error - it's a normal state after leaving
    // This happens when events arrive after user has already left the call
    if (errorMessage.includes('You are not in this call') ||
        errorMessage.includes('not in this call')) {
      logger.debug('[CallManager]', 'Ignoring expected error after leaving call: ' + errorMessage);
      return;
    }

    // Sibling-drift fix (2026-07-05): iOS's call:error subscriber whitelists
    // these 3 codes as transient/non-fatal, each backed by a real prod
    // incident (CallManager.swift ~3480-3510) — RATE_LIMIT_EXCEEDED throttles
    // a single ICE candidate (redundant by design, gateway cap is 50/5s vs. a
    // legitimate gathering flush of 15-25/ms) and killed a live call 382ms
    // after connect when treated as fatal; TARGET_NOT_FOUND is the peer's
    // socket momentarily missing from the call room during churn/reconnect
    // and killed a healthy call while the peer re-joined seconds later;
    // INVALID_SIGNAL is a per-message relay rejection, not an operation
    // error. The gateway emits all 3 to web the same way it does to iOS
    // (CallEventsHandler.ts call:signal/call:toggle-*), so an unrelated web
    // call showed a scary, self-healing "error" mid-call with no fix here.
    if (error?.code === 'RATE_LIMIT_EXCEEDED' || error?.code === 'TARGET_NOT_FOUND' || error?.code === 'INVALID_SIGNAL') {
      logger.debug('[CallManager]', `Ignoring transient call:error (${error.code}): ${errorMessage}`);
      return;
    }

    logger.error('[CallManager]', 'Call error: ' + errorMessage, { error });
    toast.error(errorMessage);
  }, []);

  /**
   * Shared join path — used by BOTH the incoming-call Accept button and the
   * live-bubble join (cold rehydration via `useCallStore.requestJoin`).
   *
   * Privacy fix (audit 2026-07-07): acquire local media BEFORE joining,
   * gated on the call's ACTUAL type — mirrors the caller's own
   * pre-authorization in use-video-call.ts's startCall. Handing the stream
   * off via `__preauthorizedMediaStream` reuses the same Safari-compatible
   * path VideoCallInterface already checks on mount.
   *
   * Vague 19 — the join must be confirmed via its ack before the UI commits
   * to "in call": the gateway can reject call:join at any point right up to
   * the moment the caller hangs up (already-ended call, no-longer-a-
   * participant, rate limit, etc.). A failure anywhere after getUserMedia
   * succeeded must not leave the mic/camera hot — the stream is stopped
   * before rethrowing to the caller (which owns the user-facing toast).
   */
  const acceptOrJoinCall = useCallback(async (params: {
    callId: string;
    conversationId: string;
    mode: CallSession['mode'];
    initiatorId: string;
    participants: CallSession['participants'];
    isVideo: boolean;
  }) => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        getCallMediaConstraints(params.isVideo ? 'video' : 'audio')
      );
      (window as any).__preauthorizedMediaStream = stream;

      // Join call via Socket.IO - CallInterface will initialize local stream
      const socket = meeshySocketIOService.getSocket();
      if (!socket) {
        throw new Error('No socket connection');
      }

      const ack = await new Promise<CallJoinAck>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('CALL_JOIN_ACK_TIMEOUT')),
          CALL_JOIN_ACK_TIMEOUT_MS
        );
        socket.emit(
          CLIENT_EVENTS.CALL_JOIN,
          {
            callId: params.callId,
            settings: {
              audioEnabled: true,
              videoEnabled: params.isVideo,
            },
          },
          (response) => {
            clearTimeout(timer);
            resolve(response);
          }
        );
      });

      if (!ack?.success) {
        throw new Error('Failed to join call');
      }

      // Apply the server-provided ICE servers (STUN + time-limited TURN) so
      // the RTCPeerConnection is built with TURN credentials before any SDP
      // is answered/offered.
      if (ack.data?.iceServers?.length) {
        setIceServers(ack.data.iceServers);
      }

      // Create call session in store. `answeredAt` (Vague 110, 2026-08-12) is
      // what VideoCallInterface anchors the visible call-duration clock on —
      // for the callee this IS the answer moment, unlike the caller whose
      // `startedAt` is stamped back at ring-start (use-video-call.ts).
      const answeredAt = new Date();
      setCurrentCall({
        id: params.callId,
        conversationId: params.conversationId,
        mode: params.mode,
        status: 'active',
        initiatorId: params.initiatorId,
        startedAt: answeredAt,
        answeredAt,
        participants: params.participants,
        metadata: { type: params.isVideo ? 'video' : 'audio' },
      } as CallSession);

      // Set call as active
      setInCall(true);
    } catch (error) {
      stopPreauthorizedStream(stream);
      throw error;
    }
  }, [setCurrentCall, setInCall, setIceServers]);

  /**
   * Accept incoming call
   */
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall) return;
    if (acceptingCallIdRef.current === incomingCall.callId) return;
    acceptingCallIdRef.current = incomingCall.callId;

    logger.debug('[CallManager]', 'Accepting call - callId: ' + incomingCall.callId);

    try {
      // Clear timeout since we're accepting
      clearCallTimeout();

      // Stop ringtone immediately
      import('@/utils/ringtone').then(({ stopRingtone }) => {
        stopRingtone();
      }).catch((error) => {
        logger.error('[CallManager]', 'Failed to load ringtone module: ' + error?.message);
      });

      await acceptOrJoinCall({
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        mode: incomingCall.mode,
        initiatorId: incomingCall.initiator.userId,
        participants: incomingCall.participants as CallSession['participants'],
        isVideo: incomingCall.type === 'video',
      });

      // Clear incoming call notification
      setIncomingCall(null);

      logger.info('[CallManager]', 'Call accepted - callId: ' + incomingCall.callId);
    } catch (error: unknown) {
      logger.error('[CallManager]', 'Failed to accept call: ' + ((error as Error)?.message || 'Unknown error'));
      toast.error(t('toasts.joinFailed'));
      setIncomingCall(null);
    } finally {
      acceptingCallIdRef.current = null;
    }
  }, [incomingCall, acceptOrJoinCall, clearCallTimeout, t]);

  /**
   * End & answer (call-waiting swap): hang up the ACTIVE call, then answer the
   * WAITING one. Parity iOS `endCurrentAndAnswerPending` / Android
   * `acceptWaitingSwap` (both hang up → settle → answer). reset() closes the
   * active call's peer connections and stops its tracks (call-store.ts), so no
   * orphaned RTCPeerConnection survives the swap.
   */
  const handleEndAndAnswerWaiting = useCallback(async () => {
    if (!waitingCall) return;
    const swapTo = waitingCall;
    logger.info('[CallManager]', 'End & answer — swapping active call for waiting call ' + swapTo.callId);

    clearWaitingTimeout();
    setWaitingCall(null);

    // 1. End the ACTIVE call on the wire (call:leave, like VideoCallInterface's
    //    hangup) so the gateway ends it and notifies the peer.
    const { currentCall: active } = useCallStore.getState();
    const socket = meeshySocketIOService.getSocket();
    if (socket && active?.id) {
      socket.emit(CLIENT_EVENTS.CALL_LEAVE, {
        callId: active.id,
      });
    }

    // 2. Tear down the active call's WebRTC before answering the waiting one.
    reset();

    // 3. Answer the waiting call — same flow as accepting a fresh incoming call.
    try {
      await acceptOrJoinCall({
        callId: swapTo.callId,
        conversationId: swapTo.conversationId,
        mode: swapTo.mode,
        initiatorId: swapTo.initiator.userId,
        participants: swapTo.participants as CallSession['participants'],
        isVideo: swapTo.type === 'video',
      });
    } catch (error: unknown) {
      logger.error('[CallManager]', 'End & answer failed to join waiting call: ' + ((error as Error)?.message || 'Unknown error'));
      toast.error(t('toasts.joinFailed'));
    }
  }, [waitingCall, clearWaitingTimeout, reset, acceptOrJoinCall, t]);

  /**
   * Reject incoming call
   */
  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;

    logger.debug('[CallManager]', 'Rejecting call - callId: ' + incomingCall.callId);

    // Clear timeout since we're rejecting
    clearCallTimeout();

    // Stop ringtone immediately
    import('@/utils/ringtone').then(({ stopRingtone }) => {
      stopRingtone();
    }).catch((error) => {
      logger.error('[CallManager]', 'Failed to load ringtone module: ' + error?.message);
    });

    // call:end avec reason=rejected (et non call:leave) : le leave pré-décroché
    // terminait bien l'appel 1:1 mais le serveur le résolvait en « missed » —
    // le journal de l'appelant mentait sur un refus explicite. Le end est
    // permis à tout participant actif (P2P, spec C4) et broadcast call:ended
    // immédiatement à l'appelant.
    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      socket.emit(CLIENT_EVENTS.CALL_END, {
        callId: incomingCall.callId,
        reason: 'rejected',
      });
    }

    // Clear notification
    setIncomingCall(null);

    // Toast métier désactivé - utiliser le système de notifications v2
  }, [incomingCall, clearCallTimeout]);

  /**
   * CALL-RESILIENCE — re-enter the call room after the signaling socket
   * reconnects (network blip or gateway restart). Call media is direct P2P
   * (RTCPeerConnection) and survives such a drop untouched; only the
   * signaling socket needs to rejoin the gateway's call room before its
   * reconnect-grace window expires and force-ends an otherwise-healthy call
   * (services/gateway CallEventsHandler DISCONNECT_GRACE_MS). Without this,
   * the socket reconnects and its listeners re-attach, but the gateway never
   * sees it back in the call room, so grace extensions run out and the call
   * is ended server-side even though both peers' media is fine. Mirrors iOS
   * CallManager.didReconnect.
   */
  const rejoinActiveCallAfterReconnect = useCallback((socket: TypedSocket | null) => {
    const { isInCall: activeInCall, currentCall: activeCall } = useCallStore.getState();
    if (!socket || !activeInCall || !activeCall?.id) return;

    const callId = activeCall.id;
    logger.info('[CallManager]', 'Socket reconnected — re-joining call room', { callId });

    socket.emit(
      CLIENT_EVENTS.CALL_JOIN,
      { callId, settings: { audioEnabled: true, videoEnabled: true } },
      (ack) => {
        if (ack?.success) return;
        if (ack?.error?.code === 'CALL_ENDED') {
          logger.warn('[CallManager]', 'Call ended while disconnected — tearing down', { callId });
          // Vague 161 — forward the server's REAL endReason when the gateway
          // sends one (CallAlreadyEndedError, CallService.joinCallAttempt)
          // instead of hardcoding 'completed'. Hardcoding it silently
          // defeated isRetryableCallFailure's offer for the one case this
          // reconnect path exists for: a genuine connectionLost/
          // heartbeatTimeout that lost the race against the gateway's
          // disconnect-grace window while this socket was down.
          handleCallEndedRef.current({
            callId,
            duration: 0,
            endedBy: '',
            reason: ack.error?.endReason ?? 'completed',
          } as CallEndedEvent);
          return;
        }
        logger.warn('[CallManager]', 'Re-join after reconnect failed', { callId, error: ack?.error });
      }
    );
  }, []);

  /**
   * Live call bubble → join (cold-rehydration path). The bubble
   * (`CallSystemMessage`, message kind 'call-live') owns no media/UI: it
   * poses a `requestJoin` on the call store, consumed here. The call is
   * revalidated via REST (`GET /conversations/:id/active-call`) — no
   * dependency on a previously received `call:initiated` socket event, so a
   * page reloaded mid-call can still join. A call that ended in the meantime
   * surfaces a toast instead of a broken join.
   */
  useEffect(() => {
    if (!joinRequest) return;
    const request = joinRequest;
    clearJoinRequest();

    // Guard: already in a call — the store's requestJoin also refuses this,
    // but the state may have changed between the tap and this effect.
    if (useCallStore.getState().isInCall) return;

    void (async () => {
      try {
        const response = await callsService.getActiveCall(request.conversationId);
        const session = response.success ? response.data : null;
        const isJoinable = !!session
          && session.id === request.callId
          && !CALL_TERMINAL_STATUSES.includes(session.status);
        if (!isJoinable) {
          toast.info(t('toasts.callAlreadyEnded'));
          return;
        }

        logger.info('[CallManager]', 'Joining ongoing call from live bubble', { callId: session.id });
        await acceptOrJoinCall({
          callId: session.id,
          conversationId: request.conversationId,
          mode: session.mode,
          initiatorId: session.initiatorId,
          participants: session.participants ?? [],
          isVideo: request.callType === 'video',
        });
      } catch (error: unknown) {
        logger.error('[CallManager]', 'Failed to join ongoing call from bubble: ' + ((error as Error)?.message || 'Unknown error'));
        toast.error(t('toasts.joinFailed'));
      }
    })();
  }, [joinRequest, clearJoinRequest, acceptOrJoinCall, t]);

  // Stable refs for all handlers - prevents useEffect re-fires on every render
  const handleIncomingCallRef = useRef(handleIncomingCall);
  const handleParticipantJoinedRef = useRef(handleParticipantJoined);
  const handleParticipantLeftRef = useRef(handleParticipantLeft);
  const handleCallEndedRef = useRef(handleCallEnded);
  const handleAnsweredElsewhereRef = useRef(handleAnsweredElsewhere);
  const handleMediaToggleRef = useRef(handleMediaToggle);
  const handleCallErrorRef = useRef(handleCallError);

  // Keep refs in sync (no dep array = runs every render, which is correct for refs)
  useEffect(() => {
    handleIncomingCallRef.current = handleIncomingCall;
    handleParticipantJoinedRef.current = handleParticipantJoined;
    handleParticipantLeftRef.current = handleParticipantLeft;
    handleCallEndedRef.current = handleCallEnded;
    handleAnsweredElsewhereRef.current = handleAnsweredElsewhere;
    handleMediaToggleRef.current = handleMediaToggle;
    handleCallErrorRef.current = handleCallError;
  });

  /**
   * Setup Socket.IO listeners
   * Attaches once on user.id change, uses connect event instead of polling
   */
  useEffect(() => {
    if (isChecking || !user?.id) return;

    let isSubscribed = true;
    let debugListenerRef: ((eventName: string, ...args: unknown[]) => void) | null = null;
    // Regression: `socket.off(EVENT)` with no handler argument removes EVERY
    // listener registered for that event name — not just this component's
    // own. `attachListeners` re-runs on every reconnect while a call is
    // active, so this used to silently delete a sibling component's listener
    // for the same event (VideoCallInterface also listens for
    // CALL_PARTICIPANT_LEFT). Track our own bound functions so cleanup only
    // ever removes exactly those.
    let attachedListeners: Record<string, (...args: unknown[]) => void> | null = null;

    const attachListeners = (socket: TypedSocket | null) => {
      if (!isSubscribed || !socket?.connected) return;

      // Cleanup this component's OWN previously-attached listeners only.
      if (attachedListeners) {
        socket.off(SERVER_EVENTS.CALL_INITIATED, attachedListeners[SERVER_EVENTS.CALL_INITIATED]);
        socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_JOINED]);
        socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_LEFT]);
        socket.off(SERVER_EVENTS.CALL_ENDED, attachedListeners[SERVER_EVENTS.CALL_ENDED]);
        socket.off(SERVER_EVENTS.CALL_ALREADY_ANSWERED, attachedListeners[SERVER_EVENTS.CALL_ALREADY_ANSWERED]);
        socket.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED, attachedListeners[SERVER_EVENTS.CALL_MEDIA_TOGGLED]);
        socket.off(SERVER_EVENTS.CALL_ERROR, attachedListeners[SERVER_EVENTS.CALL_ERROR]);
        socket.off(SERVER_EVENTS.CALL_FORCE_LEAVE, attachedListeners[SERVER_EVENTS.CALL_FORCE_LEAVE]);
      }
      if (debugListenerRef) socket.offAny(debugListenerRef);

      // Debug listener for call events
      debugListenerRef = (eventName: string, ...args: unknown[]) => {
        if (eventName.startsWith('call:')) {
          console.log('📡 [CallManager] Socket event:', eventName, args);
        }
      };
      socket.onAny(debugListenerRef);

      // Attach via refs (stable references that don't cause re-fires)
      attachedListeners = {
        // `attachedListeners` is a heterogeneous bag keyed by event name — its
        // storage type stays a loose `(...args: unknown[]) => void` (needed
        // for the uniform on/off/off-by-name calls below), so each entry
        // narrows its own `unknown` payload to the event's real shape right
        // at the boundary where the server contract guarantees it, instead of
        // erasing the whole socket's type the way `(socket as unknown)` did.
        [SERVER_EVENTS.CALL_INITIATED]: (data: unknown) => handleIncomingCallRef.current(data as CallInitiatedEvent),
        [SERVER_EVENTS.CALL_PARTICIPANT_JOINED]: (data: unknown) => handleParticipantJoinedRef.current(data as CallParticipantJoinedEvent),
        [SERVER_EVENTS.CALL_PARTICIPANT_LEFT]: (data: unknown) => handleParticipantLeftRef.current(data as CallParticipantLeftEvent),
        [SERVER_EVENTS.CALL_ENDED]: (data: unknown) => handleCallEndedRef.current(data as CallEndedEvent),
        [SERVER_EVENTS.CALL_ALREADY_ANSWERED]: (data: unknown) => handleAnsweredElsewhereRef.current(data as { callId: string }),
        [SERVER_EVENTS.CALL_MEDIA_TOGGLED]: (data: unknown) => handleMediaToggleRef.current(data as CallMediaToggleEvent),
        [SERVER_EVENTS.CALL_ERROR]: (data: unknown) => handleCallErrorRef.current(data as CallError),
        // `call:force-leave` — le serveur sort CE destinataire de l'appel,
        // qui continue pour les autres (fin d'appartenance : quitté, banni,
        // retiré, fil supprimé pour soi). Distinct de `call:participant-left`,
        // qui parle d'un PAIR : celui-ci dit « c'est toi qu'on sort », et
        // c'est le seul chemin par lequel cet onglet l'apprend — ses sockets
        // viennent d'être évincées de la room de l'appel.
        //
        // Délégué à `handleCallEnded`, qui porte déjà toute la descente
        // (garde sur le callId suivi, extinction de la sonnerie, `reset()`,
        // promotion d'un appel en attente) — même délégation que l'ACK
        // `CALL_ENDED` du re-join après reconnexion plus haut. Raison
        // `completed` : rien n'a échoué, et aucune offre « Réessayer » ne doit
        // être posée pour un appel qu'on n'a plus le droit de rejoindre.
        [SERVER_EVENTS.CALL_FORCE_LEAVE]: (data: unknown) => {
          const event = data as { callId?: string; reason?: string };
          if (!event?.callId) return;
          logger.warn('[CallManager]', 'Forced out of call by server - callId: ' + event.callId + ', reason: ' + (event.reason ?? 'unspecified'));
          handleCallEndedRef.current({
            callId: event.callId,
            duration: 0,
            endedBy: '',
            reason: 'completed',
          } as CallEndedEvent);
        },
      };
      socket.on(SERVER_EVENTS.CALL_INITIATED, attachedListeners[SERVER_EVENTS.CALL_INITIATED]);
      socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_JOINED]);
      socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_LEFT]);
      socket.on(SERVER_EVENTS.CALL_ENDED, attachedListeners[SERVER_EVENTS.CALL_ENDED]);
      socket.on(SERVER_EVENTS.CALL_ALREADY_ANSWERED, attachedListeners[SERVER_EVENTS.CALL_ALREADY_ANSWERED]);
      socket.on(SERVER_EVENTS.CALL_MEDIA_TOGGLED, attachedListeners[SERVER_EVENTS.CALL_MEDIA_TOGGLED]);
      socket.on(SERVER_EVENTS.CALL_ERROR, attachedListeners[SERVER_EVENTS.CALL_ERROR]);
      socket.on(SERVER_EVENTS.CALL_FORCE_LEAVE, attachedListeners[SERVER_EVENTS.CALL_FORCE_LEAVE]);

      console.log('✅ [CallManager] All call listeners registered', {
        socketId: socket.id,
        userId: user?.id,
        listenersCount: 8
      });
    };

    // Ask the server to replay any in-progress (ringing) call this socket
    // missed — a call that started while the tab was reloading, asleep, or
    // between a brief WebSocket drop and its reconnect. The live
    // `call:initiated` broadcast only reaches sockets already in the user's
    // room at the moment of `call:initiate`; without this, a web callee whose
    // socket (re)connects mid-ring never sees the incoming-call banner and
    // the call silently rings out to `missed`. Fired on EVERY connect
    // (first or reconnect) — mirrors iOS `MessageSocketManager`'s
    // unconditional `call:check-active` emit on connect. Idempotent: the
    // gateway scopes the replay to the 60s ringing window and the client
    // dedups by callId (see CallEventsHandler.ts `call:check-active`).
    const checkForActiveCall = (socket: TypedSocket | null) => {
      // Only ever invoked from an already-established `connect` context
      // (initial-connected branch, the `connect` event itself, or the
      // socket-becomes-available poll below), so `.connected` is implied —
      // mirrors how `attachListeners` is invoked from the same call sites.
      if (socket) socket.emit(CLIENT_EVENTS.CALL_CHECK_ACTIVE);
    };

    // Try immediately if socket already connected
    const socket = meeshySocketIOService.getSocket();
    // This effect instance hasn't observed a connect yet; if the socket is
    // already connected, that counts as the initial connect (nothing to
    // rejoin — the call was joined explicitly via handleAcceptCall/initiate).
    hasConnectedRef.current = socket?.connected === true;
    if (socket?.connected) {
      attachListeners(socket);
      checkForActiveCall(socket);
    }

    // Listen for future connections (instead of polling with setTimeout)
    const onConnect = () => {
      const s = meeshySocketIOService.getSocket();
      if (s) attachListeners(s);
      checkForActiveCall(s);

      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      rejoinActiveCallAfterReconnect(s);
    };

    // If socket exists, listen for connect event
    if (socket) {
      socket.on('connect', onConnect);
    }

    // If socket is null at mount, poll until it becomes available (#4)
    let socketPollInterval: ReturnType<typeof setInterval> | null = null;
    if (!socket) {
      socketPollInterval = setInterval(() => {
        if (!isSubscribed) return;
        const s = meeshySocketIOService.getSocket();
        if (s) {
          if (socketPollInterval) clearInterval(socketPollInterval);
          socketPollInterval = null;
          s.on('connect', onConnect);
          if (s.connected) {
            hasConnectedRef.current = true;
            attachListeners(s);
            checkForActiveCall(s);
          }
        }
      }, 1000);
    }

    return () => {
      isSubscribed = false;
      if (socketPollInterval) clearInterval(socketPollInterval);
      const s = meeshySocketIOService.getSocket();
      if (s) {
        s.off('connect', onConnect);
        if (debugListenerRef) s.offAny(debugListenerRef);
        if (attachedListeners) {
          s.off(SERVER_EVENTS.CALL_INITIATED, attachedListeners[SERVER_EVENTS.CALL_INITIATED]);
          s.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_JOINED]);
          s.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_LEFT]);
          s.off(SERVER_EVENTS.CALL_ENDED, attachedListeners[SERVER_EVENTS.CALL_ENDED]);
          s.off(SERVER_EVENTS.CALL_ALREADY_ANSWERED, attachedListeners[SERVER_EVENTS.CALL_ALREADY_ANSWERED]);
          s.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED, attachedListeners[SERVER_EVENTS.CALL_MEDIA_TOGGLED]);
          s.off(SERVER_EVENTS.CALL_ERROR, attachedListeners[SERVER_EVENTS.CALL_ERROR]);
          s.off(SERVER_EVENTS.CALL_FORCE_LEAVE, attachedListeners[SERVER_EVENTS.CALL_FORCE_LEAVE]);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isChecking]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Clear timeouts on unmount — both the no-answer timeout AND the
      // call-waiting auto-decline timeout. Missing the latter left an
      // orphaned setTimeout that, 45s after unmount, would still call
      // rejectWaitingCall() — a real call:end emit — for a component nothing
      // is observing anymore.
      clearCallTimeout();
      clearWaitingTimeout();

      if (isInCall) {
        logger.debug('[CallManager]', 'Cleaning up on unmount');
        reset();
        // CallInterface will handle WebRTC cleanup
      }
    };
  }, [isInCall, reset, clearCallTimeout, clearWaitingTimeout]);

  if (process.env.NODE_ENV === 'development') {
    console.log('[CallManager] Rendering:', {
      incomingCall: !!incomingCall,
      incomingCallId: incomingCall?.callId,
      isInCall,
      currentCallId: currentCall?.id,
      userId: user?.id,
      willShowNotification: !!incomingCall,
      willShowInterface: !!(isInCall && currentCall && user?.id)
    });
  }

  return (
    <>
      {/* Incoming Call Notification */}
      {incomingCall && (
        <CallNotification
          call={incomingCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Call-waiting banner — a second incoming call while already busy */}
      {waitingCall && (
        <CallWaitingBanner
          call={waitingCall}
          onReject={handleRejectWaiting}
          onEndAndAnswer={handleEndAndAnswerWaiting}
        />
      )}

      {/* Active Call Interface */}
      {isInCall && currentCall && user?.id && (
        <CallErrorBoundary>
          <VideoCallInterface callId={currentCall.id} />
        </CallErrorBoundary>
      )}
    </>
  );
}
