/**
 * Client ZMQ haute performance pour communication avec le service de traduction
 * Architecture: PUB/SUB + REQ/REP avec pool de connexions et gestion asynchrone
 */

import { EventEmitter } from 'events';
import * as zmq from 'zeromq';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import path from 'path';

// Types pour l'architecture PUB/SUB
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
  // NOUVELLES INFORMATIONS TECHNIQUES
  translatorModel?: string;  // Modèle ML utilisé
  workerId?: string;        // Worker qui a traité
  poolType?: string;        // Pool utilisée (normal/any)
  translationTime?: number; // Temps de traduction
  queueTime?: number;       // Temps d'attente en queue
  memoryUsage?: number;     // Usage mémoire (MB)
  cpuUsage?: number;        // Usage CPU (%)
  version?: string;         // Version du Translator
  // Structure preservation metrics (from Translator)
  segmentsCount?: number;   // Number of segments translated
  emojisCount?: number;     // Number of emojis preserved
}

export interface TranslationCompletedEvent {
  type: 'translation_completed';
  taskId: string;
  result: TranslationResult;
  targetLanguage: string;
  timestamp: number;
  metadata?: any;  // Métadonnées techniques
}

export interface TranslationErrorEvent {
  type: 'translation_error';
  taskId: string;
  messageId: string;
  error: string;
  conversationId: string;
  metadata?: any;  // Métadonnées techniques
}

export interface PongEvent {
  type: 'pong';
  timestamp: number;
  translator_status: string;
  translator_port_pub?: number;
  translator_port_pull?: number;
  audio_pipeline_available?: boolean;  // Added for alignment
}

export type TranslationEvent = TranslationCompletedEvent | TranslationErrorEvent | PongEvent;

// ═══════════════════════════════════════════════════════════════
// AUDIO PROCESSING TYPES
// ═══════════════════════════════════════════════════════════════

// Seuil pour envoyer le fichier en base64 (5 MB)
// Au-delà, le Translator téléchargera via audioUrl
export const AUDIO_BASE64_SIZE_THRESHOLD = 5 * 1024 * 1024;

// ═══════════════════════════════════════════════════════════════
// ZMQ MULTIPART BINARY PROTOCOL
// ═══════════════════════════════════════════════════════════════
/**
 * Protocol ZMQ Multipart pour données binaires (audio, embeddings)
 *
 * Avantages:
 * - Pas d'encodage/décodage base64 (économie CPU)
 * - Réduction de 33% de la taille des données
 * - Support natif ZMQ (performant)
 *
 * Format:
 * - Frame 0: JSON metadata avec binaryFrames indiquant les indices
 * - Frame 1+: Données binaires (audio, embedding, etc.)
 *
 * Rétrocompatibilité:
 * - Si binaryFrames absent dans le JSON → ancien format base64
 * - Si binaryFrames présent → nouveau format multipart
 */
export interface BinaryFrameInfo {
  /** Index du frame contenant l'audio binaire (1-based, 0 = absent) */
  audio?: number;
  /** Index du frame contenant l'embedding pkl binaire (1-based, 0 = absent) */
  embedding?: number;
  /** Mime type de l'audio */
  audioMimeType?: string;
  /** Taille de l'audio en bytes */
  audioSize?: number;
  /** Taille de l'embedding en bytes */
  embeddingSize?: number;
}

export interface AudioProcessRequest {
  type: 'audio_process';
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  // audioPath: Le fichier sera chargé et envoyé en multipart binaire
  // OBLIGATOIRE dans l'appel sendAudioProcessRequest() mais optionnel dans l'interface
  // car le message envoyé au Translator ne contient pas le chemin (seulement binaryFrames)
  audioPath?: string;
  // audioUrl est DEPRECATED - conservé pour rétrocompatibilité interface mais non utilisé
  audioUrl?: string;
  // DEPRECATED: Préférer binaryFrames pour multipart
  // Contenu audio en base64 (legacy, pour rétrocompatibilité)
  audioBase64?: string;
  audioMimeType?: string;
  // NOUVEAU: Indique que les données binaires sont dans des frames ZMQ séparés
  // Si présent, le Translator utilise recv_multipart() pour extraire les binaires
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

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE PROFILE FIELDS (pour transferts et réutilisation)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ID de l'émetteur original (différent de senderId si message transféré)
   * Pour les messages normaux: originalSenderId === senderId
   * Pour les transferts: originalSenderId = émetteur du message original
   */
  originalSenderId?: string;

  /**
   * Profil vocal existant de l'émetteur original (si disponible en BDD Gateway)
   * Si fourni, Translator l'utilise directement sans le recréer
   * Si absent, Translator génère un nouveau profil et le retourne à Gateway
   */
  existingVoiceProfile?: {
    profileId: string;
    userId: string;
    embedding: string;      // Base64 encoded numpy array
    qualityScore: number;
    fingerprint?: Record<string, any>;
    voiceCharacteristics?: Record<string, any>;
    version: number;
    audioCount: number;
    totalDurationMs: number;
  };

