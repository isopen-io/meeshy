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
import { VideoCallInterface } from '@/components/video-calls/VideoCallInterface';
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
} from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { getCallMediaConstraints, stopPreauthorizedStream } from '@/lib/calls/call-media-constraints';

const CALL_TIMEOUT_MS = 30000; // 30 seconds

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
    removeRemoteStream,
    removePeerConnection,
    startHeartbeat,
    stopHeartbeat,
  } = useCallStore();

  const [incomingCall, setIncomingCall] = useState<CallInitiatedEvent | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
   * Start call timeout - auto-cleanup after 30s if no one joins
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
          (socket as unknown).emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
        }

        // Reset local state
        reset();
        setIncomingCall(null);

        // Toast métier désactivé - utiliser le système de notifications v2
      }
    }, CALL_TIMEOUT_MS);

    logger.debug('[CallManager]', `Call timeout started - ${CALL_TIMEOUT_MS/1000}s`);
  }, [clearCallTimeout, reset]);

  /**
   * Bug fix (2026-07-06, follow-up to the 682c35279 P0 fix) — the initiator's
   * own outgoing call never reaches this component via `call:initiated`: the
   * gateway deliberately never re-emits that event back to the initiator's
   * own socket, so `startCall`'s ack handler (use-video-call.ts) sets
   * `currentCall` directly instead. That path has no reference to
   * `startCallTimeout`, so the initiator's 30s no-answer auto-cleanup never
   * armed for the caller — only the callee (via `handleIncomingCall`) had
   * one. Arm it here, reactively, the moment the initiator's own call
   * becomes current in `initiated` status; `handleParticipantJoined` already
   * clears it the instant someone actually joins.
   */
  useEffect(() => {
    if (!user || !currentCall) return;
    if (currentCall.status !== 'initiated') return;
    if (currentCall.initiatorId !== user.id) return;
    startCallTimeout(currentCall.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.id, currentCall?.status, currentCall?.initiatorId, user?.id]);

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
      });

      // Set call as active - CallInterface will initialize local stream
      setInCall(true);

      // Start timeout to auto-cleanup if no one joins
      startCallTimeout(event.callId);

      // Toast métier désactivé - utiliser le système de notifications v2
    } else {
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
  }, [user?.id, setCurrentCall, setInCall, isInCall, currentCall, startCallTimeout]);

  /**
   * Handle participant joined
   */
  const handleParticipantJoined = useCallback(
    (event: CallParticipantJoinedEvent) => {
      logger.info('[CallManager]', 'Participant joined - callId: ' + event.callId + ', participantId: ' + event.participant.id);

      // Clear timeout since someone joined
      clearCallTimeout();

      // Apply the per-user ICE servers (STUN + time-limited TURN) the gateway
      // attaches to participant-joined, so the initiator's RTCPeerConnection is
      // built with TURN credentials before the SDP offer is created.
      if (event.iceServers?.length) {
        setIceServers(event.iceServers);
      }

      // Add participant to call
      addParticipant(event.participant);

      // Update call status to 'active' if it was 'initiated'
      const { currentCall } = useCallStore.getState();
      if (currentCall && currentCall.status === 'initiated') {
        setCurrentCall({
          ...currentCall,
          status: 'active',
        });
      }

      // Note: CallInterface will handle creating the WebRTC offer
      // based on currentCall.initiatorId check

      // Toast métier désactivé - utiliser le système de notifications v2
    },
    [addParticipant, setCurrentCall, setIceServers, clearCallTimeout]
  );

  /**
   * Handle participant left
   */
  const handleParticipantLeft = useCallback(
    (event: CallParticipantLeftEvent) => {
      logger.info('[CallManager]', 'Participant left - callId: ' + event.callId + ', participantId: ' + event.participantId, {
        userId: event.userId,
        anonymousId: (event as unknown).anonymousId,
        mode: event.mode
      });

      // Use userId for WebRTC cleanup (peer connections and streams are tracked by userId)
      const userIdForCleanup = event.userId || (event as unknown).anonymousId;

      if (userIdForCleanup) {
        // Remove their stream and peer connection (tracked by userId)
        removeRemoteStream(userIdForCleanup);
        removePeerConnection(userIdForCleanup);
      } else {
        console.warn('⚠️ [CallManager] No userId or anonymousId for cleanup!', event);
      }

      // Remove participant from call (tracked by database participantId)
      removeParticipant(event.participantId);

      // Toast métier désactivé - utiliser le système de notifications v2
    },
    [removeParticipant, removeRemoteStream, removePeerConnection]
  );

  /**
   * Handle call ended
   */
  const handleCallEnded = useCallback(
    (event: CallEndedEvent) => {
      logger.info('[CallManager]', 'Call ended - callId: ' + event.callId + ', duration: ' + event.duration);

      // Clear timeout
      clearCallTimeout();

      // Reset call state - CallInterface will handle WebRTC cleanup
      reset();

      // Clear incoming call notification
      setIncomingCall(null);

      // Toast métier désactivé - utiliser le système de notifications v2
    },
    [reset, clearCallTimeout]
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
      if (!incomingCall || incomingCall.callId !== event.callId) return;

      logger.info('[CallManager]', 'Call answered on another device - dismissing ring - callId: ' + event.callId);

      import('@/utils/ringtone').then(({ stopRingtone }) => {
        stopRingtone();
      });
      clearCallTimeout();
      setIncomingCall(null);
    },
    [incomingCall, clearCallTimeout]
  );

  /**
   * Handle media toggle (remote participant)
   */
  const handleMediaToggle = useCallback(
    (event: CallMediaToggleEvent) => {
      logger.debug('[CallManager]', 'Media toggle - participantId: ' + event.participantId + ', type: ' + event.mediaType + ', enabled: ' + event.enabled);

      // Update participant state
      if (event.mediaType === 'audio') {
        updateParticipant(event.participantId, {
          isAudioEnabled: event.enabled,
        });
      } else if (event.mediaType === 'video') {
        updateParticipant(event.participantId, {
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
   * Accept incoming call
   */
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall) return;
    if (acceptingCallIdRef.current === incomingCall.callId) return;
    acceptingCallIdRef.current = incomingCall.callId;

    logger.debug('[CallManager]', 'Accepting call - callId: ' + incomingCall.callId);

    const isVideoCall = incomingCall.type === 'video';
    let stream: MediaStream | null = null;

    try {
      // Clear timeout since we're accepting
      clearCallTimeout();

      // Stop ringtone immediately
      import('@/utils/ringtone').then(({ stopRingtone }) => {
        stopRingtone();
      }).catch((error) => {
        logger.error('[CallManager]', 'Failed to load ringtone module: ' + error?.message);
      });

      // Privacy fix (audit 2026-07-07): acquire local media BEFORE joining,
      // gated on the call's ACTUAL type — mirrors the caller's own
      // pre-authorization in use-video-call.ts's startCall. Previously the
      // callee never called getUserMedia here at all; VideoCallInterface's
      // mount effect fell back to unconditional audio+video constraints
      // (DEFAULT_MEDIA_CONSTRAINTS in webrtc-service.ts) regardless of call
      // type, so an audio-only call still activated the callee's camera and
      // transmitted live video with no consent. Handing the stream off via
      // `__preauthorizedMediaStream` reuses the same Safari-compatible path
      // VideoCallInterface already checks on mount — no changes needed there.
      stream = await navigator.mediaDevices.getUserMedia(
        getCallMediaConstraints(isVideoCall ? 'video' : 'audio')
      );
      (window as any).__preauthorizedMediaStream = stream;

      // Join call via Socket.IO - CallInterface will initialize local stream
      const socket = meeshySocketIOService.getSocket();
      if (!socket) {
        throw new Error('No socket connection');
      }

      // Vague 19 — the join must be confirmed via its ack before the UI
      // commits to "in call": the gateway can reject call:join at any point
      // right up to the moment the caller hangs up (already-ended call,
      // no-longer-a-participant, rate limit, etc.), and previously this ack
      // was only used to opportunistically apply ICE servers while
      // setCurrentCall/setInCall/setIncomingCall(null) ran unconditionally
      // right after emit() — a rejected join still left the callee staring
      // at a fully-mounted VideoCallInterface with no peer connection ever
      // formed. Mirrors the already-correct ack check in the sibling
      // (but unwired) `answerCall` in hooks/conversations/use-video-call.ts.
      const ack = await new Promise<{ success?: boolean; data?: { iceServers?: RTCIceServer[] } }>((resolve) => {
        (socket as unknown).emit(
          CLIENT_EVENTS.CALL_JOIN,
          {
            callId: incomingCall.callId,
            settings: {
              audioEnabled: true,
              videoEnabled: isVideoCall,
            },
          },
          resolve
        );
      });

      if (!ack?.success) {
        throw new Error('Failed to join call');
      }

      // Apply the server-provided ICE servers (STUN + time-limited TURN) so
      // the callee's RTCPeerConnection is built with TURN credentials before
      // the incoming SDP offer is answered.
      if (ack.data?.iceServers?.length) {
        setIceServers(ack.data.iceServers);
      }

      // Create call session in store
      setCurrentCall({
        id: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        mode: incomingCall.mode,
        status: 'active',
        initiatorId: incomingCall.initiator.userId,
        startedAt: new Date(),
        participants: incomingCall.participants,
      });

      // Set call as active
      setInCall(true);

      // Clear incoming call notification
      setIncomingCall(null);

      logger.info('[CallManager]', 'Call accepted - callId: ' + incomingCall.callId);
    } catch (error: unknown) {
      // A failure anywhere after getUserMedia succeeded (no socket, rejected
      // join ack) must not leave the mic/camera hot with nothing consuming
      // the stream.
      stopPreauthorizedStream(stream);
      logger.error('[CallManager]', 'Failed to accept call: ' + (error?.message || 'Unknown error'));
      toast.error(t('calls.toasts.joinFailed'));
      setIncomingCall(null);
    } finally {
      acceptingCallIdRef.current = null;
    }
  }, [incomingCall, setCurrentCall, setInCall, setIceServers, clearCallTimeout]);

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

    // Emit leave event
    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as unknown).emit(CLIENT_EVENTS.CALL_LEAVE, {
        callId: incomingCall.callId,
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
  const rejoinActiveCallAfterReconnect = useCallback((socket: unknown) => {
    const { isInCall: activeInCall, currentCall: activeCall } = useCallStore.getState();
    if (!socket || !activeInCall || !activeCall?.id) return;

    const callId = activeCall.id;
    logger.info('[CallManager]', 'Socket reconnected — re-joining call room', { callId });

    (socket as unknown).emit(
      CLIENT_EVENTS.CALL_JOIN,
      { callId, settings: { audioEnabled: true, videoEnabled: true } },
      (ack: { success?: boolean; error?: { code?: string; message?: string } }) => {
        if (ack?.success) return;
        if (ack?.error?.code === 'CALL_ENDED') {
          logger.warn('[CallManager]', 'Call ended while disconnected — tearing down', { callId });
          handleCallEndedRef.current({
            callId,
            duration: 0,
            endedBy: '',
            reason: 'completed',
          } as CallEndedEvent);
          return;
        }
        logger.warn('[CallManager]', 'Re-join after reconnect failed', { callId, error: ack?.error });
      }
    );
  }, []);

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

    const attachListeners = (socket: unknown) => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Socket.IO listener args are typed by the handler ref
        [SERVER_EVENTS.CALL_INITIATED]: (data: any) => handleIncomingCallRef.current(data),
        [SERVER_EVENTS.CALL_PARTICIPANT_JOINED]: (data: unknown) => handleParticipantJoinedRef.current(data),
        [SERVER_EVENTS.CALL_PARTICIPANT_LEFT]: (data: unknown) => handleParticipantLeftRef.current(data),
        [SERVER_EVENTS.CALL_ENDED]: (data: unknown) => handleCallEndedRef.current(data),
        [SERVER_EVENTS.CALL_ALREADY_ANSWERED]: (data: unknown) => handleAnsweredElsewhereRef.current(data as { callId: string }),
        [SERVER_EVENTS.CALL_MEDIA_TOGGLED]: (data: unknown) => handleMediaToggleRef.current(data),
        [SERVER_EVENTS.CALL_ERROR]: (data: unknown) => handleCallErrorRef.current(data),
      };
      socket.on(SERVER_EVENTS.CALL_INITIATED, attachedListeners[SERVER_EVENTS.CALL_INITIATED]);
      socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_JOINED]);
      socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, attachedListeners[SERVER_EVENTS.CALL_PARTICIPANT_LEFT]);
      socket.on(SERVER_EVENTS.CALL_ENDED, attachedListeners[SERVER_EVENTS.CALL_ENDED]);
      socket.on(SERVER_EVENTS.CALL_ALREADY_ANSWERED, attachedListeners[SERVER_EVENTS.CALL_ALREADY_ANSWERED]);
      socket.on(SERVER_EVENTS.CALL_MEDIA_TOGGLED, attachedListeners[SERVER_EVENTS.CALL_MEDIA_TOGGLED]);
      socket.on(SERVER_EVENTS.CALL_ERROR, attachedListeners[SERVER_EVENTS.CALL_ERROR]);

      console.log('✅ [CallManager] All call listeners registered', {
        socketId: socket.id,
        userId: user?.id,
        listenersCount: 7
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
    const checkForActiveCall = (socket: unknown) => {
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
          s.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED, attachedListeners[SERVER_EVENTS.CALL_MEDIA_TOGGLED]);
          s.off(SERVER_EVENTS.CALL_ERROR, attachedListeners[SERVER_EVENTS.CALL_ERROR]);
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
      // Clear timeout on unmount
      clearCallTimeout();

      if (isInCall) {
        logger.debug('[CallManager]', 'Cleaning up on unmount');
        reset();
        // CallInterface will handle WebRTC cleanup
      }
    };
  }, [isInCall, reset, clearCallTimeout]);

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

      {/* Active Call Interface */}
      {isInCall && currentCall && user?.id && (
        <VideoCallInterface callId={currentCall.id} />
      )}
    </>
  );
}
