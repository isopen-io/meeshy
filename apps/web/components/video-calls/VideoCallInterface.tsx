/**
 * VIDEO CALL INTERFACE - Mobile-Responsive
 * Complete mobile-optimized video call UI with draggable local video
 */

'use client';

import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { useWebRTCP2P } from '@/hooks/use-webrtc-p2p';
import { useAudioEffects } from '@/hooks/use-audio-effects';
import { useCallQuality } from '@/hooks/use-call-quality';
import { useRemoteCallAlerts } from '@/hooks/use-remote-call-alerts';
import { useCallCaptions } from '@/hooks/use-call-captions';
import { useCallAnalyticsReporter } from '@/hooks/use-call-analytics-reporter';
import { useActivePeerConnection } from '@/hooks/use-active-peer-connection';
import {
  useAdaptiveDegradation,
  type AdaptiveDegradationActions,
} from '@/hooks/use-adaptive-degradation';
import { useCallDuration } from '@/hooks/use-call-duration';
import { useDraggable } from '@/hooks/use-draggable';
import { VideoStream } from './VideoStream';
import { CallControls } from './CallControls';
import { CallStatusIndicator } from './CallStatusIndicator';
import { AudioEffectsCarousel } from './AudioEffectsCarousel';
import { CallQualityOverlay } from './CallQualityOverlay';
import { CallCaptionsOverlay } from './CallCaptionsOverlay';
import { CallInfoOverlay } from './CallInfoOverlay';
import { LocalVideoTile } from './LocalVideoTile';
import { DraggableParticipantOverlay } from './DraggableParticipantOverlay';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';

/**
 * Watchdog de la phase de connexion (parité iOS `connectingFailSeconds` /
 * Android `CallConnectingWatchdog`) : un appel dont l'ICE ne s'établit JAMAIS
 * restait indéfiniment sur l'UI d'appel — l'échec ne produisait qu'un toast
 * pendant que webrtc-service retentait l'ICE en boucle sans borne d'escalade.
 * Une seule fenêtre par appel, jamais ré-armée après la première connexion
 * (les stalls mid-call ont leur propre chaîne reconnect/restart).
 */
const CONNECT_WATCHDOG_MS = 45_000;

interface VideoCallInterfaceProps {
  callId: string;
}