  /**
   * Si true, utiliser la voix de l'émetteur original même pour les transferts
   * Si false, utiliser la voix du forwarder (senderId)
   * Par défaut: true
   */
  useOriginalVoice?: boolean;

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE CLONE PARAMETERS (Chatterbox TTS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Paramètres de clonage vocal pour Chatterbox TTS
   * Permet un contrôle fin de la génération vocale.
   * Si non spécifiés, les paramètres sont auto-calculés basés sur l'analyse vocale.
   */
  voiceCloneParams?: {
    /** Expressivité vocale (0.0-1.0). Défaut: auto-calculé */
    exaggeration?: number;
    /** Guidance du modèle (0.0-1.0). Défaut: auto-calculé */
    cfgWeight?: number;
    /** Température/Créativité (0.0-2.0). Défaut: 0.8 */
    temperature?: number;
    /** Pénalité de répétition (1.0-3.0). Défaut: 1.2 (mono) / 2.0 (multi) */
    repetitionPenalty?: number;
    /** Probabilité minimum (0.0-1.0). Défaut: 0.05 */
    minP?: number;
    /** Nucleus sampling (0.0-1.0). Défaut: 1.0 */
    topP?: number;
    /** Activer l'auto-optimisation. Défaut: true */
    autoOptimize?: boolean;
  };
}

export interface TranscriptionData {
  text: string;
  language: string;
  confidence: number;
  source: 'mobile' | 'whisper';
  segments?: Array<{ text: string; startMs: number; endMs: number }>;
}

export interface TranslatedAudioData {
  targetLanguage: string;
  translatedText: string;
  audioUrl: string;
  audioPath: string;
  durationMs: number;
  voiceCloned: boolean;
  voiceQuality: number;
}

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
  attachmentId?: string;  // Optionnel si audioData est fourni

  // Option 1: Chemin du fichier audio (pour attachments existants)
  audioPath?: string;
  audioUrl?: string;

  // Option 2: Audio en base64 (DEPRECATED - préférer binaryFrames)
  audioData?: string;     // Audio encodé en base64
  audioFormat?: string;   // Format: wav, mp3, ogg, webm, m4a

  // Option 3: Audio binaire via ZMQ multipart (RECOMMANDÉ)
  // Plus efficace que base64 (économise 33% de taille et CPU)
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

export type TranscriptionEvent = TranscriptionCompletedEvent | TranscriptionErrorEvent;

// ═══════════════════════════════════════════════════════════════════════════
// VOICE API TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// VOICE PROFILE TYPES (Internal ZMQ communication with Translator)
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceProfileAnalyzeRequest {
  type: 'voice_profile_analyze';
  request_id: string;
  user_id: string;
  audio_data: string;  // base64 encoded
  audio_format: string;  // wav, mp3, ogg
  is_update?: boolean;
  existing_fingerprint?: Record<string, any>;
  include_transcription?: boolean;  // Request transcription along with profile analysis
  // Voice preview generation options
  generate_previews?: boolean;  // Generate voice previews in target languages
  preview_languages?: string[];  // Target languages for previews (e.g., ['en', 'fr', 'es'])
  preview_text?: string;  // Source text for previews (uses transcription if not provided)
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
  source: string;  // "whisper" or "mobile"
  model?: string;
  segments?: Array<{
    text: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
  }>;
  processing_time_ms: number;
}

/** Voice preview sample returned from Translator */
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
  embedding_data?: string;  // Base64-encoded embedding binary for MongoDB storage
  embedding_dimension?: number;  // Embedding vector dimension (default 256)
  transcription?: VoiceProfileTranscription;  // Transcription data (if requested)
  voice_previews?: VoicePreviewSampleZMQ[];  // Voice previews in target languages
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

// Voice Profile specific event union (for service-level typing)
export type VoiceProfileEvent =
  | VoiceProfileAnalyzeResult
  | VoiceProfileVerifyResult
  | VoiceProfileCompareResult
  | VoiceProfileErrorEvent;

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED VOICE EVENT TYPE
// All voice-related events (API + Profile) are combined for simpler handling
// ═══════════════════════════════════════════════════════════════════════════

export type VoiceEvent =
  // Voice API events (high-level operations)
  | VoiceAPISuccessEvent
  | VoiceAPIErrorEvent
  | VoiceJobProgressEvent
  // Voice Profile events (internal audio processing)
  | VoiceProfileAnalyzeResult
  | VoiceProfileVerifyResult
  | VoiceProfileCompareResult
  | VoiceProfileErrorEvent;

// Combined event type for all ZMQ events (normalized: Translation, Audio, Voice, Transcription)
export type ZMQEvent = TranslationEvent | AudioEvent | VoiceEvent | TranscriptionEvent;

export interface ZMQClientStats {
  requests_sent: number;
  results_received: number;
  errors_received: number;
  pool_full_rejections: number;
  avg_response_time: number;
  uptime_seconds: number;
  memory_usage_mb: number;
}

export class ZMQTranslationClient extends EventEmitter {
  private pushSocket: zmq.Push | null = null;  // PUSH pour envoyer commandes
  private subSocket: zmq.Subscriber | null = null;  // SUB pour recevoir réponses
  private context: zmq.Context | null = null;
  
  private host: string;
  private pushPort: number;  // Port pour PUSH (commandes)
  private subPort: number;   // Port pour SUB (réponses)
  
  private running: boolean = false;
  private startTime: number = Date.now();
  
  // Statistiques
  private stats: ZMQClientStats = {
    requests_sent: 0,
    results_received: 0,
    errors_received: 0,
    pool_full_rejections: 0,
    avg_response_time: 0,
    uptime_seconds: 0,
    memory_usage_mb: 0
  };
  
  // Cache des requêtes en cours (pour traçabilité)
  private pendingRequests: Map<string, {
    request: TranslationRequest;
    timestamp: number;
  }> = new Map();

  private processedResults = new Set<string>();

  constructor(
    host: string = process.env.ZMQ_TRANSLATOR_HOST || '0.0.0.0',
    pushPort: number = parseInt(process.env.ZMQ_TRANSLATOR_PUSH_PORT || '5555'),  // Port où Gateway PUSH connect (Translator PULL bind)
    subPort: number = parseInt(process.env.ZMQ_TRANSLATOR_SUB_PORT || '5558')     // Port où Gateway SUB connect (Translator PUB bind)
  ) {
    super();
    this.host = host;
    this.pushPort = pushPort;
    this.subPort = subPort;
    
  // logger.info(`[ZMQ-Client] ZMQTranslationClient initialisé: PUSH connect ${host}:${pushPort} (envoi commandes), SUB connect ${host}:${subPort} (réception résultats)`); // Reduced log
  }

