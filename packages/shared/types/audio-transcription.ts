/**
 * Types pour la transcription audio et le clonage vocal
 * Alignés avec les modèles Prisma: MessageAudioTranscription, MessageTranslatedAudio, UserVoiceModel
 *
 * Ces types gèrent la transcription Whisper, la synthèse vocale (TTS)
 * et le clonage vocal pour les messages audio traduits.
 */

// =====================================================
// MESSAGE AUDIO TRANSCRIPTION
// =====================================================

// Import des types partagés depuis attachment-transcription
import type { TranscriptionSourceType, TranscriptionSegment } from './attachment-transcription.js';

export { TranscriptionSourceType, TranscriptionSegment };

/**
 * Information sur un locuteur détecté
 */
export interface SpeakerInfo {
  readonly speaker_id: string;
  readonly is_primary: boolean;
  readonly speaking_time_ms: number;
  readonly speaking_ratio: number;
  readonly voice_characteristics?: VoiceCharacteristics;
  readonly fingerprint?: Record<string, unknown>;
}

/**
 * Analyse de diarization des locuteurs
 */
export interface SpeakerDiarizationAnalysis {
  readonly speakers: readonly SpeakerInfo[];
  readonly total_duration_ms: number;
  readonly overlap_ratio: number;
}

/**
 * Transcription d'un message audio
 * Aligned with schema.prisma MessageAudioTranscription
 */
export interface MessageAudioTranscription {
  readonly id: string;

  /** Relation vers l'attachment source (unique - 1 transcription par attachment) */
  readonly attachmentId: string;

  /** Relation vers le message (pour requêtes directes) */
  readonly messageId: string;

  /** Texte transcrit */
  readonly transcribedText: string;

  /** Langue détectée (code ISO 639-1: fr, en, es...) */
  readonly language: string;

  /** Score de confiance (0-1) */
  readonly confidence: number;

  /** Source de la transcription: "mobile" (iOS/Android) ou "whisper" (serveur) */
  readonly source: TranscriptionSourceType;

  /** Segments avec timestamps (JSON optionnel) */
  readonly segments?: readonly TranscriptionSegment[];

  /** Durée audio en millisecondes */
  readonly audioDurationMs: number;

  /** Modèle utilisé (si whisper: "whisper-large-v3") */
  readonly model?: string;

  // === SPEAKER DIARIZATION (Multi-speaker support) ===

  /** Nombre de locuteurs distincts détectés */
  readonly speakerCount?: number;

  /** ID du locuteur principal (qui parle le plus) */
  readonly primarySpeakerId?: string;

  /** Métadonnées d'analyse des locuteurs */
  readonly speakerAnalysis?: SpeakerDiarizationAnalysis;

  readonly createdAt: Date;
}

/**
 * DTO pour créer une transcription
 */
export interface CreateMessageAudioTranscriptionDTO {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly transcribedText: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;
  readonly segments?: readonly TranscriptionSegment[];
  readonly audioDurationMs: number;
  readonly model?: string;
  readonly speakerCount?: number;
  readonly primarySpeakerId?: string;
  readonly speakerAnalysis?: SpeakerDiarizationAnalysis;
}

/**
 * Réponse de transcription
 */
export interface TranscriptionResponse {
  readonly success: boolean;
  readonly data?: MessageAudioTranscription;
  readonly error?: string;
}

// =====================================================
// MESSAGE TRANSLATED AUDIO
// =====================================================

/**
 * Format audio supporté pour la synthèse
 */
export type AudioFormat = 'mp3' | 'wav' | 'ogg';

/**
 * Modèle TTS supporté
 */
export type TTSModel = 'xtts' | 'openvoice' | 'elevenlabs';

/**
 * Audio traduit avec voix clonée
 * Aligned with schema.prisma MessageTranslatedAudio
 */
export interface MessageTranslatedAudio {
  readonly id: string;

  /** Relation vers l'attachment source */
  readonly attachmentId: string;

  /** Relation vers le message */
  readonly messageId: string;

  /** Langue de cette version (code ISO 639-1) */
  readonly targetLanguage: string;

  /** Texte traduit utilisé pour la synthèse */
  readonly translatedText: string;

