/**
 * Voice API Types - Production-ready type definitions
 * Shared between Gateway, Frontend, and Translator
 */

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceTranslateRequest {
  type: 'voice_translate';
  taskId: string;
  userId: string;
  audioBase64?: string;
  audioPath?: string;
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone: boolean;
  webhookUrl?: string;
  priority?: number;
  callbackMetadata?: Record<string, unknown>;
}

export interface VoiceTranslateAsyncRequest extends VoiceTranslateRequest {
  type: 'voice_translate_async';
}

export interface VoiceAnalyzeRequest {
  type: 'voice_analyze';
  taskId: string;
  userId: string;
  audioBase64?: string;
  audioPath?: string;
  analysisTypes?: VoiceAnalysisType[];
}

export type VoiceAnalysisType = 'pitch' | 'timbre' | 'mfcc' | 'spectral' | 'classification';

export interface VoiceCompareRequest {
  type: 'voice_compare';
  taskId: string;
  userId: string;
  audioBase64_1?: string;
  audioPath_1?: string;
  audioBase64_2?: string;
  audioPath_2?: string;
}

export interface VoiceProfileRequest {
  type: 'voice_profile_get' | 'voice_profile_create' | 'voice_profile_update' | 'voice_profile_delete' | 'voice_profile_list';
  taskId: string;
  userId: string;
  profileId?: string;
  name?: string;
  audioBase64?: string;
  audioPath?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface VoiceJobStatusRequest {
  type: 'voice_job_status';
  taskId: string;
  userId: string;
  jobId: string;
}

export interface VoiceJobCancelRequest {
  type: 'voice_job_cancel';
  taskId: string;
  userId: string;
  jobId: string;
}

export interface VoiceFeedbackRequest {
  type: 'voice_feedback';
  taskId: string;
  userId: string;
  translationId: string;
  rating: number;
  feedbackType?: VoiceFeedbackType;
  comment?: string;
  metadata?: Record<string, unknown>;
}

export type VoiceFeedbackType = 'quality' | 'accuracy' | 'voice_similarity' | 'other';

export interface VoiceHistoryRequest {
  type: 'voice_history';
  taskId: string;
  userId: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface VoiceStatsRequest {
  type: 'voice_stats';
  taskId: string;
  userId: string;
  period?: VoiceStatsPeriod;
}

export type VoiceStatsPeriod = 'day' | 'week' | 'month' | 'all';

export interface VoiceAdminMetricsRequest {
  type: 'voice_admin_metrics';
  taskId: string;
  userId: string;
}

export interface VoiceHealthRequest {
  type: 'voice_health';
  taskId: string;
}

export interface VoiceLanguagesRequest {
  type: 'voice_languages';
  taskId: string;
}

export type VoiceAPIRequest =
  | VoiceTranslateRequest
  | VoiceTranslateAsyncRequest
  | VoiceAnalyzeRequest
  | VoiceCompareRequest
  | VoiceProfileRequest
  | VoiceJobStatusRequest
  | VoiceJobCancelRequest
  | VoiceFeedbackRequest
  | VoiceHistoryRequest
  | VoiceStatsRequest
  | VoiceAdminMetricsRequest
  | VoiceHealthRequest
  | VoiceLanguagesRequest;

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VoicePitchAnalysis {
  mean: number;
  std: number;
  min: number;
  max: number;
  contour: number[];
}

export interface VoiceTimbreAnalysis {
  spectralCentroid: number;
  spectralBandwidth: number;
  spectralRolloff: number;
  spectralFlatness: number;
}

export interface VoiceMFCCAnalysis {
  coefficients: number[];
  mean: number[];
  std: number[];
}

export interface VoiceEnergyAnalysis {
  rms: number;
  peak: number;
  dynamicRange: number;
}

export interface VoiceClassification {
  voiceType: string;
  gender: string;
  ageRange: string;
  confidence: number;
}

export interface VoiceAnalysisResult {
  pitch: VoicePitchAnalysis;
  timbre: VoiceTimbreAnalysis;
  mfcc: VoiceMFCCAnalysis;
  energy: VoiceEnergyAnalysis;
  classification: VoiceClassification;
}

export type VoiceComparisonVerdict = 'same_speaker' | 'different_speaker' | 'uncertain';

export interface VoiceComparisonResult {
  overallSimilarity: number;
  pitchSimilarity: number;
  timbreSimilarity: number;
  mfccSimilarity: number;
  energySimilarity: number;
  verdict: VoiceComparisonVerdict;
  confidence: number;
}

export interface VoiceProfile {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sampleCount: number;
  averageQuality: number;
  voiceCharacteristics?: VoiceAnalysisResult;
  metadata?: Record<string, unknown>;
}

export type TranslationJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TranslationJob {
  jobId: string;
  userId: string;
  status: TranslationJobStatus;
  progress: number;
  currentStep?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: VoiceTranslationResult;
  error?: string;
}

export interface VoiceTranslationOriginalAudio {
  transcription: string;
  language: string;
  durationMs: number;
  confidence: number;
}

export interface VoiceTranslationOutput {
  targetLanguage: string;
  translatedText: string;
  audioBase64?: string;
  audioUrl?: string;
  durationMs: number;
  voiceCloned: boolean;
  voiceQuality: number;
}

export interface VoiceTranslationProfile {
  profileId: string;
  quality: number;
  isNew: boolean;
}

export interface VoiceTranslationResult {
  translationId: string;
  originalAudio: VoiceTranslationOriginalAudio;
  translations: VoiceTranslationOutput[];
  voiceProfile?: VoiceTranslationProfile;
  processingTimeMs: number;
}

export interface TranslationHistoryEntry {
  id: string;
  userId: string;
  timestamp: string;
  sourceLanguage: string;
  targetLanguages: string[];
  originalText: string;
  translatedTexts: Record<string, string>;
  audioGenerated: boolean;
  voiceCloned: boolean;
  processingTimeMs: number;
  feedbackRating?: number;
}

export interface VoiceUserStats {
  userId: string;
  totalTranslations: number;
  totalAudioMinutes: number;
  languagesUsed: string[];
  averageProcessingTimeMs: number;
  averageFeedbackRating: number;
  feedbackCount: number;
  profileCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface VoiceSystemMetrics {
  activeJobs: number;
  queuedJobs: number;
  completedToday: number;
  failedToday: number;
  averageProcessingTimeMs: number;
  cpuUsage: number;
  memoryUsageMb: number;
  gpuUsage?: number;
  gpuMemoryMb?: number;
  modelsLoaded: string[];
  uptime: number;
  version: string;
}

export type VoiceServiceHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface VoiceServiceStatus {
  transcription: boolean;
  translation: boolean;
  tts: boolean;
  voiceClone: boolean;
  analytics: boolean;
  database: boolean;
}

export interface VoiceServiceLatency {
  transcriptionMs: number;
  translationMs: number;
  ttsMs: number;
}

export interface VoiceHealthStatus {
  status: VoiceServiceHealthStatus;
  services: VoiceServiceStatus;
  latency: VoiceServiceLatency;
  timestamp: string;
}

export interface VoiceSupportedFeatures {
  transcription: boolean;
  translation: boolean;
  tts: boolean;
  voiceClone: boolean;
}

export interface VoiceSupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  supportedFeatures: VoiceSupportedFeatures;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZMQ EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceAPISuccessEvent {
  type: 'voice_api_success';
  taskId: string;
  requestType: string;
  result: unknown;
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

export type VoiceAPIEvent = VoiceAPISuccessEvent | VoiceAPIErrorEvent | VoiceJobProgressEvent;

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES
// ═══════════════════════════════════════════════════════════════════════════

export type VoiceAPIErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'SEND_FAILED'
  | 'CLEANUP_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'AUDIO_TOO_LONG'
  | 'AUDIO_TOO_SHORT'
  | 'UNSUPPORTED_FORMAT'
  | 'LANGUAGE_NOT_SUPPORTED'
  | 'VOICE_CLONE_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'TRANSLATION_FAILED'
  | 'TTS_FAILED';

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceAPIListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface VoiceAPISuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

export interface VoiceAPIErrorResponse {
  success: false;
  error: string;
  code: VoiceAPIErrorCode;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type VoiceAPIResponse<T = unknown> = VoiceAPISuccessResponse<T> | VoiceAPIErrorResponse;