  async initialize(): Promise<void> {
    try {
      logger.info(`🔧 [ZMQ-Client] Début initialisation ZMQTranslationClient...`);
      
      // Créer le contexte ZMQ
      this.context = new zmq.Context();
      logger.info(`🔧 [ZMQ-Client] Contexte ZMQ créé`);
      
      // Socket PUSH pour envoyer les commandes de traduction (remplace PUB)
      this.pushSocket = new zmq.Push();
      await this.pushSocket.connect(`tcp://${this.host}:${this.pushPort}`);
  // logger.info(`🔧 [ZMQ-Client] Socket PUSH connecté à ${this.host}:${this.pushPort}`); // Reduced log
      
      // Socket SUB pour recevoir les résultats (se connecte au port 5558 du Translator)
      this.subSocket = new zmq.Subscriber();
      await this.subSocket.connect(`tcp://${this.host}:${this.subPort}`);
      await this.subSocket.subscribe(''); // S'abonner à tous les messages
  // logger.info(`🔧 [ZMQ-Client] Socket SUB connecté à ${this.host}:${this.subPort}`); // Reduced log
      
      // Démarrer l'écoute des résultats
      logger.info(`🔧 [ZMQ-Client] Démarrage de l'écoute des résultats...`);
      this._startResultListener();
      
      // Vérification de connectivité après un délai
      setTimeout(() => {
  // logger.info(`🔍 [ZMQ-Client] Vérification de connectivité...`); // Reduced log
  // ...logs supprimés...
      }, 2000);
      
      this.running = true;
      logger.info('✅ [ZMQ-Client] ZMQTranslationClient initialisé avec succès');
  // logger.info(`🔌 [ZMQ-Client] Socket PUSH connecté: ${this.host}:${this.pushPort} (envoi commandes)`); // Reduced log
  // logger.info(`🔌 [ZMQ-Client] Socket SUB connecté: ${this.host}:${this.subPort} (réception résultats)`); // Reduced log
      
    } catch (error) {
      logger.error(`❌ Erreur initialisation ZMQTranslationClient: ${error}`);
      throw error;
    }
  }

  private async _startResultListener(): Promise<void> {
    if (!this.subSocket) {
      throw new Error('Socket SUB non initialisé');
    }

    logger.info('🎧 [ZMQ-Client] Démarrage écoute des résultats de traduction...');

    // Approche simple avec setInterval
    let heartbeatCount = 0;
    
    const checkForMessages = async () => {
      if (!this.running) {
        logger.info('🛑 [ZMQ-Client] Arrêt de l\'écoute - running=false');
        return;
      }

      try {
        // Log périodique pour vérifier que la boucle fonctionne
        if (heartbeatCount % 50 === 0) { // Toutes les 5 secondes
          logger.info(`💓 [ZMQ-Client] Boucle d'écoute active (heartbeat ${heartbeatCount})`);
          
          // LOG DÉTAILLÉ DES OBJETS PÉRIODIQUEMENT
          logger.info('🔍 [GATEWAY] VÉRIFICATION OBJETS ZMQ DANS BOUCLE ÉCOUTE:');
          // ...logs supprimés...
        }
        heartbeatCount++;

        // Essayer de recevoir un message de manière non-bloquante
        try {
          const messages = await this.subSocket.receive();
          
          if (messages && messages.length > 0) {
            const [message] = messages as Buffer[];
            
            // LOG APRÈS RÉCEPTION
            logger.info('🔍 [GATEWAY] APRÈS RÉCEPTION SUB:');
            logger.info(`   📋 Message reçu (taille): ${message.length} bytes`);
            // logger.info(`   📋 Socket SUB state: ${this.subSocket}`); // Reduced log
            logger.info(`📨 [ZMQ-Client] Message reçu dans la boucle (taille: ${message.length} bytes)`);
            
            await this._handleTranslationResult(message);
          }
        } catch (receiveError) {
          // Pas de message disponible ou erreur de réception
          // C'est normal, on continue
        }

      } catch (error) {
        if (this.running) {
          logger.error(`❌ Erreur réception résultat: ${error}`);
        }
      }
    };

    // Démarrer le polling avec setInterval
    logger.info('🔄 [ZMQ-Client] Démarrage polling avec setInterval...');
    const intervalId = setInterval(checkForMessages, 100); // 100ms entre chaque vérification
    
    // Stocker l'interval ID pour pouvoir l'arrêter plus tard
    (this as any).pollingIntervalId = intervalId;
  }

