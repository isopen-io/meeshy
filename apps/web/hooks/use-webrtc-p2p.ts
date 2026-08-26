/**
 * USE WEBRTC P2P HOOK
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages P2P WebRTC connections and signaling via Socket.IO
 */

'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { WebRTCService, type VideoQualityTier } from '@/services/webrtc-service';
import { useCallStore } from '@/stores/call-store';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import type {
  CallSignalEvent,
  WebRTCSignal,
  CALL_ERROR_CODES,
  CallRequestIceServersEvent,
  CallIceServersRefreshedEvent,
} from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

export interface UseWebRTCP2POptions {
  callId: string;
  userId?: string;
  onError?: (error: Error) => void;
  onConnected?: () => void;
}

// Gap fix (2026-07-07) — the gateway has always exposed a full TURN
// credential refresh round-trip (`call:request-ice-servers` /
// `call:ice-servers-refreshed`, mirroring the HMAC secret's rotation TTL) and
// iOS has consumed it since the SOTA reliability pass, but web never had a
// single call site for either event: a call outliving the TURN credential
// TTL (default ~3600s) with no refresh armed would silently retry ICE
// restarts with expired credentials, unrecoverable for a peer behind
// symmetric NAT. This default is a conservative fallback for the FIRST
// refresh only — the real TTL from the server response reschedules every
// refresh after that (see `scheduleTurnRefresh` below).
const DEFAULT_TURN_CREDENTIAL_TTL_SECONDS = 3600;

// Aggregation order for `RTCPeerConnectionState` across every participant in
// the call — best state present wins. Checking 'connected' first means a
// group call where one peer is healthy and another has just failed still
// reads as 'connected' overall; 'failed' can only win when it is the ONLY
// state left in the map, i.e. every participant's connection has failed.
const CONNECTION_STATE_PRIORITY: RTCPeerConnectionState[] = [
  'connected',
  'connecting',
  'new',
  'disconnected',
  'closed',
  'failed',
];

// Same idea for `RTCIceConnectionState` (a superset with 'completed'/'checking').
const ICE_CONNECTION_STATE_PRIORITY: RTCIceConnectionState[] = [
  'connected',
  'completed',
  'checking',
  'new',
  'disconnected',
  'closed',
  'failed',
];

/**
 * Reduces one `RTCPeerConnectionState` per participant to a single call-wide
 * value. Group calls (Vague — cap lifted 2026-08-13) hold one
 * `RTCPeerConnection` per remote participant; before this, `connectionState`
 * was a bare `useState` last-writer-wins across every `onConnectionStateChange`
 * callback, so ONE peer failing (e.g. a straggler still negotiating) flipped
 * the whole call to 'failed' and fired the global error toast/`onError` even
 * while every other peer stayed connected.
 */
function aggregateConnectionState(
  states: Map<string, RTCPeerConnectionState>
): RTCPeerConnectionState {
  if (states.size === 0) return 'new';
  const present = new Set(states.values());
  return CONNECTION_STATE_PRIORITY.find((candidate) => present.has(candidate)) ?? 'new';
}

/** ICE counterpart of {@link aggregateConnectionState} — same last-writer-wins bug (W4). */
function aggregateIceConnectionState(
  states: Map<string, RTCIceConnectionState>
): RTCIceConnectionState {
  if (states.size === 0) return 'new';
  const present = new Set(states.values());
  return ICE_CONNECTION_STATE_PRIORITY.find((candidate) => present.has(candidate)) ?? 'new';
}

