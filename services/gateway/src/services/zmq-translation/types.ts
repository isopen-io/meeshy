/**
 * ZMQ Translation Types
 * Définitions de types pour la communication ZMQ avec le service Translator
 */

// ═══════════════════════════════════════════════════════════════
// TRANSLATION TYPES
// ═══════════════════════════════════════════════════════════════

export interface TranslationRequest {
  messageId: string;
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
  conversationId: string;
  modelType?: string;
}

export interface TranslationResult {
  messageId: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidenceScore: number;
  processingTime: number;
  modelType: string;
  workerName?: string;
  error?: string;
  // Technical information
  translatorModel?: string;
  workerId?: string;
  poolType?: string;
  translationTime?: number;
  queueTime?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  version?: string;
  // Structure preservation metrics
  segmentsCount?: number;
  emojisCount?: number;
}

export interface TranslationCompletedEvent {
  type: 'translation_completed';
  taskId: string;
  result: TranslationResult;
  targetLanguage: string;
  timestamp: number;
  metadata?: any;
}

export interface TranslationErrorEvent {
  type: 'translation_error';
  taskId: string;
  messageId: string;
  error: string;
  conversationId: string;
  metadata?: any;
}

export interface PongEvent {
  type: 'pong';
  timestamp: number;
  translator_status: string;
  translator_port_pub?: number;
  translator_port_pull?: number;
  audio_pipeline_available?: boolean;
}

export type TranslationEvent =
  | TranslationCompletedEvent
  | TranslationErrorEvent
  | TranslationReadyEvent
  | AudioTranslationReadyEvent
  | AudioTranslationsProgressiveEvent
  | AudioTranslationsCompletedEvent
  | PongEvent;

// ═══════════════════════════════════════════════════════════════
// AUDIO PROCESSING TYPES
// ═══════════════════════════════════════════════════════════════

export const AUDIO_BASE64_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

export interface BinaryFrameInfo {
  audio?: number;
  embedding?: number;
  voiceProfile?: number;  // Index du frame contenant le voice profile embedding
  audioMimeType?: string;
  audioSize?: number;
  embeddingSize?: number;
  voiceProfileSize?: number;  // Taille du voice profile embedding en bytes
}

export interface AudioProcessRequest {
  type: 'audio_process';
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  audioPath?: string;
  audioUrl?: string;
  audioBase64?: string;
  audioMimeType?: string;
  binaryFrames?: BinaryFrameInfo;
  audioDurationMs: number;
  mobileTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
  targetLanguages: string[];
  generateVoiceClone: boolean;
  modelType: string;
  originalSenderId?: string;
  existingVoiceProfile?: {
    profileId: string;
    userId: string;
    embedding: string;
    qualityScore: number;
    fingerprint?: Record<string, any>;
    voiceCharacteristics?: Record<string, any>;
    version: number;
    audioCount: number;
    totalDurationMs: number;
  };
  useOriginalVoice?: boolean;
  voiceCloneParams?: {
    chatterbox?: {
      exaggeration?: number;
      cfgWeight?: number;
      temperature?: number;
      topP?: number;
      minP?: number;
      repetitionPenalty?: number;
      autoOptimize?: boolean;
    };
    performance?: {
      parallel?: boolean;
      maxWorkers?: number;
      optimizeModel?: boolean;
      useFp16?: boolean;
      warmup?: boolean;
    };
    quality?: {
      minSimilarityThreshold?: number;
      autoRetryOnLowSimilarity?: boolean;
      maxRetries?: number;
    };
  };
}

// Import unified types from shared
import type { TranslatedAudioData } from '@meeshy/shared/types';
import type {
  TranscriptionSegment,
  SpeakerAnalysis
} from '@meeshy/shared/types/attachment-transcription';

export interface TranscriptionData {
  text: string;
  language: string;
  confidence: number;
  durationMs: number;
  source: 'mobile' | 'whisper';
  model?: string;
  segments?: TranscriptionSegment[];  // ✅ Utiliser le type partagé
  // Diarization fields
  speakerCount?: number;
  primarySpeakerId?: string;
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string | null;
  speakerAnalysis?: SpeakerAnalysis;  // ✅ Utiliser le type partagé
}

// Re-export for convenience
export type { TranslatedAudioData };