  private async _handleTranslationResult(message: Buffer): Promise<void> {
    try {
      const messageStr = message.toString('utf-8');
      const event: ZMQEvent = JSON.parse(messageStr);
      
      // Vérifier le type d'événement
      if (event.type === 'translation_completed') {
        const completedEvent = event as TranslationCompletedEvent;
        
        // Utiliser taskId pour la déduplication (permet la retraduction avec un nouveau taskId)
        const resultKey = `${completedEvent.taskId}_${completedEvent.targetLanguage}`;
        
        // Vérifier si ce taskId a déjà été traité (évite les doublons accidentels)
        if (this.processedResults.has(resultKey)) {
          return;
        }
        
        // Marquer ce task comme traité
        this.processedResults.add(resultKey);
        
        // Nettoyer les anciens résultats (garder seulement les 1000 derniers)
        if (this.processedResults.size > 1000) {
          const firstKey = this.processedResults.values().next().value;
          this.processedResults.delete(firstKey);
        }
        
        // VALIDATION COMPLÈTE
        if (!completedEvent.result) {
          logger.error(`❌ [GATEWAY] Message sans résultat`);
          return;
        }
        
        if (!completedEvent.result.messageId) {
          logger.error(`❌ [GATEWAY] Message sans messageId`);
          return;
        }
        
        this.stats.results_received++;
        
        // Émettre l'événement avec toutes les informations
        this.emit('translationCompleted', {
          taskId: completedEvent.taskId,
          result: completedEvent.result,
          targetLanguage: completedEvent.targetLanguage,
          metadata: completedEvent.metadata || {}
        });
        
        // Nettoyer la requête en cours si elle existe
        this.pendingRequests.delete(completedEvent.taskId);
        
      } else if (event.type === 'pong') {
        // Gestion des réponses ping/pong (silencieux en production)
        
      } else if (event.type === 'translation_error') {
        const errorEvent = event as TranslationErrorEvent;
        this.stats.errors_received++;
        
        if (errorEvent.error === 'translation pool full') {
          this.stats.pool_full_rejections++;
        }
        
        logger.error(`❌ [GATEWAY] Erreur traduction: ${errorEvent.error} pour ${errorEvent.messageId}`);
        
        // Émettre l'événement d'erreur avec métadonnées
        this.emit('translationError', {
          taskId: errorEvent.taskId,
          messageId: errorEvent.messageId,
          error: errorEvent.error,
          conversationId: errorEvent.conversationId,
          metadata: errorEvent.metadata || {}
        });
        
        // Nettoyer la requête en cours
        this.pendingRequests.delete(errorEvent.taskId);

      // ═══════════════════════════════════════════════════════════════
      // AUDIO PROCESS EVENTS
      // ═══════════════════════════════════════════════════════════════
      } else if (event.type === 'audio_process_completed') {
        const audioEvent = event as unknown as AudioProcessCompletedEvent;

        logger.info(`🎤 [GATEWAY] Audio process terminé: ${audioEvent.messageId}`);
        logger.info(`   📝 Transcription: ${audioEvent.transcription.text.substring(0, 50)}...`);
        logger.info(`   🌍 Traductions audio: ${audioEvent.translatedAudios.length} versions`);

        // Émettre l'événement de succès audio
        this.emit('audioProcessCompleted', {
          taskId: audioEvent.taskId,
          messageId: audioEvent.messageId,
          attachmentId: audioEvent.attachmentId,
          transcription: audioEvent.transcription,
          translatedAudios: audioEvent.translatedAudios,
          voiceModelUserId: audioEvent.voiceModelUserId,
          voiceModelQuality: audioEvent.voiceModelQuality,
          processingTimeMs: audioEvent.processingTimeMs
        });

        // Nettoyer la requête en cours
        this.pendingRequests.delete(audioEvent.taskId);

      } else if (event.type === 'audio_process_error') {
        const audioError = event as unknown as AudioProcessErrorEvent;

        logger.error(`❌ [GATEWAY] Audio process erreur: ${audioError.messageId} - ${audioError.error}`);

        // Émettre l'événement d'erreur audio
        this.emit('audioProcessError', {
          taskId: audioError.taskId,
          messageId: audioError.messageId,
          attachmentId: audioError.attachmentId,
          error: audioError.error,
          errorCode: audioError.errorCode
        });

        // Nettoyer la requête en cours
        this.pendingRequests.delete(audioError.taskId);

      // ═══════════════════════════════════════════════════════════════
      // VOICE API EVENTS
      // ═══════════════════════════════════════════════════════════════
      } else if (event.type === 'voice_api_success') {
        const voiceEvent = event as unknown as VoiceAPISuccessEvent;

        logger.info(`🎤 [GATEWAY] Voice API success: ${voiceEvent.taskId} (${voiceEvent.processingTimeMs}ms)`);

        // Émettre l'événement de succès Voice API
        this.emit('voiceAPISuccess', {
          taskId: voiceEvent.taskId,
          requestType: voiceEvent.requestType,
          result: voiceEvent.result,
          processingTimeMs: voiceEvent.processingTimeMs,
          timestamp: voiceEvent.timestamp
        });

        // Nettoyer la requête en cours
        this.pendingRequests.delete(voiceEvent.taskId);

      } else if (event.type === 'voice_api_error') {
        const voiceError = event as unknown as VoiceAPIErrorEvent;

        logger.error(`❌ [GATEWAY] Voice API error: ${voiceError.taskId} - ${voiceError.errorCode}: ${voiceError.error}`);

        // Émettre l'événement d'erreur Voice API
        this.emit('voiceAPIError', {
          taskId: voiceError.taskId,
          requestType: voiceError.requestType,
          error: voiceError.error,
          errorCode: voiceError.errorCode,
          timestamp: voiceError.timestamp
        });

        // Nettoyer la requête en cours
        this.pendingRequests.delete(voiceError.taskId);

      } else if (event.type === 'voice_job_progress') {
        const progressEvent = event as unknown as VoiceJobProgressEvent;

        logger.info(`📊 [GATEWAY] Voice job progress: ${progressEvent.jobId} - ${progressEvent.progress}% (${progressEvent.currentStep})`);

        // Émettre l'événement de progression
        this.emit('voiceJobProgress', {
          taskId: progressEvent.taskId,
          jobId: progressEvent.jobId,
          progress: progressEvent.progress,
          currentStep: progressEvent.currentStep,
          timestamp: progressEvent.timestamp
        });

      // ═══════════════════════════════════════════════════════════════
      // VOICE PROFILE EVENTS (Internal audio processing results)
      // ═══════════════════════════════════════════════════════════════
      } else if (event.type === 'voice_profile_analyze_result') {
        const profileEvent = event as unknown as VoiceProfileAnalyzeResult;

        if (profileEvent.success) {
          logger.info(`🎤 [GATEWAY] Voice profile analyzed: ${profileEvent.request_id} - quality: ${profileEvent.quality_score}`);
        } else {
          logger.error(`❌ [GATEWAY] Voice profile analyze failed: ${profileEvent.request_id} - ${profileEvent.error}`);
        }

        this.emit('voiceProfileAnalyzeResult', profileEvent);
        this.pendingRequests.delete(profileEvent.request_id);

      } else if (event.type === 'voice_profile_verify_result') {
        const verifyEvent = event as unknown as VoiceProfileVerifyResult;

        if (verifyEvent.success) {
          logger.info(`🎤 [GATEWAY] Voice profile verified: ${verifyEvent.request_id} - match: ${verifyEvent.is_match}, score: ${verifyEvent.similarity_score}`);
        } else {
          logger.error(`❌ [GATEWAY] Voice profile verify failed: ${verifyEvent.request_id} - ${verifyEvent.error}`);
        }

        this.emit('voiceProfileVerifyResult', verifyEvent);
        this.pendingRequests.delete(verifyEvent.request_id);

      } else if (event.type === 'voice_profile_compare_result') {
        const compareEvent = event as unknown as VoiceProfileCompareResult;

        if (compareEvent.success) {
          logger.info(`🎤 [GATEWAY] Voice profiles compared: ${compareEvent.request_id} - match: ${compareEvent.is_match}, score: ${compareEvent.similarity_score}`);
        } else {
          logger.error(`❌ [GATEWAY] Voice profile compare failed: ${compareEvent.request_id} - ${compareEvent.error}`);
        }

        this.emit('voiceProfileCompareResult', compareEvent);
        this.pendingRequests.delete(compareEvent.request_id);

      } else if (event.type === 'voice_profile_error') {
        const profileError = event as unknown as VoiceProfileErrorEvent;

        logger.error(`❌ [GATEWAY] Voice profile error: ${profileError.request_id} - ${profileError.error}`);

        this.emit('voiceProfileError', profileError);
        this.pendingRequests.delete(profileError.request_id);

      // ═══════════════════════════════════════════════════════════════
      // TRANSCRIPTION ONLY EVENTS
      // ═══════════════════════════════════════════════════════════════
      } else if (event.type === 'transcription_completed') {
        const transcriptionEvent = event as unknown as TranscriptionCompletedEvent;

        logger.info(`📝 [GATEWAY] Transcription terminée: ${transcriptionEvent.messageId}`);
        logger.info(`   📝 Texte: ${transcriptionEvent.transcription.text.substring(0, 50)}...`);
        logger.info(`   🌍 Langue: ${transcriptionEvent.transcription.language}`);

        // Émettre l'événement de succès transcription
        this.emit('transcriptionCompleted', {
          taskId: transcriptionEvent.taskId,
          messageId: transcriptionEvent.messageId,
          attachmentId: transcriptionEvent.attachmentId,
          transcription: transcriptionEvent.transcription,
          processingTimeMs: transcriptionEvent.processingTimeMs
        });

        // Nettoyer la requête en cours
        this.pendingRequests.delete(transcriptionEvent.taskId);

      } else if (event.type === 'transcription_error') {
        const transcriptionError = event as unknown as TranscriptionErrorEvent;

        logger.error(`❌ [GATEWAY] Transcription error: ${transcriptionError.messageId} - ${transcriptionError.error}`);

        // Émettre l'événement d'erreur transcription
        this.emit('transcriptionError', {
          taskId: transcriptionError.taskId,
          messageId: transcriptionError.messageId,
          attachmentId: transcriptionError.attachmentId,
          error: transcriptionError.error,
          errorCode: transcriptionError.errorCode
        });

        // Nettoyer la requête en cours
        this.pendingRequests.delete(transcriptionError.taskId);
      }

    } catch (error) {
      logger.error(`❌ [GATEWAY] Erreur traitement message ZMQ: ${error}`);
    }
  }

