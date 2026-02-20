import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SocketIOTranslatedAudio, AttachmentTranslations } from '@meeshy/shared/types';
import type { AudioTranslationEventData } from '@meeshy/shared/types/socketio-events';
import { toSocketIOTranslation } from '@meeshy/shared/types';
import { apiService } from '@/services/api.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

// Type pour l'audio traduit provenant de Socket.IO (utilise directement shared)
type TranslatedAudioFromSocket = AudioTranslationEventData['translatedAudio'];

/**
 * Convertit TranslatedAudioFromSocket (événement Socket.IO) vers SocketIOTranslatedAudio (format UI)
 * Cette fonction garantit la cohérence des types via TypeScript
 */
function convertSocketAudioToUI(data: TranslatedAudioFromSocket): SocketIOTranslatedAudio {
  return {
    id: data.id,
    type: 'audio' as const,
    targetLanguage: data.targetLanguage,
    translatedText: data.transcription, // ← Mapping garanti par TypeScript
    url: data.url,
    durationMs: data.durationMs,
    cloned: data.cloned,
    quality: data.quality,
    path: data.path,
    format: data.format,
    ttsModel: data.ttsModel,
    voiceModelId: data.voiceModelId,
    segments: data.segments
  };
}

interface AudioTranscription {
  text: string;
  language: string;
  confidence?: number;
  segments?: readonly any[]; // TranscriptionSegment[]
  speakerCount?: number;
  primarySpeakerId?: string;
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string | null;
  speakerAnalysis?: any;
}

interface UseAudioTranslationOptions {
  attachmentId: string;
  messageId?: string;
  initialTranscription?: AudioTranscription;
  initialTranslations?: AttachmentTranslations; // Structure BD: { "en": { transcription: "...", url: "...", ... }, ... }
  attachmentFileUrl: string;
  userLanguages?: string[]; // Langues préférées de l'utilisateur pour auto-sélection
}

