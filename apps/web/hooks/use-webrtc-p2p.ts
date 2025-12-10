/**
 * USE WEBRTC P2P HOOK
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages P2P WebRTC connections and signaling via Socket.IO
 */

'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { WebRTCService } from '@/services/webrtc-service';
import { useCallStore } from '@/stores/call-store';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import type {
  CallSignalEvent,
  WebRTCSignal,
  CALL_ERROR_CODES,
} from '@meeshy/shared/types/video-call';

export interface UseWebRTCP2POptions {
  callId: string;
  userId?: string;
  onError?: (error: Error) => void;
}

export function useWebRTCP2P({ callId, userId, onError }: UseWebRTCP2POptions) {
  const {
    localStream,
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
              sdpMLineIndex: candidateInit.sdpMLineIndex,
              sdpMid: candidateInit.sdpMid,
            };

            socket.emit('call:signal', {
              callId,
              signal,
            } as CallSignalEvent);

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
            }
          },

          onIceConnectionStateChange: (state) => {
            logger.debug('[useWebRTCP2P]', 'ICE connection state changed', {
              participantId,
              state,
            });
            setIceConnectionState(state);

            if (state === 'failed') {
              setError('ICE connection failed');
              toast.error('Connection failed. Retrying...');
              onError?.(new Error('ICE_CONNECTION_FAILED'));
            }
          },

          onError: (error) => {
            logger.error('[useWebRTCP2P]', 'WebRTC error', { error });
            setError(error.message);
            toast.error(error.message);
            onError?.(error);
          },
        });

        webrtcServicesRef.current.set(participantId, service);
      }

      return service;
    },
    [callId, userId, addRemoteStream, setError, setConnecting, onError]  // CRITICAL: Added userId
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

        // Add local stream tracks
        stream.getTracks().forEach((track) => {
          service.addTrack(track, stream);
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

        socket.emit('call:signal', {
          callId,
          signal,
        } as CallSignalEvent);

        logger.info('[useWebRTCP2P]', 'Offer created and sent', { targetUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to create offer', { error });
        setConnecting(false);

        const message = error instanceof Error ? error.message : 'Failed to create offer';
        setError(message);
        toast.error(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, ensureLocalStream, getWebRTCService, addPeerConnection, setConnecting, setError, onError, userId]
  );

  /**
   * Handle incoming offer
   */
  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, fromUserId: string) => {
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

        // Add local stream tracks
        stream.getTracks().forEach((track) => {
          service.addTrack(track, stream);
        });

        // Create answer
        const answer = await service.createAnswer(offer);

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

        socket.emit('call:signal', {
          callId,
          signal,
        } as CallSignalEvent);

        // Process queued ICE candidates
        const queuedCandidates = iceCandidateQueueRef.current.get(fromUserId) || [];
        for (const candidate of queuedCandidates) {
          await service.addIceCandidate(candidate);
        }
        iceCandidateQueueRef.current.delete(fromUserId);

        logger.info('[useWebRTCP2P]', 'Answer created and sent', { fromUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to handle offer', { error });
        setConnecting(false);

        const message = error instanceof Error ? error.message : 'Failed to handle offer';
        setError(message);
        toast.error(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, ensureLocalStream, getWebRTCService, addPeerConnection, setConnecting, setError, onError, userId]
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

        // Set remote description
        await service.setRemoteDescription(answer);

        // Process queued ICE candidates
        const queuedCandidates = iceCandidateQueueRef.current.get(fromUserId) || [];
        for (const candidate of queuedCandidates) {
          await service.addIceCandidate(candidate);
        }
        iceCandidateQueueRef.current.delete(fromUserId);

        logger.info('[useWebRTCP2P]', 'Answer handled successfully', { fromUserId, callId });
      } catch (error) {
        logger.error('[useWebRTCP2P]', 'Failed to handle answer', { error });

        const message = error instanceof Error ? error.message : 'Failed to handle answer';
        setError(message);
        toast.error(message);
        onError?.(error instanceof Error ? error : new Error(message));
      }
    },
    [callId, setError, onError]
  );

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit, fromUserId: string) => {
      try {
        logger.debug('[useWebRTCP2P]', 'Handling ICE candidate', { fromUserId, callId });

        const service = webrtcServicesRef.current.get(fromUserId);
        if (!service) {
          // Queue candidate if peer connection not ready yet
          const queue = iceCandidateQueueRef.current.get(fromUserId) || [];
          queue.push(candidate);
          iceCandidateQueueRef.current.set(fromUserId, queue);
          logger.debug('[useWebRTCP2P]', 'ICE candidate queued', { fromUserId });
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

      switch (signal.type) {
        case 'offer':
          // Convert flat signal to RTCSessionDescriptionInit
          handleOffer({ type: 'offer', sdp: signal.sdp }, signal.from);
          break;

        case 'answer':
          // Convert flat signal to RTCSessionDescriptionInit
          handleAnswer({ type: 'answer', sdp: signal.sdp }, signal.from);
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
          logger.warn('[useWebRTCP2P]', 'Unknown signal type', { type: signal.type });
      }
    };

    socket.on('call:signal', handleIncomingSignal);

    return () => {
      socket.off('call:signal', handleIncomingSignal);
    };
  }, [callId, handleOffer, handleAnswer, handleIceCandidate]);

  return {
    connectionState,
    iceConnectionState,
    initializeLocalStream,
    ensureLocalStream,
    createOffer,
    cleanup,
  };
}