  async sendTranslationRequest(request: TranslationRequest): Promise<string> {
    if (!this.pushSocket) {
      logger.error('❌ [GATEWAY] Socket PUSH non initialisé');
      throw new Error('Socket PUSH non initialisé');
    }

    // Test de connectivité avec un ping
    try {
      const pingMessage = { type: 'ping', timestamp: Date.now() };
      await this.pushSocket.send(JSON.stringify(pingMessage));
    } catch (error) {
      logger.error(`❌ [GATEWAY] Erreur lors du ping via port ${this.pushPort}: ${error}`);
    }

    try {
      const taskId = randomUUID();
      
      // Préparer le message de commande
      const requestMessage = {
        taskId: taskId,
        messageId: request.messageId,
        text: request.text,
        sourceLanguage: request.sourceLanguage,
        targetLanguages: request.targetLanguages,
        conversationId: request.conversationId,
        modelType: request.modelType || 'basic',
        timestamp: Date.now()
      };
      
      logger.info('🔍 [GATEWAY] PRÉPARATION ENVOI PUSH:');
      logger.info(`   📋 taskId: ${taskId}`);
      logger.info(`   📋 messageId: ${request.messageId}`);
      logger.info(`   📋 text: "${request.text}"`);
      logger.info(`   📋 sourceLanguage: ${request.sourceLanguage}`);
      logger.info(`   📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
      logger.info(`   📋 conversationId: ${request.conversationId}`);
      logger.info(`   🎨 modelType: ${requestMessage.modelType}`);
      logger.info(`   📋 message size: ${JSON.stringify(requestMessage).length} chars`);
      
      // Envoyer la commande via PUSH (garantit distribution équitable)
      logger.info('🔍 [GATEWAY] ENVOI VIA PUSH SOCKET:');
      logger.info(`   📋 Socket state avant envoi: ${this.pushSocket}`);
      
      await this.pushSocket.send(JSON.stringify(requestMessage));
      
      logger.info('🔍 [GATEWAY] VÉRIFICATION APRÈS ENVOI:');
      logger.info(`   📋 Socket state après envoi: ${this.pushSocket}`);
      logger.info(`   📋 Envoi réussi pour taskId: ${taskId}`);
      
      // Mettre à jour les statistiques
      this.stats.requests_sent++;
      
      // Stocker la requête en cours pour traçabilité
      this.pendingRequests.set(taskId, {
        request: request,
        timestamp: Date.now()
      });
      
      logger.info(`📤 [ZMQ-Client] Commande PUSH envoyée: taskId=${taskId}, conversationId=${request.conversationId}, langues=${request.targetLanguages.length}, message=${JSON.stringify(requestMessage)}`);
      
      return taskId;
      
    } catch (error) {
      logger.error(`❌ Erreur envoi commande PUSH: ${error}`);
      throw error;
    }
  }

  /**
   * Envoie une requête de processing audio au service translator.
   * Le translator va:
   * 1. Transcrire l'audio (ou utiliser la transcription mobile)
   * 2. Traduire vers les langues cibles
   * 3. Cloner la voix de l'émetteur
   * 4. Générer des versions audio traduites
   */
  /**
   * Charge le fichier audio en binaire si:
   * - Le fichier existe localement
   * - La taille est inférieure au seuil (5MB par défaut)
   *
   * @returns { buffer: Buffer, mimeType: string, size: number } ou null si trop gros ou inaccessible
   */
  private async loadAudioAsBinary(audioPath?: string): Promise<{ buffer: Buffer; mimeType: string; size: number } | null> {
    if (!audioPath) return null;

    try {
      // Vérifier si le fichier existe
      if (!existsSync(audioPath)) {
        logger.info(`[ZMQ-Client] Fichier audio non accessible localement: ${audioPath}`);
        return null;
      }

      // Vérifier la taille
      const stats = statSync(audioPath);
      if (stats.size > AUDIO_BASE64_SIZE_THRESHOLD) {
        logger.info(`[ZMQ-Client] Fichier trop gros pour transfert ZMQ (${(stats.size / 1024 / 1024).toFixed(2)}MB > ${AUDIO_BASE64_SIZE_THRESHOLD / 1024 / 1024}MB), Translator téléchargera via URL`);
        return null;
      }

      // Lire le buffer brut (pas d'encodage base64!)
      const buffer = await fs.readFile(audioPath);

      // Déterminer le mime type
      const ext = path.extname(audioPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.webm': 'audio/webm',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac'
      };
      const mimeType = mimeTypes[ext] || 'audio/wav';

      logger.info(`[ZMQ-Client] Audio chargé en binaire: ${(stats.size / 1024).toFixed(1)}KB (${mimeType})`);

      return { buffer, mimeType, size: stats.size };
    } catch (error) {
      logger.warning(`[ZMQ-Client] Erreur lecture fichier audio: ${error}`);
      return null;
    }
  }

  /**
   * Envoie un message multipart ZMQ avec des frames binaires
   * Frame 0: JSON metadata
   * Frame 1+: Données binaires (audio, embedding, etc.)
   */
  private async sendMultipart(jsonPayload: object, binaryFrames: Buffer[]): Promise<void> {
    if (!this.pushSocket) {
      throw new Error('Socket PUSH non initialisé');
    }

    // Préparer les frames: JSON en premier, puis les binaires
    const frames: Buffer[] = [
      Buffer.from(JSON.stringify(jsonPayload), 'utf-8'),
      ...binaryFrames
    ];

    // Envoyer en multipart
    await this.pushSocket.send(frames);

    logger.info(`[ZMQ-Client] Multipart envoyé: ${frames.length} frames, total ${frames.reduce((sum, f) => sum + f.length, 0)} bytes`);
  }

  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>): Promise<string> {
    if (!this.pushSocket) {
      logger.error('❌ [GATEWAY] Socket PUSH non initialisé pour audio process');
      throw new Error('Socket PUSH non initialisé');
    }

    // Valider qu'on a une source audio
    if (!request.audioPath) {
      throw new Error('audioPath must be provided');
    }

    try {
      const taskId = randomUUID();

      // Charger l'audio en binaire (OBLIGATOIRE - pas de fallback URL)
      const audioData = await this.loadAudioAsBinary(request.audioPath);
      if (!audioData) {
        throw new Error(`Impossible de charger le fichier audio: ${request.audioPath}`);
      }

      // Préparer les frames binaires
      const binaryFrames: Buffer[] = [audioData.buffer];
      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,  // L'audio est dans le frame 1 (0-indexed après le JSON)
        audioMimeType: audioData.mimeType,
        audioSize: audioData.size
      };

      // Préparer le message de commande audio (SANS chemin ni URL!)
      const requestMessage: AudioProcessRequest = {
        type: 'audio_process',
        messageId: request.messageId,
        attachmentId: request.attachmentId,
        conversationId: request.conversationId,
        senderId: request.senderId,
        // Pas de audioPath, audioUrl, audioBase64 - uniquement binaryFrames
        audioUrl: '',  // Champ requis par interface mais non utilisé
        audioMimeType: audioData.mimeType,
        binaryFrames: binaryFrameInfo,
        audioDurationMs: request.audioDurationMs,
        mobileTranscription: request.mobileTranscription,
        targetLanguages: request.targetLanguages,
        generateVoiceClone: request.generateVoiceClone,
        modelType: request.modelType,
        // Champs voice profile (si fournis)
        originalSenderId: request.originalSenderId,
        existingVoiceProfile: request.existingVoiceProfile,
        useOriginalVoice: request.useOriginalVoice,
        voiceCloneParams: request.voiceCloneParams
      };

      const transferMode = `multipart binaire (${(audioData.size / 1024).toFixed(1)}KB, ${audioData.mimeType})`;

      logger.info('🎤 [GATEWAY] ENVOI AUDIO PROCESS:');
      logger.info(`   📋 taskId: ${taskId}`);
      logger.info(`   📋 messageId: ${request.messageId}`);
      logger.info(`   📋 attachmentId: ${request.attachmentId}`);
      logger.info(`   📋 senderId: ${request.senderId}`);
      logger.info(`   📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
      logger.info(`   📋 audioDurationMs: ${request.audioDurationMs}`);
      logger.info(`   📋 mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);
      logger.info(`   📋 transferMode: ${transferMode}`);

      // Envoyer via PUSH en multipart (TOUJOURS)
      await this.sendMultipart(requestMessage, binaryFrames);

      // Mettre à jour les statistiques
      this.stats.requests_sent++;

      // Stocker la requête en cours pour traçabilité
      this.pendingRequests.set(taskId, {
        request: requestMessage as any,
        timestamp: Date.now()
      });

      logger.info(`📤 [ZMQ-Client] Audio process PUSH envoyée: taskId=${taskId}, messageId=${request.messageId}`);

      return taskId;

    } catch (error) {
      logger.error(`❌ Erreur envoi audio process: ${error}`);
      throw error;
    }
  }

  /**
   * Envoie une requête de transcription seule au service translator.
   * Retourne uniquement la transcription sans traduction ni TTS.
   *
   * Envoie les données audio en multipart binaire via ZMQ.
   * Supporte deux modes:
   * - Mode fichier: audioPath fourni → charge le fichier
   * - Mode base64: audioData fourni → décode en Buffer
   */
  async sendTranscriptionOnlyRequest(
    request: Omit<TranscriptionOnlyRequest, 'type' | 'taskId'>
  ): Promise<string> {
    if (!this.pushSocket) {
      logger.error('❌ [GATEWAY] Socket PUSH non initialisé pour transcription only');
      throw new Error('Socket PUSH non initialisé');
    }

    // Valider qu'on a une source audio (fichier OU base64)
    if (!request.audioPath && !request.audioData) {
      throw new Error('Either audioPath or audioData (base64) must be provided');
    }

    try {
      const taskId = randomUUID();

      let audioBuffer: Buffer;
      let mimeType: string;
      let audioSize: number;

      if (request.audioPath) {
        // Mode fichier: charger depuis le disque
        const audioData = await this.loadAudioAsBinary(request.audioPath);
        if (!audioData) {
          throw new Error(`Impossible de charger le fichier audio: ${request.audioPath}`);
        }
        audioBuffer = audioData.buffer;
        mimeType = audioData.mimeType;
        audioSize = audioData.size;
      } else {
        // Mode base64: décoder en Buffer (pas de fichier temporaire)
        audioBuffer = Buffer.from(request.audioData!, 'base64');
        audioSize = audioBuffer.length;

        // Déterminer le mime type depuis audioFormat
        const formatMimeTypes: Record<string, string> = {
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg',
          'm4a': 'audio/mp4',
          'ogg': 'audio/ogg',
          'webm': 'audio/webm',
          'aac': 'audio/aac',
          'flac': 'audio/flac'
        };
        mimeType = formatMimeTypes[request.audioFormat || 'wav'] || 'audio/wav';
      }

      // Préparer les frames binaires
      const binaryFrames: Buffer[] = [audioBuffer];
      const binaryFrameInfo: BinaryFrameInfo = {
        audio: 1,
        audioMimeType: mimeType,
        audioSize: audioSize
      };

      // Préparer le message de commande transcription (sans chemin ni URL)
      const requestMessage: TranscriptionOnlyRequest = {
        type: 'transcription_only',
        taskId,
        messageId: request.messageId,
        attachmentId: request.attachmentId,
        audioFormat: mimeType.replace('audio/', ''),
        mobileTranscription: request.mobileTranscription,
        binaryFrames: binaryFrameInfo
      };

      const sourceMode = request.audioPath ? 'fichier' : 'base64';
      const transferMode = `multipart binaire (${(audioSize / 1024).toFixed(1)}KB, ${mimeType}, source: ${sourceMode})`;

      logger.info('📝 [GATEWAY] ENVOI TRANSCRIPTION ONLY:');
      logger.info(`   📋 taskId: ${taskId}`);
      logger.info(`   📋 messageId: ${request.messageId}`);
      logger.info(`   📋 attachmentId: ${request.attachmentId || 'N/A (direct audio)'}`);
      logger.info(`   📋 transferMode: ${transferMode}`);
      logger.info(`   📋 mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);

      // Envoyer via PUSH en multipart
      await this.sendMultipart(requestMessage, binaryFrames);

      // Mettre à jour les statistiques
      this.stats.requests_sent++;

      // Stocker la requête en cours pour traçabilité
      this.pendingRequests.set(taskId, {
        request: requestMessage as any,
        timestamp: Date.now()
      });

      logger.info(`📤 [ZMQ-Client] Transcription only PUSH envoyée: taskId=${taskId}, messageId=${request.messageId}`);

      return taskId;

    } catch (error) {
      logger.error(`❌ Erreur envoi transcription only: ${error}`);
      throw error;
    }
  }

  async translateText(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    messageId: string,
    conversationId: string,
    modelType: string = 'basic'
  ): Promise<string> {
    const request: TranslationRequest = {
      messageId: messageId,
      text: text,
      sourceLanguage: sourceLanguage,
      targetLanguages: [targetLanguage],
      conversationId: conversationId,
      modelType: modelType
    };
    
    return await this.sendTranslationRequest(request);
  }

  async translateToMultipleLanguages(
    text: string,
    sourceLanguage: string,
    targetLanguages: string[],
    messageId: string,
    conversationId: string,
    modelType: string = 'basic'
  ): Promise<string> {
    const request: TranslationRequest = {
      messageId: messageId,
      text: text,
      sourceLanguage: sourceLanguage,
      targetLanguages: targetLanguages,
      conversationId: conversationId,
      modelType: modelType
    };
    
    return await this.sendTranslationRequest(request);
  }

  /**
   * Envoie une requête Voice API au service translator.
   * Supporte toutes les opérations Voice API:
   * - voice_translate / voice_translate_async
   * - voice_analyze / voice_compare
   * - voice_profile_* (CRUD)
   * - voice_feedback / voice_history / voice_stats
   * - voice_admin_metrics / voice_health / voice_languages
   */
  async sendVoiceAPIRequest(request: VoiceAPIRequest): Promise<string> {
    if (!this.pushSocket) {
      logger.error('❌ [GATEWAY] Socket PUSH non initialisé pour Voice API');
      throw new Error('Socket PUSH non initialisé');
    }

    try {
      logger.info('🎤 [GATEWAY] ENVOI VOICE API REQUEST:');
      logger.info(`   📋 type: ${request.type}`);
      logger.info(`   📋 taskId: ${request.taskId}`);
      logger.info(`   📋 userId: ${request.userId || 'N/A'}`);

      // Envoyer via PUSH
      await this.pushSocket.send(JSON.stringify(request));

      // Mettre à jour les statistiques
      this.stats.requests_sent++;

      // Stocker la requête en cours pour traçabilité
      this.pendingRequests.set(request.taskId, {
        request: request as any,
        timestamp: Date.now()
      });

      logger.info(`📤 [ZMQ-Client] Voice API request envoyée: taskId=${request.taskId}, type=${request.type}`);

      return request.taskId;

    } catch (error) {
      logger.error(`❌ Erreur envoi Voice API request: ${error}`);
      throw error;
    }
  }

  /**
   * Send a voice profile request to Translator for audio processing.
   *
   * Supported types:
   * - voice_profile_analyze: Analyze audio for profile creation/update
   * - voice_profile_verify: Verify audio matches existing profile
   * - voice_profile_compare: Compare two fingerprints
   */
  async sendVoiceProfileRequest(request: VoiceProfileRequest): Promise<string> {
    if (!this.pushSocket) {
      logger.error('❌ [GATEWAY] Socket PUSH non initialisé pour Voice Profile');
      throw new Error('Socket PUSH non initialisé');
    }

    try {
      logger.info('🎤 [GATEWAY] ENVOI VOICE PROFILE REQUEST:');
      logger.info(`   📋 type: ${request.type}`);
      logger.info(`   📋 request_id: ${request.request_id}`);

      // Envoyer via PUSH
      await this.pushSocket.send(JSON.stringify(request));

      // Mettre à jour les statistiques
      this.stats.requests_sent++;

      // Stocker la requête en cours pour traçabilité
      this.pendingRequests.set(request.request_id, {
        request: request as any,
        timestamp: Date.now()
      });

      logger.info(`📤 [ZMQ-Client] Voice Profile request envoyée: request_id=${request.request_id}, type=${request.type}`);

      return request.request_id;

    } catch (error) {
      logger.error(`❌ Erreur envoi Voice Profile request: ${error}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.running || !this.pushSocket || !this.subSocket) {
        return false;
      }
      
      // Test simple d'envoi d'un message de ping
      const pingMessage = {
        type: 'ping',
        timestamp: Date.now()
      };
      
      await this.pushSocket.send(JSON.stringify(pingMessage));
      logger.info(`🏓 [GATEWAY] Health check ping envoyé via port ${this.pushPort}`);
      return true
      
    } catch (error) {
      logger.error(`❌ Health check échoué: ${error}`);
      return false;
    }
  }

  getStats(): ZMQClientStats {
    const uptime = (Date.now() - this.startTime) / 1000;
    
    return {
      ...this.stats,
      uptime_seconds: uptime,
      memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024
    };
  }

  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  async close(): Promise<void> {
    logger.info('🛑 Arrêt ZMQTranslationClient...');
    
    this.running = false;
    
    try {
      if (this.pushSocket) {
        await this.pushSocket.close();
        this.pushSocket = null;
      }
      
      if (this.subSocket) {
        await this.subSocket.close();
        this.subSocket = null;
      }
      
      if (this.context) {
        this.context = null;
      }
      
      // Nettoyer les requêtes en cours
      this.pendingRequests.clear();
      
      // Arrêter le polling
      if ((this as any).pollingIntervalId) {
        clearInterval((this as any).pollingIntervalId);
        (this as any).pollingIntervalId = null;
      }

      logger.info('✅ ZMQTranslationClient arrêté');
      
    } catch (error) {
      logger.error(`❌ Erreur arrêt ZMQTranslationClient: ${error}`);
    }
  }

  // Méthode de test pour vérifier la réception
  async testReception(): Promise<void> {
    logger.info('🧪 [ZMQ-Client] Test de réception des messages...');
    
    // Envoyer un ping et attendre la réponse
    try {
      const pingMessage = { type: 'ping', timestamp: Date.now() };
      await this.pushSocket.send(JSON.stringify(pingMessage));
      logger.info(`🧪 [ZMQ-Client] Ping envoyé pour test via port ${this.pushPort}`);
      
      // Attendre un peu pour voir si on reçoit quelque chose
      setTimeout(() => {
        logger.info(`🧪 [ZMQ-Client] Test terminé. Messages reçus: ${this.stats.results_received}`);
        logger.info(`🧪 [ZMQ-Client] Heartbeats: ${this.stats.uptime_seconds}s`);
        logger.info(`🧪 [ZMQ-Client] Socket SUB état: ${this.subSocket ? 'Connecté' : 'Non connecté'}`);
        logger.info(`🧪 [ZMQ-Client] Running: ${this.running}`);
      }, 3000);
      
    } catch (error) {
      logger.error(`❌ [ZMQ-Client] Erreur test réception: ${error}`);
    }
  }
}

// Configuration du logging
const logger = {
  info: (message: string) => console.log(`[GATEWAY] ${message}`),
  error: (message: string) => console.error(`[GATEWAY] ❌ ${message}`),
  warning: (message: string) => console.warn(`[GATEWAY] ⚠️ ${message}`)
};