  /** Chemin du fichier audio généré */
  readonly audioPath: string;

  /** URL accessible pour lecture */
  readonly audioUrl: string;

  /** Durée en millisecondes */
  readonly durationMs: number;

  /** Format audio (mp3, wav, ogg) */
  readonly format: AudioFormat;

  /** Voix clonée utilisée (true si clonage vocal actif) */
  readonly voiceCloned: boolean;

  /** Qualité du clonage vocal (0-1) */
  readonly voiceQuality: number;

  /** ID du modèle de voix utilisé */
  readonly voiceModelId?: string;

  /** Modèle TTS utilisé (xtts, openvoice) */
  readonly ttsModel: TTSModel;

  readonly createdAt: Date;
}

/**
 * DTO pour créer un audio traduit
 */
export interface CreateMessageTranslatedAudioDTO {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioPath: string;
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly format?: AudioFormat;
  readonly voiceCloned?: boolean;
  readonly voiceQuality: number;
  readonly voiceModelId?: string;
  readonly ttsModel?: TTSModel;
}

/**
 * Réponse d'audio traduit
 */
export interface TranslatedAudioResponse {
  readonly success: boolean;
  readonly data?: MessageTranslatedAudio;
  readonly error?: string;
}

/**
 * Collection d'audios traduits pour un message
 */
export interface MessageTranslatedAudios {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly translations: Record<string, MessageTranslatedAudio>;
}

// =====================================================
// USER VOICE MODEL
// =====================================================

/**
 * Modèle d'embedding vocal
 */
export type EmbeddingModel = 'openvoice_v2' | 'resemblyzer' | 'xtts_v2';

/**
 * Analyse de pitch vocal
 */
export interface VoicePitchCharacteristics {
  readonly mean_hz: number;
  readonly std_hz: number;
  readonly min_hz: number;
  readonly max_hz: number;
}

/**
 * Classification vocale
 */
export interface VoiceClassificationResult {
  readonly voice_type: 'low_male' | 'medium_male' | 'high_male' | 'low_female' | 'medium_female' | 'high_female';
  readonly estimated_gender: 'male' | 'female' | 'unknown';
  readonly estimated_age_range: 'child' | 'young_adult' | 'adult' | 'senior';
}

/**
 * Caractéristiques spectrales de la voix
 */
export interface VoiceSpectralCharacteristics {
  readonly brightness: number;
  readonly warmth: number;
  readonly breathiness: number;
  readonly nasality: number;
}

/**
 * Caractéristiques de prosodie
 */
export interface VoiceProsodyCharacteristics {
  readonly energy_mean: number;
  readonly energy_std: number;
  readonly silence_ratio: number;
  readonly speech_rate_wpm: number;
}

/**
 * Caractéristiques vocales complètes
 */
export interface VoiceCharacteristics {
  readonly pitch: VoicePitchCharacteristics;
  readonly classification: VoiceClassificationResult;
  readonly spectral: VoiceSpectralCharacteristics;
  readonly prosody: VoiceProsodyCharacteristics;
}

/**
 * Modèle de voix cloné d'un utilisateur
 * Aligned with schema.prisma UserVoiceModel
 */
export interface UserVoiceModel {
  readonly id: string;
  readonly userId: string;

  /** Identifiant unique du profil vocal (vfp_xxx) */
  readonly profileId?: string;

  // === EMBEDDING STORAGE ===

  /**
   * Vecteur d'embedding stocké comme données binaires (numpy array sérialisé)
   * Typiquement 256-512 floats = 1-2KB
   */
  readonly embedding?: Uint8Array;

  /** Modèle utilisé pour générer l'embedding */
  readonly embeddingModel: EmbeddingModel;

  /** Dimension du vecteur d'embedding (ex: 256, 512) */
  readonly embeddingDimension: number;

  /** Legacy: Chemin vers le fichier d'embedding (deprecated) */
  readonly embeddingPath?: string;

  // === TRAINING STATS ===

  /** Nombre d'audios utilisés pour l'entraînement */
  readonly audioCount: number;

  /** Durée totale des audios d'entraînement (ms) */
  readonly totalDurationMs: number;

