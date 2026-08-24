import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    segments: data.segments as any
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

  // Auto-sélection de la langue selon les préférences utilisateur — logique
  // partagée entre le seed initial et la ré-évaluation réactive ci-dessous.
  const resolveAutoLanguage = useCallback(
    (audios: readonly SocketIOTranslatedAudio[]): string => {
      if (!userLanguages?.length || audios.length === 0) return 'original';
      const originalLang = (transcription?.language ?? initialTranscription?.language)?.toLowerCase();
      // Règle 3 du Prisme (`/CLAUDE.md`) : la langue d'origine concourt à son
      // RANG, jamais en court-circuit. Ce parcours portait auparavant un test
      // `userLanguages.includes(originalLang)` AVANT la boucle — c'est-à-dire
      // mot pour mot la formulation que la règle interdit : « si la langue
      // d'origine appartient au prisme ⇒ afficher l'original ». Elle
      // rétrograde la langue PRIMAIRE dès que la langue d'origine occupe un
      // rang inférieur, ce que la locale appareil (règle 2, rang 4) produit
      // mécaniquement. Prisme ['fr','en'] + vocal anglais + piste française
      // ⇒ la piste FRANÇAISE, jamais l'original.
      //
      // Miroir de `AudioTrackLanguageResolver.resolve` (iOS) et de
      // `resolveTranslatedAudio` (Android) : on parcourt les langues du
      // lecteur DANS L'ORDRE, et la première servie gagne — par une piste
      // traduite, ou parce que le vocal est déjà dans cette langue.
      //
      // Les deux côtés sont minusculés : `userLanguages` sort lowercasé de
      // `resolveUserLanguagesOrdered`, mais la langue d'origine vient de
      // Whisper et la langue cible du pipeline TTS. On rend en revanche le
      // `targetLanguage` TEL QU'IL EST STOCKÉ — `currentAudioUrl` et
      // `currentAudioDuration` retrouvent leur piste par égalité stricte sur
      // ce champ, qu'un code renormalisé ferait manquer.
      for (const lang of userLanguages) {
        const lower = lang.toLowerCase();
        if (originalLang && lower === originalLang) return 'original';
        const match = audios.find(t => t.targetLanguage.toLowerCase() === lower && t.url);
        if (match) return match.targetLanguage;
      }
      return 'original';
    },
    [userLanguages, transcription?.language, initialTranscription?.language]
  );

  const [selectedLanguage, setSelectedLanguage] = useState<string>(() =>
    resolveAutoLanguage(initialTranslatedAudios)
  );

  // Suit un choix EXPLICITE de l'utilisateur (tap sur un pill) — tant qu'il
  // n'a pas eu lieu, la langue continue de suivre Prisme automatiquement
  // quand une nouvelle traduction arrive après le montage (cas le plus
  // courant : audio fraîchement envoyé/reçu, traduction encore en cours).
  const hasManualSelectionRef = useRef(false);

  const handleSetSelectedLanguage = useCallback((language: string) => {
    hasManualSelectionRef.current = true;
    setSelectedLanguage(language);
  }, []);

  useEffect(() => {
    if (hasManualSelectionRef.current) return;
    setSelectedLanguage(resolveAutoLanguage(translatedAudios));
  }, [translatedAudios, resolveAutoLanguage]);

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
    setSelectedLanguage: handleSetSelectedLanguage,
    currentAudioUrl,
    currentAudioDuration,
    requestTranscription,
    requestTranslation,
  };
}
