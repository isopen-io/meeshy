/**
 * Client ZMQ haute performance pour communication avec le service de traduction
 * Architecture: PUB/SUB + REQ/REP avec pool de connexions et gestion asynchrone
 *
 * Architecture refactorisée:
 * - ZmqConnectionPool: Gestion des sockets et connexions
 * - ZmqRetryHandler: Retry logic et circuit breaker
 * - ZmqTranslationClient: Orchestration et API publique
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { ZmqConnectionPool, ConnectionPoolConfig } from './ZmqConnectionPool';
import { ZmqRetryHandler, RetryConfig } from './ZmqRetryHandler';

// Re-export types from original file
export * from './types';

// Import types
import {
  TranslationRequest,
  TranslationResult,
  TranslationCompletedEvent,
  TranslationErrorEvent,
  AudioProcessRequest,
  AudioProcessCompletedEvent,
  AudioProcessErrorEvent,
  TranscriptionOnlyRequest,
  TranscriptionCompletedEvent,
  TranscriptionErrorEvent,
  VoiceAPIRequest,
  VoiceAPISuccessEvent,
  VoiceAPIErrorEvent,
  VoiceJobProgressEvent,
  VoiceProfileRequest,
  VoiceProfileAnalyzeResult,
  VoiceProfileVerifyResult,
  VoiceProfileCompareResult,
  VoiceProfileErrorEvent,
  ZMQEvent,
  BinaryFrameInfo,
  AUDIO_BASE64_SIZE_THRESHOLD
} from './types';

export interface ZMQClientConfig {
  host?: string;
  pushPort?: number;
  subPort?: number;
  retryConfig?: Partial<RetryConfig>;
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

export class ZmqTranslationClient extends EventEmitter {
  private connectionPool: ZmqConnectionPool;
  private retryHandler: ZmqRetryHandler;

  private running: boolean = false;
  private startTime: number = Date.now();

  // Deduplication cache
  private processedResults = new Set<string>();

  // Statistics
  private stats: ZMQClientStats = {
    requests_sent: 0,
    results_received: 0,
    errors_received: 0,
    pool_full_rejections: 0,
    avg_response_time: 0,
    uptime_seconds: 0,
    memory_usage_mb: 0
  };

  constructor(config?: ZMQClientConfig) {
    super();

    const host = config?.host || process.env.ZMQ_TRANSLATOR_HOST || '0.0.0.0';
    const pushPort = config?.pushPort || parseInt(process.env.ZMQ_TRANSLATOR_PUSH_PORT || '5555');
    const subPort = config?.subPort || parseInt(process.env.ZMQ_TRANSLATOR_SUB_PORT || '5558');

    // Initialize connection pool
    const poolConfig: ConnectionPoolConfig = {
      host,
      pushPort,
      subPort,
      pollIntervalMs: 100
    };
    this.connectionPool = new ZmqConnectionPool(poolConfig);

    // Initialize retry handler
    this.retryHandler = new ZmqRetryHandler(config?.retryConfig);

    // Setup event handlers
    this.setupEventHandlers();

    console.log('[ZMQ-Client] ZmqTranslationClient initialized');
  }

  private setupEventHandlers(): void {
    // Connection pool message handler
    this.connectionPool.on('message', this.handleMessage.bind(this));

    // Connection pool error handler
    this.connectionPool.on('error', (error) => {
      console.error(`[ZMQ-Client] Connection pool error: ${error}`);
      this.emit('error', error);
    });

    // Retry handler retry event
    this.retryHandler.on('retry', async ({ taskId, request }) => {
      console.log(`[ZMQ-Client] Retrying request ${taskId}`);
      try {
        await this.connectionPool.send(request);
      } catch (error) {
        console.error(`[ZMQ-Client] Retry failed for ${taskId}: ${error}`);
        await this.retryHandler.markFailure(taskId, String(error));
      }
    });

    // Circuit breaker events
    this.retryHandler.on('circuitOpen', () => {
      console.error('[ZMQ-Client] Circuit breaker OPEN - blocking requests');
      this.emit('circuitBreakerOpen');
    });

    this.retryHandler.on('circuitHalfOpen', () => {
      console.log('[ZMQ-Client] Circuit breaker HALF_OPEN - testing connection');
      this.emit('circuitBreakerHalfOpen');
    });

    this.retryHandler.on('circuitClosed', () => {
      console.log('[ZMQ-Client] Circuit breaker CLOSED - accepting requests');
      this.emit('circuitBreakerClosed');
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log('[ZMQ-Client] Initializing ZmqTranslationClient...');

      await this.connectionPool.connect();
      this.running = true;

      // Periodic cleanup of stale requests
      setInterval(() => {
        this.retryHandler.cleanupStaleRequests(300000); // 5 minutes
      }, 60000); // Check every minute

      console.log('[ZMQ-Client] ZmqTranslationClient initialized successfully');

    } catch (error) {
      console.error(`[ZMQ-Client] Initialization failed: ${error}`);
      throw error;
    }
  }

  private async handleMessage(message: Buffer | Buffer[]): Promise<void> {
    try {
      // Parse message (simple or multipart)
      let firstFrame: Buffer;
      let binaryFrames: Buffer[] = [];

      if (Array.isArray(message)) {
        [firstFrame, ...binaryFrames] = message;
      } else {
        firstFrame = message;
      }

      const messageStr = firstFrame.toString('utf-8');
      const event: ZMQEvent = JSON.parse(messageStr);

      // Log multipart info
      if (binaryFrames.length > 0) {
        const totalSize = binaryFrames.reduce((sum, f) => sum + f.length, 0);
        console.log(`[ZMQ-Client] Multipart received: ${binaryFrames.length} frames, ${totalSize} bytes`);
      }

      // Route to appropriate handler
      await this.routeEvent(event, binaryFrames);

    } catch (error) {
      console.error(`[ZMQ-Client] Message handling error: ${error}`);
    }
  }

  private async routeEvent(event: ZMQEvent, binaryFrames: Buffer[]): Promise<void> {
    switch (event.type) {
      case 'translation_completed':
        this.handleTranslationCompleted(event as TranslationCompletedEvent);
        break;

      case 'translation_error':
        this.handleTranslationError(event as TranslationErrorEvent);
        break;

      case 'audio_process_completed':
        this.handleAudioProcessCompleted(event as unknown as AudioProcessCompletedEvent, binaryFrames);
        break;

      case 'audio_process_error':
        this.handleAudioProcessError(event as unknown as AudioProcessErrorEvent);
        break;

      case 'voice_api_success':
        this.handleVoiceAPISuccess(event as unknown as VoiceAPISuccessEvent);
        break;

      case 'voice_api_error':
        this.handleVoiceAPIError(event as unknown as VoiceAPIErrorEvent);
        break;

      case 'voice_job_progress':
        this.handleVoiceJobProgress(event as unknown as VoiceJobProgressEvent);
        break;

      case 'voice_profile_analyze_result':
        this.handleVoiceProfileAnalyze(event as unknown as VoiceProfileAnalyzeResult);
        break;

      case 'voice_profile_verify_result':
        this.handleVoiceProfileVerify(event as unknown as VoiceProfileVerifyResult);
        break;

      case 'voice_profile_compare_result':
        this.handleVoiceProfileCompare(event as unknown as VoiceProfileCompareResult);
        break;

      case 'voice_profile_error':
        this.handleVoiceProfileError(event as unknown as VoiceProfileErrorEvent);
        break;

      case 'transcription_completed':
        this.handleTranscriptionCompleted(event as unknown as TranscriptionCompletedEvent);
        break;

      case 'transcription_error':
        this.handleTranscriptionError(event as unknown as TranscriptionErrorEvent);
        break;

      case 'pong':
        // Silent ping/pong handling
        break;

      default:
        console.warn(`[ZMQ-Client] Unknown event type: ${(event as any).type}`);
    }
  }

  private handleTranslationCompleted(event: TranslationCompletedEvent): void {
    const resultKey = `${event.taskId}_${event.targetLanguage}`;

    if (this.processedResults.has(resultKey)) {
      return;
    }

    this.processedResults.add(resultKey);

    // Cleanup old results (keep last 1000)
    if (this.processedResults.size > 1000) {
      const firstKey = this.processedResults.values().next().value;
      this.processedResults.delete(firstKey);
    }

    if (!event.result || !event.result.messageId) {
      console.error('[ZMQ-Client] Invalid translation completed event');
      return;
    }

    this.stats.results_received++;
    this.retryHandler.markSuccess(event.taskId);

    this.emit('translationCompleted', {
      taskId: event.taskId,
      result: event.result,
      targetLanguage: event.targetLanguage,
      metadata: event.metadata || {}
    });
  }

  private handleTranslationError(event: TranslationErrorEvent): void {
    this.stats.errors_received++;

    if (event.error === 'translation pool full') {
      this.stats.pool_full_rejections++;
    }

    console.error(`[ZMQ-Client] Translation error: ${event.error} for ${event.messageId}`);

    // Attempt retry
    this.retryHandler.markFailure(event.taskId, event.error);

    this.emit('translationError', {
      taskId: event.taskId,
      messageId: event.messageId,
      error: event.error,
      conversationId: event.conversationId,
      metadata: event.metadata || {}
    });
  }

  private handleAudioProcessCompleted(event: AudioProcessCompletedEvent, binaryFrames: Buffer[]): void {
    console.log(`[ZMQ-Client] Audio process completed: ${event.messageId}`);

    // Extract binary data from frames
    const binaryFramesInfo = (event as any).binaryFrames || {};
    const audioBinaries: Map<string, Buffer> = new Map();
    let embeddingBinary: Buffer | null = null;

    for (const [key, info] of Object.entries(binaryFramesInfo)) {
      const frameInfo = info as { index: number; size: number; mimeType?: string };
      const frameIndex = frameInfo.index - 1;

      if (frameIndex >= 0 && frameIndex < binaryFrames.length) {
        if (key.startsWith('audio_')) {
          const language = key.replace('audio_', '');
          audioBinaries.set(language, binaryFrames[frameIndex]);
        } else if (key === 'embedding') {
          embeddingBinary = binaryFrames[frameIndex];
        }
      }
    }

    // Enrich translated audios with binary data
    const enrichedAudios = event.translatedAudios.map(audio => ({
      ...audio,
      _audioBinary: audioBinaries.get(audio.targetLanguage) || null
    }));

    // Enrich voice profile with embedding
    let enrichedProfile = (event as any).newVoiceProfile || null;
    if (enrichedProfile && embeddingBinary) {
      enrichedProfile = {
        ...enrichedProfile,
        _embeddingBinary: embeddingBinary
      };
    }

    this.retryHandler.markSuccess(event.taskId);

    this.emit('audioProcessCompleted', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      transcription: event.transcription,
      translatedAudios: enrichedAudios,
      voiceModelUserId: event.voiceModelUserId,
      voiceModelQuality: event.voiceModelQuality,
      processingTimeMs: event.processingTimeMs,
      newVoiceProfile: enrichedProfile
    });
  }

  private handleAudioProcessError(event: AudioProcessErrorEvent): void {
    console.error(`[ZMQ-Client] Audio process error: ${event.messageId} - ${event.error}`);

    this.retryHandler.markFailure(event.taskId, event.error);

    this.emit('audioProcessError', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      error: event.error,
      errorCode: event.errorCode
    });
  }

  private handleVoiceAPISuccess(event: VoiceAPISuccessEvent): void {
    console.log(`[ZMQ-Client] Voice API success: ${event.taskId}`);
    this.retryHandler.markSuccess(event.taskId);
    this.emit('voiceAPISuccess', event);
  }

  private handleVoiceAPIError(event: VoiceAPIErrorEvent): void {
    console.error(`[ZMQ-Client] Voice API error: ${event.taskId} - ${event.error}`);
    this.retryHandler.markFailure(event.taskId, event.error);
    this.emit('voiceAPIError', event);
  }

  private handleVoiceJobProgress(event: VoiceJobProgressEvent): void {
    this.emit('voiceJobProgress', event);
  }

  private handleVoiceProfileAnalyze(event: VoiceProfileAnalyzeResult): void {
    if (event.success) {
      this.retryHandler.markSuccess(event.request_id);
    } else {
      this.retryHandler.markFailure(event.request_id, event.error || 'Unknown error');
    }
    this.emit('voiceProfileAnalyzeResult', event);
  }

  private handleVoiceProfileVerify(event: VoiceProfileVerifyResult): void {
    if (event.success) {
      this.retryHandler.markSuccess(event.request_id);
    } else {
      this.retryHandler.markFailure(event.request_id, event.error || 'Unknown error');
    }
    this.emit('voiceProfileVerifyResult', event);
  }

  private handleVoiceProfileCompare(event: VoiceProfileCompareResult): void {
    if (event.success) {
      this.retryHandler.markSuccess(event.request_id);
    } else {
      this.retryHandler.markFailure(event.request_id, event.error || 'Unknown error');
    }
    this.emit('voiceProfileCompareResult', event);
  }

  private handleVoiceProfileError(event: VoiceProfileErrorEvent): void {
    this.retryHandler.markFailure(event.request_id, event.error);
    this.emit('voiceProfileError', event);
  }

  private handleTranscriptionCompleted(event: TranscriptionCompletedEvent): void {
    console.log(`[ZMQ-Client] Transcription completed: ${event.messageId}`);
    this.retryHandler.markSuccess(event.taskId);
    this.emit('transcriptionCompleted', event);
  }

  private handleTranscriptionError(event: TranscriptionErrorEvent): void {
    console.error(`[ZMQ-Client] Transcription error: ${event.messageId} - ${event.error}`);
    this.retryHandler.markFailure(event.taskId, event.error);
    this.emit('transcriptionError', event);
  }

  // Public API methods continue in next section...
  async sendTranslationRequest(request: TranslationRequest): Promise<string> {
    if (!this.retryHandler.canSendRequest()) {
      throw new Error('Circuit breaker is OPEN - requests blocked');
    }

    const taskId = randomUUID();

    const requestMessage = {
      taskId,
      messageId: request.messageId,
      text: request.text,
      sourceLanguage: request.sourceLanguage,
      targetLanguages: request.targetLanguages,
      conversationId: request.conversationId,
      modelType: request.modelType || 'basic',
      timestamp: Date.now()
    };

    await this.connectionPool.send(requestMessage);

    this.stats.requests_sent++;
    this.retryHandler.registerRequest(taskId, requestMessage);

    console.log(`[ZMQ-Client] Translation request sent: ${taskId}`);

    return taskId;
  }

  private async loadAudioAsBinary(audioPath?: string): Promise<{ buffer: Buffer; mimeType: string; size: number } | null> {
    if (!audioPath) return null;

    try {
      if (!existsSync(audioPath)) {
        return null;
      }

      const stats = statSync(audioPath);
      if (stats.size > AUDIO_BASE64_SIZE_THRESHOLD) {
        console.log(`[ZMQ-Client] File too large for ZMQ transfer: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        return null;
      }

      const buffer = await fs.readFile(audioPath);
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

      return { buffer, mimeType, size: stats.size };
    } catch (error) {
      console.warn(`[ZMQ-Client] Error reading audio file: ${error}`);
      return null;
    }
  }

  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>): Promise<string> {
    if (!this.retryHandler.canSendRequest()) {
      throw new Error('Circuit breaker is OPEN - requests blocked');
    }

    if (!request.audioPath) {
      throw new Error('audioPath must be provided');
    }

    const taskId = randomUUID();

    const audioData = await this.loadAudioAsBinary(request.audioPath);
    if (!audioData) {
      throw new Error(`Unable to load audio file: ${request.audioPath}`);
    }

    const binaryFrames: Buffer[] = [audioData.buffer];
    const binaryFrameInfo: BinaryFrameInfo = {
      audio: 1,
      audioMimeType: audioData.mimeType,
      audioSize: audioData.size
    };

    const requestMessage: AudioProcessRequest = {
      type: 'audio_process',
      messageId: request.messageId,
      attachmentId: request.attachmentId,
      conversationId: request.conversationId,
      senderId: request.senderId,
      audioUrl: '',
      audioMimeType: audioData.mimeType,
      binaryFrames: binaryFrameInfo,
      audioDurationMs: request.audioDurationMs,
      mobileTranscription: request.mobileTranscription,
      targetLanguages: request.targetLanguages,
      generateVoiceClone: request.generateVoiceClone,
      modelType: request.modelType,
      originalSenderId: request.originalSenderId,
      existingVoiceProfile: request.existingVoiceProfile,
      useOriginalVoice: request.useOriginalVoice,
      voiceCloneParams: request.voiceCloneParams
    };

    await this.connectionPool.sendMultipart(requestMessage, binaryFrames);

    this.stats.requests_sent++;
    this.retryHandler.registerRequest(taskId, requestMessage);

    console.log(`[ZMQ-Client] Audio process request sent: ${taskId}`);

    return taskId;
  }

  async sendTranscriptionOnlyRequest(request: Omit<TranscriptionOnlyRequest, 'type' | 'taskId'>): Promise<string> {
    if (!this.retryHandler.canSendRequest()) {
      throw new Error('Circuit breaker is OPEN - requests blocked');
    }

    if (!request.audioPath && !request.audioData) {
      throw new Error('Either audioPath or audioData must be provided');
    }

    const taskId = randomUUID();

    let audioBuffer: Buffer;
    let mimeType: string;
    let audioSize: number;

    if (request.audioPath) {
      const audioData = await this.loadAudioAsBinary(request.audioPath);
      if (!audioData) {
        throw new Error(`Unable to load audio file: ${request.audioPath}`);
      }
      audioBuffer = audioData.buffer;
      mimeType = audioData.mimeType;
      audioSize = audioData.size;
    } else {
      audioBuffer = Buffer.from(request.audioData!, 'base64');
      audioSize = audioBuffer.length;
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

    const binaryFrames: Buffer[] = [audioBuffer];
    const binaryFrameInfo: BinaryFrameInfo = {
      audio: 1,
      audioMimeType: mimeType,
      audioSize: audioSize
    };

    const requestMessage: TranscriptionOnlyRequest = {
      type: 'transcription_only',
      taskId,
      messageId: request.messageId,
      attachmentId: request.attachmentId,
      audioFormat: mimeType.replace('audio/', ''),
      mobileTranscription: request.mobileTranscription,
      binaryFrames: binaryFrameInfo
    };

    await this.connectionPool.sendMultipart(requestMessage, binaryFrames);

    this.stats.requests_sent++;
    this.retryHandler.registerRequest(taskId, requestMessage);

    console.log(`[ZMQ-Client] Transcription request sent: ${taskId}`);

    return taskId;
  }

  async sendVoiceAPIRequest(request: VoiceAPIRequest): Promise<string> {
    if (!this.retryHandler.canSendRequest()) {
      throw new Error('Circuit breaker is OPEN - requests blocked');
    }

    await this.connectionPool.send(request);

    this.stats.requests_sent++;
    this.retryHandler.registerRequest(request.taskId, request);

    console.log(`[ZMQ-Client] Voice API request sent: ${request.taskId}`);

    return request.taskId;
  }

  async sendVoiceProfileRequest(request: VoiceProfileRequest): Promise<string> {
    if (!this.retryHandler.canSendRequest()) {
      throw new Error('Circuit breaker is OPEN - requests blocked');
    }

    await this.connectionPool.send(request);

    this.stats.requests_sent++;
    this.retryHandler.registerRequest(request.request_id, request);

    console.log(`[ZMQ-Client] Voice profile request sent: ${request.request_id}`);

    return request.request_id;
  }

  async healthCheck(): Promise<boolean> {
    return await this.connectionPool.healthCheck();
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
    return this.retryHandler.getPendingCount();
  }

  getCircuitBreakerState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.retryHandler.getCircuitState();
  }

  async close(): Promise<void> {
    console.log('[ZMQ-Client] Shutting down...');

    this.running = false;
    this.retryHandler.clear();
    await this.connectionPool.disconnect();

    console.log('[ZMQ-Client] Shutdown complete');
  }
}
