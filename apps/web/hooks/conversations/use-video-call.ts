/**
 * useVideoCall - Gère l'initiation des appels vidéo
 *
 * Suit les Vercel React Best Practices:
 * - Logique isolée dans un hook dédié
 * - Gestion propre des ressources (MediaStream)
 *
 * @module hooks/conversations/use-video-call
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { Conversation } from '@meeshy/shared/types';
import type { CallInitiateAck, CallJoinAck } from '@meeshy/shared/types/video-call';
import { getCallMediaConstraints, stopPreauthorizedStream } from '@/lib/calls/call-media-constraints';

interface UseVideoCallOptions {
  /**
   * Conversation sélectionnée
   */
  conversation: Conversation | null;
}

export type CallMediaType = 'audio' | 'video';

interface UseVideoCallReturn {
  startCall: (type?: CallMediaType) => Promise<void>;
  answerCall: (callId: string) => Promise<void>;
  rejectCall: (callId: string) => Promise<void>;
  endCall: (callId: string) => Promise<void>;
  toggleAudio: (callId: string, enabled: boolean) => Promise<void>;
  toggleVideo: (callId: string, enabled: boolean) => Promise<void>;
  isCallSupported: boolean;
  error: string | null;
}

/**
 * Hook pour gérer les appels vidéo
 */
export function useVideoCall({ conversation }: UseVideoCallOptions): UseVideoCallReturn {
  const [error, setError] = useState<string | null>(null);
  const callStore = useCallStore();
  const { user } = useAuth();

  // Les appels ne sont supportés que pour les conversations directes
  const isCallSupported = conversation?.type === 'direct';

  /**
   * Démarre un appel vidéo
   */
  const startCall = useCallback(async (type: CallMediaType = 'video') => {
    if (!conversation) {
      toast.error('Please select a conversation first');
      return;
    }

    if (conversation.type !== 'direct') {
      toast.error('Calls are only available for direct conversations');
      return;
    }

    const isVideo = type === 'video';
    let stream: MediaStream | null = null;

    try {
      // Demander les permissions média (vidéo uniquement pour un appel vidéo)
      stream = await navigator.mediaDevices.getUserMedia(getCallMediaConstraints(type));

      // Stocker le stream pour réutilisation
      (window as any).__preauthorizedMediaStream = stream;

      // Vérifier la connexion Socket
      const socket = meeshySocketIOService.getSocket();

      if (!socket?.connected) {
        toast.error('Connection error. Please try again.');
        stopPreauthorizedStream(stream);
        return;
      }

      // Initier l'appel avec le type correct CallInitiateEvent
      const callData = {
        conversationId: conversation.id,
        type,
        settings: {
          screenShareEnabled: isVideo,
          translationEnabled: true,
        },
      };

      socket.emit(CLIENT_EVENTS.CALL_INITIATE, callData, (ack: CallInitiateAck) => {
        // The gateway can reject call:initiate (callee busy/blocked/offline,
        // rate-limited, validation error). Without handling this branch the
        // pre-authorized camera/mic stream stays hot forever — the only
        // consumer that releases it is VideoCallInterface, which never
        // mounts because currentCall is never set — and the user is left
        // staring at a "Starting call..." toast with no further feedback.
        if (!ack?.success) {
          stopPreauthorizedStream(stream);
          toast.error(ack?.error?.message ?? 'Failed to start call. Please try again.');
          return;
        }

        // Persist the server-provided ICE servers (STUN + time-limited TURN)
        // so the initiator's RTCPeerConnection is built with TURN credentials
        // before the SDP offer is created.
        if (ack.data?.iceServers?.length) {
          useCallStore.getState().setIceServers(ack.data.iceServers);
        }

        // P0 fix (2026-07-06) — the gateway deliberately never re-emits
        // `call:initiated` back to the initiator's own socket(s) (it only
        // notifies the OTHER conversation members); `CallManager`'s
        // `isInitiator` branch that would set `currentCall`/`isInCall` is
        // therefore unreachable for the caller on web. Without this, the
        // callee gets rung correctly but the caller's own screen never shows
        // the call UI. Set the call as current directly from the ack — the
        // only data the caller actually needs to start rendering; the
        // participants list is populated as callees join via the existing
        // `call:participant-joined` handler (a no-op until `currentCall`
        // exists, so this is the step that unblocks it).
        if (ack.data?.callId && user) {
          useCallStore.getState().setCurrentCall({
            id: ack.data.callId,
            conversationId: conversation.id,
            mode: ack.data.mode,
            status: 'initiated',
            initiatorId: user.id,
            startedAt: new Date(),
            participants: [],
          });
        }

        toast.success('Starting call...');
      });
    } catch (error: unknown) {
      stopPreauthorizedStream(stream);
      handleMediaError(error);
    }
  }, [conversation, user]);

  const answerCall = useCallback(async (callId: string) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) {
      setError('Socket not connected');
      return;
    }
    socket.emit(CLIENT_EVENTS.CALL_JOIN, { callId }, (response: CallJoinAck) => {
      if (!response?.success) {
        setError('Failed to join call');
        return;
      }
      if (response.data?.iceServers?.length) {
        useCallStore.getState().setIceServers(response.data.iceServers);
      }
    });
  }, []);

  const rejectCall = useCallback(async (callId: string) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) return;
    socket.emit(CLIENT_EVENTS.CALL_END, { callId, reason: 'rejected' }, () => {});
  }, []);

  const endCall = useCallback(async (callId: string) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) return;
    socket.emit(CLIENT_EVENTS.CALL_END, { callId, reason: 'completed' }, () => {});
    callStore.reset();
  }, [callStore]);

  const toggleAudio = useCallback(async (callId: string, enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) return;
    socket.emit(CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId, enabled }, () => {});
    callStore.toggleAudio();
  }, [callStore]);

  const toggleVideo = useCallback(async (callId: string, enabled: boolean) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) return;
    socket.emit(CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId, enabled }, () => {});
    callStore.toggleVideo();
  }, [callStore]);

  return {
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    isCallSupported,
    error,
  };
}

/**
 * Gère les erreurs d'accès aux médias
 */
function handleMediaError(error: unknown): void {
  if (error instanceof Error) {
    switch (error.name) {
      case 'NotAllowedError':
        toast.error('Camera/microphone permission denied.');
        break;
      case 'NotFoundError':
        toast.error('No camera or microphone found.');
        break;
      default:
        toast.error(`Failed to access camera/microphone: ${error.message}`);
    }
  } else {
    toast.error('Failed to access camera/microphone');
  }
}
