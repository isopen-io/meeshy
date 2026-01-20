import { useState, useEffect, useCallback } from 'react';
import type { SocketIOTranslatedAudio } from '@meeshy/shared/types';
import { apiService } from '@/services/api.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

interface AudioTranscription {
  text: string;
  language: string;
  confidence?: number;
}

interface UseAudioTranslationOptions {
  attachmentId: string;
  messageId?: string;
  initialTranscription?: AudioTranscription;
  initialTranslatedAudios?: readonly SocketIOTranslatedAudio[];
  attachmentFileUrl: string;
}

interface UseAudioTranslationReturn {
  // État de transcription
  transcription: AudioTranscription | undefined;
  isTranscribing: boolean;
  transcriptionError: string | null;
  isTranscriptionExpanded: boolean;
  setIsTranscriptionExpanded: (expanded: boolean) => void;

  // État de traduction
  translatedAudios: readonly SocketIOTranslatedAudio[];
  isTranslating: boolean;
  translationError: string | null;

  // Sélection de langue
  selectedLanguage: string;
  setSelectedLanguage: (language: string) => void;
  currentAudioUrl: string;

  // Actions
  requestTranscription: (options?: { useLocalTranscription?: boolean }) => Promise<void>;
  requestTranslation: (options?: {
    targetLanguages?: string[];
    generateVoiceClone?: boolean;
    useLocalTranscription?: boolean;
  }) => Promise<void>;
}

/**
 * Hook personnalisé pour gérer la transcription et traduction audio
 * Gère la réception via WebSocket et les requêtes API
 */
export function useAudioTranslation({
  attachmentId,
  messageId,
  initialTranscription,
  initialTranslatedAudios,
  attachmentFileUrl,
}: UseAudioTranslationOptions): UseAudioTranslationReturn {
  const [transcription, setTranscription] = useState<AudioTranscription | undefined>(initialTranscription);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isTranscriptionExpanded, setIsTranscriptionExpanded] = useState(false);

  const [translatedAudios, setTranslatedAudios] = useState<readonly SocketIOTranslatedAudio[]>(initialTranslatedAudios || []);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const [selectedLanguage, setSelectedLanguage] = useState<string>('original');

  // S'abonner aux traductions audio via Socket.IO
  useEffect(() => {
    if (!messageId || !attachmentId) return;

    const unsubscribe = meeshySocketIOService.onAudioTranslation((data) => {
      if (data.attachmentId !== attachmentId) return;

      if (data.transcription) {
        setTranscription({
          text: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
        });
      }

      if (data.translatedAudios && data.translatedAudios.length > 0) {
        setTranslatedAudios(data.translatedAudios);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [messageId, attachmentId]);

  // Arrêter les états de chargement quand la transcription arrive
  useEffect(() => {
    if (transcription) {
      if (isTranscribing) {
        setIsTranscribing(false);
        setTranscriptionError(null);
      }
      if (isTranslating) {
        setIsTranslating(false);
        setTranslationError(null);
      }
    }
  }, [transcription, isTranscribing, isTranslating]);

  // Arrêter l'état de traduction quand les audios arrivent
  useEffect(() => {
    if (translatedAudios.length > 0 && isTranslating) {
      setIsTranslating(false);
      setTranslationError(null);
    }
  }, [translatedAudios.length, isTranslating]);

  // Calculer l'URL audio actuelle
  const currentAudioUrl = (() => {
    if (selectedLanguage === 'original') {
      return attachmentFileUrl;
    }
    const translatedAudio = translatedAudios.find(t => t.targetLanguage === selectedLanguage);
    return translatedAudio?.audioUrl || attachmentFileUrl;
  })();

  // Demander uniquement la transcription
  const requestTranscription = useCallback(async (options?: {
    useLocalTranscription?: boolean;
  }) => {
    if (options?.useLocalTranscription) {
      setTranscriptionError('Transcription locale non implémentée');
      return;
    }

    if (isTranscribing) return;

    if (transcription) {
      return;
    }

    try {
      setIsTranscribing(true);
      setTranscriptionError(null);

      const response = await apiService.post<{ success: boolean; data?: any; error?: string }>(
        `/attachments/${attachmentId}/transcribe`,
        { async: true }
      );

      if (!response.success) {
        throw new Error(response.error || 'Erreur de transcription');
      }

      setTimeout(() => {
        setIsTranscribing(prev => {
          if (prev) {
            setTranscriptionError('Timeout - la transcription prend trop de temps');
            return false;
          }
          return prev;
        });
      }, 60000);

    } catch (error: any) {
      console.error('[useAudioTranslation] Transcription request failed:', error);
      setIsTranscribing(false);

      if (error?.status === 403) {
        setTranscriptionError('Fonctionnalité non activée');
      } else if (error?.status === 404) {
        setTranscriptionError('Fichier audio introuvable');
      } else {
        setTranscriptionError(error?.message || 'Erreur de transcription');
      }
    }
  }, [attachmentId, isTranscribing, transcription]);

  // Demander la traduction audio
  const requestTranslation = useCallback(async (options?: {
    targetLanguages?: string[];
    generateVoiceClone?: boolean;
    useLocalTranscription?: boolean;
  }) => {
    if (options?.useLocalTranscription) {
      setTranslationError('Transcription locale non implémentée');
      return;
    }

    if (isTranslating) return;

    try {
      setIsTranslating(true);
      setTranslationError(null);

      const response = await apiService.post<{ success: boolean; data?: any; error?: string }>(
        `/attachments/${attachmentId}/translate`,
        {
          targetLanguages: options?.targetLanguages || ['en', 'fr'],
          generateVoiceClone: options?.generateVoiceClone || false,
          async: true,
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Erreur de traduction');
      }

      setTimeout(() => {
        setIsTranslating(prev => {
          if (prev) {
            setTranslationError('Timeout - la traduction prend trop de temps');
            return false;
          }
          return prev;
        });
      }, 120000);

    } catch (error: any) {
      console.error('[useAudioTranslation] Translation request failed:', error);
      setIsTranslating(false);

      if (error?.status === 403) {
        setTranslationError('Fonctionnalité non activée');
      } else if (error?.status === 404) {
        setTranslationError('Fichier audio introuvable');
      } else {
        setTranslationError(error?.message || 'Erreur de traduction');
      }
    }
  }, [attachmentId, isTranslating]);

  return {
    transcription,
    isTranscribing,
    transcriptionError,
    isTranscriptionExpanded,
    setIsTranscriptionExpanded,
    translatedAudios,
    isTranslating,
    translationError,
    selectedLanguage,
    setSelectedLanguage,
    currentAudioUrl,
    requestTranscription,
    requestTranslation,
  };
}