  /**
   * Score de qualité du modèle (0-1)
   * - 0-0.3: faible (audio trop court)
   * - 0.3-0.5: moyen
   * - 0.5-0.7: bon
   * - 0.7-1.0: excellent
   */
  readonly qualityScore: number;

  /** Version du modèle (incrémentée à chaque recalibration) */
  readonly version: number;

  // === VOICE CHARACTERISTICS ===

  /** Caractéristiques vocales analysées */
  readonly voiceCharacteristics?: VoiceCharacteristics;

  // === LIFECYCLE ===

  /** Si le modèle est actif */
  readonly isActive: boolean;

  /** Raison de désactivation */
  readonly deactivatedReason?: string;

  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastUsedAt?: Date;
}

/**
 * DTO pour créer un modèle de voix
 */
export interface CreateUserVoiceModelDTO {
  readonly userId: string;
  readonly profileId?: string;
  readonly embedding?: Uint8Array;
  readonly embeddingModel?: EmbeddingModel;
  readonly embeddingDimension?: number;
  readonly embeddingPath?: string;
  readonly audioCount: number;
  readonly totalDurationMs: number;
  readonly qualityScore: number;
  readonly voiceCharacteristics?: VoiceCharacteristics;
}

/**
 * DTO pour mettre à jour un modèle de voix
 */
export interface UpdateUserVoiceModelDTO {
  readonly embedding?: Uint8Array;
  readonly embeddingPath?: string;
  readonly audioCount?: number;
  readonly totalDurationMs?: number;
  readonly qualityScore?: number;
  readonly version?: number;
  readonly voiceCharacteristics?: VoiceCharacteristics;
  readonly isActive?: boolean;
  readonly deactivatedReason?: string;
}

/**
 * Réponse de modèle de voix
 */
export interface UserVoiceModelResponse {
  readonly success: boolean;
  readonly data?: UserVoiceModel;
  readonly error?: string;
}

/**
 * Statut du modèle de voix d'un utilisateur
 */
export interface VoiceModelStatus {
  readonly hasModel: boolean;
  readonly qualityLevel: 'none' | 'low' | 'medium' | 'good' | 'excellent';
  readonly qualityScore?: number;
  readonly audioCount?: number;
  readonly totalDurationMs?: number;
  readonly needsMoreSamples: boolean;
  readonly recommendedMinDurationMs: number;
}

// =====================================================
// TYPE GUARDS & UTILITIES
// =====================================================

/**
 * Détermine le niveau de qualité à partir du score
 */
export function getQualityLevel(score: number): 'low' | 'medium' | 'good' | 'excellent' {
  if (score < 0.3) return 'low';
  if (score < 0.5) return 'medium';
  if (score < 0.7) return 'good';
  return 'excellent';
}

/**
 * Vérifie si un modèle de voix est utilisable pour le clonage
 */
export function isVoiceModelUsable(model: UserVoiceModel): boolean {
  return model.isActive && model.qualityScore >= 0.3 && !!model.embedding;
}

/**
 * Calcule la durée minimale recommandée pour un bon modèle de voix
 */
export function getRecommendedMinDuration(): number {
  return 30000; // 30 secondes minimum
}

/**
 * Vérifie si le modèle a besoin de plus d'échantillons audio
 */
export function needsMoreSamples(model: UserVoiceModel): boolean {
  return model.totalDurationMs < getRecommendedMinDuration() || model.qualityScore < 0.5;
}

/**
 * Obtient le statut complet du modèle de voix
 */
export function getVoiceModelStatus(model: UserVoiceModel | null): VoiceModelStatus {
  if (!model) {
    return {
      hasModel: false,
      qualityLevel: 'none',
      needsMoreSamples: true,
      recommendedMinDurationMs: getRecommendedMinDuration(),
    };
  }

  return {
    hasModel: true,
    qualityLevel: getQualityLevel(model.qualityScore),
    qualityScore: model.qualityScore,
    audioCount: model.audioCount,
    totalDurationMs: model.totalDurationMs,
    needsMoreSamples: needsMoreSamples(model),
    recommendedMinDurationMs: getRecommendedMinDuration(),
  };
}
