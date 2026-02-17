/**
 * VIDEO CALL INTERFACE - Mobile-Responsive
 * Complete mobile-optimized video call UI with draggable local video
 */

'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { useWebRTCP2P } from '@/hooks/use-webrtc-p2p';
import { useAudioEffects } from '@/hooks/use-audio-effects';
import { useCallQuality } from '@/hooks/use-call-quality';
import { VideoStream } from './VideoStream';
import { CallControls } from './CallControls';
import { CallStatusIndicator } from './CallStatusIndicator';
import { AudioEffectsCarousel } from './AudioEffectsCarousel';
import { ConnectionQualityBadge } from './ConnectionQualityBadge';
import { DraggableParticipantOverlay } from './DraggableParticipantOverlay';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VideoCallInterfaceProps {
  callId: string;
}

export function VideoCallInterface({ callId }: VideoCallInterfaceProps) {
  const { user } = useAuth();
  const {
    localStream,
    remoteStreams,
    currentCall,
    controls,
    toggleAudio,
    toggleVideo,
    reset,
  } = useCallStore();

  const [localVideoPosition, setLocalVideoPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [callDuration, setCallDuration] = useState(0);
  const [showAudioEffects, setShowAudioEffects] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // New state for fullscreen mode and disconnected participants
  const [fullscreenParticipantId, setFullscreenParticipantId] = useState<string | null>(null);
  const [disconnectedParticipants, setDisconnectedParticipants] = useState<Set<string>>(new Set());

  // Stable error handler
  const handleWebRTCError = useCallback((error: Error) => {
    logger.error('[VideoCallInterface]', 'WebRTC error: ' + error.message);
    toast.error('Call connection error: ' + error.message);
  }, []);

  // Initialize WebRTC
  const { initializeLocalStream, createOffer, connectionState } = useWebRTCP2P({
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

  // Get active peer connection for quality monitoring
  const activePeerConnection = React.useMemo(() => {
    const peerConnections = useCallStore.getState().peerConnections;
    return peerConnections.size > 0 ? Array.from(peerConnections.values())[0] : null;
  }, []);

  // Monitor call quality
  const { qualityStats } = useCallQuality({
    peerConnection: activePeerConnection,
    updateInterval: 2000,
  });

  // Check if any audio effect is active
  const audioEffectsActive = Object.values(effectsState).some(effect => effect.enabled);

  // Initialize local stream on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // SAFARI FIX: Check for pre-authorized stream first
        const preauthorizedStream = (window as any).__preauthorizedMediaStream;

        if (preauthorizedStream) {
          logger.info('[VideoCallInterface]', '✅ Using pre-authorized media stream (Safari-compatible)');

          // Use the pre-authorized stream directly
          const { setLocalStream } = useCallStore.getState();
          setLocalStream(preauthorizedStream);

          // Clean up the global reference
          delete (window as any).__preauthorizedMediaStream;
        } else {
          logger.debug('[VideoCallInterface]', 'No pre-authorized stream, requesting permissions now');
          await initializeLocalStream();
        }
      } catch (error) {
        if (mounted) {
          logger.error('[VideoCallInterface]', 'Failed to initialize local stream: ' + (error?.message || 'Unknown error'));
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [initializeLocalStream]);

  // Track call duration
  useEffect(() => {
    if (!currentCall?.startedAt) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(currentCall.startedAt).getTime()) / 1000);
      setCallDuration(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentCall?.startedAt]);

  // Handle creating offers for participants
  const offersCreatedFor = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentCall || !user) return;

    if (currentCall.initiatorId !== user.id) return;

    const activeParticipants = currentCall.participants?.filter(p => !p.leftAt) || [];

    activeParticipants.forEach((participant) => {
      const participantId = participant.userId || participant.anonymousId;

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
      (state) => state.peerConnections.size,
      (size) => setPeerConnectionsCount(size)
    );
    return unsubscribe;
  }, []);

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
          (socket as any).emit(CLIENT_EVENTS.CALL_LEAVE, { callId: currentCall.id });
        }
      }
    };

    // Handle page refresh/close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
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
      (socket as any).emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId, enabled: newEnabled });
    }
  };

  const handleToggleVideo = () => {
    const newEnabled = !controls.videoEnabled;
    toggleVideo();

    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as any).emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId, enabled: newEnabled });
    }
  };

  const handleSwitchCamera = async () => {
    try {
      if (!localStream) return;

      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) return;

      const constraints = videoTrack.getConstraints();
      const currentFacingMode = (constraints as any).facingMode || 'user';
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track in peer connections
      useCallStore.getState().peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      });

      videoTrack.stop();
      localStream.removeTrack(videoTrack);
      localStream.addTrack(newVideoTrack);

      toast.success('Camera switched');
    } catch (error) {
      logger.error('[VideoCallInterface]', 'Failed to switch camera', { error });
      toast.error('Failed to switch camera');
    }
  };

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
      (socket as any).emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
    }

    // Reset immediately for instant UI feedback
    reset();
  }, [callId, reset]);

  // Draggable local video handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - localVideoPosition.x, y: clientY - localVideoPosition.y });
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const newX = clientX - dragStart.x;
    const newY = clientY - dragStart.y;

    // Constrain to viewport
    const maxX = window.innerWidth - 160;
    const maxY = window.innerHeight - 240;

    setLocalVideoPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging, dragStart]);

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove]);

  // Format call duration
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Listen for participant left events to show disconnected state
  useEffect(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    const handleParticipantLeft = (event: any) => {
      if (event.callId !== callId) return;

      const participantId = event.userId || event.anonymousId;
      if (!participantId) return;

      logger.info('[VideoCallInterface]', 'Participant left event received', { participantId });

      // Mark participant as disconnected
      setDisconnectedParticipants((prev) => new Set(prev).add(participantId));

      // Remove their stream and peer connection after 2 seconds
      setTimeout(() => {
        const { removeRemoteStream, removePeerConnection } = useCallStore.getState();
        removeRemoteStream(participantId);
        removePeerConnection(participantId);

        // Remove from disconnected set
        setDisconnectedParticipants((prev) => {
          const newSet = new Set(prev);
          newSet.delete(participantId);
          return newSet;
        });
      }, 2000);
    };

    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);

    return () => {
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
    };
  }, [callId]);

  // Get remote participant info
  const remoteParticipant = currentCall?.participants?.find(
    p => (p.userId || p.anonymousId) !== user?.id && !p.leftAt
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
        <div className="text-white text-lg">Loading call...</div>
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

      {/* Connection Quality Badge */}
      <div className="absolute top-4 right-4">
        <ConnectionQualityBadge stats={qualityStats} showAlways={showStats} />
      </div>

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
            className="w-full h-full cursor-pointer"
            onClick={() => handleToggleFullscreen(displayParticipant[0])}
          >
            <VideoStream
              key={displayParticipant[0]}
              stream={displayParticipant[1]}
              muted={false}
              isLocal={false}
              className="w-full h-full object-cover"
              participantName={
                currentCall?.participants?.find(
                  (p) => (p.userId || p.anonymousId) === displayParticipant[0]
                )?.username
              }
              isAudioEnabled={
                currentCall?.participants?.find(
                  (p) => (p.userId || p.anonymousId) === displayParticipant[0]
                )?.isAudioEnabled ?? true
              }
              isVideoEnabled={
                currentCall?.participants?.find(
                  (p) => (p.userId || p.anonymousId) === displayParticipant[0]
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
              <p className="text-lg">{remoteParticipant?.username || 'Waiting for participant...'}</p>
              <p className="text-sm text-gray-400 mt-2">
                {connectionState === 'connecting' ? 'Connecting...' : 'No video'}
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
            (p) => (p.userId || p.anonymousId) === participantId
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

      {/* Local Video - Draggable Overlay */}
      <div
        className={cn(
          'absolute rounded-lg overflow-hidden shadow-2xl cursor-move',
          'w-32 h-40 md:w-40 md:h-52',
          'transition-shadow hover:shadow-3xl',
          isDragging && 'cursor-grabbing'
        )}
        style={{
          left: `${localVideoPosition.x}px`,
          top: `${localVideoPosition.y}px`,
        }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <VideoStream
          stream={localStream}
          muted={true}
          isLocal={true}
          className="w-full h-full object-cover transform -scale-x-100"
          participantName="You"
          isAudioEnabled={controls.audioEnabled}
          isVideoEnabled={controls.videoEnabled}
        />
      </div>

      {/* Call Controls */}
      <CallControls
        audioEnabled={controls.audioEnabled}
        videoEnabled={controls.videoEnabled}
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
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
          <p className="text-white text-sm font-medium">
            {formatDuration(callDuration)}
          </p>
        </div>
        <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
          <p className="text-white text-sm">
            {currentCall?.participants.filter(p => !p.leftAt).length || 0} participant(s)
          </p>
        </div>
      </div>
    </div>
  );
}
