/**
 * VIDEO CALL INTERFACE - Mobile-Responsive
 * Complete mobile-optimized video call UI with draggable local video
 */

'use client';

import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { useConversationQuery } from '@/hooks/queries/use-conversations-query';
import { isParticipantModerator } from '@/utils/participant-helpers';
import { callsService } from '@/services/calls.service';
import { useWebRTCP2P } from '@/hooks/use-webrtc-p2p';
import { useAudioEffects } from '@/hooks/use-audio-effects';
import { useCallQuality } from '@/hooks/use-call-quality';
import { useRemoteCallAlerts } from '@/hooks/use-remote-call-alerts';
import { useCallCaptions } from '@/hooks/use-call-captions';
import { useCallTranscriptJournal } from '@/hooks/use-call-transcript-journal';
import { useRemoteTranscriptionActive } from '@/hooks/use-remote-transcription-active';
import { useCallAnalyticsReporter } from '@/hooks/use-call-analytics-reporter';
import { usePeerConnections } from '@/hooks/use-peer-connections';
import {
  useAdaptiveDegradation,
  type AdaptiveDegradationActions,
} from '@/hooks/use-adaptive-degradation';
import { usePerPeerVideoTier } from '@/hooks/use-per-peer-video-tier';
import { useCallDuration } from '@/hooks/use-call-duration';
import { useDraggable } from '@/hooks/use-draggable';
import { VideoStream } from './VideoStream';
import { CallControls } from './CallControls';
import { AudioEffectsCarousel } from './AudioEffectsCarousel';
import { CallQualityOverlay } from './CallQualityOverlay';
import { CallCaptionsOverlay } from './CallCaptionsOverlay';
import { CallTranscriptPanel } from './CallTranscriptPanel';
import { CallInfoOverlay } from './CallInfoOverlay';
import { LocalVideoTile } from './LocalVideoTile';
import { DraggableParticipantOverlay } from './DraggableParticipantOverlay';
import { computeParticipantOverlayPosition } from '@/lib/calls/overlay-grid-layout';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallParticipantLeftEvent } from '@meeshy/shared/types/video-call';
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
  const [showTranscript, setShowTranscript] = useState(false);
  // Local-only: which output the user wants remote audio on. Never synced to
  // peers (unlike controls.audioEnabled/videoEnabled) — it drives `muted` on
  // every <video> element playing a remote stream, nothing else.
  const [speakerEnabled, setSpeakerEnabled] = useState(true);

  // Local self-view dragging + ticking call duration (extracted hooks).
  const { position: localVideoPosition, isDragging, onDragStart } = useDraggable({
    initial: { x: 20, y: 20 },
  });
  // Vague 110 (2026-08-12): anchor on `answeredAt`, never `startedAt`.
  // `startedAt` is stamped at ring-start (use-video-call.ts, CallManager's
  // acceptOrJoinCall) — for the CALLER specifically, that's the instant the
  // callee's device starts ringing, not when they pick up. Feeding it
  // straight into the ticking clock baked the entire ring delay into every
  // subsequent second of "call duration" shown on screen. `answeredAt` is
  // unset until the call is actually answered (CallManager's
  // handleParticipantJoined / acceptOrJoinCall), so the clock correctly
  // reads 0:00 while ringing and only starts ticking once picked up.
  const { seconds: callDuration, label: callDurationLabel } = useCallDuration(
    currentCall?.answeredAt
  );

  // New state for fullscreen mode and disconnected participants
  const [fullscreenParticipantId, setFullscreenParticipantId] = useState<string | null>(null);
  const [disconnectedParticipants, setDisconnectedParticipants] = useState<Set<string>>(new Set());

  // Stable error handler. useWebRTCP2P's aggregate-gated onError forwards a
  // small, known set of internal error codes (see use-webrtc-p2p.ts) — those
  // get a translated, user-facing message instead of the raw code leaking
  // into the toast (e.g. "Connection error: PEER_CONNECTION_FAILED"). Any
  // other message falls back to the generic prefixed form, unchanged, so a
  // genuinely unexpected error stays debuggable.
  const handleWebRTCError = useCallback((error: Error) => {
    logger.error('[VideoCallInterface]', 'WebRTC error: ' + error.message);
    const message =
      error.message === 'PEER_CONNECTION_FAILED' ? t('toasts.peerConnectionFailed')
      : error.message === 'ICE_CONNECTION_FAILED' ? t('toasts.iceConnectionFailed')
      : t('toasts.connectionError') + ': ' + error.message;
    toast.error(message);
  }, [t]);

  // Stable success handler, same forwarding contract as handleWebRTCError
  // above (Vague 153) — the hook has no i18n access, so it forwards the
  // call-connected signal here instead of toasting a hardcoded English
  // 'Connected!' regardless of locale.
  const handleWebRTCConnected = useCallback(() => {
    toast.success(t('toasts.connected'));
  }, [t]);

  // Initialize WebRTC
  const { initializeLocalStream, createOffer, connectionState, isReconnecting, enableVideo, disableVideo, switchCamera, applyQualityTierToPeer, removeParticipant } = useWebRTCP2P({
    callId,
    userId: user?.id,
    onError: handleWebRTCError,
    onConnected: handleWebRTCConnected,
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

  // Every peer connection for quality monitoring. MUST be selected reactively
  // from the store — connections are created lazily inside
  // createOffer/handleOffer, after this component mounts. A one-shot
  // useMemo([]) snapshot captured an empty map and stayed null forever, which
  // silently disabled quality monitoring, the adaptive bitrate ladder and
  // call:quality-report (root cause of the mid-call "instabilité de
  // connexion": the encoder never shed bitrate under congestion). In a group
  // call there can be more than one peer (W5,
  // `2026-08-13-group-calls-gap-analysis.md`) — useCallQuality aggregates
  // across all of them so a single struggling peer is never masked.
  const peerConnections = usePeerConnections();

  // Monitor call quality. callId is required for the server-side quality
  // report (call:quality-report) that drives congestion alerts and persists
  // "data spent / network quality" on the call summary.
  const { qualityStats, perPeerStats } = useCallQuality({
    peerConnections,
    callId,
    updateInterval: 2000,
  });

  // Remote-peer alerts relayed by the gateway (iOS/Android parity): the PEER's
  // sustained degradation (transient pill, 15 s auto-clear) and the privacy
  // signal when the peer captures the call screen.
  const {
    remoteQualityDegraded,
    remoteQualityDegradedParticipantId,
    remoteScreenCapturing,
    remoteScreenCapturingParticipantIds,
  } = useRemoteCallAlerts(callId);
  const { captions } = useCallCaptions(callId);
  // Journal de transcription (displayName (heure): message + tag de langue) —
  // alimenté par les DEUX transports : data channel WebRTC P2P quand le pair
  // l'a ouvert, relais serveur traduit sinon/en plus (fusion par id).
  // Abonnement lié au panneau : caché → désabonné des deux canaux ; le
  // journal accumulé reste et se réaffiche à la réouverture (reset au
  // changement d'appel uniquement).
  const { entries: transcriptEntries } = useCallTranscriptJournal(callId, { active: showTranscript });
  // Signal de présence : un pair a activé sa transcription → badge
  // d'invitation sur le bouton sous-titres (jamais gâté par le panneau
  // local — c'est l'invitation à l'ouvrir).
  const { peerTranscribing } = useRemoteTranscriptionActive(callId);

  // Signale aux pairs l'ouverture/fermeture de NOTRE panneau (le gateway
  // estampille l'émetteur et rediffuse `call:transcription-active`). Émis
  // uniquement sur transition réelle — jamais de `active: false` au mount.
  const transcriptActiveAnnouncedRef = useRef(false);
  useEffect(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;
    if (showTranscript && !transcriptActiveAnnouncedRef.current) {
      transcriptActiveAnnouncedRef.current = true;
      socket.emit(CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId, active: true });
    } else if (!showTranscript && transcriptActiveAnnouncedRef.current) {
      transcriptActiveAnnouncedRef.current = false;
      socket.emit(CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId, active: false });
    }
  }, [showTranscript, callId]);

  // Report per-call reliability telemetry at teardown (parité iOS/Android) —
  // the web was the one client that never emitted call:analytics, leaving the
  // reliability dashboard blind to web calls.
  useCallAnalyticsReporter({
    callId,
    connectionState,
    isReconnecting,
    qualityStats,
    // `metadata.type` is the call's actual nature — a mid-call camera toggle
    // (controls.videoEnabled) must not misreport an audio call as video (or
    // vice versa) in the reliability dashboard.
    isVideo: currentCall?.metadata?.type ? currentCall.metadata.type === 'video' : controls.videoEnabled,
  });

  // Check if any audio effect is active
  const audioEffectsActive = Object.values(effectsState).some(effect => effect.enabled);

  // Re-entrancy guard for the manual video on/off path (handleToggleVideo
  // below), which calls enableVideo()/disableVideo() (use-webrtc-p2p.ts) —
  // Vague 76 guarded the manual double-click. The adaptive-degradation
  // controller's own suspend()/resume() (right below) used to call those
  // same track-mutating methods and shared this guard for that reason
  // (Vague 82); since L6-3 they only flip a local `frozen` flag — no track
  // mutation, so they can no longer race handleToggleVideo/handleSwitchCamera
  // — but they still run through `runGuardedVideoToggle` below, which is
  // harmless and avoids re-opening that synchronization question for a
  // narrow, one-line change.
  const videoToggleInFlightRef = useRef(false);

  // Vague 92: same class of race, one hop over. `handleSwitchCamera` (below)
  // mutates the SAME localStream video track and the SAME peer-connection
  // senders as `handleToggleVideo`, via its own, entirely disconnected
  // `cameraSwitchInFlightRef` — Vague 82 unified manual-toggle-vs-auto-
  // suspend/resume (back when auto suspend/resume also mutated the track;
  // since L6-3 it no longer does) but left camera-switch-vs-manual-toggle
  // unguarded. A camera flip racing a manual toggle (e.g. a rapid
  // flip-then-turn-off) lets one path replaceTrack/stop a track the other
  // is still mid-acquisition on, orphaning a camera capture or reviving
  // video the user just turned off. `runGuardedVideoToggle` and
  // `handleSwitchCamera` now check EACH OTHER's ref in addition to their own.
  const cameraSwitchInFlightRef = useRef(false);

  // Wraps a video on/off operation with the guard above; rejects instead of
  // running when another video toggle (manual or automatic) — or a camera
  // switch — is already in flight. The adaptive-degradation controller's
  // existing suspend()/resume() `.catch()` handlers already revert its state
  // machine on rejection, so a rejected guard collision degrades correctly —
  // the automatic decision simply retries on the next quality sample.
  const runGuardedVideoToggle = useCallback(async (op: () => Promise<void>): Promise<void> => {
    if (videoToggleInFlightRef.current || cameraSwitchInFlightRef.current) {
      throw new Error('VIDEO_TOGGLE_IN_PROGRESS');
    }
    videoToggleInFlightRef.current = true;
    try {
      await op();
    } finally {
      videoToggleInFlightRef.current = false;
    }
  }, []);

  // Call-wide network-survival freeze (L6-3). Feeds the worst-of-the-call
  // aggregate quality into a hysteresis state machine that, after sustained
  // 'poor' quality, FREEZES outbound video (pins every peer's encoder to the
  // near-still 'frozen' floor via usePerPeerVideoTier below — no track
  // mutation, no renegotiation, no `call:toggle-video` to the peer) so the
  // call survives a link that can't carry even minimal motion, and thaws it
  // once the link has clearly recovered. The user's camera intent
  // (controls.videoEnabled) is authoritative — the controller never
  // re-enables video the user turned off. This is a LOCAL freeze flag; it
  // never disables the track or tells the peer, so the peer keeps rendering
  // our last (near-still) frame instead of an avatar placeholder.
  const [videoFrozen, setVideoFrozen] = useState(false);

  // Mirrors useAdaptiveDegradation's own "user turned the camera off: forget
  // survival state" reset (use-adaptive-degradation.ts) — that reset puts
  // its internal state machine back in `sending: true`, from which `resume()`
  // is unreachable until a FRESH poor→good cycle occurs. Without this,
  // freezing, then manually cycling the camera off/on, would leave
  // `videoFrozen` stuck true — silently pinning every peer's fresh track to
  // the 2 fps floor for the rest of the call even on a since-recovered link,
  // with no automatic path left to ever clear it.
  useEffect(() => {
    if (!controls.videoEnabled) {
      setVideoFrozen(false);
    }
  }, [controls.videoEnabled]);

  // applyTier is intentionally a no-op here: per-peer bitrate/tier shedding
  // is now owned by usePerPeerVideoTier below (Vague 143) — applying the
  // SAME tier call-wide, from the worst-of-the-call aggregate, would
  // immediately fight/override the more precise per-peer tiers it just set.
  // This hook still computes the action internally (harmlessly discarded)
  // because its 'poorSince' bookkeeping also drives the suspend decision
  // above, which DOES stay call-wide — see the hook's own doc comment for
  // why per-peer suspend/resume is a deliberate follow-up, not done here.
  const degradationActions = useMemo<AdaptiveDegradationActions>(() => ({
    applyTier: () => { /* per-peer tier controller owns bitrate shedding now */ },
    suspend: () => runGuardedVideoToggle(async () => {
      setVideoFrozen(true);
      toast.warning(t('toasts.videoSuspendedPoorConnection'));
    }),
    resume: () => runGuardedVideoToggle(async () => {
      setVideoFrozen(false);
      toast.success(t('toasts.videoResumed'));
    }),
  }), [runGuardedVideoToggle, t]);

  const { videoSuspended } = useAdaptiveDegradation({
    qualityStats,
    userWantsVideo: controls.videoEnabled,
    actions: degradationActions,
  });

  // Per-peer bitrate/tier shedding (Vague 143), and the sole actuator of the
  // call-wide network-survival freeze above (L6-3, via the `frozen` flag):
  // each peer's OWN link quality drives its OWN outbound encoder tier,
  // independent of every other peer, EXCEPT while `videoFrozen` is true, in
  // which case every peer is pinned to the 'frozen' floor regardless of its
  // own reading. applyQualityTierToPeer is a pure setParameters() call with
  // no track mutation, so it cannot race the manual-toggle/camera-switch
  // guards that only handleToggleVideo/handleSwitchCamera go through.
  usePerPeerVideoTier({
    perPeerStats,
    userWantsVideo: controls.videoEnabled,
    frozen: videoFrozen,
    applyTierToPeer: (peerId, tier) => {
      applyQualityTierToPeer(peerId, tier).catch(() => { /* best effort */ });
    },
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

    const activeParticipants = currentCall.participants?.filter(p => !p.leftAt) || [];
    const isInitiator = currentCall.initiatorId === user.id;

    activeParticipants.forEach((participant) => {
      const participantId = participant.userId || participant.participantId;

      if (!participantId || participantId === user.id) return;

      // Offer ownership. The initiator always owns every pair it's part of
      // (unchanged 1:1 behavior). For any OTHER pair — two non-initiator
      // participants in a group call — nobody owns it by role, so each side
      // independently resolves the SAME owner via a deterministic id
      // tie-break (same idea as WebRTCService.setNegotiationRole's
      // polite/impolite split): the lexicographically smaller user id
      // creates the offer, the other side waits for it. Before this, the
      // effect was gated on `currentCall.initiatorId !== user.id` and bailed
      // out entirely for non-initiators — only the initiator ever created an
      // offer, so a 3+ person call was a star (everyone connects to the
      // initiator) rather than a mesh: non-initiator participants never saw
      // or heard each other at all.
      const participantIsInitiator = participantId === currentCall.initiatorId;
      const ownsOffer = isInitiator || (!participantIsInitiator && user.id < participantId);

      if (!ownsOffer) return;

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

  // Route outgoing audio through the processed (effects) track while any
  // effect is enabled, and through the raw microphone track otherwise.
  // Deliberately a single effect with NO cleanup: an effect's cleanup runs
  // with the closure captured at the render that scheduled it — i.e. always
  // the PREVIOUS value of `audioEffectsActive`, never the one that triggered
  // the re-run. A prior version branched on `!audioEffectsActive` inside the
  // cleanup to decide whether to restore the raw track, which read that
  // stale value: turning effects OFF left the processed track on the wire
  // (restore silently skipped), and turning them ON briefly restored the raw
  // track before the processed one landed (audible blip). Picking the
  // target track directly in the effect body — which always sees the
  // CURRENT render's values — sidesteps the whole class of bug, and also
  // means a new participant (peerConnectionsCount change) is naturally
  // wired to whatever's currently playing rather than always the processed
  // stream regardless of `audioEffectsActive`.
  useEffect(() => {
    if (!localStream) return;

    const peerConnections = useCallStore.getState().peerConnections;
    if (peerConnections.size === 0) {
      logger.debug('[VideoCallInterface]', 'No peer connections yet, audio routing will be applied when connections are created');
      return;
    }

    const targetStream = audioEffectsActive ? processedAudioStream : localStream;
    const targetTracks = targetStream?.getAudioTracks() ?? [];
    if (targetTracks.length === 0) {
      logger.warn('[VideoCallInterface]', 'No audio tracks available to route', { audioEffectsActive });
      return;
    }

    const targetTrack = targetTracks[0];
    logger.info('[VideoCallInterface]', 'Routing outgoing audio track', {
      audioEffectsActive,
      trackId: targetTrack.id,
      peerConnectionsCount
    });

    peerConnections.forEach((peerConnection, participantId) => {
      const senders = peerConnection.getSenders();
      const audioSender = senders.find(sender => sender.track?.kind === 'audio');

      if (!audioSender) {
        logger.warn('[VideoCallInterface]', 'No audio sender found for participant', { participantId });
        return;
      }
      if (audioSender.track?.id === targetTrack.id) return;

      audioSender.replaceTrack(targetTrack)
        .then(() => {
          logger.debug('[VideoCallInterface]', 'Audio track replaced successfully', { participantId });
        })
        .catch((error) => {
          logger.error('[VideoCallInterface]', 'Failed to replace audio track', { participantId, error });
        });
    });
  }, [processedAudioStream, localStream, audioEffectsActive, peerConnectionsCount]);

  // Cleanup on unmount and page unload
  useEffect(() => {
    const cleanup = () => {
      const { currentCall, isInCall } = useCallStore.getState();
      if (isInCall && currentCall) {
        logger.info('[VideoCallInterface]', 'Cleaning up call on unmount/unload - callId: ' + currentCall.id);
        const socket = meeshySocketIOService.getSocket();
        if (socket && socket.connected) {
          socket.emit(CLIENT_EVENTS.CALL_LEAVE, { callId: currentCall.id });
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

  // Toggles whether remote audio is audible. Purely local playback state —
  // never emitted to the socket (unlike audio/video), since it has no
  // meaning for the other participants.
  const handleToggleSpeaker = () => {
    setSpeakerEnabled((prev) => !prev);
  };

  // Handle media toggles
  const handleToggleAudio = () => {
    const newEnabled = !controls.audioEnabled;
    toggleAudio();

    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      socket.emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId, enabled: newEnabled });
    }
  };

  const handleToggleVideo = async () => {
    if (videoToggleInFlightRef.current || cameraSwitchInFlightRef.current) return;
    videoToggleInFlightRef.current = true;
    try {
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
        toast.error(t('toasts.videoSwitchFailed'));
        return;
      }

      setControls({ videoEnabled: newEnabled });

      const socket = meeshySocketIOService.getSocket();
      if (socket) {
        socket.emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId, enabled: newEnabled });
      }
    } finally {
      videoToggleInFlightRef.current = false;
    }
  };

  const handleSwitchCamera = async () => {
    if (cameraSwitchInFlightRef.current || videoToggleInFlightRef.current) return;
    cameraSwitchInFlightRef.current = true;
    try {
      if (!localStream) return;

      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) return;

      const constraints = videoTrack.getConstraints();
      const currentFacingMode = (constraints as unknown).facingMode || 'user';
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      // Track acquisition + per-peer replaceTrack/stop sequencing lives in
      // switchCamera() (use-webrtc-p2p.ts), which mirrors enableVideo()'s
      // "one real track + N clones" ownership model — giving the first peer
      // the literal camera track and every other peer a `.clone()` — so a
      // group call's per-peer WebRTCService bookkeeping stays accurate.
      await switchCamera(newFacingMode);

      toast.success(t('toasts.cameraSwitched'));
    } catch (error) {
      logger.error('[VideoCallInterface]', 'Failed to switch camera', { error });
      toast.error(t('toasts.cameraSwitchFailed'));
    } finally {
      cameraSwitchInFlightRef.current = false;
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
          type: currentCall.metadata?.type ?? (controls.videoEnabled ? 'video' : 'audio'),
        });
      } else {
        toast.error(t('toasts.connectTimeout'));
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
      socket.emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
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

    const handleParticipantLeft = (event: CallParticipantLeftEvent) => {
      if (event.callId !== callId) return;

      // Vague 133 — `CallParticipantLeftEvent` has no `anonymousId` field
      // (see packages/shared/types/video-call.ts); that fallback was always
      // dead. `participantId` (the DB CallParticipant id) is the one field
      // the event always carries — fall back to it instead so a payload
      // whose optional `userId` is absent still disconnects/cleans up the
      // right tile instead of silently no-oping.
      const participantId = event.userId || event.participantId;
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

  // Vague 131 — `remoteParticipant` above is an arbitrary "first non-self"
  // pick, correct only for a 1:1 call. `remoteQualityDegraded`/
  // `remoteScreenCapturing` are call-WIDE aggregates (Vague 129) but each
  // alert is still ABOUT a specific peer (already relayed by the gateway and
  // exposed by useRemoteCallAlerts below) — in a group call that peer is not
  // necessarily `remoteParticipant`. Resolve each alert's name independently
  // instead of reusing the same guess for both.
  //
  // The id passed in here is `useRemoteCallAlerts`' resolved identity
  // (`event.userId ?? event.participantId`, Vague 132) — a real `User.id`
  // whenever the gateway sends one, matching what every roster entry's
  // `.userId` already carries. It is NOT the raw `CallScreenCaptureEvent`/
  // `CallQualityAlertEvent.participantId` field (a `Participant.id`, which
  // never matches this roster lookup for a registered peer) — that
  // translation must happen upstream in the hook, not here.
  const resolveParticipantName = (participantId: string | null | undefined): string =>
    (participantId
      ? currentCall?.participants?.find((p) => (p.userId || p.participantId) === participantId)?.username
      : undefined) || '';

  // Group calls — moderator "remove participant" (W6,
  // `tasks/2026-08-13-group-calls-gap-analysis.md`). Conversation role is
  // NOT on `CallParticipant` (that `role` field is call-session
  // initiator/participant, unrelated) — same idiom as
  // `useParticipantManagement`, cross-referenced against the conversation's
  // own participant roster.
  const { data: conversation } = useConversationQuery(currentCall?.conversationId);
  const canKickParticipants = useMemo(() => {
    if (!conversation || !user || conversation.type !== 'group') return false;
    const membership = conversation.participants?.find((p) => p.userId === user.id);
    return isParticipantModerator(membership?.role || 'member');
  }, [conversation, user]);

  const handleKickParticipant = useCallback(
    async (participantId: string) => {
      if (!currentCall) return;
      try {
        await callsService.removeParticipant(currentCall.id, participantId);
        toast.success(t('toasts.participantRemoved'));
        // No local store mutation here on purpose: the gateway broadcasts
        // `SERVER_EVENTS.CALL_PARTICIPANT_LEFT` on success (fixed
        // 2026-08-15), reconciled by the existing listener above for every
        // participant, including this one.
      } catch (error) {
        logger.error('[VideoCallInterface]', 'Failed to remove participant', {
          participantId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error(t('toasts.removeParticipantFailed'));
      }
    },
    [currentCall, t]
  );

  // Toggle fullscreen for a participant
  const handleToggleFullscreen = (participantId: string) => {
    setFullscreenParticipantId((current) => (current === participantId ? null : participantId));
  };

  // Get the participant to display in fullscreen (or first remote participant by default).
  // Audit web-calls (2026-08-15): the pinned participant leaving the call
  // used to blank the main view for the rest of the call — `remoteStreams`
  // correctly drops their entry, but the ternary below only fell back to
  // the first remaining participant when `fullscreenParticipantId` was
  // falsy, never when the pinned id simply has no match anymore. `??`
  // covers both: a stale pin now falls back exactly like no pin at all.
  const displayParticipant = (fullscreenParticipantId
    ? Array.from(remoteStreams.entries()).find(([id]) => id === fullscreenParticipantId)
    : undefined
  ) ?? Array.from(remoteStreams.entries())[0];

  // IMPORTANT: Early return AFTER all hooks to comply with React Rules of Hooks
  if (!user || !user.id) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-white text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Connection quality + discreet survival pill + remote-peer alerts */}
      <CallQualityOverlay
        stats={qualityStats}
        showStats={showStats}
        videoSuspended={videoSuspended}
        userWantsVideo={controls.videoEnabled}
        remoteQualityDegraded={remoteQualityDegraded}
        remoteScreenCapturing={remoteScreenCapturing}
        qualityDegradedParticipantName={resolveParticipantName(remoteQualityDegradedParticipantId)}
        screenCapturingParticipantName={resolveParticipantName(remoteScreenCapturingParticipantIds[0])}
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

      {/* Journal de transcription — displayName (heure): message + tag langue */}
      {showTranscript && (
        <CallTranscriptPanel
          entries={transcriptEntries}
          localUserId={user?.id}
          resolveSpeakerName={(speakerId) =>
            currentCall?.participants?.find(
              (p) => (p.userId || p.participantId) === speakerId
            )?.username
          }
        />
      )}

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
            aria-label={t('stream.fullscreen')}
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
              muted={!speakerEnabled}
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
              onKickParticipant={
                canKickParticipants
                  ? () => handleKickParticipant(displayParticipant[0])
                  : undefined
              }
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
              <p className="text-lg">{remoteParticipant?.username || t('waiting.forParticipant')}</p>
              <p className="text-sm text-gray-400 mt-2">
                {connectionState === 'connecting' ? t('status.connecting') : t('waiting.noVideo')}
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
              muted={!speakerEnabled}
              initialPosition={
                typeof window !== 'undefined'
                  ? computeParticipantOverlayPosition({
                      index,
                      viewportWidth: window.innerWidth,
                      viewportHeight: window.innerHeight,
                    })
                  : { x: 20, y: 20 }
              }
              onDoubleClick={() => handleToggleFullscreen(participantId)}
              onRemove={() => {
                const { removeRemoteStream, removePeerConnection } = useCallStore.getState();
                removeRemoteStream(participantId);
                removePeerConnection(participantId);
              }}
              onKickParticipant={
                canKickParticipants ? () => handleKickParticipant(participantId) : undefined
              }
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
        speakerEnabled={speakerEnabled}
        videoSuspended={videoSuspended}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onToggleSpeaker={handleToggleSpeaker}
        onSwitchCamera={handleSwitchCamera}
        onToggleAudioEffects={() => setShowAudioEffects(!showAudioEffects)}
        onToggleStats={() => setShowStats(!showStats)}
        onToggleTranscript={() => setShowTranscript(!showTranscript)}
        onHangUp={handleHangUp}
        audioEffectsActive={audioEffectsActive}
        showStats={showStats}
        showTranscript={showTranscript}
        transcriptInvite={peerTranscribing && !showTranscript}
      />

      {/* Call Duration & Participant Count */}
      {/*
        Vague 120 — `currentCall.participants` never includes the local user:
        the gateway deliberately skips echoing `call:participant-joined` back
        to the socket that just joined (CallEventsHandler.ts), and the
        caller's own optimistic `setCurrentCall` on the `call:initiate` ack
        seeds `participants: []` (use-video-call.ts). This component only
        ever mounts while `isInCall` is true, so the local user is always
        part of the call — +1 makes the visible count match reality instead
        of showing "0 participants" while ringing, or under-counting by one
        once connected.
      */}
      <CallInfoOverlay
        durationLabel={callDurationLabel}
        participantCount={(currentCall?.participants.filter(p => !p.leftAt).length || 0) + 1}
      />
    </div>
  );
}