export interface AudioProcessCompletedEvent {
  type: 'audio_process_completed';
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription: TranscriptionData;
  translatedAudios: TranslatedAudioData[];
  voiceModelUserId: string;
  voiceModelQuality: number;
  processingTimeMs: number;
  timestamp: number;
}

export interface AudioProcessErrorEvent {
  type: 'audio_process_error';
  taskId: string;
  messageId: string;
  attachmentId: string;
  error: string;
  errorCode: string;
  timestamp: number;
}

export type AudioEvent = AudioProcessCompletedEvent | AudioProcessErrorEvent;

// ═══════════════════════════════════════════════════════════════
// TRANSCRIPTION ONLY TYPES
// ═══════════════════════════════════════════════════════════════

export interface TranscriptionOnlyRequest {
  type: 'transcription_only';
  taskId: string;
  messageId: string;
  attachmentId?: string;
  audioPath?: string;
  audioUrl?: string;
  audioData?: string;
  audioFormat?: string;
  binaryFrames?: BinaryFrameInfo;
  mobileTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
}

export interface TranscriptionCompletedEvent {
  type: 'transcription_completed';
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription: {
    text: string;
    language: string;
    confidence: number;
    durationMs: number;
    source: string;
    model?: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
  processingTimeMs: number;
  timestamp: number;
}

export interface TranscriptionErrorEvent {
  type: 'transcription_error';
  taskId: string;
  messageId: string;
  attachmentId: string;
  error: string;
  errorCode: string;
  timestamp: number;
}

/**
 * Événement envoyé dès que la transcription est prête (AVANT la traduction).
 * Permet d'afficher la transcription immédiatement sans attendre la traduction.
 */
export interface TranscriptionReadyEvent {
  type: 'transcription_ready';
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription: TranscriptionData;
  processingTimeMs: number;
  timestamp: number;
}

export interface TranslationReadyEvent {
  type: 'translation_ready';
  taskId: string;
  messageId: string;
  attachmentId: string;
  language: string;
  translatedAudio: {
    targetLanguage: string;
    translatedText: string;
    audioUrl: string;
    audioPath: string;
    durationMs: number;
    voiceCloned: boolean;
    voiceQuality: number;
    audioMimeType: string;
    segments?: TranscriptionSegment[];
  };
  timestamp: number;
}

/**
 * Structure commune pour tous les événements de traduction audio
 */
interface BaseTranslationEvent {
  taskId: string;
  messageId: string;
  attachmentId: string;
  language: string;
  translatedAudio: {
    targetLanguage: string;
    translatedText: string;
    audioUrl: string;
    audioPath: string;
    durationMs: number;
    voiceCloned: boolean;
    voiceQuality: number;
    audioMimeType: string;
    segments?: TranscriptionSegment[];
  };
  timestamp: number;
}

/**
 * Événement: traduction audio unique (1 seule langue demandée)
 */
export interface AudioTranslationReadyEvent extends BaseTranslationEvent {
  type: 'audio_translation_ready';
}

/**
 * Événement: traduction progressive (multi-langues, pas la dernière)
 */
export interface AudioTranslationsProgressiveEvent extends BaseTranslationEvent {
  type: 'audio_translations_progressive';
}

/**
 * Événement: dernière traduction terminée (multi-langues)
 */
export interface AudioTranslationsCompletedEvent extends BaseTranslationEvent {
  type: 'audio_translations_completed';
}

export type TranscriptionEvent = TranscriptionCompletedEvent | TranscriptionErrorEvent | TranscriptionReadyEvent;

// ═══════════════════════════════════════════════════════════════
// VOICE API TYPES
// ═══════════════════════════════════════════════════════════════

export interface VoiceAPIRequest {
  type: string;
  taskId: string;
  userId?: string;
  [key: string]: any;
}

export interface VoiceAPISuccessEvent {
  type: 'voice_api_success';
  taskId: string;
  requestType: string;
  result: any;
  processingTimeMs: number;
  timestamp: number;
}

export interface VoiceAPIErrorEvent {
  type: 'voice_api_error';
  taskId: string;
  requestType: string;
  error: string;
  errorCode: string;
  timestamp: number;
}

export interface VoiceJobProgressEvent {
  type: 'voice_job_progress';
  taskId: string;
  jobId: string;
  progress: number;
  currentStep: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// VOICE PROFILE TYPES
// ═══════════════════════════════════════════════════════════════

export interface VoiceProfileAnalyzeRequest {
  type: 'voice_profile_analyze';
  request_id: string;
  user_id: string;
  audio_data: string;
  audio_format: string;
  is_update?: boolean;
  existing_fingerprint?: Record<string, any>;
  include_transcription?: boolean;
  generate_previews?: boolean;
  preview_languages?: string[];
  preview_text?: string;
}

export interface VoiceProfileVerifyRequest {
  type: 'voice_profile_verify';
  request_id: string;
  user_id: string;
  audio_data: string;
  audio_format: string;
  existing_fingerprint: Record<string, any>;
}

export interface VoiceProfileCompareRequest {
  type: 'voice_profile_compare';
  request_id: string;
  fingerprint_a: Record<string, any>;
  fingerprint_b: Record<string, any>;
}

export type VoiceProfileRequest = VoiceProfileAnalyzeRequest | VoiceProfileVerifyRequest | VoiceProfileCompareRequest;

export interface VoiceProfileTranscription {
  text: string;
  language: string;
  confidence: number;
  duration_ms: number;
  source: string;
  model?: string;
  segments?: Array<{
    text: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
  }>;
  processing_time_ms: number;
}

export interface VoicePreviewSampleZMQ {
  language: string;
  original_text: string;
  translated_text: string;
  audio_base64: string;
  audio_format: string;
  duration_ms: number;
  generated_at: string;
}

export interface VoiceProfileAnalyzeResult {
  type: 'voice_profile_analyze_result';
  request_id: string;
  success: boolean;
  user_id: string;
  profile_id?: string;
  quality_score?: number;
  audio_duration_ms?: number;
  voice_characteristics?: Record<string, any>;
  fingerprint?: Record<string, any>;
  fingerprint_id?: string;
  signature_short?: string;
  embedding_path?: string;
  embedding_data?: string;
  embedding_dimension?: number;
  transcription?: VoiceProfileTranscription;
  voice_previews?: VoicePreviewSampleZMQ[];
  error?: string;
}

export interface VoiceProfileVerifyResult {
  type: 'voice_profile_verify_result';
  request_id: string;
  success: boolean;
  user_id: string;
  is_match?: boolean;
  similarity_score?: number;
  threshold?: number;
  error?: string;
}

export interface VoiceProfileCompareResult {
  type: 'voice_profile_compare_result';
  request_id: string;
  success: boolean;
  similarity_score?: number;
  is_match?: boolean;
  threshold?: number;
  error?: string;
}

export interface VoiceProfileErrorEvent {
  type: 'voice_profile_error';
  request_id: string;
  user_id?: string;
  error: string;
  success: false;
  timestamp: number;
}

export type VoiceProfileEvent =
  | VoiceProfileAnalyzeResult
  | VoiceProfileVerifyResult
  | VoiceProfileCompareResult
  | VoiceProfileErrorEvent;

// ═══════════════════════════════════════════════════════════════
// VOICE TRANSLATION JOB TYPES
// ═══════════════════════════════════════════════════════════════

// Import du format unifié depuis shared
import type { VoiceTranslationResult as SharedVoiceTranslationResult } from '@meeshy/shared/types/voice-api';

export interface VoiceTranslationCompletedEvent {
  type: 'voice_translation_completed';
  jobId: string;
  status: string;
  userId: string;
  timestamp: number;
  result?: SharedVoiceTranslationResult;
}

export interface VoiceTranslationFailedEvent {
  type: 'voice_translation_failed';
  jobId: string;
  status: string;
  userId: string;
  timestamp: number;
  error?: string;
  errorCode?: string;
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED VOICE EVENT TYPE
// ═══════════════════════════════════════════════════════════════

export type VoiceEvent =
  | VoiceAPISuccessEvent
  | VoiceAPIErrorEvent
  | VoiceJobProgressEvent
  | VoiceProfileAnalyzeResult
  | VoiceProfileVerifyResult
  | VoiceProfileCompareResult
  | VoiceProfileErrorEvent
  | VoiceTranslationCompletedEvent
  | VoiceTranslationFailedEvent;

// ═══════════════════════════════════════════════════════════════
// COMBINED EVENT TYPE
// ═══════════════════════════════════════════════════════════════

export type ZMQEvent = TranslationEvent | AudioEvent | VoiceEvent | TranscriptionEvent;
