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

    socket.emit('call:signal', {
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

    socket.emit('call:join', {
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

    socket.emit('call:leave', { callId });
    logger.info('[useCallSignaling]', 'Leave call emitted', { callId });
  }, [callId]);

  /**
   * Toggle audio
   */
  const toggleAudio = useCallback((enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    socket.emit('call:toggle-audio', { callId, enabled });
    logger.debug('[useCallSignaling]', 'Toggle audio emitted', { enabled });
  }, [callId]);

  /**
   * Toggle video
   */
  const toggleVideo = useCallback((enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    socket.emit('call:toggle-video', { callId, enabled });
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
    socket.on('call:signal', handleSignal);
    socket.on('call:initiated', handleCallInitiated);
    socket.on('call:participant-joined', handleParticipantJoined);
    socket.on('call:participant-left', handleParticipantLeft);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:media-toggled', handleMediaToggle);
    socket.on('call:error', handleError);

    logger.info('[useCallSignaling]', 'Socket listeners registered', { callId });

    return () => {
      socket.off('call:signal', handleSignal);
      socket.off('call:initiated', handleCallInitiated);
      socket.off('call:participant-joined', handleParticipantJoined);
      socket.off('call:participant-left', handleParticipantLeft);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:media-toggled', handleMediaToggle);
      socket.off('call:error', handleError);

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
