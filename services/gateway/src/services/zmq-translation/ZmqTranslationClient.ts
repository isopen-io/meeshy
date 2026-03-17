/**
 * Client ZMQ haute performance pour communication avec le service de traduction
 * Architecture: PUB/SUB + REQ/REP avec gestion asynchrone
 *
 * Architecture refactorisée:
 * - ZmqConnectionManager: Gestion des sockets (PUSH/SUB)
 * - ZmqMessageHandler: Traitement des messages reçus
 * - ZmqRequestSender: Envoi des requêtes
 * - ZmqTranslationClient: Orchestrateur principal (API publique)
 */

import { EventEmitter } from 'events';
import { ZmqConnectionManager, type ConnectionManagerConfig } from './ZmqConnectionManager';
import { ZmqMessageHandler } from './ZmqMessageHandler';
import { ZmqRequestSender } from './ZmqRequestSender';

// Re-export tous les types publics
export * from './types';

// Import types
import type {
  TranslationRequest,
  AudioProcessRequest,
  TranscriptionOnlyRequest,
  VoiceAPIRequest,
  VoiceProfileRequest
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
// Logger dédié pour ZmqTranslationClient
const logger = enhancedLogger.child({ module: 'ZmqTranslationClient' });


export interface TranslateTextObjectParams {
  postId: string;
  textObjectIndex: number;
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
}

export interface ZMQClientStats {
  requests_sent: number;
  results_received: number;
  errors_received: number;
  pool_full_rejections: number;
  avg_response_time: number;
  uptime_seconds: number;
  memory_usage_mb: number;
}

// Timeout for ZMQ translation requests (30 seconds)
const ZMQ_REQUEST_TIMEOUT_MS = 30_000;
// Maximum number of retries before emitting an error
const ZMQ_MAX_RETRIES = 1;

export class ZmqTranslationClient extends EventEmitter {
  private connectionManager: ZmqConnectionManager;
  private messageHandler: ZmqMessageHandler;
  private requestSender: ZmqRequestSender;

  private host: string;
  private pushPort: number;
  private subPort: number;

  private running: boolean = false;
  private startTime: number = Date.now();

  // Polling interval ID (pour compatibilité Jest)
  private pollingIntervalId: NodeJS.Timeout | null = null;

  // Retry counts per taskId (cleaned up on completion or final timeout)
  private retryCount: Map<string, number> = new Map();

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

  constructor(
    host: string = process.env.ZMQ_TRANSLATOR_HOST || '0.0.0.0',
    pushPort: number = parseInt(process.env.ZMQ_TRANSLATOR_PUSH_PORT || '5555'),
    subPort: number = parseInt(process.env.ZMQ_TRANSLATOR_SUB_PORT || '5558')
  ) {
    super();
    this.host = host;
    this.pushPort = pushPort;
    this.subPort = subPort;

    // Créer les composants
    const config: ConnectionManagerConfig = {
      host: this.host,
      pushPort: this.pushPort,
      subPort: this.subPort
    };

    this.connectionManager = new ZmqConnectionManager(config);
    this.messageHandler = new ZmqMessageHandler();
    this.requestSender = new ZmqRequestSender(this.connectionManager);

    // Setup event forwarding from messageHandler to this client
    this.setupEventForwarding();
  }

  /**
   * Registers a 30-second timeout for a pending ZMQ request.
   * On first timeout: retries the send once.
   * On second timeout: emits a synthetic error event and cleans up.
   *
   * @param taskId - Correlation ID for the request
   * @param errorEvent - The error event payload to emit if all retries fail
   * @param errorEventName - The EventEmitter event name to emit on final failure
   * @param resend - Async function that re-sends the request and returns the new taskId
   */
  private _registerRequestTimeout(
    taskId: string,
    errorEventName: string,
    errorEvent: Record<string, unknown>,
    resend: () => Promise<string>
  ): void {
    this.requestSender.registerTimeout(taskId, ZMQ_REQUEST_TIMEOUT_MS, async () => {
      const retries = this.retryCount.get(taskId) ?? 0;
      this.retryCount.delete(taskId);

      if (retries < ZMQ_MAX_RETRIES) {
        logger.warn(`⏱️ ZMQ timeout for taskId=${taskId} (attempt ${retries + 1}/${ZMQ_MAX_RETRIES + 1}), retrying...`);
        try {
          const newTaskId = await resend();
          this.retryCount.set(newTaskId, retries + 1);
          this._registerRequestTimeout(newTaskId, errorEventName, { ...errorEvent, taskId: newTaskId }, resend);
        } catch (err) {
          logger.error(`❌ ZMQ retry failed for taskId=${taskId}: ${err}`);
          this.stats.errors_received++;
          this.emit(errorEventName, { ...errorEvent, taskId });
        }
      } else {
        logger.error(`❌ ZMQ timeout after ${ZMQ_MAX_RETRIES + 1} attempt(s) for taskId=${taskId}, giving up`);
        this.stats.errors_received++;
        this.emit(errorEventName, { ...errorEvent, taskId });
      }
    });
  }

  /**
   * Configure le forwarding des événements du handler vers le client
   */
  private setupEventForwarding(): void {
    // Translation events
    this.messageHandler.on('translationCompleted', (event) => {
      this.stats.results_received++;
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('translationCompleted', event);
    });

    this.messageHandler.on('translationError', (event) => {
      this.stats.errors_received++;
      if (event.error === 'translation pool full') {
        this.stats.pool_full_rejections++;
      }
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('translationError', event);
    });

    // Audio events
    this.messageHandler.on('audioProcessCompleted', (event) => {
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('audioProcessCompleted', event);
    });

    this.messageHandler.on('audioProcessError', (event) => {
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('audioProcessError', event);
    });

    // Voice API events
    this.messageHandler.on('voiceAPISuccess', (event) => {
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('voiceAPISuccess', event);
    });

    this.messageHandler.on('voiceAPIError', (event) => {
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('voiceAPIError', event);
    });

    this.messageHandler.on('voiceJobProgress', (event) => {
      this.emit('voiceJobProgress', event);
    });

    // Voice Profile events
    this.messageHandler.on('voiceProfileAnalyzeResult', (event) => {
      this.retryCount.delete(event.request_id);
      this.requestSender.removePendingRequest(event.request_id);
      this.emit('voiceProfileAnalyzeResult', event);
    });

    this.messageHandler.on('voiceProfileVerifyResult', (event) => {
      this.retryCount.delete(event.request_id);
      this.requestSender.removePendingRequest(event.request_id);
      this.emit('voiceProfileVerifyResult', event);
    });

    this.messageHandler.on('voiceProfileCompareResult', (event) => {
      this.retryCount.delete(event.request_id);
      this.requestSender.removePendingRequest(event.request_id);
      this.emit('voiceProfileCompareResult', event);
    });

    this.messageHandler.on('voiceProfileError', (event) => {
      this.retryCount.delete(event.request_id);
      this.requestSender.removePendingRequest(event.request_id);
      this.emit('voiceProfileError', event);
    });

    // Transcription events
    this.messageHandler.on('transcriptionCompleted', (event) => {
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('transcriptionCompleted', event);
    });

    this.messageHandler.on('transcriptionError', (event) => {
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('transcriptionError', event);
    });

    // Transcription ready (avant traduction)
    this.messageHandler.on('transcriptionReady', (event) => {
      this.emit('transcriptionReady', event);
    });

    // Translation ready events (progressive)
    this.messageHandler.on('translationReady', (event) => {
      this.emit('translationReady', event);
    });

    this.messageHandler.on('audioTranslationReady', (event) => {
      this.emit('audioTranslationReady', event);
    });

    this.messageHandler.on('audioTranslationsProgressive', (event) => {
      this.emit('audioTranslationsProgressive', event);
    });

    this.messageHandler.on('audioTranslationsCompleted', (event) => {
      this.emit('audioTranslationsCompleted', event);
    });

    // Voice Translation Job events
    this.messageHandler.on('voiceTranslationCompleted', (event) => {
      this.emit('voiceTranslationCompleted', event);
    });

    this.messageHandler.on('voiceTranslationFailed', (event) => {
      this.emit('voiceTranslationFailed', event);
    });

    // Story text object translation events
    this.messageHandler.on('storyTextObjectTranslationCompleted', (event) => {
      this.emit('storyTextObjectTranslationCompleted', event);
    });
  }

  /**
   * Initialise le client ZMQ
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`🔧 Début initialisation ZmqTranslationClient...`);

      // Initialiser le connection manager
      await this.connectionManager.initialize();

      // Démarrer l'écoute des résultats
      logger.info(`🔧 Démarrage de l'écoute des résultats...`);
      this._startResultListener();

      // Vérification de connectivité après un délai
      setTimeout(() => {
        // Log de vérification (optionnel)
      }, 2000);

      this.running = true;
      logger.info('✅ ZmqTranslationClient initialisé avec succès');
      logger.info(`🔌 Socket PUSH connecté: ${this.host}:${this.pushPort} (envoi commandes)`);
      logger.info(`🔌 Socket SUB connecté: ${this.host}:${this.subPort} (réception résultats)`);

    } catch (error) {
      logger.error(`❌ Erreur initialisation ZmqTranslationClient: ${error}`);
      throw error;
    }
  }

  /**
   * Démarre l'écoute des résultats avec polling (compatible Jest)
   * COPIÉ DU FICHIER MONOLITHIQUE pour garantir compatibilité avec jest.useFakeTimers()
   */
  private async _startResultListener(): Promise<void> {
    logger.info('🎧 Démarrage écoute des résultats de traduction...');

    // Approche simple avec setInterval (compatible Jest)
    let heartbeatCount = 0;

    const checkForMessages = async () => {
      if (!this.running) {
        logger.info('🛑 Arrêt de l\'écoute - running=false');
        return;
      }

      try {
        heartbeatCount++;

        // Essayer de recevoir un message de manière non-bloquante
        try {
          const message = await this.connectionManager.receive();

          if (message) {
            // Passer au message handler
            await this.messageHandler.handleMessage(message);
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
    logger.info('🔄 Démarrage polling avec setInterval...');
    this.pollingIntervalId = setInterval(checkForMessages, 100); // 100ms entre chaque vérification
  }

  /**
   * Envoie une requête de traduction
   */
  async sendTranslationRequest(request: TranslationRequest): Promise<string> {
    const taskId = await this.requestSender.sendTranslationRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'translationError',
      { taskId, messageId: request.messageId, error: 'ZMQ timeout: no response from translator', conversationId: request.conversationId },
      async () => {
        const newTaskId = await this.requestSender.sendTranslationRequest(request);
        this.stats.requests_sent++;
        return newTaskId;
      }
    );
    return taskId;
  }

  /**
   * Envoie une requête de processing audio
   */
  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>): Promise<string> {
    const taskId = await this.requestSender.sendAudioProcessRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'audioProcessError',
      { taskId, messageId: request.messageId, attachmentId: request.attachmentId, error: 'ZMQ timeout: no response from translator' },
      async () => {
        const newTaskId = await this.requestSender.sendAudioProcessRequest(request);
        this.stats.requests_sent++;
        return newTaskId;
      }
    );
    return taskId;
  }

  /**
   * Envoie une requête de transcription seule
   */
  async sendTranscriptionOnlyRequest(
    request: Omit<TranscriptionOnlyRequest, 'type' | 'taskId'>
  ): Promise<string> {
    const taskId = await this.requestSender.sendTranscriptionOnlyRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'transcriptionError',
      { taskId, messageId: request.messageId, attachmentId: request.attachmentId, error: 'ZMQ timeout: no response from translator' },
      async () => {
        const newTaskId = await this.requestSender.sendTranscriptionOnlyRequest(request);
        this.stats.requests_sent++;
        return newTaskId;
      }
    );
    return taskId;
  }

  /**
   * Envoie une requête Voice API
   */
  async sendVoiceAPIRequest(request: VoiceAPIRequest): Promise<string> {
    const taskId = await this.requestSender.sendVoiceAPIRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'voiceAPIError',
      { taskId, requestType: request.type, error: 'ZMQ timeout: no response from translator', errorCode: 'TIMEOUT' },
      async () => {
        const newTaskId = await this.requestSender.sendVoiceAPIRequest(request);
        this.stats.requests_sent++;
        return newTaskId;
      }
    );
    return taskId;
  }

  /**
   * Envoie une requête Voice Profile
   */
  async sendVoiceProfileRequest(request: VoiceProfileRequest): Promise<string> {
    const taskId = await this.requestSender.sendVoiceProfileRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'voiceProfileError',
      { request_id: taskId, error: 'ZMQ timeout: no response from translator', success: false },
      async () => {
        const newTaskId = await this.requestSender.sendVoiceProfileRequest(request);
        this.stats.requests_sent++;
        return newTaskId;
      }
    );
    return taskId;
  }

  /**
   * Méthodes de compatibilité avec l'API publique originale
   */
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
   * Envoie un textObject de story au pipeline de traduction.
   * Fire-and-forget: n'attend pas la réponse (gérée par Task 15 handler).
   */
  translateTextObject(params: TranslateTextObjectParams): void {
    this.requestSender.sendStoryTextObjectRequest(params).catch((err) => {
      logger.warn('translateTextObject: ZMQ send failed', { err, postId: params.postId, index: params.textObjectIndex });
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.running || !this.connectionManager.getIsConnected()) {
        return false;
      }

      await this.connectionManager.sendPing();
      return true;

    } catch (error) {
      logger.error(`❌ Health check échoué: ${error}`);
      return false;
    }
  }

  /**
   * Récupère les statistiques
   */
  getStats(): ZMQClientStats {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      ...this.stats,
      uptime_seconds: uptime,
      memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024
    };
  }

  /**
   * Récupère le nombre de requêtes en cours
   */
  getPendingRequestsCount(): number {
    return this.requestSender.getPendingRequestsCount();
  }

  /**
   * Ferme le client et nettoie les ressources
   */
  async close(): Promise<void> {
    logger.info('🛑 Arrêt ZmqTranslationClient...');

    this.running = false;

    try {
      // Arrêter le polling
      if (this.pollingIntervalId) {
        clearInterval(this.pollingIntervalId);
        this.pollingIntervalId = null;
      }

      // Fermer le connection manager
      await this.connectionManager.close();

      // Nettoyer les composants (requestSender.clear() annule aussi les timeouts)
      this.requestSender.clear();
      this.messageHandler.clear();
      this.retryCount.clear();

      logger.info('✅ ZmqTranslationClient arrêté');

    } catch (error) {
      logger.error(`❌ Erreur arrêt ZmqTranslationClient: ${error}`);
    }
  }

  /**
   * Méthode de test pour vérifier la réception (pour tests)
   */
  async testReception(): Promise<void> {
    logger.info('🧪 [ZMQ-Client] Test de réception des messages...');

    // Envoyer un ping et attendre la réponse
    try {
      await this.connectionManager.sendPing();
      logger.info(`🧪 [ZMQ-Client] Ping envoyé pour test via port ${this.pushPort}`);

      // Attendre un peu pour voir si on reçoit quelque chose
      setTimeout(() => {
        logger.info(`🧪 [ZMQ-Client] Test terminé. Messages reçus: ${this.stats.results_received}`);
        logger.info(`🧪 [ZMQ-Client] Heartbeats: ${this.stats.uptime_seconds}s`);
        logger.info(`🧪 [ZMQ-Client] Running: ${this.running}`);
      }, 3000);

    } catch (error) {
      logger.error(`❌ [ZMQ-Client] Erreur test réception: ${error}`);
    }
  }
}
