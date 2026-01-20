/**
 * Types génériques pour la transcription et traduction d'attachements
 * Supporte: audio, video, document, image
 * Partagés entre frontend et backend
 */

// =====================================================
// TRANSCRIPTION GÉNÉRIQUE
// =====================================================

/**
 * Type de source pour la transcription
 */
export type TranscriptionSourceType = 'mobile' | 'whisper' | 'ocr' | 'vision';

/**
 * Segment de transcription avec timestamps (audio/video)
 */
export interface TranscriptionSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  /** ID du locuteur pour ce segment (via diarisation) */
  readonly speakerId?: string;
  /**
   * Score de similarité vocale avec le profil de l'utilisateur connecté (0-1)
   * Plus le score est élevé, plus il est probable que ce soit l'utilisateur qui parle
   *
   * Interprétation:
   * - 0.0 - 0.3: Probablement pas l'utilisateur
   * - 0.3 - 0.6: Incertain
   * - 0.6 - 0.8: Probablement l'utilisateur
   * - 0.8 - 1.0: Très probablement l'utilisateur
   *
   * null si la reconnaissance vocale n'est pas disponible ou si aucun profil vocal n'existe
   */
  readonly voiceSimilarityScore?: number | null;
  readonly confidence?: number;
}

/**
 * Informations détaillées sur un locuteur détecté
 */
export interface SpeakerInfo {
  /** ID court du locuteur (s0, s1, s2, ...) */
  readonly sid: string;
  /** Ce locuteur est-il le locuteur principal (celui qui parle le plus) */
  readonly is_primary: boolean;
  /** Temps de parole en millisecondes */
  readonly speaking_time_ms: number;
  /** Ratio de temps de parole (0-1) */
  readonly speaking_ratio: number;
  /** Score de similarité vocale avec le profil utilisateur (0-1 ou null) */
  readonly voice_similarity_score: number | null;
  /** Segments de temps où ce locuteur parle */
  readonly segments: readonly { start_ms: number; end_ms: number; duration_ms: number }[];
}

/**
 * Analyse complète des locuteurs détectés
 */
export interface SpeakerAnalysis {
  /** Liste de tous les locuteurs détectés */
  readonly speakers: readonly SpeakerInfo[];
  /** Durée totale de l'audio en millisecondes */
  readonly total_duration_ms: number;
  /** Méthode de diarisation utilisée */
  readonly method: 'pyannote' | 'pitch_clustering' | 'single_speaker';
}

/**
 * Transcription audio (Whisper)
 * Aligns with schema.prisma MessageAudioTranscription
 */
export interface AudioTranscription {
  readonly type: 'audio';
  readonly transcribedText: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;
  readonly model?: string;
  readonly segments?: readonly TranscriptionSegment[];
  readonly audioDurationMs?: number;
  /** Nombre de locuteurs détectés dans l'audio */
  readonly speakerCount?: number;
  /** ID du locuteur principal (celui qui parle le plus) */
  readonly primarySpeakerId?: string;
  /** L'utilisateur a-t-il été identifié parmi les locuteurs (nécessite profil vocal) */
  readonly senderVoiceIdentified?: boolean;
  /** ID du locuteur identifié comme l'utilisateur (null si non identifié) */
  readonly senderSpeakerId?: string | null;
  /** Analyse détaillée de tous les locuteurs détectés */
  readonly speakerAnalysis?: SpeakerAnalysis;
}

/**
 * Transcription vidéo (sous-titres)
 */
export interface VideoTranscription {
  readonly type: 'video';
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;
  readonly model?: string;
  readonly segments?: readonly TranscriptionSegment[];
  readonly durationMs?: number;
  readonly subtitleUrl?: string;
  readonly format?: 'srt' | 'vtt' | 'ass';
}

/**
 * Transcription document (OCR)
 */
export interface DocumentTranscription {
  readonly type: 'document';
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;
  readonly model?: string;
  readonly pageCount?: number;
  readonly layout?: 'single-column' | 'multi-column' | 'mixed';
}

/**
 * Transcription image (OCR/Vision)
 */
export interface ImageTranscription {
  readonly type: 'image';
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;
  readonly model?: string;
  readonly description?: string;
  readonly detectedObjects?: string[];
}

/**
 * Union de tous les types de transcription
 */
export type AttachmentTranscription =
  | AudioTranscription
  | VideoTranscription
  | DocumentTranscription
  | ImageTranscription;

// =====================================================
// TRANSLATION GÉNÉRIQUE
// =====================================================

/**
 * Traduction audio avec voix clonée (TTS)
 */
export interface AudioTranslation {
  readonly type: 'audio';
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly voiceCloned: boolean;
  readonly voiceQuality: number;
  readonly ttsModel?: string;
  readonly format?: 'mp3' | 'wav' | 'ogg';
}

/**
 * Traduction vidéo (sous-titres traduits)
 */
export interface VideoTranslation {
  readonly type: 'video';
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly subtitleUrl: string;
  readonly format: 'srt' | 'vtt' | 'ass';
  readonly durationMs?: number;
}

/**
 * Traduction document (texte traduit)
 */
export interface DocumentTranslation {
  readonly type: 'document';
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly documentUrl?: string;
  readonly format?: 'txt' | 'pdf' | 'docx';
  readonly pageCount?: number;
}

/**
 * Traduction image (texte traduit avec overlay)
 */
export interface ImageTranslation {
  readonly type: 'image';
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly imageUrl?: string;
  readonly overlayUrl?: string;
}

/**
 * Union de tous les types de traduction
 */
export type AttachmentTranslation =
  | AudioTranslation
  | VideoTranslation
  | DocumentTranslation
  | ImageTranslation;

// =====================================================
// TYPE GUARDS
// =====================================================

/**
 * Vérifie si une transcription est de type audio
 */
export function isAudioTranscription(t: AttachmentTranscription): t is AudioTranscription {
  return t.type === 'audio';
}

/**
 * Vérifie si une transcription est de type vidéo
 */
export function isVideoTranscription(t: AttachmentTranscription): t is VideoTranscription {
  return t.type === 'video';
}

/**
 * Vérifie si une transcription est de type document
 */
export function isDocumentTranscription(t: AttachmentTranscription): t is DocumentTranscription {
  return t.type === 'document';
}

/**
 * Vérifie si une transcription est de type image
 */
export function isImageTranscription(t: AttachmentTranscription): t is ImageTranscription {
  return t.type === 'image';
}

/**
 * Vérifie si une traduction est de type audio
 */
export function isAudioTranslation(t: AttachmentTranslation): t is AudioTranslation {
  return t.type === 'audio';
}

/**
 * Vérifie si une traduction est de type vidéo
 */
export function isVideoTranslation(t: AttachmentTranslation): t is VideoTranslation {
  return t.type === 'video';
}

/**
 * Vérifie si une traduction est de type document
 */
export function isDocumentTranslation(t: AttachmentTranslation): t is DocumentTranslation {
  return t.type === 'document';
}

/**
 * Vérifie si une traduction est de type image
 */
export function isImageTranslation(t: AttachmentTranslation): t is ImageTranslation {
  return t.type === 'image';
}