interface UseAudioTranslationReturn {
  // État de transcription
  transcription: AudioTranscription | undefined;
  currentTranscription: AudioTranscription | undefined; // Transcription actuelle selon langue sélectionnée
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
  currentAudioDuration: number | undefined; // Durée en secondes de l'audio actuellement sélectionné

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
  initialTranslations,
  attachmentFileUrl,
  userLanguages,
}: UseAudioTranslationOptions): UseAudioTranslationReturn {
  const [transcription, setTranscription] = useState<AudioTranscription | undefined>(initialTranscription);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isTranscriptionExpanded, setIsTranscriptionExpanded] = useState(false);

  // Convertir initialTranslations JSON en array pour l'UI
  const initialTranslatedAudios = useMemo(() => {
    if (!initialTranslations || Object.keys(initialTranslations).length === 0) {
      return [];
    }

    return Object.entries(initialTranslations as AttachmentTranslations).map(([lang, translation]): SocketIOTranslatedAudio => {
      return toSocketIOTranslation(attachmentId, lang, translation);
    });
  }, [initialTranslations, attachmentId]);

  const [translatedAudios, setTranslatedAudios] = useState<readonly SocketIOTranslatedAudio[]>(initialTranslatedAudios);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Auto-sélection de la langue selon les préférences utilisateur
  const initialLanguage = useMemo(() => {
    if (!userLanguages?.length || initialTranslatedAudios.length === 0) return 'original';
    const originalLang = initialTranscription?.language;
    if (originalLang && userLanguages.includes(originalLang)) return 'original';
    for (const lang of userLanguages) {
      if (initialTranslatedAudios.find(t => t.targetLanguage === lang && t.url)) return lang;
    }
    return 'original';
  }, [userLanguages, initialTranslatedAudios, initialTranscription?.language]);

  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialLanguage);

  // S'abonner à la transcription seule (Phase 1: avant traduction)
  useEffect(() => {
    if (!messageId || !attachmentId) return;

    const unsubscribe = meeshySocketIOService.onTranscription((data) => {
      if (data.attachmentId !== attachmentId) return;

      setTranscription({
        text: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence,
        segments: data.transcription.segments,
        speakerCount: data.transcription.speakerCount,
        primarySpeakerId: data.transcription.primarySpeakerId,
        senderVoiceIdentified: data.transcription.senderVoiceIdentified,
        senderSpeakerId: data.transcription.senderSpeakerId,
        speakerAnalysis: data.transcription.speakerAnalysis,
      });
    });

    return () => {
      unsubscribe();
    };
  }, [messageId, attachmentId]);

  // S'abonner aux traductions audio via Socket.IO (DEPRECATED - conservé pour rétrocompatibilité)
  useEffect(() => {
    if (!messageId || !attachmentId) return;

    const unsubscribe = meeshySocketIOService.onAudioTranslation((data: AudioTranslationEventData) => {
      if (data.attachmentId !== attachmentId) return;

      const uiAudio = convertSocketAudioToUI(data.translatedAudio);

      setTranslatedAudios((prev) => {
        const existingIndex = prev.findIndex(t => t.targetLanguage === data.language);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = uiAudio;
          return updated;
        } else {
          return [...prev, uiAudio];
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [messageId, attachmentId]);

  // S'abonner aux traductions progressives (Phase 2: traductions une par une)
  useEffect(() => {
    if (!messageId || !attachmentId) return;

    const unsubscribeProgressive = meeshySocketIOService.onAudioTranslationsProgressive((data: AudioTranslationEventData) => {
      if (data.attachmentId !== attachmentId) return;

      const uiAudio = convertSocketAudioToUI(data.translatedAudio);

      setTranslatedAudios((prev) => {
        const existingIndex = prev.findIndex(t => t.targetLanguage === data.language);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = uiAudio;
          return updated;
        } else {
          return [...prev, uiAudio];
        }
      });
    });

    const unsubscribeCompleted = meeshySocketIOService.onAudioTranslationsCompleted((data: AudioTranslationEventData) => {
      if (data.attachmentId !== attachmentId) return;

      const uiAudio = convertSocketAudioToUI(data.translatedAudio);

      setTranslatedAudios((prev) => {
        const existingIndex = prev.findIndex(t => t.targetLanguage === data.language);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = uiAudio;
          return updated;
        } else {
          return [...prev, uiAudio];
        }
      });
    });

    return () => {
      unsubscribeProgressive();
      unsubscribeCompleted();
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
    return translatedAudio?.url || attachmentFileUrl;
  })();

  // Calculer la durée actuelle selon la langue sélectionnée (rerender-derived-state)
  const currentAudioDuration = useMemo(() => {
    if (selectedLanguage === 'original') {
      return undefined;
    }

    const translatedAudio = translatedAudios.find(t => t.targetLanguage === selectedLanguage);
    if (translatedAudio?.durationMs) {
      return translatedAudio.durationMs / 1000;
    }

    return undefined;
  }, [selectedLanguage, translatedAudios]);

  // Calculer la transcription actuelle selon la langue sélectionnée
  const currentTranscription = useMemo(() => {
    if (selectedLanguage === 'original') {
      return transcription;
    }

    const translatedAudio = translatedAudios.find(t => t.targetLanguage === selectedLanguage);
    if (translatedAudio && translatedAudio.segments && translatedAudio.segments.length > 0) {
      return {
        text: translatedAudio.translatedText,
        language: selectedLanguage,
        confidence: 1.0,
        segments: translatedAudio.segments as any[],
        speakerCount: transcription?.speakerCount,
        primarySpeakerId: transcription?.primarySpeakerId,
        senderVoiceIdentified: transcription?.senderVoiceIdentified,
        senderSpeakerId: transcription?.senderSpeakerId,
        speakerAnalysis: transcription?.speakerAnalysis,
      };
    }

    return transcription;
  }, [selectedLanguage, translatedAudios, transcription]);

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
    currentTranscription,
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
    currentAudioDuration,
    requestTranscription,
    requestTranslation,
  };
}
