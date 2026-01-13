/**
 * AudioTranslateService - Audio translation via Translator service
 *
 * Handles audio translation requests:
 * - Synchronous translation (wait for result)
 * - Asynchronous translation (job-based)
 * - Job status and cancellation
 *
 * Communication with Translator is done via ZMQ.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { ZMQTranslationClient } from './ZmqTranslationClient';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Voice profile data to send to Translator for voice cloning
 */
export interface VoiceProfileData {
  profileId: string;
  userId: string;
  embedding: string; // Base64 encoded numpy array
  qualityScore: number;
  fingerprint?: Record<string, any>;
  voiceCharacteristics?: Record<string, any>;
  version: number;
  audioCount: number;
  totalDurationMs: number;
}

export interface AudioTranslationOptions {
  audioBase64: string;
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;

  // Voice profile options - for using original sender's voice in forwarded messages
  originalSenderId?: string;
  existingVoiceProfile?: VoiceProfileData;
  useOriginalVoice?: boolean; // Default: true - always use original sender's voice
}

export interface AudioTranslationAsyncOptions extends AudioTranslationOptions {
  webhookUrl?: string;
  priority?: number;
  callbackMetadata?: Record<string, any>;
}

export interface AudioTranslationResult {
  translationId: string;
  originalAudio: {
    transcription: string;
    language: string;
    durationMs: number;
    confidence: number;
  };
  translations: Array<{
    targetLanguage: string;
    translatedText: string;
    audioBase64?: string;
    audioUrl?: string;
    durationMs: number;
    voiceCloned: boolean;
    voiceQuality?: number;
  }>;
  voiceProfile?: {
    profileId: string;
    quality: number;
    isNew: boolean;
  };
  processingTimeMs: number;
}

export interface AsyncJobResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  currentStep?: string;
  result?: AudioTranslationResult;
  error?: string;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
  requestType: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = 60000; // 60 seconds for audio processing
const ASYNC_SUBMIT_TIMEOUT = 5000; // 5 seconds to submit async job
const JOB_STATUS_TIMEOUT = 10000; // 10 seconds for job status

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class AudioTranslateService extends EventEmitter {
  private zmqClient: ZMQTranslationClient;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private initialized: boolean = false;

  constructor(zmqClient: ZMQTranslationClient) {
    super();
    this.zmqClient = zmqClient;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for translation responses from Translator
    this.zmqClient.on('voiceAPISuccess', (event: any) => {
      this.handleSuccess(event);
    });

    this.zmqClient.on('voiceAPIError', (event: any) => {
      this.handleError(event);
    });

    this.zmqClient.on('voiceJobProgress', (event: any) => {
      this.emit('jobProgress', event);
    });

    this.initialized = true;
    logger.info('[AudioTranslateService] Service initialized');
  }

  private handleSuccess(event: any): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.resolve(event.result);
      logger.info(`[AudioTranslateService] Request completed: ${event.taskId} (${event.processingTimeMs}ms)`);
    }
  }

  private handleError(event: any): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.reject(new Error(event.error));
      logger.error(`[AudioTranslateService] Request failed: ${event.taskId} - ${event.errorCode}: ${event.error}`);
    }
  }

  private async sendRequest<T>(
    request: any,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(request.taskId);
        reject(new Error('Request timeout'));
      }, timeout);

      this.pendingRequests.set(request.taskId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        requestType: request.type,
        timestamp: Date.now()
      });

      this.zmqClient.sendVoiceAPIRequest(request).catch((error) => {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(request.taskId);
        reject(new Error(`Failed to send request: ${error.message}`));
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Synchronous audio translation - waits for result
   */
  async translateSync(
    userId: string,
    options: AudioTranslationOptions
  ): Promise<ServiceResult<AudioTranslationResult>> {
    try {
      const request = {
        type: 'voice_translate',
        taskId: randomUUID(),
        userId,
        audioBase64: options.audioBase64,
        targetLanguages: options.targetLanguages,
        sourceLanguage: options.sourceLanguage,
        generateVoiceClone: options.generateVoiceClone ?? true,
        // Voice profile for voice cloning (original sender's voice)
        originalSenderId: options.originalSenderId,
        existingVoiceProfile: options.existingVoiceProfile,
        useOriginalVoice: options.useOriginalVoice ?? true
      };

      const result = await this.sendRequest<AudioTranslationResult>(request);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('[AudioTranslateService] Sync translation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed',
        errorCode: 'TRANSLATION_FAILED'
      };
    }
  }

  /**
   * Asynchronous audio translation - returns job ID immediately
   */
  async translateAsync(
    userId: string,
    options: AudioTranslationAsyncOptions
  ): Promise<ServiceResult<{ jobId: string; status: string }>> {
    try {
      const request = {
        type: 'voice_translate_async',
        taskId: randomUUID(),
        userId,
        audioBase64: options.audioBase64,
        targetLanguages: options.targetLanguages,
        sourceLanguage: options.sourceLanguage,
        generateVoiceClone: options.generateVoiceClone ?? true,
        webhookUrl: options.webhookUrl,
        priority: options.priority ?? 1,
        callbackMetadata: options.callbackMetadata,
        // Voice profile for voice cloning (original sender's voice)
        originalSenderId: options.originalSenderId,
        existingVoiceProfile: options.existingVoiceProfile,
        useOriginalVoice: options.useOriginalVoice ?? true
      };

      const result = await this.sendRequest<{ jobId: string; status: string }>(
        request,
        ASYNC_SUBMIT_TIMEOUT
      );

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('[AudioTranslateService] Async translation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit job',
        errorCode: 'JOB_SUBMIT_FAILED'
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(
    userId: string,
    jobId: string
  ): Promise<ServiceResult<AsyncJobResult>> {
    try {
      const request = {
        type: 'voice_job_status',
        taskId: randomUUID(),
        userId,
        jobId
      };

      const result = await this.sendRequest<AsyncJobResult>(request, JOB_STATUS_TIMEOUT);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('[AudioTranslateService] Get job status error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job status',
        errorCode: 'JOB_STATUS_FAILED'
      };
    }
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(
    userId: string,
    jobId: string
  ): Promise<ServiceResult<{ cancelled: boolean }>> {
    try {
      const request = {
        type: 'voice_job_cancel',
        taskId: randomUUID(),
        userId,
        jobId
      };

      const result = await this.sendRequest<{ success: boolean; message: string }>(
        request,
        JOB_STATUS_TIMEOUT
      );

      return {
        success: true,
        data: { cancelled: result.success }
      };
    } catch (error) {
      logger.error('[AudioTranslateService] Cancel job error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel job',
        errorCode: 'JOB_CANCEL_FAILED'
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.zmqClient !== null;
  }

  /**
   * Get pending requests count
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }
}
