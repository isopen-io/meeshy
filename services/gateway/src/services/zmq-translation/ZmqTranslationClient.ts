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
import { readZmqToleranceConfig } from './zmqToleranceConfig';

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

// Tolérance ZMQ surchargeable par env (cf. zmqToleranceConfig.ts) : permet
// d'ajuster timeouts / retries / circuit-breaker en prod sans redéployer de code.
// But : ne jamais dropper une traduction tant que le translator finit par
// répondre, sans tempête de retries dupliqués.
const _zmqTolerance = readZmqToleranceConfig();

// Timeout par tentative pour une requête de traduction texte (défaut 30 s).
const ZMQ_REQUEST_TIMEOUT_MS = _zmqTolerance.requestTimeoutMs;
// Nombre de retries avant émission d'erreur (tentatives totales = +1).
const ZMQ_MAX_RETRIES = _zmqTolerance.maxRetries;
// Pipelines voix longs (voice_translate / voice_translate_async) : plusieurs
// minutes (Whisper + NLLB + Chatterbox). Re-pousser dupliquerait le job dans le
// worker pool et saturerait le CPU → un seul tir, deadman long, pas de retry.
const ZMQ_VOICE_TRANSLATE_DEADMAN_MS = _zmqTolerance.voiceTranslateDeadmanMs;