export function VideoCallInterface({ callId }: VideoCallInterfaceProps) {
  const { user } = useAuth();
  const { t } = useI18n('calls');
  const {
    localStream,
    remoteStreams,
    currentCall,
    controls,
    toggleAudio,
    setControls,
    reset,
  } = useCallStore();

  const [showAudioEffects, setShowAudioEffects] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Local self-view dragging + ticking call duration (extracted hooks).
  const { position: localVideoPosition, isDragging, onDragStart } = useDraggable({
    initial: { x: 20, y: 20 },
  });
  const { seconds: callDuration, label: callDurationLabel } = useCallDuration(
    currentCall?.startedAt
  );

  // New state for fullscreen mode and disconnected participants
  const [fullscreenParticipantId, setFullscreenParticipantId] = useState<string | null>(null);
  const [disconnectedParticipants, setDisconnectedParticipants] = useState<Set<string>>(new Set());

  // Stable error handler
  const handleWebRTCError = useCallback((error: Error) => {
    logger.error('[VideoCallInterface]', 'WebRTC error: ' + error.message);
    toast.error(t('calls.toasts.connectionError') + ': ' + error.message);
  }, []);

  // Initialize WebRTC
  const { initializeLocalStream, createOffer, connectionState, enableVideo, disableVideo, applyQualityTier, removeParticipant } = useWebRTCP2P({
    callId,
    userId: user?.id,
    onError: handleWebRTCError,
  });

  // Initialize audio effects
  const {
    outputStream: processedAudioStream,
    effectsState,
    toggleEffect,
    updateEffectParams,
    loadPreset,
    currentPreset,
    availableBackSounds,
    availablePresets,
  } = useAudioEffects({
    inputStream: localStream,
  });

  // Active peer connection for quality monitoring. MUST be selected reactively
  // from the store — it is created lazily inside createOffer/handleOffer, after
  // this component mounts. A one-shot useMemo([]) snapshot captured an empty map
  // and stayed null forever, which silently disabled quality monitoring, the
  // adaptive bitrate ladder and call:quality-report (root cause of the mid-call
  // "instabilité de connexion": the encoder never shed bitrate under
  // congestion).
  const activePeerConnection = useActivePeerConnection();

  // Monitor call quality. callId is required for the server-side quality
  // report (call:quality-report) that drives congestion alerts and persists
  // "data spent / network quality" on the call summary.
  const { qualityStats } = useCallQuality({
    peerConnection: activePeerConnection,
    callId,
    updateInterval: 2000,
  });

  // Remote-peer alerts relayed by the gateway (iOS/Android parity): the PEER's
  // sustained degradation (transient pill, 15 s auto-clear) and the privacy
  // signal when the peer captures the call screen.
  const { remoteQualityDegraded, remoteScreenCapturing } = useRemoteCallAlerts(callId);
  const { captions } = useCallCaptions(callId);

  // Report per-call reliability telemetry at teardown (parité iOS/Android) —
  // the web was the one client that never emitted call:analytics, leaving the
  // reliability dashboard blind to web calls.
  useCallAnalyticsReporter({ callId, connectionState, qualityStats, isVideo: controls.videoEnabled });

  // Check if any audio effect is active
  const audioEffectsActive = Object.values(effectsState).some(effect => effect.enabled);

  // Emit a media-toggle to the peer (drives the remote avatar placeholder),
  // mirroring the manual camera button. Used by the survival controller when it
  // auto-suspends/resumes outbound video.
  const emitVideoToggle = useCallback((enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as unknown).emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId, enabled });
    }
  }, [callId]);

  // Adaptive compression + graceful-degradation control loop. Feeds observed
  // connection quality into a hysteresis state machine that (1) sheds the
  // encoder down the bitrate ladder under congestion, (2) DROPS outbound video
  // to audio-only after sustained 'poor' quality so the call survives a link
  // that can't carry even minimal video, and (3) brings video back once the
  // link has clearly recovered. The user's camera intent (controls.videoEnabled)
  // is authoritative — the controller never re-enables video the user turned off.
  const degradationActions = useMemo<AdaptiveDegradationActions>(() => ({
    applyTier: (tier) => { applyQualityTier(tier).catch(() => { /* best effort */ }); },
    suspend: async () => {
      await disableVideo();
      emitVideoToggle(false);
      toast.warning(t('calls.toasts.videoSuspendedPoorConnection'));
    },
    resume: async () => {
      await enableVideo();
      emitVideoToggle(true);
      toast.success(t('calls.toasts.videoResumed'));
    },
  }), [applyQualityTier, disableVideo, enableVideo, emitVideoToggle, t]);

  const { videoSuspended } = useAdaptiveDegradation({
    qualityStats,
    userWantsVideo: controls.videoEnabled,
    actions: degradationActions,
  });

  // Initialize local stream on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // SAFARI FIX: Check for pre-authorized stream first
        const preauthorizedStream = (window as unknown).__preauthorizedMediaStream;

        if (preauthorizedStream) {
          logger.info('[VideoCallInterface]', '✅ Using pre-authorized media stream (Safari-compatible)');

          // Use the pre-authorized stream directly
          const { setLocalStream } = useCallStore.getState();
          setLocalStream(preauthorizedStream);

          // Clean up the global reference
          delete (window as unknown).__preauthorizedMediaStream;
        } else {
          logger.debug('[VideoCallInterface]', 'No pre-authorized stream, requesting permissions now');
          await initializeLocalStream();
        }
      } catch (error) {
        if (mounted) {
          logger.error('[VideoCallInterface]', 'Failed to initialize local stream: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [initializeLocalStream]);

  // Handle creating offers for participants
  const offersCreatedFor = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentCall || !user) return;

    if (currentCall.initiatorId !== user.id) return;

    const activeParticipants = currentCall.participants?.filter(p => !p.leftAt) || [];

    activeParticipants.forEach((participant) => {
      const participantId = participant.userId || participant.participantId;

      if (!participantId || participantId === user.id) return;

      if (offersCreatedFor.current.has(participantId)) return;

      offersCreatedFor.current.add(participantId);

      logger.info('[VideoCallInterface]', 'Creating offer for new participant', { participantId });
      createOffer(participantId).catch((error) => {
        logger.error('[VideoCallInterface]', 'Failed to create offer', { participantId, error });
        offersCreatedFor.current.delete(participantId);
      });
    });
  }, [currentCall?.participants?.length, currentCall?.initiatorId, user?.id, createOffer]);

  // Keep track of peer connections to detect when new ones are added
  const [peerConnectionsCount, setPeerConnectionsCount] = useState(0);

  // Monitor peer connections changes
  useEffect(() => {
    const unsubscribe = useCallStore.subscribe(
      (state) => {
        const newSize = state.peerConnections.size;
        if (newSize !== peerConnectionsCount) {
          setPeerConnectionsCount(newSize);
        }
      }
    );
    return unsubscribe;
  }, [peerConnectionsCount]);

  // Apply audio effects to outgoing stream
  // Replace audio tracks in all peer connections when processed audio stream changes or new connections are added
  useEffect(() => {
    if (!processedAudioStream || !localStream) return;

    const peerConnections = useCallStore.getState().peerConnections;
    if (peerConnections.size === 0) {
      logger.debug('[VideoCallInterface]', 'No peer connections yet, audio effects will be applied when connections are created');
      return;
    }

    // Get the processed audio track
    const processedAudioTracks = processedAudioStream.getAudioTracks();
    if (processedAudioTracks.length === 0) {
      logger.warn('[VideoCallInterface]', 'No audio tracks in processed stream');
      return;
    }

    const newAudioTrack = processedAudioTracks[0];
    logger.info('[VideoCallInterface]', 'Replacing audio tracks in peer connections with processed audio', {
      audioEffectsActive,
      trackId: newAudioTrack.id,
      peerConnectionsCount
    });

    // Replace audio track in all peer connections
    peerConnections.forEach((peerConnection, participantId) => {
      const senders = peerConnection.getSenders();
      const audioSender = senders.find(sender => sender.track?.kind === 'audio');

      if (audioSender) {
        audioSender.replaceTrack(newAudioTrack)
          .then(() => {
            logger.debug('[VideoCallInterface]', 'Audio track replaced successfully', { participantId });
          })
          .catch((error) => {
            logger.error('[VideoCallInterface]', 'Failed to replace audio track', { participantId, error });
          });
      } else {
        logger.warn('[VideoCallInterface]', 'No audio sender found for participant', { participantId });
      }
    });

    // Cleanup: when effect is disabled or component unmounts, restore original audio
    return () => {
      if (!audioEffectsActive && localStream) {
        const originalAudioTracks = localStream.getAudioTracks();
        if (originalAudioTracks.length > 0) {
          const originalAudioTrack = originalAudioTracks[0];
          logger.info('[VideoCallInterface]', 'Restoring original audio track');

          peerConnections.forEach((peerConnection, participantId) => {
            const senders = peerConnection.getSenders();
            const audioSender = senders.find(sender => sender.track?.kind === 'audio');

            if (audioSender) {
              audioSender.replaceTrack(originalAudioTrack)
                .catch((error) => {
                  logger.error('[VideoCallInterface]', 'Failed to restore original audio track', { participantId, error });
                });
            }
          });
        }
      }
    };
  }, [processedAudioStream, localStream, audioEffectsActive, peerConnectionsCount]);

  // Cleanup on unmount and page unload
  useEffect(() => {
    const cleanup = () => {
      const { currentCall, isInCall } = useCallStore.getState();
      if (isInCall && currentCall) {
        logger.info('[VideoCallInterface]', 'Cleaning up call on unmount/unload - callId: ' + currentCall.id);
        const socket = meeshySocketIOService.getSocket();
        if (socket && socket.connected) {
          (socket as unknown).emit(CLIENT_EVENTS.CALL_LEAVE, { callId: currentCall.id });
        }
      }
    };

    // Handle page refresh/close
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      cleanup();
      // Don't show confirmation dialog - just cleanup
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Handle component unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, []);

  // Handle media toggles
  const handleToggleAudio = () => {
    const newEnabled = !controls.audioEnabled;
    toggleAudio();

    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as unknown).emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId, enabled: newEnabled });
    }
  };

  const handleToggleVideo = async () => {
    const newEnabled = !controls.videoEnabled;
    try {
      // Real audio↔video switch: acquire/release the camera and renegotiate
      // (FaceTime-style asymmetric) instead of merely toggling track.enabled.
      if (newEnabled) {
        await enableVideo();
      } else {
        await disableVideo();
      }
    } catch (error) {
      logger.error('[VideoCallInterface]', 'Video toggle failed: ' + (error instanceof Error ? error.message : 'unknown'));
      toast.error(t('calls.toasts.videoSwitchFailed'));
      return;
    }

    setControls({ videoEnabled: newEnabled });

    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as unknown).emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId, enabled: newEnabled });
    }
  };

  const handleSwitchCamera = async () => {
    try {
      if (!localStream) return;

      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) return;

      const constraints = videoTrack.getConstraints();
      const currentFacingMode = (constraints as unknown).facingMode || 'user';
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // MDN warns the outgoing track must not be stopped until replaceTrack()
      // resolves on every sender — the peer connection may still be reading
      // from it. Await all replacements first; a rejection propagates to the
      // catch block below and the old track is left untouched.
      const replacements = Array.from(useCallStore.getState().peerConnections.values())
        .map(pc => pc.getSenders().find(s => s.track?.kind === 'video'))
        .filter((sender): sender is RTCRtpSender => Boolean(sender))
        .map(sender => sender.replaceTrack(newVideoTrack));
      await Promise.all(replacements);

      videoTrack.stop();
      localStream.removeTrack(videoTrack);
      localStream.addTrack(newVideoTrack);

      toast.success(t('calls.toasts.cameraSwitched'));
    } catch (error) {
      logger.error('[VideoCallInterface]', 'Failed to switch camera', { error });
      toast.error(t('calls.toasts.cameraSwitchFailed'));
    }
  };

  // Le watchdog lit le raccrochage et l'état via des refs : ré-armer la
  // fenêtre parce qu'une dépendance a changé fausserait le budget.
  const handleHangUpRef = useRef<() => void>(() => {});
  const connectionStateRef = useRef(connectionState);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    connectionStateRef.current = connectionState;
    if (connectionState === 'connected') {
      hasConnectedRef.current = true;
    }
  }, [connectionState]);

  useEffect(() => {
    // Seedé depuis l'état COURANT (pas `false` en dur) : un remontage sur un
    // appel déjà connecté ne doit jamais ré-ouvrir une fenêtre de kill.
    hasConnectedRef.current = connectionStateRef.current === 'connected';
    const timer = setTimeout(() => {
      if (hasConnectedRef.current) return;
      logger.warn('[VideoCallInterface]', 'Connect watchdog expired — ending the never-connected call', {
        callId,
      });
      // A never-connected call is a TRANSIENT failure — post a « Réessayer »
      // offer (consumed by useCallRetryToast at the conversation level, which
      // survives this teardown) instead of a dead-end toast. Fall back to the
      // plain timeout toast if the call context is already gone.
      const { currentCall, controls, offerCallRetry } = useCallStore.getState();
      if (currentCall?.conversationId) {
        offerCallRetry({
          conversationId: currentCall.conversationId,
          type: controls.videoEnabled ? 'video' : 'audio',
        });
      } else {
        toast.error(t('calls.toasts.connectTimeout'));
      }
      handleHangUpRef.current();
    }, CONNECT_WATCHDOG_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fenêtre par callId, jamais ré-armée par les re-render
  }, [callId]);

  const handleHangUp = useCallback(() => {
    logger.debug('[VideoCallInterface]', 'Hanging up - callId: ' + callId);

    // Check if we're still in a call before leaving
    const { currentCall, isInCall } = useCallStore.getState();
    if (!isInCall || !currentCall) {
      logger.debug('[VideoCallInterface]', 'Already left the call, skipping hangup');
      return;
    }

    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as unknown).emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
    }

    // Reset immediately for instant UI feedback
    reset();
  }, [callId, reset]);

  useEffect(() => {
    handleHangUpRef.current = handleHangUp;
  }, [handleHangUp]);

  // Listen for participant left events to show disconnected state
  // Regression: the 2s delayed cleanup below used to hand setTimeout() to
  // nobody — unmounting (or this effect re-running for a new callId)
  // mid-window left it armed, so it fired against whatever call was current
  // by then, tearing down a brand-new call's participant. Tracked per
  // participant so cleanup can cancel every pending timeout on teardown.
  const leaveCleanupTimeouts = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    const handleParticipantLeft = (event: unknown) => {
      if (event.callId !== callId) return;

      const participantId = event.userId || event.anonymousId;
      if (!participantId) return;

      logger.info('[VideoCallInterface]', 'Participant left event received', { participantId });

      // Mark participant as disconnected
      setDisconnectedParticipants((prev) => new Set(prev).add(participantId));

      // Snapshot the connection at leave-time so the delayed cleanup below can
      // detect a same-session rejoin (network blip, tab reload) within the
      // grace window and skip tearing down the *new* connection that already
      // replaced this one in the store.
      const connectionAtLeave = useCallStore.getState().peerConnections.get(participantId);

      const existingTimeout = leaveCleanupTimeouts.current.get(participantId);
      if (existingTimeout) clearTimeout(existingTimeout);

      // Remove their stream and peer connection after 2 seconds
      const timeoutId = setTimeout(() => {
        leaveCleanupTimeouts.current.delete(participantId);
        const { peerConnections, removeRemoteStream } = useCallStore.getState();

        if (peerConnections.get(participantId) !== connectionAtLeave) {
          // Participant already rejoined and got a fresh RTCPeerConnection
          // registered under the same id — leave it (and the offer guard
          // below) alone, only clear the stale disconnected-banner flag.
          setDisconnectedParticipants((prev) => {
            const newSet = new Set(prev);
            newSet.delete(participantId);
            return newSet;
          });
          return;
        }

        removeRemoteStream(participantId);
        // removeParticipant (not just the store's removePeerConnection) so the
        // WebRTCService/remoteDescriptionSetRef/iceCandidateQueueRef/offerInFlightRef
        // entries are cleared too — otherwise a same-session rejoin's initial
        // offer gets misrouted as a renegotiation against a closed connection.
        removeParticipant(participantId);

        // Sibling-drift fix: `offersCreatedFor` is only ever populated (or
        // cleared on createOffer failure) by the offer-creation effect above —
        // never on a participant leaving. If this same participant rejoins
        // while the component stays mounted (network blip, tab reload), the
        // effect would see them as already-offered and silently skip
        // `createOffer` forever, since the peer connection just torn down
        // above is gone but the guard never was.
        offersCreatedFor.current.delete(participantId);

        // Remove from disconnected set
        setDisconnectedParticipants((prev) => {
          const newSet = new Set(prev);
          newSet.delete(participantId);
          return newSet;
        });
      }, 2000);

      leaveCleanupTimeouts.current.set(participantId, timeoutId);
    };

    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);

    return () => {
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
      for (const timeoutId of leaveCleanupTimeouts.current.values()) {
        clearTimeout(timeoutId);
      }
      leaveCleanupTimeouts.current.clear();
    };
  }, [callId, removeParticipant]);

  // Get remote participant info
  const remoteParticipant = currentCall?.participants?.find(
    p => (p.userId || p.participantId) !== user?.id && !p.leftAt
  );

  // Toggle fullscreen for a participant
  const handleToggleFullscreen = (participantId: string) => {
    setFullscreenParticipantId((current) => (current === participantId ? null : participantId));
  };

  // Get the participant to display in fullscreen (or first remote participant by default)
  const displayParticipant = fullscreenParticipantId
    ? Array.from(remoteStreams.entries()).find(([id]) => id === fullscreenParticipantId)
    : Array.from(remoteStreams.entries())[0];

  // IMPORTANT: Early return AFTER all hooks to comply with React Rules of Hooks
  if (!user || !user.id) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-white text-lg">{t('calls.loading')}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Status Indicator */}
      <CallStatusIndicator
        connectionState={connectionState}
        callDuration={callDuration}
        participantName={remoteParticipant?.username || 'Unknown'}
      />

      {/* Connection quality + discreet survival pill + remote-peer alerts */}
      <CallQualityOverlay
        stats={qualityStats}
        showStats={showStats}
        videoSuspended={videoSuspended}
        userWantsVideo={controls.videoEnabled}
        remoteQualityDegraded={remoteQualityDegraded}
        remoteScreenCapturing={remoteScreenCapturing}
        participantName={remoteParticipant?.username || ''}
      />

      {/* Live translated captions from peers (call:translated-segment) */}
      <CallCaptionsOverlay
        captions={captions}
        resolveSpeakerName={(speakerId) =>
          currentCall?.participants?.find(
            (p) => (p.userId || p.participantId) === speakerId
          )?.username
        }
      />

      {/* Audio Effects Panel (Sliding from bottom) */}
      {showAudioEffects && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-40">
          <AudioEffectsCarousel
            effectsState={effectsState}
            onToggleEffect={toggleEffect}
            onUpdateParams={updateEffectParams}
            onLoadPreset={loadPreset}
            currentPreset={currentPreset}
            availablePresets={availablePresets}
            availableBackSounds={availableBackSounds}
            onClose={() => setShowAudioEffects(false)}
          />
        </div>
      )}

      {/* Remote Video - Full Screen (main participant) */}
      <div className="absolute inset-0">
        {displayParticipant ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={t('calls.stream.fullscreen')}
            className="w-full h-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            onClick={() => handleToggleFullscreen(displayParticipant[0])}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleFullscreen(displayParticipant[0]);
              }
            }}
          >
            <VideoStream
              key={displayParticipant[0]}
              stream={displayParticipant[1]}
              muted={false}
              isLocal={false}
              className="w-full h-full object-cover"
              participantName={
                currentCall?.participants?.find(
                  (p) => (p.userId || p.participantId) === displayParticipant[0]
                )?.username
              }
              isAudioEnabled={
                currentCall?.participants?.find(
                  (p) => (p.userId || p.participantId) === displayParticipant[0]
                )?.isAudioEnabled ?? true
              }
              isVideoEnabled={
                currentCall?.participants?.find(
                  (p) => (p.userId || p.participantId) === displayParticipant[0]
                )?.isVideoEnabled ?? true
              }
              isDisconnected={disconnectedParticipants.has(displayParticipant[0])}
              onRemove={() => {
                const { removeRemoteStream, removePeerConnection } = useCallStore.getState();
                removeRemoteStream(displayParticipant[0]);
                removePeerConnection(displayParticipant[0]);
              }}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">
                  {remoteParticipant?.username?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <p className="text-lg">{remoteParticipant?.username || t('calls.waiting.forParticipant')}</p>
              <p className="text-sm text-gray-400 mt-2">
                {connectionState === 'connecting' ? t('calls.status.connecting') : t('calls.waiting.noVideo')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Other Participants - Overlay (draggable) */}
      {Array.from(remoteStreams.entries())
        .filter(([id]) => id !== displayParticipant?.[0])
        .map(([participantId, stream], index) => {
          const participant = currentCall?.participants?.find(
            (p) => (p.userId || p.participantId) === participantId
          );

          return (
            <DraggableParticipantOverlay
              key={participantId}
              participantId={participantId}
              stream={stream}
              participantName={participant?.username}
              isAudioEnabled={participant?.isAudioEnabled ?? true}
              isVideoEnabled={participant?.isVideoEnabled ?? true}
              isDisconnected={disconnectedParticipants.has(participantId)}
              initialPosition={{ x: 20 + index * 160, y: 20 }}
              onDoubleClick={() => handleToggleFullscreen(participantId)}
              onRemove={() => {
                const { removeRemoteStream, removePeerConnection } = useCallStore.getState();
                removeRemoteStream(participantId);
                removePeerConnection(participantId);
              }}
            />
          );
        })}

      {/* Local Video - Draggable Overlay (with weak-link "paused" state) */}
      <LocalVideoTile
        stream={localStream}
        audioEnabled={controls.audioEnabled}
        videoEnabled={controls.videoEnabled}
        videoSuspended={videoSuspended}
        position={localVideoPosition}
        isDragging={isDragging}
        onDragStart={onDragStart}
      />

      {/* Call Controls */}
      <CallControls
        audioEnabled={controls.audioEnabled}
        videoEnabled={controls.videoEnabled}
        videoSuspended={videoSuspended}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onSwitchCamera={handleSwitchCamera}
        onToggleAudioEffects={() => setShowAudioEffects(!showAudioEffects)}
        onToggleStats={() => setShowStats(!showStats)}
        onHangUp={handleHangUp}
        audioEffectsActive={audioEffectsActive}
        showStats={showStats}
      />

      {/* Call Duration & Participant Count */}
      <CallInfoOverlay
        durationLabel={callDurationLabel}
        participantCount={currentCall?.participants.filter(p => !p.leftAt).length || 0}
      />
    </div>
  );
}
