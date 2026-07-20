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

export function useWebRTCP2P({ callId, userId, onError }: UseWebRTCP2POptions) {
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
            const signal: WebRTCSignal =
              description.type === 'answer'
                ? { type: 'answer', from: userId, to: participantId, sdp: description.sdp ?? '' }
                : { type: 'offer', from: userId, to: participantId, sdp: description.sdp ?? '' };
            socket.emit(CLIENT_EVENTS.CALL_SIGNAL, { callId, signal } as CallSignalEvent, () => {});
            logger.info('[useWebRTCP2P]', 'Renegotiation SDP relayed', { participantId, type: description.type });
          },

          onConnectionStateChange: (state) => {
            logger.debug('[useWebRTCP2P]', 'Connection state changed', {
              participantId,
              state,
            });
            setConnectionState(state);

            if (state === 'failed') {
              setError('Connection failed');
              toast.error('Connection failed. Please try again.');
              onError?.(new Error('PEER_CONNECTION_FAILED'));
            } else if (state === 'connected') {
              setConnecting(false);
              toast.success('Connected!');
              // Bound the receive jitter buffers now that media flows.
              webrtcServicesRef.current.get(participantId)?.setJitterBufferTargets();
            }
          },

          onIceConnectionStateChange: (state) => {
            logger.debug('[useWebRTCP2P]', 'ICE connection state changed', {
              participantId,
              state,
            });
            setIceConnectionState(state);

            if (state === 'connected' || state === 'completed') {
              connectedPeersRef.current.add(participantId);
              if (stalledPeersRef.current.delete(participantId) && userId) {
                // Le restart mené par webrtc-service a abouti — le serveur
                // repasse l'appel `active`.
                meeshySocketIOService.getSocket()?.emit(CLIENT_EVENTS.CALL_RECONNECTED, {
                  callId,
                  participantId: userId,
                });
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
              } else {
                setError('ICE connection failed');
                toast.error('Connection failed. Retrying...');
                onError?.(new Error('ICE_CONNECTION_FAILED'));
              }
            }
          },

          onError: (error) => {
            logger.error('[useWebRTCP2P]', 'WebRTC error', { error });
            setError(error.message);
            toast.error(error.message);
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
    [callId, userId, iceServers, addRemoteStream, setError, setConnecting, onError, requestFreshTurnCredentials]  // CRITICAL: Added userId, iceServers
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

      const message =
        error instanceof Error ? error.message : 'Failed to access camera/microphone';
      setError(message);
      toast.error(message);
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
      removePeerConnection(participantId);
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

        const message = error instanceof Error ? error.message : 'Failed to create offer';
        setError(message);
        toast.error(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, ensureLocalStream, getWebRTCService, addPeerConnection, setConnecting, setError, onError, userId, removeParticipant]
  );

  /**
   * Handle incoming offer
   */
  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, fromUserId: string) => {
      // Synchronous — runs before the first `await` below, closing the race
      // window a duplicate delivery (live relay + buffered replay) would
      // otherwise slip through. See offerInFlightRef's doc comment.
      offerInFlightRef.current.add(fromUserId);
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

        const message = error instanceof Error ? error.message : 'Failed to handle offer';
        setError(message);
        toast.error(message);
        onError?.(error instanceof Error ? error : new Error(message));
      } finally {
        offerInFlightRef.current.delete(fromUserId);
      }
    },
    [callId, ensureLocalStream, getWebRTCService, addPeerConnection, setConnecting, setError, onError, userId, drainIceCandidateQueue, removeParticipant]
  );

  /**
   * Handle incoming answer
   */
  const handleAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit, fromUserId: string) => {
      try {
        logger.debug('[useWebRTCP2P]', 'Handling answer', { fromUserId, callId });

        const service = webrtcServicesRef.current.get(fromUserId);
        if (!service) {
          throw new Error('WebRTC service not found for participant');
        }

        // Set remote description (the answer)
        await service.setRemoteDescription(answer);
        remoteDescriptionSetRef.current.add(fromUserId);

        // Drain any ICE candidates buffered before the remote description was set
        await drainIceCandidateQueue(fromUserId, service);

        logger.info('[useWebRTCP2P]', 'Answer handled successfully', { fromUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to handle answer', { error });

        const message = error instanceof Error ? error.message : 'Failed to handle answer';
        setError(message);
        toast.error(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, setError, onError, drainIceCandidateQueue]
  );

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit, fromUserId: string) => {
      try {
        logger.debug('[useWebRTCP2P]', 'Handling ICE candidate', { fromUserId, callId });

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
    [callId]
  );

  /**
   * Turn the local camera ON mid-call (audio→video upgrade, FaceTime-style).
   * Acquires a single camera track and attaches it to every peer (cloning for
   * additional peers), flipping each reserved video transceiver to sendrecv
   * and renegotiating. Works while ringing or connected.
   */
  const enableVideo = useCallback(async (): Promise<void> => {
    const services = Array.from(webrtcServicesRef.current.values());
    if (services.length === 0) return;
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
    await Promise.all(
      services.map((service, index) =>
        service.enableVideoSend(index === 0 ? baseTrack : baseTrack.clone())
      )
    );
    logger.info('[useWebRTCP2P]', 'Local video enabled (upgrade)', { callId });
  }, [callId]);

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
   * Apply an adaptive video quality tier to every peer (compression / survival
   * under congestion). 'audio-only' drops outbound video entirely.
   */
  const applyQualityTier = useCallback(async (tier: VideoQualityTier): Promise<void> => {
    await Promise.all(
      Array.from(webrtcServicesRef.current.values()).map((service) => service.applyVideoEncoding(tier))
    );
  }, []);

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
    reconnectAttemptRef.current = 0;

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
            existingService.handleRenegotiationOffer({ type: 'offer', sdp: signal.sdp }).catch((error) => {
              logger.error('[useWebRTCP2P]', 'Failed to handle renegotiation offer', { error, from: signal.from });
              const message = error instanceof Error ? error.message : 'Failed to renegotiate call';
              setError(message);
              toast.error(message);
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
            handleOffer({ type: 'offer', sdp: signal.sdp }, signal.from);
          }
          break;

        case 'answer':
          // Answer to one of our renegotiation offers vs. the initial answer.
          if (existingService && isEstablished) {
            existingService.setRemoteAnswer({ type: 'answer', sdp: signal.sdp }).catch((error) => {
              logger.error('[useWebRTCP2P]', 'Failed to handle renegotiation answer', { error, from: signal.from });
              const message = error instanceof Error ? error.message : 'Failed to renegotiate call';
              setError(message);
              toast.error(message);
              onError?.(error instanceof Error ? error : new Error(message));
            });
          } else {
            handleAnswer({ type: 'answer', sdp: signal.sdp }, signal.from);
          }
          break;

        case 'ice-candidate':
          // Convert flat signal to RTCIceCandidateInit
          handleIceCandidate({
            candidate: signal.candidate,
            sdpMLineIndex: signal.sdpMLineIndex,
            sdpMid: signal.sdpMid,
          }, signal.from);
          break;

        default:
          logger.warn('[useWebRTCP2P]', 'Unknown signal type', { type: (signal as any).type });
      }
    };

    socket.on(SERVER_EVENTS.CALL_SIGNAL, handleIncomingSignal);

    return () => {
      socket.off(SERVER_EVENTS.CALL_SIGNAL, handleIncomingSignal);
    };
  }, [callId, handleOffer, handleAnswer, handleIceCandidate]);

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
    initializeLocalStream,
    ensureLocalStream,
    createOffer,
    enableVideo,
    disableVideo,
    applyQualityTier,
    removeParticipant,
    cleanup,
  };
}