// Circuit breaker : ouvre après N erreurs consécutives.
const CB_FAILURE_THRESHOLD = _zmqTolerance.cbFailureThreshold;
// Reste ouvert ce délai avant auto-reset.
const CB_COOLDOWN_MS = _zmqTolerance.cbCooldownMs;

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

  // Circuit breaker state
  private cbConsecutiveErrors: number = 0;
  private cbOpenedAt: number | null = null;

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
   * Registers a timeout for a pending ZMQ request.
   *
   * Default behavior: 30s timeout + up to 3 retries with the SAME taskId.
   *
   * When `retryEnabled` is false (long voice pipelines), the function arms a
   * single long "deadman" timeout (`timeoutMs`) with no retry: the translator
   * worker pool queues the work and the result comes back asynchronously via
   * the SUB socket. Re-pushing the request would just create a parallel
   * duplicate job in the worker pool and saturate CPU.
   *
   * @param taskId - Correlation ID for the request (preserved across retries)
   * @param errorEvent - The error event payload to emit if the request fails
   * @param errorEventName - The EventEmitter event name to emit on final failure
   * @param resend - Async function that re-sends the request with the same taskId
   * @param opts.retryEnabled - When false, no retry; one shot with the long deadman
   * @param opts.timeoutMs - Override timeout (defaults to ZMQ_REQUEST_TIMEOUT_MS)
   */
  private _registerRequestTimeout(
    taskId: string,
    errorEventName: string,
    errorEvent: Record<string, unknown>,
    resend: (existingTaskId: string) => Promise<string>,
    opts: { retryEnabled?: boolean; timeoutMs?: number } = {}
  ): void {
    const retryEnabled = opts.retryEnabled !== false;
    const timeoutMs = opts.timeoutMs ?? ZMQ_REQUEST_TIMEOUT_MS;

    this.requestSender.registerTimeout(taskId, timeoutMs, async () => {
      if (!retryEnabled) {
        logger.error(`❌ ZMQ deadman timeout (${Math.round(timeoutMs / 1000)}s) for taskId=${taskId}, giving up (no retry for long voice pipelines)`);
        this.retryCount.delete(taskId);
        this.stats.errors_received++;
        this.emit(errorEventName, { ...errorEvent, taskId });
        return;
      }

      const retries = this.retryCount.get(taskId) ?? 0;

      if (retries < ZMQ_MAX_RETRIES) {
        logger.warn(`⏱️ ZMQ timeout for taskId=${taskId} (attempt ${retries + 1}/${ZMQ_MAX_RETRIES + 1}), retrying with same taskId...`);
        try {
          await resend(taskId);
          this.retryCount.set(taskId, retries + 1);
          this._registerRequestTimeout(taskId, errorEventName, errorEvent, resend, opts);
        } catch (err) {
          logger.error(`❌ ZMQ retry failed for taskId=${taskId}: ${err}`);
          this.retryCount.delete(taskId);
          this.stats.errors_received++;
          this.emit(errorEventName, { ...errorEvent, taskId });
        }
      } else {
        logger.error(`❌ ZMQ timeout after ${ZMQ_MAX_RETRIES + 1} attempt(s) for taskId=${taskId}, giving up`);
        this.retryCount.delete(taskId);
        this.stats.errors_received++;
        this.emit(errorEventName, { ...errorEvent, taskId });
      }
    });
  }

  /**
   * Voice translation operations that must NOT be retried by the ZMQ client.
   * These are long-running pipelines (Whisper + NLLB + TTS) queued by the
   * translator's worker pool — retries would just duplicate work in the queue.
   */
  /**
   * Silence maximal toléré sur le SUB avant recréation du socket. Les pongs
   * du translator arrivent toutes les ~30 s en régime normal : 120 s sans
   * RIEN = socket zombie (incident prod 2026-07-04 : canal retour sourd
   * pendant des heures, TCP établi mais aucun message délivré à l'app).
   */
  private static readonly SUB_SILENCE_RESET_MS = 120_000;

  private static readonly VOICE_LONG_RUNNING_TYPES = new Set<string>([
    'voice_translate',
    'voice_translate_async',
  ]);

  private _cbIsOpen(): boolean {
    if (this.cbOpenedAt === null) return false;
    if (Date.now() - this.cbOpenedAt >= CB_COOLDOWN_MS) {
      this.cbOpenedAt = null;
      this.cbConsecutiveErrors = 0;
      logger.info('[CB] Circuit breaker reset — translator may be back');
      return false;
    }
    return true;
  }

  private _cbRecordSuccess(): void {
    this.cbConsecutiveErrors = 0;
    this.cbOpenedAt = null;
  }

  private _cbRecordError(): void {
    this.cbConsecutiveErrors++;
    if (this.cbConsecutiveErrors >= CB_FAILURE_THRESHOLD && this.cbOpenedAt === null) {
      this.cbOpenedAt = Date.now();
      logger.warn(`[CB] Circuit breaker OPEN after ${this.cbConsecutiveErrors} consecutive errors — blocking ZMQ for ${CB_COOLDOWN_MS / 1000}s`);
    }
  }

  /**
   * Configure le forwarding des événements du handler vers le client
   */
  private setupEventForwarding(): void {
    // Translation events
    this.messageHandler.on('translationCompleted', (event) => {
      this.stats.results_received++;
      this._cbRecordSuccess();
      this.retryCount.delete(event.taskId);
      this.requestSender.removePendingRequest(event.taskId);
      this.emit('translationCompleted', event);
      // Also forward the per-messageId scoped event (ZmqMessageHandler emits
      // both) so callers — PostService's story-caption translation,
      // CallEventsHandler's call-transcription translation — can subscribe
      // narrowly instead of filtering every global translation completion
      // in the process.
      if (event.result?.messageId) {
        this.emit(`translationCompleted:${event.result.messageId}`, event);
      }
    });

    this.messageHandler.on('translationError', (event) => {
      this.stats.errors_received++;
      if (event.error === 'translation pool full') {
        this.stats.pool_full_rejections++;
      }
      this._cbRecordError();
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

    // Un seul receive() en vol : zeromq.js n'autorise qu'une lecture à la
    // fois par socket — l'ancien tick 100 ms relançait receive() par-dessus
    // celui en attente et jetait « Socket is busy reading » 10×/s dans un
    // catch muet. Incident prod 2026-07-04 : le canal retour est resté
    // sourd des heures sans une seule ligne de log.
    let receiveInFlight = false;
    let lastMessageAt = Date.now();
    let lastSilenceLogAt = 0;

    const checkForMessages = async () => {
      /* istanbul ignore next -- clearInterval is called in close() before this fires in tests */
      if (!this.running) {
        logger.info('🛑 Arrêt de l\'écoute - running=false');
        return;
      }

      // Watchdog : les pongs du translator arrivent toutes les ~30 s dès
      // que le health-ping tourne — un silence prolongé signifie un socket
      // SUB zombie (jamais silencieux en fonctionnement normal). Recréer
      // le socket est sans danger : PUB/SUB n'a pas d'état de session.
      // Déclenché MÊME si un receive() est en vol : un zombie a par
      // définition un receive pending éternel ; le close() du recreate le
      // rejette et libère le flag pour le nouveau socket.
      const silenceMs = Date.now() - lastMessageAt;
      if (silenceMs > ZmqTranslationClient.SUB_SILENCE_RESET_MS) {
        if (Date.now() - lastSilenceLogAt > ZmqTranslationClient.SUB_SILENCE_RESET_MS) {
          lastSilenceLogAt = Date.now();
          logger.warn(
            `⚠️ [ZMQ-SUB] Aucun message depuis ${Math.round(silenceMs / 1000)}s — recréation du socket SUB`
          );
          try {
            await this.connectionManager.recreateSubSocket();
            lastMessageAt = Date.now();
          } catch (recreateError) {
            logger.error(`❌ [ZMQ-SUB] Échec recréation du socket SUB: ${recreateError}`);
          }
        }
        return;
      }

      if (receiveInFlight) {
        return;
      }

      receiveInFlight = true;
      try {
        const message = await this.connectionManager.receive();

        /* istanbul ignore else -- receive() returns Buffer/Buffer[] or throws; null/undefined is structurally unreachable here */
        if (message) {
          lastMessageAt = Date.now();
          await this.messageHandler.handleMessage(message);
        }
      } catch (receiveError) {
        // « No message… » est le régime normal du polling ; toute autre
        // erreur est un vrai signal et doit se voir dans les logs.
        const text = String(receiveError);
        if (!text.includes('No message') && this.running) {
          logger.error(`❌ [ZMQ-SUB] Erreur réception résultat: ${text}`);
        }
      } finally {
        receiveInFlight = false;
      }
    };

    // Démarrer le polling avec setInterval
    logger.info('🔄 Démarrage polling avec setInterval...');
    this.pollingIntervalId = setInterval(checkForMessages, 100); // 100ms entre chaque vérification
    this.pollingIntervalId.unref?.();
  }

  /**
   * Envoie une requête de traduction
   */
  async sendTranslationRequest(request: TranslationRequest): Promise<string> {
    if (this._cbIsOpen()) {
      throw new Error('ZMQ circuit breaker OPEN: translator unavailable, request rejected');
    }
    const taskId = await this.requestSender.sendTranslationRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'translationError',
      { taskId, messageId: request.messageId, error: 'ZMQ timeout: no response from translator', conversationId: request.conversationId },
      async (existingTaskId: string) => {
        await this.requestSender.sendTranslationRequest(request, existingTaskId);
        this.stats.requests_sent++;
        return existingTaskId;
      }
    );
    return taskId;
  }

  /**
   * Envoie une requête de processing audio
   */
  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>): Promise<string> {
    if (this._cbIsOpen()) {
      throw new Error('ZMQ circuit breaker OPEN: translator unavailable, request rejected');
    }
    const taskId = await this.requestSender.sendAudioProcessRequest(request);
    this.stats.requests_sent++;
    this._registerRequestTimeout(
      taskId,
      'audioProcessError',
      { taskId, messageId: request.messageId, attachmentId: request.attachmentId, error: 'ZMQ timeout: no response from translator' },
      async (existingTaskId: string) => {
        await this.requestSender.sendAudioProcessRequest(request, existingTaskId);
        this.stats.requests_sent++;
        return existingTaskId;
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
      async (existingTaskId: string) => {
        await this.requestSender.sendTranscriptionOnlyRequest(request, existingTaskId);
        this.stats.requests_sent++;
        return existingTaskId;
      }
    );
    return taskId;
  }

  /**
   * Envoie une requête Voice API.
   *
   * Pour `voice_translate` / `voice_translate_async` (pipelines longs), aucun retry
   * n'est armé : la requête est PUSH-ée une seule fois vers le translator qui la
   * met en file dans son worker pool. La réponse remonte de manière asynchrone
   * via le canal PUB/SUB. Un deadman de 15 minutes émet `voiceAPIError` si rien
   * ne revient (le translator est probablement mort).
   *
   * Pour les autres opérations Voice API (rapides : status, list, feedback, …),
   * le retry par défaut (30 s × 4) s'applique.
   */
  async sendVoiceAPIRequest(request: VoiceAPIRequest): Promise<string> {
    const taskId = await this.requestSender.sendVoiceAPIRequest(request);
    this.stats.requests_sent++;

    const isLongRunning = ZmqTranslationClient.VOICE_LONG_RUNNING_TYPES.has(request.type);

    this._registerRequestTimeout(
      taskId,
      'voiceAPIError',
      { taskId, requestType: request.type, error: 'ZMQ timeout: no response from translator', errorCode: 'TIMEOUT' },
      async (existingTaskId: string) => {
        await this.requestSender.sendVoiceAPIRequest(request, existingTaskId);
        this.stats.requests_sent++;
        return existingTaskId;
      },
      isLongRunning
        ? { retryEnabled: false, timeoutMs: ZMQ_VOICE_TRANSLATE_DEADMAN_MS }
        : undefined
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
      async (existingTaskId: string) => {
        await this.requestSender.sendVoiceProfileRequest(request, existingTaskId);
        this.stats.requests_sent++;
        return existingTaskId;
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
      /* istanbul ignore next -- connectionManager.sendPing() catches internally; this outer catch is structurally unreachable */
      logger.error(`❌ Health check échoué: ${error}`); /* istanbul ignore next */ return false;
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
      /* istanbul ignore next -- connectionManager.close() has its own internal catch; this outer catch is structurally unreachable */
      logger.error(`❌ Erreur arrêt ZmqTranslationClient: ${error}`);
    }
  }

  /**
   * Méthode de test pour vérifier la réception (pour tests)
   */
  /* istanbul ignore next -- diagnostic utility; all meaningful behaviour is covered by the other tests */
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
