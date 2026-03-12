/**
 * CALL MANAGER COMPONENT
 * Orchestrates call lifecycle: incoming calls, joining, leaving, signaling
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { CallNotification } from './CallNotification';
import { VideoCallInterface } from '@/components/video-calls/VideoCallInterface';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import type {
  CallInitiatedEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
  CallError,
} from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const CALL_TIMEOUT_MS = 30000; // 30 seconds

export function CallManager() {
  const router = useRouter();
  const { user, isChecking } = useAuth();
  const {
    currentCall,
    isInCall,
    setCurrentCall,
    setInCall,
    addParticipant,
    removeParticipant,
    updateParticipant,
    reset,
    removeRemoteStream,
    removePeerConnection,
  } = useCallStore();

  const [incomingCall, setIncomingCall] = useState<CallInitiatedEvent | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          (socket as any).emit(CLIENT_EVENTS.CALL_LEAVE, { callId });
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
    [addParticipant, setCurrentCall, clearCallTimeout]
  );

  /**
   * Handle participant left
   */
  const handleParticipantLeft = useCallback(
    (event: CallParticipantLeftEvent) => {
      logger.info('[CallManager]', 'Participant left - callId: ' + event.callId + ', participantId: ' + event.participantId, {
        userId: event.userId,
        anonymousId: (event as any).anonymousId,
        mode: event.mode
      });

      // Use userId for WebRTC cleanup (peer connections and streams are tracked by userId)
      const userIdForCleanup = event.userId || (event as any).anonymousId;


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

    logger.error('[CallManager]', 'Call error: ' + errorMessage, { error });
    toast.error(errorMessage);
  }, []);

  /**
   * Accept incoming call
   */
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall) return;

    logger.debug('[CallManager]', 'Accepting call - callId: ' + incomingCall.callId);

    try {
      // Clear timeout since we're accepting
      clearCallTimeout();

      // Stop ringtone immediately
      import('@/utils/ringtone').then(({ stopRingtone }) => {
        stopRingtone();
      });

      // Join call via Socket.IO - CallInterface will initialize local stream
      const socket = meeshySocketIOService.getSocket();
      if (!socket) {
        throw new Error('No socket connection');
      }

      (socket as any).emit(CLIENT_EVENTS.CALL_JOIN, {
        callId: incomingCall.callId,
        settings: {
          audioEnabled: true,
          videoEnabled: true,
        },
      });

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
    } catch (error: any) {
      logger.error('[CallManager]', 'Failed to accept call: ' + (error?.message || 'Unknown error'));
      toast.error('Failed to join call');
      setIncomingCall(null);
    }
  }, [incomingCall, setCurrentCall, setInCall, clearCallTimeout]);

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
    });

    // Emit leave event
    const socket = meeshySocketIOService.getSocket();
    if (socket) {
      (socket as any).emit(CLIENT_EVENTS.CALL_LEAVE, {
        callId: incomingCall.callId,
      });
    }

    // Clear notification
    setIncomingCall(null);

    // Toast métier désactivé - utiliser le système de notifications v2
  }, [incomingCall, clearCallTimeout]);

  // Stable refs for all handlers - prevents useEffect re-fires on every render
  const handleIncomingCallRef = useRef(handleIncomingCall);
  const handleParticipantJoinedRef = useRef(handleParticipantJoined);
  const handleParticipantLeftRef = useRef(handleParticipantLeft);
  const handleCallEndedRef = useRef(handleCallEnded);
  const handleMediaToggleRef = useRef(handleMediaToggle);
  const handleCallErrorRef = useRef(handleCallError);

  // Keep refs in sync (no dep array = runs every render, which is correct for refs)
  useEffect(() => {
    handleIncomingCallRef.current = handleIncomingCall;
    handleParticipantJoinedRef.current = handleParticipantJoined;
    handleParticipantLeftRef.current = handleParticipantLeft;
    handleCallEndedRef.current = handleCallEnded;
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
    let debugListenerRef: ((eventName: string, ...args: any[]) => void) | null = null;

    const attachListeners = (socket: any) => {
      if (!isSubscribed || !socket?.connected) return;

      // Cleanup existing listeners to avoid duplicates
      socket.off(SERVER_EVENTS.CALL_INITIATED);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT);
      socket.off(SERVER_EVENTS.CALL_ENDED);
      socket.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED);
      socket.off(SERVER_EVENTS.CALL_ERROR);
      if (debugListenerRef) socket.offAny(debugListenerRef);

      // Debug listener for call events
      debugListenerRef = (eventName: string, ...args: any[]) => {
        if (eventName.startsWith('call:')) {
          console.log('📡 [CallManager] Socket event:', eventName, args);
        }
      };
      socket.onAny(debugListenerRef);

      // Attach via refs (stable references that don't cause re-fires)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Socket.IO listener args are typed by the handler ref
      socket.on(SERVER_EVENTS.CALL_INITIATED, (data: any) => handleIncomingCallRef.current(data));
      socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, (data: any) => handleParticipantJoinedRef.current(data));
      socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, (data: any) => handleParticipantLeftRef.current(data));
      socket.on(SERVER_EVENTS.CALL_ENDED, (data: any) => handleCallEndedRef.current(data));
      socket.on(SERVER_EVENTS.CALL_MEDIA_TOGGLED, (data: any) => handleMediaToggleRef.current(data));
      socket.on(SERVER_EVENTS.CALL_ERROR, (data: any) => handleCallErrorRef.current(data));

      console.log('✅ [CallManager] All call listeners registered', {
        socketId: socket.id,
        userId: user?.id,
        listenersCount: 6
      });
    };

    // Try immediately if socket already connected
    const socket = meeshySocketIOService.getSocket();
    if (socket?.connected) {
      attachListeners(socket);
    }

    // Listen for future connections (instead of polling with setTimeout)
    const onConnect = () => {
      const s = meeshySocketIOService.getSocket();
      if (s) attachListeners(s);
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
            attachListeners(s);
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
        s.off(SERVER_EVENTS.CALL_INITIATED);
        s.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
        s.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT);
        s.off(SERVER_EVENTS.CALL_ENDED);
        s.off(SERVER_EVENTS.CALL_MEDIA_TOGGLED);
        s.off(SERVER_EVENTS.CALL_ERROR);
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
