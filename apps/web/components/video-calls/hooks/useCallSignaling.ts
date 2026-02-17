/**
 * USE CALL SIGNALING HOOK
 * Socket.IO integration for WebRTC signaling
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { logger } from '@/utils/logger';
import type {
  CallSignalEvent,
  WebRTCSignal,
  CallInitiatedEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
} from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

export interface UseCallSignalingOptions {
  callId: string;
  userId?: string;
  onCallInitiated?: (event: CallInitiatedEvent) => void;
  onParticipantJoined?: (event: CallParticipantJoinedEvent) => void;
  onParticipantLeft?: (event: CallParticipantLeftEvent) => void;
  onCallEnded?: (event: CallEndedEvent) => void;
  onMediaToggle?: (event: CallMediaToggleEvent) => void;
  onSignal?: (signal: WebRTCSignal) => void;
  onError?: (error: Error) => void;
}

export function useCallSignaling(options: UseCallSignalingOptions) {
  const {
    callId,
    userId,
    onCallInitiated,
    onParticipantJoined,
    onParticipantLeft,
    onCallEnded,
    onMediaToggle,
    onSignal,
    onError,
  } = options;

  const handlersRef = useRef({
    onCallInitiated,
    onParticipantJoined,
    onParticipantLeft,
    onCallEnded,
    onMediaToggle,
    onSignal,
    onError,
  });

  // Update handlers ref when they change
  useEffect(() => {
    handlersRef.current = {
      onCallInitiated,
      onParticipantJoined,
      onParticipantLeft,
      onCallEnded,
      onMediaToggle,
      onSignal,
      onError,
    };
  }, [onCallInitiated, onParticipantJoined, onParticipantLeft, onCallEnded, onMediaToggle, onSignal, onError]);

  /**
   * Send WebRTC signal
   */
  const sendSignal = useCallback((signal: Omit<WebRTCSignal, 'from'>) => {
    if (!userId) {
      logger.error('[useCallSignaling]', 'Cannot send signal: userId not available');
      return;
    }

    const socket = meeshySocketIOService.getSocket();
    if (!socket) {
      logger.error('[useCallSignaling]', 'Socket not available');
      return;
    }

    const fullSignal: WebRTCSignal = {
      ...signal,
      from: userId,
    };

    socket.emit(CLIENT_EVENTS.CALL_SIGNAL, {
      callId,
      signal: fullSignal,
    } as CallSignalEvent);

    logger.debug('[useCallSignaling]', 'Signal sent', {
      type: signal.type,
      to: signal.to,
    });
  }, [callId, userId]);

  /**
   * Join call
   */
  const joinCall = useCallback((settings?: { audioEnabled?: boolean; videoEnabled?: boolean }) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) {
      logger.error('[useCallSignaling]', 'Socket not available');
      return;
    }

    socket.emit(CLIENT_EVENTS.CALL_JOIN, {
      callId,
      settings: settings || { audioEnabled: true, videoEnabled: true },
    });

    logger.info('[useCallSignaling]', 'Join call emitted', { callId });
  }, [callId]);

  /**
   * Leave call
   */
  const leaveCall = useCallback(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) {
      logger.error('[useCallSignaling]', 'Socket not available');
      return;
    }

    socket.emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
    logger.info('[useCallSignaling]', 'Leave call emitted', { callId });
  }, [callId]);

  /**
   * Toggle audio
   */
  const toggleAudio = useCallback((enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    socket.emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId, enabled });
    logger.debug('[useCallSignaling]', 'Toggle audio emitted', { enabled });
  }, [callId]);

  /**
   * Toggle video
   */
  const toggleVideo = useCallback((enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    socket.emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId, enabled });
    logger.debug('[useCallSignaling]', 'Toggle video emitted', { enabled });
  }, [callId]);

  /**
   * Setup Socket.IO listeners
   */
  useEffect(() => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) {
      logger.warn('[useCallSignaling]', 'Socket not available for listeners');
      return;
    }

    const handleSignal = (event: CallSignalEvent) => {
      if (event.callId !== callId) return;
      handlersRef.current.onSignal?.(event.signal);
    };

    const handleCallInitiated = (event: CallInitiatedEvent) => {
      if (event.callId !== callId) return;
      handlersRef.current.onCallInitiated?.(event);
    };

    const handleParticipantJoined = (event: CallParticipantJoinedEvent) => {
      if (event.callId !== callId) return;
      handlersRef.current.onParticipantJoined?.(event);
    };

    const handleParticipantLeft = (event: CallParticipantLeftEvent) => {
      if (event.callId !== callId) return;
      handlersRef.current.onParticipantLeft?.(event);
    };

    const handleCallEnded = (event: CallEndedEvent) => {
      if (event.callId !== callId) return;
      handlersRef.current.onCallEnded?.(event);
    };

    const handleMediaToggle = (event: CallMediaToggleEvent) => {
      if (event.callId !== callId) return;
      handlersRef.current.onMediaToggle?.(event);
    };

    const handleError = (error: any) => {
      logger.error('[useCallSignaling]', 'Call error', { error });
      handlersRef.current.onError?.(new Error(error.message || 'Call error'));
    };

    // Register listeners
    socket.on(SERVER_EVENTS.CALL_SIGNAL, handleSignal);
    socket.on(SERVER_EVENTS.CALL_INITIATED, handleCallInitiated);
    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoined);
    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
    socket.on(SERVER_EVENTS.CALL_ENDED, handleCallEnded);
    socket.on(SERVER_EVENTS.CALL_MEDIA_TOGGLED, handleMediaToggle);
    socket.on(SERVER_EVENTS.CALL_ERROR, handleError);

    logger.info('[useCallSignaling]', 'Socket listeners registered', { callId });

    return () => {
      socket.off(SERVER_EVENTS.CALL_SIGNAL, handleSignal);
      socket.off(SERVER_EVENTS.CALL_INITIATED, handleCallInitiated);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoined);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
      socket.off(SERVER_EVENTS.CALL_ENDED, handleCallEnded);
      socket.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED, handleMediaToggle);
      socket.off(SERVER_EVENTS.CALL_ERROR, handleError);

      logger.debug('[useCallSignaling]', 'Socket listeners cleaned up', { callId });
    };
  }, [callId]);

  return {
    sendSignal,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
  };
}