export function useWebRTCP2P({ callId, userId, onError, onConnected }: UseWebRTCP2POptions) {
  const {
    localStream,
    iceServers,
    setLocalStream,
    addRemoteStream,
    addPeerConnection,
    removePeerConnection,
    setError,
    setConnecting,
  } = useCallStore();

  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>('new');
  // Real mid-call stall signal, derived from stalledPeersRef — unlike
  // connectionState (an RTCPeerConnectionState, which never carries the
  // string 'reconnecting'), this is what callers (e.g. call:analytics'
  // reconnectionCount) must observe to detect an actual reconnect.
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Per-participant connection/ICE state, reduced to the call-wide scalars
  // returned below via aggregateConnectionState/aggregateIceConnectionState
  // (W4 fix — see their doc comments). lastAggregated*Ref tracks the
  // previously EMITTED aggregate so the global error/success side effects
  // (toast, setError, onError) fire only on a genuine transition, never once
  // per participant.
  const connectionStatesRef = useRef<Map<string, RTCPeerConnectionState>>(new Map());
  const iceConnectionStatesRef = useRef<Map<string, RTCIceConnectionState>>(new Map());
  const lastAggregatedConnectionStateRef = useRef<RTCPeerConnectionState>('new');

  // Store WebRTC services per participant
  const webrtcServicesRef = useRef<Map<string, WebRTCService>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Tracks participants whose remote description has been applied. A remote
  // ICE candidate cannot be added before setRemoteDescription (it throws
  // InvalidStateError), so candidates that arrive earlier MUST be buffered
  // until the offer/answer has been set — not merely until the service exists.
  const remoteDescriptionSetRef = useRef<Set<string>>(new Set());
  // Tracks participants whose initial offer is currently being processed
  // (between receipt and remote-description-applied). The gateway both
  // relays an offer live AND buffers it for replay on the recipient's next
  // `call:join` (socket churn/reconnect recovery) — the same browser tab can
  // legitimately receive the same initial offer twice. `handleOffer` awaits
  // local media before it creates the peer connection / registers in
  // `webrtcServicesRef` and `remoteDescriptionSetRef`, so a second delivery
  // arriving in that window sees no existing/established service and would
  // otherwise re-run `handleOffer`, calling `createPeerConnection` twice on
  // the same `WebRTCService` and silently orphaning the first
  // `RTCPeerConnection`. This ref closes that window synchronously.
  const offerInFlightRef = useRef<Set<string>>(new Set());
  // TURN credential refresh timer — see DEFAULT_TURN_CREDENTIAL_TTL_SECONDS doc above.
  const turnRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reconnexion mid-call (parité iOS/Android) : par participant, « a déjà
  // connecté » et « en stall », pour n'émettre call:reconnecting/reconnected
  // qu'aux VRAIS edges mid-call — l'ICE pré-connexion est la phase Connecting,
  // jamais un stall. Le restart lui-même vit dans webrtc-service (grace timer
  // + restartIce SOTA) ; ici on tient seulement le serveur informé pour qu'il
  // suspende son cleanup et que le statut/analytics reflètent la reconnexion.
  const connectedPeersRef = useRef<Set<string>>(new Set());
  const stalledPeersRef = useRef<Set<string>>(new Set());
  const reconnectAttemptRef = useRef(0);
  // Negotiation epoch tracking (glare/stale-signal guard — mirrors iOS
  // CallManager's per-peer negotiationId high-water mark; see
  // packages/shared/types/video-call.ts WebRTCSignalBase.negotiationId).
  // Web never stamped this field: when an iOS caller sent the initial offer
  // (epoch 1), web's answer carried no negotiationId, which iOS's own
  // stale-signal guard reads as epoch 0 — strictly less than its own
  // high-water mark of 1 — and silently drops as stale. The iOS caller then
  // timed out waiting for an answer the web callee had actually sent.
  // Keyed per peer since one tab can hold connections to several participants.
  const negotiationIdsRef = useRef<Map<string, number>>(new Map());

  const bumpOutgoingNegotiationId = useCallback((peerId: string): number => {
    const next = (negotiationIdsRef.current.get(peerId) ?? 0) + 1;
    negotiationIdsRef.current.set(peerId, next);
    return next;
  }, []);

  const currentNegotiationId = useCallback((peerId: string): number => {
    return negotiationIdsRef.current.get(peerId) ?? 0;
  }, []);

  const trackIncomingNegotiationId = useCallback((peerId: string, incoming: number | undefined): void => {
    const generation = incoming ?? 0;
    const current = negotiationIdsRef.current.get(peerId) ?? 0;
    if (generation > current) {
      negotiationIdsRef.current.set(peerId, generation);
    }
  }, []);

  /**
   * Replay/staleness guard for a renegotiation signal on an
   * ALREADY-ESTABLISHED connection (security audit 2026-08-17). Unlike the
   * initial offer/answer, `handleRenegotiationOffer`/`setRemoteAnswer` apply
   * straight to the live `RTCPeerConnection` with no epoch check of their
   * own — without this guard, a captured older signal (replayed by a
   * misbehaving client, or delivered out of order by the relay) is applied
   * as if it were current, forcing a spurious renegotiation with stale
   * codec/direction state against an established call.
   *
   * Compares against the per-peer high-water mark BEFORE this signal would
   * raise it (`trackIncomingNegotiationId` only ever raises, never rejects).
   * Gated on `priorEpoch > 0` so a signal is only ever judged stale once
   * we've tracked at least one real epoch for this peer — an older/legacy
   * sender that never stamps `negotiationId` (`undefined`) is treated as
   * fresh, unchanged from the pre-existing default behavior.
   *
   * Offers and answers are NOT symmetric here. A renegotiation OFFER always
   * represents a NEW epoch bumped by its sender (`bumpOutgoingNegotiationId`)
   * — anything at or below what we've already tracked is a duplicate/replay,
   * so `<=` is stale. An ANSWER instead ECHOES the epoch of the offer it's
   * responding to (`onLocalDescription` above sends `currentNegotiationId`,
   * never a bump) — exactly matching our own last-sent offer epoch is the
   * expected, fresh case; only a STRICTLY older epoch (superseded by an
   * offer we've since sent) is stale.
   */
  const isStaleNegotiation = useCallback(
    (peerId: string, negotiationId: number | undefined, signalType: 'offer' | 'answer'): boolean => {
      if (negotiationId === undefined) return false;
      const priorEpoch = negotiationIdsRef.current.get(peerId) ?? 0;
      if (priorEpoch === 0) return false;
      return signalType === 'offer' ? negotiationId <= priorEpoch : negotiationId < priorEpoch;
    },
    []
  );

  /** Emits `call:request-ice-servers`; the response is applied by the
   * `call:ice-servers-refreshed` listener registered below. */
  const requestFreshTurnCredentials = useCallback(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;
    socket.emit(CLIENT_EVENTS.CALL_REQUEST_ICE_SERVERS, { callId } as CallRequestIceServersEvent);
    logger.debug('[useWebRTCP2P]', 'Requested fresh TURN credentials', { callId });
  }, [callId]);

  /** Arms the next refresh at 80% of `ttlSeconds` (floor 60s so a degenerate
   * TTL never disarms the refresh entirely, mirroring the iOS policy). */
  const scheduleTurnRefresh = useCallback((ttlSeconds: number) => {
    if (turnRefreshTimerRef.current) clearTimeout(turnRefreshTimerRef.current);
    const delayMs = Math.max(ttlSeconds * 0.8, 60) * 1000;
    turnRefreshTimerRef.current = setTimeout(() => {
      requestFreshTurnCredentials();
    }, delayMs);
  }, [requestFreshTurnCredentials]);

  const drainIceCandidateQueue = useCallback(async (peerId: string, service: WebRTCService) => {
    const queuedCandidates = iceCandidateQueueRef.current.get(peerId) || [];
    for (const candidate of queuedCandidates) {
      await service.addIceCandidate(candidate);
    }
    iceCandidateQueueRef.current.delete(peerId);
  }, []);

  /**
   * Get or create WebRTC service for a participant
   */
  const getWebRTCService = useCallback(
    (participantId: string): WebRTCService => {
      let service = webrtcServicesRef.current.get(participantId);

      if (!service) {
        logger.debug('[useWebRTCP2P]', 'Creating new WebRTC service', { participantId, callId });

        service = new WebRTCService({
          onIceCandidate: (candidate) => {
            // Send ICE candidate via Socket.IO
            const socket = meeshySocketIOService.getSocket();
            if (!socket) {
              logger.error('[useWebRTCP2P]', 'No socket available for ICE candidate');
              return;
            }

            // CRITICAL FIX: Check if userId is empty string or undefined
            if (!userId || userId === '') {
              logger.error('[useWebRTCP2P]', 'Cannot send ICE candidate: userId not available', {
                userId,
                userIdType: typeof userId,
                participantId,
                callId
              });
              return;
            }

            // Convert RTCIceCandidate to proper signal format
            const candidateInit = candidate.toJSON();
            const signal: WebRTCSignal = {
              type: 'ice-candidate',
              from: userId,
              to: participantId,
              candidate: candidateInit.candidate || '',
              sdpMLineIndex: candidateInit.sdpMLineIndex ?? undefined,
              sdpMid: candidateInit.sdpMid ?? undefined,
              negotiationId: currentNegotiationId(participantId),
            };

            socket.emit(CLIENT_EVENTS.CALL_SIGNAL, {
              callId,
              signal,
            } as CallSignalEvent, () => {});

            logger.debug('[useWebRTCP2P]', 'ICE candidate sent', { participantId, callId });
          },

          onTrack: (event) => {
            logger.info('[useWebRTCP2P]', 'Remote track received', {
              participantId,
              trackKind: event.track.kind,
            });

            // Add remote stream to store
            if (event.streams && event.streams[0]) {
              addRemoteStream(participantId, event.streams[0]);
            }
          },

          // Renegotiation / ICE-restart SDP (A/V switch, recovery). Relayed via
          // the same call:signal channel as the initial offer/answer.
          onLocalDescription: (description) => {
            const socket = meeshySocketIOService.getSocket();
            if (!socket || !userId || userId === '') {
              logger.error('[useWebRTCP2P]', 'Cannot relay renegotiation SDP: socket/userId missing', { participantId });
              return;
            }
            // An answer echoes the epoch it's responding to (already tracked
            // when the offer that triggered it was received); an offer we
            // initiate ourselves (renegotiation) bumps to a new epoch.
            const negotiationId =
              description.type === 'answer'
                ? currentNegotiationId(participantId)
                : bumpOutgoingNegotiationId(participantId);
            const signal: WebRTCSignal =
              description.type === 'answer'
                ? { type: 'answer', from: userId, to: participantId, sdp: description.sdp ?? '', negotiationId }
                : { type: 'offer', from: userId, to: participantId, sdp: description.sdp ?? '', negotiationId };
            socket.emit(CLIENT_EVENTS.CALL_SIGNAL, { callId, signal } as CallSignalEvent, () => {});
            logger.info('[useWebRTCP2P]', 'Renegotiation SDP relayed', { participantId, type: description.type });
          },

          onConnectionStateChange: (state) => {
            logger.debug('[useWebRTCP2P]', 'Connection state changed', {
              participantId,
              state,
            });

            connectionStatesRef.current.set(participantId, state);
            const aggregated = aggregateConnectionState(connectionStatesRef.current);
            const previousAggregated = lastAggregatedConnectionStateRef.current;
            lastAggregatedConnectionStateRef.current = aggregated;
            setConnectionState(aggregated);

            // Gated on the AGGREGATE transition, not this one participant's
            // state: in a group call, one peer failing must not toast/kill
            // the call while others are still connected, and 'Connected!'
            // must fire once for the call, not once per participant join.
            //
            // No toast.error here (Vague 151) — the sole consumer of this
            // hook's onError, VideoCallInterface.handleWebRTCError, already
            // shows a translated toast for 'PEER_CONNECTION_FAILED' (its
            // English copy is byte-identical to what this call site used to
            // hardcode: locales/en/calls.json toasts.peerConnectionFailed).
            // Toasting here too meant every locale saw TWO stacked toasts for
            // the same failure — one correctly translated, one always in
            // English regardless of locale.
            if (aggregated === 'failed' && previousAggregated !== 'failed') {
              setError('Connection failed');
              onError?.(new Error('PEER_CONNECTION_FAILED'));
            } else if (aggregated === 'connected' && previousAggregated !== 'connected') {
              setConnecting(false);
              // No toast.success here either (Vague 153) — same forwarding
              // contract as the failure branch above: this hook has no i18n
              // access (it isn't a component and doesn't load translation
              // catalogs), so the hardcoded 'Connected!' toast was English
              // for every locale. The consumer (VideoCallInterface's
              // handleWebRTCConnected) owns the translated toast.
              onConnected?.();
            }

            if (state === 'connected') {
              // Bound the receive jitter buffers now that media flows —
              // scoped to THIS peer, unrelated to the call-wide aggregate.
              webrtcServicesRef.current.get(participantId)?.setJitterBufferTargets();
            }
          },

          onIceConnectionStateChange: (state) => {
            logger.debug('[useWebRTCP2P]', 'ICE connection state changed', {
              participantId,
              state,
            });

            iceConnectionStatesRef.current.set(participantId, state);
            setIceConnectionState(aggregateIceConnectionState(iceConnectionStatesRef.current));

            if (state === 'connected' || state === 'completed') {
              connectedPeersRef.current.add(participantId);
              const wasStalled = stalledPeersRef.current.delete(participantId);
              if (wasStalled) {
                if (stalledPeersRef.current.size === 0) {
                  setIsReconnecting(false);
                }
                if (userId) {
                  // Le restart mené par webrtc-service a abouti — le serveur
                  // repasse l'appel `active`.
                  meeshySocketIOService.getSocket()?.emit(CLIENT_EVENTS.CALL_RECONNECTED, {
                    callId,
                    participantId: userId,
                  });
                }
              }
            } else if (state === 'disconnected' || state === 'failed') {
              // Stall MID-CALL seulement : le serveur suspend son cleanup et
              // marque l'appel `reconnecting` pendant que webrtc-service mène
              // grace + restartIce. Le schéma exige un participantId non vide ;
              // le serveur résout le SIEN (anti-usurpation), le userId suffit.
              if (
                userId &&
                connectedPeersRef.current.has(participantId) &&
                !stalledPeersRef.current.has(participantId)
              ) {
                stalledPeersRef.current.add(participantId);
                setIsReconnecting(true);
                reconnectAttemptRef.current = Math.min(reconnectAttemptRef.current + 1, 10);
                meeshySocketIOService.getSocket()?.emit(CLIENT_EVENTS.CALL_RECONNECTING, {
                  callId,
                  participantId: userId,
                  attempt: reconnectAttemptRef.current,
                });
              }
              if (state === 'disconnected') {
                // A network change (Wi-Fi↔cellular, ICE restart ahead) is
                // exactly when a stale TURN credential most likely bites — get
                // ahead of it instead of waiting for the periodic refresh.
                requestFreshTurnCredentials();
              } else if (aggregateIceConnectionState(iceConnectionStatesRef.current) === 'failed') {
                // Only surface the global "Connection failed" error once
                // EVERY participant's ICE has failed — one peer failing in a
                // group call while others are still connected must not toast
                // an error for (or call onError on) the whole call.
                //
                // No toast.error here (Vague 151 — see the matching comment
                // on the aggregated-'failed' branch of onConnectionStateChange
                // above): VideoCallInterface.handleWebRTCError already shows
                // a translated toast for 'ICE_CONNECTION_FAILED', identical
                // in English to what this line used to hardcode
                // (locales/en/calls.json toasts.iceConnectionFailed) — this
                // call site toasted a second, always-English copy alongside it.
                setError('ICE connection failed');
                onError?.(new Error('ICE_CONNECTION_FAILED'));
              }
            }
          },

          onError: (error) => {
            logger.error('[useWebRTCP2P]', 'WebRTC error', { error });

            // scheduleIceRestart() (webrtc-service.ts) raises this PER-PEER,
            // terminal signal only once ICE has already reached 'failed' for
            // THAT one peer — the call-wide "Connection failed" escalation
            // was already decided once, on the AGGREGATE ICE state, by
            // onIceConnectionStateChange's 'failed' branch above. Escalating
            // it a SECOND time here, ungated by aggregation, would toast and
            // kill the whole call because one peer gave up on restarting ICE
            // — even if every other peer in a group call is still connected.
            if (error.message === 'ICE_RESTART_ATTEMPTS_EXHAUSTED') {
              return;
            }

            // No toast.error(error.message) here either (Vague 151 — same
            // fix as the two aggregation branches above): the raw internal
            // message (untranslated, and often a code like
            // 'PEER_CONNECTION_FAILED' rather than user-facing text) would
            // show verbatim on top of the translated toast onError already
            // produces downstream.
            setError(error.message);
            onError?.(error);
          },
        });

        // Apply the server-provided ICE servers (STUN + time-limited TURN)
        // BEFORE the RTCPeerConnection is created in createOffer/handleOffer.
        // Without this the peer connection uses the STUN-only defaults and
        // calls fail between peers behind symmetric NATs.
        if (iceServers && iceServers.length > 0) {
          service.setIceServers(iceServers);
          logger.debug('[useWebRTCP2P]', 'Applied server ICE servers', {
            participantId,
            callId,
            iceServersCount: iceServers.length,
          });
        }

        // Deterministic polite/impolite role for glare-free renegotiation.
        if (userId && userId !== '') {
          service.setNegotiationRole(userId, participantId);
        }

        webrtcServicesRef.current.set(participantId, service);
      }

      return service;
    },
    [callId, userId, iceServers, addRemoteStream, setError, setConnecting, onError, onConnected, requestFreshTurnCredentials, currentNegotiationId, bumpOutgoingNegotiationId]  // CRITICAL: Added userId, iceServers
  );

  /**
   * Initialize local stream
   */
  const initializeLocalStream = useCallback(async () => {
    try {
      logger.debug('[useWebRTCP2P]', 'Initializing local stream', { callId });
      setConnecting(true);
      setError(null);

      // Get user media
      const service = new WebRTCService();
      const stream = await service.getLocalStream();

      // Add to store
      setLocalStream(stream);

      logger.info('[useWebRTCP2P]', 'Local stream initialized', { callId });
      return stream;
    } catch (error) {
      logger.error('[useWebRTCP2P]', 'Failed to initialize local stream', { error });
      setConnecting(false);

      // No toast.error(message) — onError below is the consumer's exclusive
      // toast surface (VideoCallInterface.tsx's handleWebRTCError), same fix
      // as Vague 151's connection-state branches.
      const message =
        error instanceof Error ? error.message : 'Failed to access camera/microphone';
      setError(message);
      onError?.(error instanceof Error ? error : new Error(message));

      throw error;
    }
  }, [callId, setLocalStream, setConnecting, setError, onError]);

  /**
   * Ensure local stream is ready (wait if not initialized yet)
   */
  const ensureLocalStream = useCallback(async (): Promise<MediaStream> => {
    // If we already have a local stream, return it
    if (localStream) {
      logger.debug('[useWebRTCP2P]', '✅ Local stream already exists, returning it', { callId });
      return localStream;
    }

    // Otherwise, initialize it
    logger.debug('[useWebRTCP2P]', 'Local stream not ready, initializing...', { callId });
    const stream = await initializeLocalStream();
    logger.debug('[useWebRTCP2P]', '🔍 Stream returned from initializeLocalStream:', {
      callId,
      streamExists: !!stream,
      streamId: stream?.id,
      trackCount: stream?.getTracks().length
    });
    return stream;
  }, [localStream, initializeLocalStream, callId]);

  /**
   * Tear down and forget everything about ONE participant's signaling state —
   * call this when they leave for good (after confirming, at the call site,
   * that they haven't rejoined within the grace window). Scoped mirror of
   * `cleanup()` below: without this, a departed participant's stale
   * `remoteDescriptionSetRef`/`iceCandidateQueueRef` entry survives and
   * misroutes the *new* connection a same-session rejoin creates — the
   * rejoin's initial answer gets treated as a renegotiation answer, and its
   * ICE candidates skip buffering and get silently dropped against a
   * connection that was never `setRemoteDescription`'d.
   */
  const removeParticipant = useCallback(
    (participantId: string) => {
      const service = webrtcServicesRef.current.get(participantId);
      if (service) {
        // Never stop the shared local stream here — it's the same
        // MediaStream reference every other still-connected participant's
        // service is sending. Only the full-call teardown (cleanup() below,
        // or call-store's reset()) may release the hardware tracks.
        service.close({ stopLocalTracks: false });
        webrtcServicesRef.current.delete(participantId);
      }
      iceCandidateQueueRef.current.delete(participantId);
      remoteDescriptionSetRef.current.delete(participantId);
      offerInFlightRef.current.delete(participantId);
      negotiationIdsRef.current.delete(participantId);
      removePeerConnection(participantId);

      // Recompute the aggregate now that this participant is gone — a
      // participant who left while 'failed' or 'disconnected' must not keep
      // dragging the call-wide state down forever.
      connectionStatesRef.current.delete(participantId);
      iceConnectionStatesRef.current.delete(participantId);
      const aggregated = aggregateConnectionState(connectionStatesRef.current);
      lastAggregatedConnectionStateRef.current = aggregated;
      setConnectionState(aggregated);
      setIceConnectionState(aggregateIceConnectionState(iceConnectionStatesRef.current));

      // Audit web-calls (2026-08-15) — a peer that stalled
      // (disconnected/failed) and never recovered before genuinely LEAVING
      // the call used to leave `stalledPeersRef` holding its id forever:
      // only a successful ICE reconnect (onIceConnectionStateChange
      // 'connected'/'completed', above) or a full-call cleanup() ever
      // cleared an entry. `isReconnecting` — and reconnectAttemptRef, which
      // keeps counting up across unrelated future stalls — then stayed
      // stuck for the REST of the call even once every remaining peer was
      // perfectly healthy. Mirror the recovery branch above: dropping the
      // departed peer's stall entry can itself drain the set to empty.
      connectedPeersRef.current.delete(participantId);
      const wasStalled = stalledPeersRef.current.delete(participantId);
      if (wasStalled && stalledPeersRef.current.size === 0) {
        setIsReconnecting(false);
        reconnectAttemptRef.current = 0;
      }
    },
    [removePeerConnection]
  );

  /**
   * Create and send offer
   */
  const createOffer = useCallback(
    async (targetUserId: string) => {
      try {
        logger.debug('[useWebRTCP2P]', 'Creating offer', { targetUserId, callId });
        setConnecting(true);

        // Ensure local stream is ready before creating offer
        const stream = await ensureLocalStream();

        logger.debug('[useWebRTCP2P]', '🔍 Stream received in createOffer:', {
          callId,
          targetUserId,
          streamExists: !!stream,
          streamId: stream?.id,
          trackCount: stream?.getTracks().length
        });

        // Use the stream returned directly from ensureLocalStream instead of reading from store
        // This avoids race conditions with Zustand state updates
        if (!stream) {
          throw new Error('Local stream not available after initialization');
        }

        const service = getWebRTCService(targetUserId);

        // Create peer connection
        const peerConnection = service.createPeerConnection(targetUserId);
        addPeerConnection(targetUserId, peerConnection);

        // Attach local media through pre-allocated transceivers. The video
        // m-line is always reserved (recvonly when the camera is off) so the
        // call can be upgraded audio→video later without an addTransceiver.
        service.addLocalMedia(stream, {
          sendVideo: stream.getVideoTracks().some((t) => t.enabled),
        });

        // Create offer
        const offer = await service.createOffer();

        // Send offer via Socket.IO
        const socket = meeshySocketIOService.getSocket();
        if (!socket) {
          throw new Error('No socket connection');
        }

        // Ensure userId is available
        if (!userId) {
          throw new Error('Cannot create offer: User ID not available');
        }

        const signal: WebRTCSignal = {
          type: 'offer',
          from: userId,
          to: targetUserId,
          sdp: offer.sdp || '',
          negotiationId: bumpOutgoingNegotiationId(targetUserId),
        };

        socket.emit(CLIENT_EVENTS.CALL_SIGNAL, {
          callId,
          signal,
        } as CallSignalEvent, () => {});

        logger.info('[useWebRTCP2P]', 'Offer created and sent', { targetUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to create offer', { error });
        setConnecting(false);

        // The peer connection may already have been created and registered
        // (addPeerConnection above) by the time createOffer()/the socket
        // check/etc. throws — without this it stays open and registered
        // forever, an orphaned RTCPeerConnection leak.
        removeParticipant(targetUserId);

        // No toast.error(message) — the consumer's onError forward already
        // toasts once for the whole call (Vague 151).
        const message = error instanceof Error ? error.message : 'Failed to create offer';
        setError(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, ensureLocalStream, getWebRTCService, addPeerConnection, setConnecting, setError, onError, userId, removeParticipant, bumpOutgoingNegotiationId]
  );

  /**
   * Handle incoming offer
   */
  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, fromUserId: string, negotiationId?: number) => {
      // Synchronous — runs before the first `await` below, closing the race
      // window a duplicate delivery (live relay + buffered replay) would
      // otherwise slip through. See offerInFlightRef's doc comment.
      offerInFlightRef.current.add(fromUserId);
      // Track the offer's epoch BEFORE answering, so the answer below echoes
      // it back exactly — this is the fix for iOS dropping web's answer.
      trackIncomingNegotiationId(fromUserId, negotiationId);
      try {
        logger.debug('[useWebRTCP2P]', 'Handling offer', { fromUserId, callId });
        setConnecting(true);

        // Ensure local stream is ready before handling offer
        const stream = await ensureLocalStream();

        // CRITICAL: Use stream returned directly instead of reading from store
        // This avoids race conditions with Zustand state updates
        if (!stream) {
          throw new Error('Local stream not available after initialization');
        }

        const service = getWebRTCService(fromUserId);

        // Create peer connection
        const peerConnection = service.createPeerConnection(fromUserId);
        addPeerConnection(fromUserId, peerConnection);

        // Attach local media through pre-allocated transceivers. The video
        // m-line is always reserved (recvonly when the camera is off) so the
        // call can be upgraded audio→video later without an addTransceiver.
        service.addLocalMedia(stream, {
          sendVideo: stream.getVideoTracks().some((t) => t.enabled),
        });

        // Create answer (this applies the remote description / offer)
        const answer = await service.createAnswer(offer);
        remoteDescriptionSetRef.current.add(fromUserId);

        // Send answer via Socket.IO
        const socket = meeshySocketIOService.getSocket();
        if (!socket) {
          throw new Error('No socket connection');
        }

        // Ensure userId is available
        if (!userId) {
          throw new Error('Cannot send answer: User ID not available');
        }

        const signal: WebRTCSignal = {
          type: 'answer',
          from: userId,
          to: fromUserId,
          sdp: answer.sdp || '',
          negotiationId: currentNegotiationId(fromUserId),
        };

        socket.emit(CLIENT_EVENTS.CALL_SIGNAL, {
          callId,
          signal,
        } as CallSignalEvent, () => {});

        // Drain any ICE candidates buffered before the remote description was set
        await drainIceCandidateQueue(fromUserId, service);

        logger.info('[useWebRTCP2P]', 'Answer created and sent', { fromUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to handle offer', { error });
        setConnecting(false);

        // See createOffer's matching comment — the peer connection may
        // already be registered by the time createAnswer()/the socket
        // check/etc. throws; without this it leaks, open and registered
        // forever.
        removeParticipant(fromUserId);

        // No toast.error(message) — same duplicate-notification fix as
        // createOffer's catch above (Vague 151).
        const message = error instanceof Error ? error.message : 'Failed to handle offer';
        setError(message);
        onError?.(error instanceof Error ? error : new Error(message));
      } finally {
        offerInFlightRef.current.delete(fromUserId);
      }
    },
    [callId, ensureLocalStream, getWebRTCService, addPeerConnection, setConnecting, setError, onError, userId, drainIceCandidateQueue, removeParticipant, trackIncomingNegotiationId, currentNegotiationId]
  );

  /**
   * Handle incoming answer
   */
  const handleAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit, fromUserId: string, negotiationId?: number) => {
      try {
        logger.debug('[useWebRTCP2P]', 'Handling answer', { fromUserId, callId });

        const service = webrtcServicesRef.current.get(fromUserId);
        if (!service) {
          throw new Error('WebRTC service not found for participant');
        }

        trackIncomingNegotiationId(fromUserId, negotiationId);

        // Set remote description (the answer)
        await service.setRemoteDescription(answer);
        remoteDescriptionSetRef.current.add(fromUserId);

        // Vague 113 (2026-08-12) — this IS the caller's true "answered"
        // moment. `CallManager.tsx`'s `handleParticipantJoined` used to
        // stamp `answeredAt`/status on the room-join event instead, but
        // iOS deliberately auto-early-joins the call room the instant it
        // RECEIVES an incoming call (CallManager.swift
        // `joinCallRoomReliably`, fired from `reportIncomingVoIPCall` /
        // foreground incoming-call handling, "so the SDP offer can be
        // received while ringing") — call:join fires long before the human
        // answers. A web caller ringing an iOS callee therefore saw its
        // clock start (and the call flip to 'active') the instant that
        // device started ringing, not when it was picked up — defeating the
        // exact ring-time-vs-talk-time fix Vague 110 made, for every call
        // to an iOS callee. The genuine pickup signal is the SDP *answer*,
        // which only a real Accept sends (gateway `call:signal`'s 'answer'
        // branch — see CallEventsHandler.ts, ADR Vague 104). Guarded on
        // 'initiated' so a later renegotiation/ICE-restart answer (call
        // already active) never re-stamps it — same guard CallManager used.
        const { currentCall, setCurrentCall } = useCallStore.getState();
        if (currentCall && currentCall.status === 'initiated') {
          setCurrentCall({ ...currentCall, status: 'active', answeredAt: new Date() });
        }

        // Drain any ICE candidates buffered before the remote description was set
        await drainIceCandidateQueue(fromUserId, service);

        logger.info('[useWebRTCP2P]', 'Answer handled successfully', { fromUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to handle answer', { error });

        // See createOffer's/handleOffer's matching comment — the peer
        // connection is already created + registered (by the earlier
        // createOffer call) by the time setRemoteDescription()/the ICE
        // drain throws; without this it leaks, open and registered forever,
        // and its stale WebRTCService stays cached for any retry offer to
        // reuse instead of a fresh instance.
        removeParticipant(fromUserId);

        // No toast.error(message) — same duplicate-notification fix as
        // createOffer/handleOffer's catches above (Vague 151).
        const message = error instanceof Error ? error.message : 'Failed to handle answer';
        setError(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, setError, onError, drainIceCandidateQueue, trackIncomingNegotiationId, removeParticipant]
  );

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit, fromUserId: string, negotiationId?: number) => {
      try {
        logger.debug('[useWebRTCP2P]', 'Handling ICE candidate', { fromUserId, callId });
        trackIncomingNegotiationId(fromUserId, negotiationId);

        const service = webrtcServicesRef.current.get(fromUserId);
        // Buffer the candidate until BOTH the service exists AND its remote
        // description has been applied. Adding a candidate before
        // setRemoteDescription throws InvalidStateError and the candidate is
        // lost, which on the offerer side (service exists but the answer has
        // not yet arrived) can prevent the connection from ever establishing.
        if (!service || !remoteDescriptionSetRef.current.has(fromUserId)) {
          const queue = iceCandidateQueueRef.current.get(fromUserId) || [];
          queue.push(candidate);
          iceCandidateQueueRef.current.set(fromUserId, queue);
          logger.debug('[useWebRTCP2P]', 'ICE candidate queued (remote description not set yet)', { fromUserId });
          return;
        }

        // Add ICE candidate to peer connection
        await service.addIceCandidate(candidate);

        logger.debug('[useWebRTCP2P]', 'ICE candidate added', { fromUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to handle ICE candidate', { error });
        // Don't show error to user - ICE candidates can fail individually
      }
    },
    [callId, trackIncomingNegotiationId]
  );

  /**
   * Turn the local camera ON mid-call (audio→video upgrade, FaceTime-style).
   * Acquires a single camera track and attaches it to every peer (cloning for
   * additional peers), flipping each reserved video transceiver to sendrecv
   * and renegotiating.
   *
   * Throws if no peer connection exists yet (e.g. still ringing, before the
   * caller's own createOffer or the callee's first offer signal has run) —
   * the caller MUST NOT treat a resolved promise as "video is on" when there
   * is nothing to attach a camera track to. Silently no-op'ing here used to
   * let handleToggleVideo (VideoCallInterface) flip controls.videoEnabled to
   * true and tell the peer video is enabled, while no camera track was ever
   * acquired — a UI/media desync with nothing to recover it automatically.
   *
   * The peer list is read TWICE: once before `getUserMedia()` (fail fast,
   * without prompting for camera permission, when nobody is connected yet)
   * and again right after it resolves, immediately before distributing the
   * track (Vague 97). `getUserMedia()` can take human-scale time (the
   * permission prompt), and a peer joining an ALREADY-active group call
   * during that window is an ordinary sequence, not adversarial timing. A
   * stale pre-await snapshot used to permanently exclude that peer: its
   * video transceiver stays recvonly forever, with no later event ever
   * re-triggering enableVideoSend for it. If the second read comes back
   * empty (every peer left while the prompt was pending), the just-acquired
   * camera is released instead of leaking a live, unattached capture.
   */
  const enableVideo = useCallback(async (): Promise<void> => {
    if (webrtcServicesRef.current.size === 0) {
      throw new Error('NO_PEER_CONNECTION');
    }
    const cam = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    const baseTrack = cam.getVideoTracks()[0];
    if (!baseTrack) return;
    const services = Array.from(webrtcServicesRef.current.values());
    if (services.length === 0) {
      cam.getTracks().forEach((track) => track.stop());
      throw new Error('NO_PEER_CONNECTION');
    }
    await Promise.all(
      services.map((service, index) =>
        service.enableVideoSend(index === 0 ? baseTrack : baseTrack.clone())
      )
    );
    logger.info('[useWebRTCP2P]', 'Local video enabled (upgrade)', { callId });
  }, [callId]);

  /**
   * Switch the local camera between front/back mid-call (FaceTime-style flip
   * — Vague 95). Mirrors enableVideo()'s "one real track + N clones"
   * ownership model — giving the first peer the literal camera track and
   * every other peer a `.clone()` — so each peer's WebRTCService instance
   * (via switchVideoSendTrack) can safely stop/release only the exact track
   * it owns.
   *
   * Before this existed, VideoCallInterface's handleSwitchCamera replaced
   * every sender with a SINGLE shared track object while assuming
   * `localStream` held only one video track — an assumption that breaks the
   * moment a group call has clones in flight, silently orphaning a live
   * camera capture on every switch beyond the first.
   *
   * Same double-read-around-getUserMedia() as enableVideo() (Vague 97): a
   * peer joining WHILE the flip's camera prompt is pending is excluded from
   * the initial pre-await snapshot, so the peer list is re-read right after
   * `getUserMedia()` resolves, immediately before distributing the track.
   */
  const switchCamera = useCallback(
    async (facingMode: 'user' | 'environment'): Promise<void> => {
      if (webrtcServicesRef.current.size === 0) {
        throw new Error('NO_PEER_CONNECTION');
      }
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      const baseTrack = cam.getVideoTracks()[0];
      if (!baseTrack) return;
      const services = Array.from(webrtcServicesRef.current.values());
      if (services.length === 0) {
        cam.getTracks().forEach((track) => track.stop());
        throw new Error('NO_PEER_CONNECTION');
      }
      await Promise.all(
        services.map((service, index) =>
          service.switchVideoSendTrack(index === 0 ? baseTrack : baseTrack.clone())
        )
      );
      logger.info('[useWebRTCP2P]', 'Camera switched', { callId, facingMode });
    },
    [callId]
  );

  /**
   * Turn the local camera OFF mid-call (video→audio downgrade). Stops outbound
   * video on every peer and flips the transceiver to recvonly so we keep
   * receiving theirs.
   */
  const disableVideo = useCallback(async (): Promise<void> => {
    await Promise.all(
      Array.from(webrtcServicesRef.current.values()).map((service) => service.disableVideoSend())
    );
    logger.info('[useWebRTCP2P]', 'Local video disabled (downgrade)', { callId });
  }, [callId]);

  /**
   * Apply an adaptive video quality tier to ONE peer only (per-peer bitrate
   * shedding, Vague 143 — replaces a former call-wide `applyQualityTier`,
   * which had no remaining caller once bitrate shedding moved per-peer.
   * Since L6-3 this function ALSO actuates the call-wide network-survival
   * freeze, with `tier === 'frozen'` — see `use-per-peer-video-tier.ts`;
   * `disableVideo`/`enableVideo` are now the manual camera button's path
   * only. `applyVideoEncoding` is a plain
   * `setParameters()` call on that peer's own RTCRtpSender — no
   * renegotiation, no track mutation — so this cannot affect any other
   * peer's outbound video. A peerId with no live service (already left, or a
   * monitoring sample from a tick that is now one participant stale) is a
   * silent no-op.
   */
  const applyQualityTierToPeer = useCallback(
    async (peerId: string, tier: VideoQualityTier): Promise<void> => {
      const service = webrtcServicesRef.current.get(peerId);
      if (!service) return;
      await service.applyVideoEncoding(tier);
    },
    []
  );

  /**
   * Cleanup on unmount or call end
   */
  const cleanup = useCallback(() => {
    logger.debug('[useWebRTCP2P]', 'Cleaning up WebRTC connections', { callId });

    // Close all WebRTC services
    webrtcServicesRef.current.forEach((service, participantId) => {
      service.close();
      removePeerConnection(participantId);
    });

    webrtcServicesRef.current.clear();
    iceCandidateQueueRef.current.clear();
    remoteDescriptionSetRef.current.clear();
    connectedPeersRef.current.clear();
    stalledPeersRef.current.clear();
    setIsReconnecting(false);
    negotiationIdsRef.current.clear();
    reconnectAttemptRef.current = 0;
    connectionStatesRef.current.clear();
    iceConnectionStatesRef.current.clear();
    lastAggregatedConnectionStateRef.current = 'new';
    setConnectionState('new');
    setIceConnectionState('new');

    logger.info('[useWebRTCP2P]', 'Cleanup completed', { callId });
  }, [callId, removePeerConnection]);

  /**
   * CRITICAL FIX: Recreate WebRTC services when userId changes
   * This ensures ICE candidates are sent with correct userId
   */
  useEffect(() => {
    // If userId was empty and now has a value, clear existing services
    // so they get recreated with the new userId
    if (userId && userId !== '') {
      const currentServices = webrtcServicesRef.current;
      if (currentServices.size > 0) {
        logger.warn('[useWebRTCP2P]', 'userId changed, clearing WebRTC services to recreate with new userId', {
          callId,
          userId,
          servicesCount: currentServices.size
        });
        // Close and clear all existing services
        currentServices.forEach((service, participantId) => {
          service.close();
          removePeerConnection(participantId);
        });
        currentServices.clear();
        iceCandidateQueueRef.current.clear();
        remoteDescriptionSetRef.current.clear();
        connectionStatesRef.current.clear();
        iceConnectionStatesRef.current.clear();
        lastAggregatedConnectionStateRef.current = 'new';
        setConnectionState('new');
        setIceConnectionState('new');

        // Audit web-calls (2026-08-17) — this branch tears down every peer
        // connection just like cleanup() below, but a userId correction
        // mid-call (anonymous→authenticated promotion, session token
        // refresh) can fire it AFTER a peer already reached ICE
        // 'connected'/'completed' or had genuinely stalled under the OLD
        // userId. Without clearing these too, `connectedPeersRef` keeps a
        // participant marked connected from a connection that no longer
        // exists: the FRESH service recreated below can report its first
        // ever 'disconnected' (a normal pre-connection blip, not a mid-call
        // stall) and the guard at onIceConnectionStateChange
        // (`connectedPeersRef.current.has(participantId)`) reads the stale
        // entry as "was connected, is now stalling" — firing a false
        // "Reconnecting…" state and an unearned `call:reconnecting` emit to
        // the server for a connection that was never actually up. Mirrors
        // the same class of bug `removeParticipant`'s matching comment
        // documents for the per-participant teardown path. `negotiationIdsRef`
        // is deliberately NOT cleared here (unlike cleanup()): the call is
        // still ongoing and the remote peer already recorded our prior
        // negotiationId high-water mark — resetting it would make our next
        // signal look OLDER than what they've already seen and get it
        // silently dropped as stale (the exact bug documented above at this
        // ref's declaration).
        connectedPeersRef.current.clear();
        stalledPeersRef.current.clear();
        setIsReconnecting(false);
        reconnectAttemptRef.current = 0;
      }
    }
  }, [userId, callId, removePeerConnection]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Listen for incoming signals
   */
  useEffect(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) {
      logger.warn('[useWebRTCP2P]', 'No socket available for signaling');
      return;
    }

    const handleIncomingSignal = (event: CallSignalEvent) => {
      if (event.callId !== callId) return;

      const { signal } = event;
      logger.debug('[useWebRTCP2P]', 'Received signal', {
        type: signal.type,
        from: signal.from,
        callId,
      });

      const existingService = webrtcServicesRef.current.get(signal.from);
      const isEstablished = remoteDescriptionSetRef.current.has(signal.from);

      switch (signal.type) {
        case 'offer':
          // A second offer on an established connection is a renegotiation
          // (A/V switch or ICE restart) — apply it in place (glare-safe)
          // instead of tearing down and rebuilding the peer connection.
          if (existingService && isEstablished) {
            if (isStaleNegotiation(signal.from, signal.negotiationId, 'offer')) {
              logger.warn('[useWebRTCP2P]', 'Dropped stale/replayed renegotiation offer', {
                from: signal.from,
                negotiationId: signal.negotiationId,
                callId,
              });
              break;
            }
            // Track BEFORE handing off — the resulting answer (emitted via
            // the service's onLocalDescription callback) echoes whatever
            // currentNegotiationId(peer) holds at that point.
            trackIncomingNegotiationId(signal.from, signal.negotiationId);
            existingService.handleRenegotiationOffer({ type: 'offer', sdp: signal.sdp }).catch((error) => {
              logger.error('[useWebRTCP2P]', 'Failed to handle renegotiation offer', { error, from: signal.from });
              // No toast.error(message) — same duplicate-notification fix as
              // the initial-negotiation catches above (Vague 151).
              const message = error instanceof Error ? error.message : 'Failed to renegotiate call';
              setError(message);
              onError?.(error instanceof Error ? error : new Error(message));
            });
          } else if (offerInFlightRef.current.has(signal.from)) {
            // The gateway both relays an offer live AND buffers it for
            // replay on the sender's next call:join (reconnect recovery).
            // A duplicate arriving while the first is still being processed
            // already reached this tab — reprocessing it would call
            // createPeerConnection a second time on the same WebRTCService
            // and orphan the in-flight RTCPeerConnection. Drop it.
            logger.debug('[useWebRTCP2P]', 'Dropped duplicate initial offer already in flight', {
              from: signal.from,
              callId,
            });
          } else {
            handleOffer({ type: 'offer', sdp: signal.sdp }, signal.from, signal.negotiationId);
          }
          break;

        case 'answer':
          // Answer to one of our renegotiation offers vs. the initial answer.
          if (existingService && isEstablished) {
            if (isStaleNegotiation(signal.from, signal.negotiationId, 'answer')) {
              logger.warn('[useWebRTCP2P]', 'Dropped stale/replayed renegotiation answer', {
                from: signal.from,
                negotiationId: signal.negotiationId,
                callId,
              });
              break;
            }
            trackIncomingNegotiationId(signal.from, signal.negotiationId);
            existingService.setRemoteAnswer({ type: 'answer', sdp: signal.sdp }).catch((error) => {
              logger.error('[useWebRTCP2P]', 'Failed to handle renegotiation answer', { error, from: signal.from });
              // No toast.error(message) — same duplicate-notification fix as
              // the renegotiation-offer catch above (Vague 151).
              const message = error instanceof Error ? error.message : 'Failed to renegotiate call';
              setError(message);
              onError?.(error instanceof Error ? error : new Error(message));
            });
          } else {
            handleAnswer({ type: 'answer', sdp: signal.sdp }, signal.from, signal.negotiationId);
          }
          break;

        case 'ice-candidate':
          // Convert flat signal to RTCIceCandidateInit
          handleIceCandidate({
            candidate: signal.candidate,
            sdpMLineIndex: signal.sdpMLineIndex,
            sdpMid: signal.sdpMid,
          }, signal.from, signal.negotiationId);
          break;

        default:
          logger.warn('[useWebRTCP2P]', 'Unknown signal type', { type: (signal as any).type });
      }
    };

    socket.on(SERVER_EVENTS.CALL_SIGNAL, handleIncomingSignal);

    return () => {
      socket.off(SERVER_EVENTS.CALL_SIGNAL, handleIncomingSignal);
    };
  }, [callId, handleOffer, handleAnswer, handleIceCandidate, trackIncomingNegotiationId, isStaleNegotiation]);

  /**
   * TURN credential refresh (see DEFAULT_TURN_CREDENTIAL_TTL_SECONDS doc
   * above) — arms the periodic refresh on mount/callId change, applies a
   * received refresh to the store AND every already-established peer
   * connection (WebRTCService.setIceServers applies live via
   * RTCPeerConnection.setConfiguration when the connection already exists),
   * then reschedules using the real TTL from the response.
   */
  useEffect(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    const handleIceServersRefreshed = (event: CallIceServersRefreshedEvent) => {
      if (event.callId !== callId || !event.iceServers?.length) return;

      logger.info('[useWebRTCP2P]', 'TURN credentials refreshed', {
        callId,
        serverCount: event.iceServers.length,
        ttl: event.ttl,
      });

      useCallStore.getState().setIceServers(event.iceServers);
      webrtcServicesRef.current.forEach((service) => service.setIceServers(event.iceServers));
      scheduleTurnRefresh(event.ttl);
    };

    socket.on(SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED, handleIceServersRefreshed);
    scheduleTurnRefresh(DEFAULT_TURN_CREDENTIAL_TTL_SECONDS);

    return () => {
      socket.off(SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED, handleIceServersRefreshed);
      if (turnRefreshTimerRef.current) {
        clearTimeout(turnRefreshTimerRef.current);
        turnRefreshTimerRef.current = null;
      }
    };
  }, [callId, scheduleTurnRefresh]);

  return {
    connectionState,
    iceConnectionState,
    isReconnecting,
    initializeLocalStream,
    ensureLocalStream,
    createOffer,
    enableVideo,
    disableVideo,
    switchCamera,
    applyQualityTierToPeer,
    removeParticipant,
    cleanup,
  };
}
