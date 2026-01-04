/**
 * Client ZMQ haute performance pour communication avec le service de traduction
 * Architecture: PUB/SUB + REQ/REP avec pool de connexions et gestion asynchrone
 */

import { EventEmitter } from 'events';
import * as zmq from 'zeromq';
import { randomUUID } from 'crypto';

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
}

export type TranslationEvent = TranslationCompletedEvent | TranslationErrorEvent | PongEvent;

// ═══════════════════════════════════════════════════════════════
// AUDIO PROCESSING TYPES
// ═══════════════════════════════════════════════════════════════

export interface AudioProcessRequest {
  type: 'audio_process';
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  audioUrl: string;
  audioPath: string;
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

export type VoiceAPIEvent = VoiceAPISuccessEvent | VoiceAPIErrorEvent | VoiceJobProgressEvent;

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

export type VoiceProfileEvent = VoiceProfileAnalyzeResult | VoiceProfileVerifyResult | VoiceProfileCompareResult | VoiceProfileErrorEvent;

// Combined event type for all ZMQ events
export type ZMQEvent = TranslationEvent | AudioEvent | VoiceAPIEvent | VoiceProfileEvent;

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
  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>): Promise<string> {
    if (!this.pushSocket) {
      logger.error('❌ [GATEWAY] Socket PUSH non initialisé pour audio process');
      throw new Error('Socket PUSH non initialisé');
    }

    try {
      const taskId = randomUUID();

      // Préparer le message de commande audio
      const requestMessage: AudioProcessRequest = {
        type: 'audio_process',
        ...request
      };

      logger.info('🎤 [GATEWAY] ENVOI AUDIO PROCESS:');
      logger.info(`   📋 taskId: ${taskId}`);
      logger.info(`   📋 messageId: ${request.messageId}`);
      logger.info(`   📋 attachmentId: ${request.attachmentId}`);
      logger.info(`   📋 senderId: ${request.senderId}`);
      logger.info(`   📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
      logger.info(`   📋 audioDurationMs: ${request.audioDurationMs}`);
      logger.info(`   📋 mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);

      // Envoyer via PUSH
      await this.pushSocket.send(JSON.stringify(requestMessage));

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