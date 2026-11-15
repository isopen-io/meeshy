/**
 * Le domaine AUDIO : transcription, traductions (progressive puis complète),
 * pistes traduites et les trois échecs qui les accompagnent.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// Import TranscriptionSegment for real-time audio synchronization
import type { TranscriptionSegment } from '../attachment-transcription.js';

// Import unified TranslatedAudioData from translated-audio.ts
import type { TranslatedAudioData } from '../translated-audio.js';

// Re-export for convenience
export type { TranslatedAudioData };

/**
 * Structure commune pour les événements de traduction audio (une traduction)
 * Utilisée pour:
 * - AUDIO_TRANSLATION_READY (langue unique)
 * - AUDIO_TRANSLATIONS_PROGRESSIVE (une traduction parmi plusieurs)
 * - AUDIO_TRANSLATIONS_COMPLETED (dernière traduction)
 */
export interface AudioTranslationEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly language: string;
  readonly translatedAudio: {
    readonly id: string;
    readonly targetLanguage: string;
    readonly url: string;
    readonly transcription: string;
    readonly durationMs: number;
    readonly format: string;
    readonly cloned: boolean;
    readonly quality: number;
    readonly voiceModelId?: string;
    readonly ttsModel: string;
    /**
     * Segments de transcription traduits avec timestamps pour synchronisation audio/texte
     * Inclut speakerId et voiceSimilarityScore pour diarisation
     */
    readonly segments?: readonly TranscriptionSegment[];
  };
  readonly processingTimeMs?: number;
}

/**
 * Événement pour UNE seule traduction quand une seule langue est demandée
 */
export type AudioTranslationReadyEventData = AudioTranslationEventData;

/**
 * Événement pour UNE traduction parmi plusieurs (progressif, pas la dernière)
 */
export type AudioTranslationsProgressiveEventData = AudioTranslationEventData;

/**
 * Événement pour la DERNIÈRE traduction + signal que toutes sont terminées
 */
export type AudioTranslationsCompletedEventData = AudioTranslationEventData;

/**
 * Données pour l'événement de transcription seule prête (sans traduction)
 * Utilisé lorsque seule la transcription est demandée, sans génération d'audios traduits
 */
export interface TranscriptionReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly transcription: {
    readonly id: string;
    readonly text: string;
    readonly language: string;
    readonly confidence?: number;
    readonly durationMs?: number;
    readonly source?: string;
    readonly segments?: readonly TranscriptionSegment[];
    // Champs de diarisation (speaker detection)
    readonly speakerCount?: number;
    readonly primarySpeakerId?: string;
    readonly senderVoiceIdentified?: boolean;
    readonly senderSpeakerId?: string;
    // Analyse détaillée des speakers avec caractéristiques vocales (pitch, fréquences, etc.)
    readonly speakerAnalysis?: Record<string, unknown>;
  };
  readonly processingTimeMs?: number;
}

/**
 * Emitted when a server-side translation attempt has permanently failed.
 * Lets clients clear any "translating…" spinner and surface a retry
 * affordance instead of waiting indefinitely for a result that will
 * never arrive. Emitted to the conversation room so all participants
 * receive the failure at the same time.
 */
export interface TranslationFailedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly error: string;
  readonly taskId?: string;
}

export interface AudioTranslationFailedEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly error: string;
  readonly errorCode?: string;
  readonly taskId?: string;
}

export interface TranscriptionFailedEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly error: string;
  readonly errorCode?: string;
  readonly taskId?: string;
}
