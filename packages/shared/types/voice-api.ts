/**
 * Voice API Types - Production-ready type definitions
 * Shared between Gateway, Frontend, and Translator
 */

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

// Base interface for voice translation options (without type discriminator)
interface VoiceTranslateOptions {
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
  /**
   * Transcription fournie par le gateway (optimisation)
   * Évite de refaire la transcription Whisper si elle existe déjà
   */
  mobileTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: VoiceTranscriptionSegment[];
  };
}

export interface VoiceTranslateRequest extends VoiceTranslateOptions {
  type: 'voice_translate';
}

export interface VoiceTranslateAsyncRequest extends VoiceTranslateOptions {
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

/**
 * Voice Prosody Analysis - Speech rhythm and timing characteristics
 */
export interface VoiceProsodyAnalysis {
  energyMean: number;
  energyStd: number;
  silenceRatio: number;
  speechRateWpm: number;
}

/**
 * Voice Quality Metrics - Overall quality assessment
 */
export interface VoiceQualityMetrics {
  overallScore: number;        // 0-1: Overall voice quality score
  clarity: number;              // 0-1: Audio clarity (SNR, noise level)
  consistency: number;          // 0-1: Voice consistency across samples
  suitableForCloning: boolean;  // Whether quality is sufficient for voice cloning
  trainingQuality?: 'poor' | 'fair' | 'good' | 'excellent';
}

/**
 * Complete Voice Quality Analysis
 * Extends VoiceAnalysisResult with prosody and quality metrics
 * Used in MessageAudioTranscription.voiceQualityAnalysis
 * and UserVoiceModel.voiceCharacteristics
 */
export interface VoiceQualityAnalysis extends VoiceAnalysisResult {
  prosody?: VoiceProsodyAnalysis;
  qualityMetrics?: VoiceQualityMetrics;
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

// ═══════════════════════════════════════════════════════════════════════════
// VOICE PROFILE CONSENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status des consentements vocaux
 * Utilisé dans la réponse de GET /voice/profile
 */
export interface VoiceProfileConsentStatus {
  voiceRecordingConsentAt: string | null;
  voiceCloningEnabledAt: string | null;
  ageVerificationConsentAt: string | null;
}

/**
 * Requête de mise à jour des consentements vocaux
 * Utilisé dans POST /voice/profile/consent
 */
export interface VoiceProfileConsentRequest {
  voiceRecordingConsent: boolean;
  voiceCloningConsent?: boolean;
  birthDate?: string; // ISO date string for age verification
}

/**
 * Détails complets d'un profil vocal
 * Réponse de GET /voice/profile
 */
export interface VoiceProfileDetails {
  profileId: string | null;
  userId: string;
  exists: boolean;
  qualityScore: number;
  audioDurationMs: number;
  audioCount: number;
  voiceCharacteristics: Record<string, unknown> | null;
  signatureShort: string | null;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  needsCalibration: boolean;
  consentStatus: VoiceProfileConsentStatus;
}

/**
 * Segment de transcription pour profil vocal avec timestamps
 */
export interface VoiceProfileSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/**
 * Source de la transcription pour profil vocal
 */
export type VoiceProfileTranscriptionSource = 'browser' | 'whisper' | 'mobile' | 'api';

/**
 * Transcription fournie par le navigateur (Web Speech API ou autre)
 * Peut être envoyée avec la requête pour éviter une double transcription
 */
export interface BrowserTranscription {
  text: string;
  language: string;
  confidence: number;
  durationMs: number;
  source: 'browser';
  /** Détails sur l'API utilisée côté navigateur */
  browserDetails?: {
    api: 'webSpeechApi' | 'mediaRecorderTranscription' | 'thirdParty' | 'manual';
    userAgent?: string;
    recognitionLang?: string;
    continuous?: boolean;
    interimResults?: boolean;
  };
  segments?: VoiceProfileSegment[];
  /** Timestamp de création côté client */
  createdAt?: string;
}

/**
 * Requête d'enregistrement de profil vocal
 * Utilisé dans POST /voice/profile/register
 */
export interface VoiceProfileRegisterRequest {
  audioData: string; // Base64 encoded
  audioFormat: 'wav' | 'mp3' | 'ogg' | 'webm' | 'm4a';
  /**
   * Demande une transcription côté serveur (Whisper)
   * Ignoré si browserTranscription est fournie
   */
  includeTranscription?: boolean;
  /**
   * Transcription déjà effectuée côté navigateur
   * Si fournie, le serveur l'utilise au lieu de re-transcrire
   */
  browserTranscription?: BrowserTranscription;
  /**
   * Paramètres de clonage vocal personnalisés
   * Si non spécifiés, les valeurs par défaut seront utilisées
   * Ces paramètres sont sauvegardés dans UserFeature pour les futurs clonages
   */
  voiceCloningSettings?: Partial<VoiceCloningUserSettings>;
  /**
   * Générer des previews vocaux dans différentes langues
   * Les previews sont retournés dans la réponse et doivent être sauvegardés
   * localement côté client (IndexedDB)
   */
  generateVoicePreviews?: boolean;
  /**
   * Langues cibles pour les previews (ex: ['en', 'fr', 'es'])
   * Par défaut: ['en', 'es', 'fr'] si non spécifié et generateVoicePreviews=true
   */
  previewLanguages?: string[];
  /**
   * Texte source pour les previews (optionnel)
   * Par défaut: utilise la transcription de l'audio enregistré
   */
  previewText?: string;
}

/**
 * Transcription incluse dans la réponse de registration
 */
export interface VoiceProfileTranscription {
  text: string;
  language: string;
  confidence: number;
  durationMs: number;
  source: VoiceProfileTranscriptionSource;
  model?: string;
  segments?: VoiceProfileSegment[];
  processingTimeMs: number;
  /** Détails du navigateur si source === 'browser' */
  browserDetails?: BrowserTranscription['browserDetails'];
}

/**
 * Exemple de voix preview générée dans différentes langues
 * Stocké localement côté client (IndexedDB) pour lecture ultérieure
 *
 * ## Frontend Storage Strategy (IndexedDB)
 *
 * Les previews vocaux sont générés côté serveur lors de l'enregistrement du profil
 * mais NE SONT PAS persistés côté serveur. Le frontend doit les sauvegarder en IndexedDB.
 *
 * ### Schéma IndexedDB recommandé:
 * ```typescript
 * // Database: 'meeshy-voice-data'
 * // Store: 'voicePreviews'
 * interface VoicePreviewRecord {
 *   id: string;           // `${userId}_${language}` (clé primaire)
 *   userId: string;       // Index secondaire pour recherche
 *   language: string;
 *   originalText: string;
 *   translatedText: string;
 *   audioBlob: Blob;      // Convertir base64 → Blob pour stockage efficace
 *   audioFormat: string;
 *   durationMs: number;
 *   generatedAt: string;
 *   profileVersion: number; // Pour invalider si profil recréé
 * }
 * ```
 *
 * ### Exemple d'implémentation:
 * ```typescript
 * // Après registration réussie avec voicePreviews
 * if (response.voicePreviews) {
 *   const db = await openDB('meeshy-voice-data', 1, {
 *     upgrade(db) {
 *       const store = db.createObjectStore('voicePreviews', { keyPath: 'id' });
 *       store.createIndex('userId', 'userId');
 *       store.createIndex('language', 'language');
 *     }
 *   });
 *
 *   for (const preview of response.voicePreviews) {
 *     const audioBlob = base64ToBlob(preview.audioBase64, `audio/${preview.audioFormat}`);
 *     await db.put('voicePreviews', {
 *       id: `${userId}_${preview.language}`,
 *       userId,
 *       language: preview.language,
 *       originalText: preview.originalText,
 *       translatedText: preview.translatedText,
 *       audioBlob,
 *       audioFormat: preview.audioFormat,
 *       durationMs: preview.durationMs,
 *       generatedAt: preview.generatedAt,
 *       profileVersion: response.version
 *     });
 *   }
 * }
 * ```
 *
 * ### Lecture pour playback:
 * ```typescript
 * const preview = await db.get('voicePreviews', `${userId}_${language}`);
 * if (preview) {
 *   const audioUrl = URL.createObjectURL(preview.audioBlob);
 *   const audio = new Audio(audioUrl);
 *   audio.play();
 * }
 * ```
 */
export interface VoicePreviewSample {
  /** Code langue (ex: 'en', 'fr', 'es') */
  language: string;
  /** Texte original utilisé pour générer le preview */
  originalText: string;
  /** Texte traduit dans la langue cible */
  translatedText: string;
  /** Audio en base64 */
  audioBase64: string;
  /** Format audio (mp3, wav, etc.) */
  audioFormat: string;
  /** Durée de l'audio en millisecondes */
  durationMs: number;
  /** Timestamp ISO de génération */
  generatedAt: string;
}

/**
 * Réponse de POST /voice/profile/register
 */
export interface VoiceProfileRegisterResponse extends VoiceProfileDetails {
  transcription?: VoiceProfileTranscription;
  /** Previews vocaux générés dans différentes langues (à sauvegarder en IndexedDB) */
  voicePreviews?: VoicePreviewSample[];
}

/**
 * Statut d'un job de traduction vocale
 * Alias du type canonique ProcessStatus avec renommage pour clarté
 * @see status-types.ts ProcessStatus
 */
export type TranslationJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
// Note: 'processing' est un alias de 'in_progress' dans le ProcessStatus canonique

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
// TRANSCRIPTION & AUDIO TRANSLATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

// Note: VoiceProfileSegment est défini plus haut pour les profils vocaux

/**
 * Segment de transcription simplifié pour l'API Voice
 */
export interface VoiceTranscriptionSegment {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Résultat de transcription audio
 */
export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  durationMs: number;
  source: string;
  segments?: VoiceTranscriptionSegment[];
  messageId?: string;
  attachmentId?: string;
  processingTimeMs: number;
}

/**
 * Résultat de traduction audio (une langue cible)
 */
export interface TranslatedAudioResult {
  targetLanguage: string;
  translatedText: string;
  audioUrl?: string;
  audioPath?: string;
  audioBase64?: string;
  durationMs?: number;
  voiceCloned: boolean;
  voiceQuality?: number;
}

/**
 * Options pour la traduction audio
 */
export interface AudioTranslationOptions {
  audioBase64?: string;
  audioPath?: string;
  attachmentId?: string;
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
  saveToDatabase?: boolean;
  // Voice cloning options for forwarded messages
  originalSenderId?: string;
  existingVoiceProfile?: VoiceProfileData;
  useOriginalVoice?: boolean;
  /**
   * Transcription existante (optimisation performance)
   * Si fournie, évite de refaire la transcription Whisper (~15-30s économisées)
   */
  existingTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: VoiceTranscriptionSegment[];
  };
  /**
   * Paramètres de clonage vocal (Chatterbox TTS)
   * Permet un contrôle fin de la génération vocale.
   * Si non spécifiés, les paramètres sont auto-calculés basés sur l'analyse vocale.
   */
  voiceCloneParams?: VoiceCloneParams;
}

/**
 * Données d'un profil vocal (pour le clonage)
 */
export interface VoiceProfileData {
  profileId: string;
  userId: string;
  embedding: string; // Base64 encoded
  qualityScore: number;
  fingerprint?: Record<string, unknown>;
  voiceCharacteristics?: Record<string, unknown>;
  version: number;
  audioCount: number;
  totalDurationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE CLONE PARAMETERS (Chatterbox TTS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Paramètres de clonage vocal pour Chatterbox TTS
 * Tous les paramètres sont optionnels - si non spécifiés, ils seront auto-calculés
 * basés sur l'analyse vocale du speaker.
 */
export interface VoiceCloneParams {
  /**
   * Expressivité vocale (0.0-1.0)
   * Amplifie les caractéristiques vocales du speaker.
   * - 0.0 = Très neutre, proche de la voix originale
   * - 0.5 = Équilibré (défaut)
   * - 1.0 = Très expressif, accentue les émotions
   *
   * Auto-calculé: Inversement proportionnel à l'expressivité naturelle de la voix.
   * Une voix déjà expressive n'a pas besoin d'amplification.
   */
  exaggeration?: number;

  /**
   * Guidance du modèle (0.0-1.0)
   * Contrôle la fidélité au texte vs créativité.
   * - 0.0 = Très créatif, peut s'écarter du texte
   * - 0.5 = Équilibré (défaut)
   * - 1.0 = Très strict, suit le texte de près
   *
   * Auto-calculé: Proportionnel à l'instabilité de la voix.
   * Une voix instable (jitter/shimmer élevés) nécessite plus de guidance.
   */
  cfgWeight?: number;

  /**
   * Température/Créativité (0.0-2.0)
   * Contrôle le caractère aléatoire de la génération.
   * - 0.0 = Déterministe, toujours le même résultat
   * - 0.8 = Équilibré (défaut)
   * - 2.0 = Très créatif, résultats variés
   *
   * Auto-calculé: Inversement proportionnel à l'expressivité naturelle.
   * Une voix expressive a déjà de la variété, pas besoin d'en ajouter.
   */
  temperature?: number;

  /**
   * Pénalité de répétition (1.0-3.0)
   * Évite les répétitions dans la génération.
   * - 1.0 = Pas de pénalité, répétitions possibles
   * - 1.2 = Défaut pour modèle monolingual (anglais)
   * - 2.0 = Défaut pour modèle multilingue
   * - 3.0 = Forte pénalité, évite fortement les répétitions
   *
   * Auto-calculé: Basé sur le jitter (variations naturelles du pitch).
   * Une voix avec des variations naturelles n'a pas besoin de pénalité forte.
   */
  repetitionPenalty?: number;

  /**
   * Probabilité minimum (0.0-1.0)
   * Filtre les tokens improbables lors du sampling.
   * - 0.02 = Très permissif
   * - 0.05 = Défaut
   * - 0.15 = Strict, filtre beaucoup
   *
   * Auto-calculé: Basé sur le rapport harmoniques/bruit (HNR).
   * Une voix claire permet plus de liberté, une voix bruiteuse nécessite plus de filtrage.
   */
  minP?: number;

  /**
   * Nucleus sampling / Top-P (0.0-1.0)
   * Limite aux tokens les plus probables.
   * - 0.85 = Strict, limite aux tokens très probables
   * - 1.0 = Défaut, considère tous les tokens
   *
   * Auto-calculé: Basé sur la complexité spectrale de la voix.
   * Une voix complexe (large bandwidth) peut bénéficier d'un top_p plus élevé.
   */
  topP?: number;

  /**
   * Activer l'auto-optimisation des paramètres
   * Si true (défaut), les paramètres non spécifiés seront calculés automatiquement
   * basés sur l'analyse des caractéristiques vocales.
   * Si false, utilise les valeurs par défaut fixes.
   */
  autoOptimize?: boolean;
}

/**
 * Paramètres optimaux calculés par l'analyse vocale
 */
export interface VoiceCloneOptimalParams extends Required<Omit<VoiceCloneParams, 'autoOptimize'>> {
  /** Score de confiance de l'analyse (0.0-1.0) */
  confidence: number;

  /** Détails de l'analyse vocale */
  analysis: {
    /** Score d'expressivité de la voix (0.0-1.0) */
    expressivenessScore: number;
    /** Score de stabilité de la voix (0.0-1.0) */
    stabilityScore: number;
    /** Coefficient de variation du pitch */
    pitchCv: number;
    /** Ratio harmoniques/bruit */
    harmonicsToNoise: number;
    /** Largeur de bande spectrale (Hz) */
    spectralBandwidth: number;
    /** Type de voix classifié */
    voiceType: string;
    /** Genre estimé */
    gender: string;
  };

  /** Explication textuelle des paramètres choisis */
  explanation: string;
}

/**
 * Résultat générique d'un service
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// REST API REQUEST BODY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Body pour POST /voice/translate
 */
export interface VoiceTranslateBody {
  audioBase64?: string;
  attachmentId?: string;
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
}

/**
 * Body pour POST /voice/translate/async
 */
export interface VoiceTranslateAsyncBody extends VoiceTranslateBody {
  webhookUrl?: string;
  priority?: number;
  callbackMetadata?: Record<string, unknown>;
}

/**
 * Body pour POST /voice/transcribe
 */
export interface VoiceTranscribeBody {
  audioBase64?: string;
  attachmentId?: string;
  sourceLanguage?: string;
}

/**
 * Body pour POST /voice/analyze
 */
export interface VoiceAnalyzeBody {
  audioBase64?: string;
  analysisTypes?: VoiceAnalysisType[];
}

/**
 * Body pour POST /voice/compare
 */
export interface VoiceCompareBody {
  audioBase64_1?: string;
  audioBase64_2?: string;
}

/**
 * Body pour POST /voice/feedback
 */
export interface VoiceFeedbackBody {
  translationId: string;
  rating: number;
  feedbackType?: VoiceFeedbackType;
  comment?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Query params pour GET /voice/history
 */
export interface VoiceHistoryQuery {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Query params pour GET /voice/stats
 */
export interface VoiceStatsQuery {
  period?: VoiceStatsPeriod;
}

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

// ═══════════════════════════════════════════════════════════════════════════
// VOICE CLONING USER SETTINGS (Persistent configuration)
// Aligned with Prisma UserFeature model
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Preset de qualité pour le clonage vocal
 */
export type VoiceCloningQualityPreset = 'fast' | 'balanced' | 'high_quality';

/**
 * Configuration utilisateur persistée pour le clonage vocal
 * Ces paramètres sont stockés dans UserFeature et peuvent être modifiés
 * via PUT /user-features/configuration
 *
 * Utilisé par:
 * - Frontend: Settings > Audio > Voice Cloning
 * - Gateway: UserFeaturesService
 * - Translator: audio_message_pipeline.py
 */
export interface VoiceCloningUserSettings {
  /**
   * Exagération des caractéristiques vocales (0.0-1.0)
   * - 0.0 = Voix très naturelle, proche de l'original
   * - 0.5 = Équilibré (défaut)
   * - 1.0 = Caractéristiques vocales très prononcées
   */
  voiceCloningExaggeration: number;

  /**
   * Poids CFG (Classifier-Free Guidance) pour la génération (0.0-1.0)
   * - Pour langues non-anglaises: 0.0 réduit le transfert d'accent
   * - 0.5 = Équilibre (défaut pour anglais)
   * - 1.0 = Forte adhésion au conditionnement
   */
  voiceCloningCfgWeight: number;

  /**
   * Température de génération (0.1-2.0)
   * - 0.5 = Plus déterministe, moins de variation
   * - 1.0 = Défaut
   * - 1.5 = Plus de variation créative
   */
  voiceCloningTemperature: number;

  /**
   * Top-P / Nucleus sampling (0.0-1.0)
   * - 0.85 = Strict, limite aux tokens très probables
   * - 0.9 = Défaut
   * - 1.0 = Considère tous les tokens
   */
  voiceCloningTopP: number;

  /**
   * Preset de qualité
   * - 'fast' = Génération rapide, qualité légèrement réduite
   * - 'balanced' = Équilibre vitesse/qualité (défaut)
   * - 'high_quality' = Meilleure qualité, plus lent
   */
  voiceCloningQualityPreset: VoiceCloningQualityPreset;
}

/**
 * Valeurs par défaut pour la configuration de clonage vocal
 */
export const DEFAULT_VOICE_CLONING_SETTINGS: VoiceCloningUserSettings = {
  voiceCloningExaggeration: 0.5,
  voiceCloningCfgWeight: 0.5,
  voiceCloningTemperature: 1.0,
  voiceCloningTopP: 0.9,
  voiceCloningQualityPreset: 'balanced',
};

/**
 * Paramètres de clonage pour une requête spécifique
 * Utilisé dans les requêtes ZMQ vers le Translator
 * Merge des settings utilisateur + overrides par requête
 */
export interface VoiceCloningRequestParams {
  /** Exagération des caractéristiques vocales */
  exaggeration: number;
  /** Poids CFG pour la génération */
  cfgWeight: number;
  /** Température de génération */
  temperature: number;
  /** Top-P / Nucleus sampling */
  topP: number;
  /** Preset de qualité utilisé */
  qualityPreset: VoiceCloningQualityPreset;
}

/**
 * Configuration de clonage envoyée dans les requêtes ZMQ
 * Structure attendue par le service Translator Python
 */
export interface ZmqCloningParams {
  exaggeration: number;
  cfgWeight: number;
  temperature: number;
  topP: number;
  qualityPreset: string;
}

/**
 * Requête de configuration utilisateur pour les features audio
 * Utilisé dans PUT /user-features/configuration
 */
export interface UserAudioConfigurationRequest {
  // Paramètres de transcription
  transcriptionSource?: 'auto' | 'mobile' | 'server';
  translatedAudioFormat?: 'mp3' | 'wav' | 'ogg';

  // Paramètres de rétention de données
  dataRetentionDays?: number;
  voiceDataRetentionDays?: number;

  // Paramètres de clonage vocal (optionnels)
  voiceCloningExaggeration?: number;
  voiceCloningCfgWeight?: number;
  voiceCloningTemperature?: number;
  voiceCloningTopP?: number;
  voiceCloningQualityPreset?: VoiceCloningQualityPreset;
}

/**
 * Réponse de configuration utilisateur pour les features audio
 * Retourné par GET /user-features/configuration
 */
export interface UserAudioConfigurationResponse {
  targetLanguage: string;
  transcriptionSource: 'auto' | 'mobile' | 'server';
  translatedAudioFormat: 'mp3' | 'wav' | 'ogg';
  dataRetentionDays: number;
  voiceDataRetentionDays: number;

  // Paramètres de clonage vocal
  voiceCloningExaggeration: number;
  voiceCloningCfgWeight: number;
  voiceCloningTemperature: number;
  voiceCloningTopP: number;
  voiceCloningQualityPreset: VoiceCloningQualityPreset;
}
