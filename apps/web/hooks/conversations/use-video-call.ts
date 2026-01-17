/**
 * useVideoCall - Gère l'initiation des appels vidéo
 *
 * Suit les Vercel React Best Practices:
 * - Logique isolée dans un hook dédié
 * - Gestion propre des ressources (MediaStream)
 *
 * @module hooks/conversations/use-video-call
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { Conversation } from '@meeshy/shared/types';

interface UseVideoCallOptions {
  /**
   * Conversation sélectionnée
   */
  conversation: Conversation | null;
}

interface UseVideoCallReturn {
  /**
   * Démarre un appel vidéo
   */
  startCall: () => Promise<void>;

  /**
   * Indique si les appels sont supportés pour cette conversation
   */
  isCallSupported: boolean;
}

/**
 * Configuration des contraintes média
 */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: 'user',
};

/**
 * Hook pour gérer les appels vidéo
 */
export function useVideoCall({ conversation }: UseVideoCallOptions): UseVideoCallReturn {
  // Les appels ne sont supportés que pour les conversations directes
  const isCallSupported = conversation?.type === 'direct';

  /**
   * Démarre un appel vidéo
   */
  const startCall = useCallback(async () => {
    if (!conversation) {
      toast.error('Please select a conversation first');
      return;
    }

    if (conversation.type !== 'direct') {
      toast.error('Video calls are only available for direct conversations');
      return;
    }

    let stream: MediaStream | null = null;

    try {
      // Demander les permissions média
      stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: VIDEO_CONSTRAINTS,
      });

      // Stocker le stream pour réutilisation
      (window as any).__preauthorizedMediaStream = stream;

      // Vérifier la connexion Socket
      const socket = meeshySocketIOService.getSocket();

      if (!socket?.connected) {
        toast.error('Connection error. Please try again.');
        cleanupStream(stream);
        return;
      }

      // Initier l'appel avec le type correct CallInitiateEvent
      const callData = {
        conversationId: conversation.id,
        type: 'video' as const,
        settings: {
          screenShareEnabled: true,
          translationEnabled: true,
        },
      };

      socket.emit('call:initiate', callData);
      toast.success('Starting call...');
    } catch (error: unknown) {
      cleanupStream(stream);
      handleMediaError(error);
    }
  }, [conversation]);

  return {
    startCall,
    isCallSupported,
  };
}

/**
 * Nettoie un MediaStream
 */
function cleanupStream(stream: MediaStream | null): void {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    delete (window as any).__preauthorizedMediaStream;
  }
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
