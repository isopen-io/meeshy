/**
 * VoiceAPIService - Production-ready Voice API service
 * Handles Gateway <-> Translator communication via ZMQ for voice operations
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { ZMQTranslationClient } from './ZmqTranslationClient';
import { logger } from '../utils/logger';
import type {
  VoiceTranslateRequest,
  VoiceTranslateAsyncRequest,
  VoiceAnalyzeRequest,
  VoiceCompareRequest,
  VoiceProfileRequest,
  VoiceJobStatusRequest,
  VoiceJobCancelRequest,
  VoiceFeedbackRequest,
  VoiceHistoryRequest,
  VoiceStatsRequest,
  VoiceAdminMetricsRequest,
  VoiceHealthRequest,
  VoiceLanguagesRequest,
  VoiceAPIRequest,
  VoiceAPISuccessEvent,
  VoiceAPIErrorEvent,
  VoiceJobProgressEvent,
  VoiceTranslationResult,
  TranslationJob,
  VoiceAnalysisResult,
  VoiceComparisonResult,
  VoiceProfile,
  TranslationHistoryEntry,
  VoiceUserStats,
  VoiceSystemMetrics,
  VoiceHealthStatus,
  VoiceSupportedLanguage,
  VoiceAnalysisType,
  VoiceFeedbackType,
  VoiceStatsPeriod
} from '@meeshy/shared/types';

// Response timeout in milliseconds
const DEFAULT_TIMEOUT = 60000; // 60 seconds for voice processing
const ASYNC_SUBMIT_TIMEOUT = 5000; // 5 seconds to submit async job

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
  requestType: string;
  timestamp: number;
}

export class VoiceAPIService extends EventEmitter {
  private zmqClient: ZMQTranslationClient;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private initialized: boolean = false;

  constructor(zmqClient: ZMQTranslationClient) {
    super();
    this.zmqClient = zmqClient;
    this._setupEventListeners();
  }

  private _setupEventListeners(): void {
    // Listen for Voice API responses from translator
    this.zmqClient.on('voiceAPISuccess', (event: VoiceAPISuccessEvent) => {
      this._handleSuccess(event);
    });

    this.zmqClient.on('voiceAPIError', (event: VoiceAPIErrorEvent) => {
      this._handleError(event);
    });

    this.zmqClient.on('voiceJobProgress', (event: VoiceJobProgressEvent) => {
      this.emit('jobProgress', event);
    });

    this.initialized = true;
    logger.info('[VoiceAPI] Service initialized');
  }

  private _handleSuccess(event: VoiceAPISuccessEvent): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.resolve(event.result);
      logger.info(`[VoiceAPI] Request completed: ${event.taskId} (${event.processingTimeMs}ms)`);
    }
  }

  private _handleError(event: VoiceAPIErrorEvent): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.reject(new VoiceAPIError(event.error, event.errorCode));
      logger.error(`[VoiceAPI] Request failed: ${event.taskId} - ${event.errorCode}: ${event.error}`);
    }
  }

  private async _sendRequest<T>(
    request: VoiceAPIRequest,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(request.taskId);
        reject(new VoiceAPIError('Request timeout', 'TIMEOUT'));
      }, timeout);

      this.pendingRequests.set(request.taskId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        requestType: request.type,
        timestamp: Date.now()
      });

      // Send via ZMQ
      this.zmqClient.sendVoiceAPIRequest(request).catch((error) => {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(request.taskId);
        reject(new VoiceAPIError(`Failed to send request: ${error.message}`, 'SEND_FAILED'));
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Synchronous voice translation - waits for result
   */
  async translateSync(
    userId: string,
    options: {
      audioBase64?: string;
      audioPath?: string;
      targetLanguages: string[];
      sourceLanguage?: string;
      generateVoiceClone?: boolean;
    }
  ): Promise<VoiceTranslationResult> {
    const request: VoiceTranslateRequest = {
      type: 'voice_translate',
      taskId: randomUUID(),
      userId,
      audioBase64: options.audioBase64,
      audioPath: options.audioPath,
      targetLanguages: options.targetLanguages,
      sourceLanguage: options.sourceLanguage,
      generateVoiceClone: options.generateVoiceClone ?? true
    };

    return this._sendRequest<VoiceTranslationResult>(request);
  }

  /**
   * Asynchronous voice translation - returns job ID immediately
   */
  async translateAsync(
    userId: string,
    options: {
      audioBase64?: string;
      audioPath?: string;
      targetLanguages: string[];
      sourceLanguage?: string;
      generateVoiceClone?: boolean;
      webhookUrl?: string;
      priority?: number;
      callbackMetadata?: Record<string, any>;
    }
  ): Promise<{ jobId: string; status: string }> {
    const request: VoiceTranslateAsyncRequest = {
      type: 'voice_translate_async',
      taskId: randomUUID(),
      userId,
      audioBase64: options.audioBase64,
      audioPath: options.audioPath,
      targetLanguages: options.targetLanguages,
      sourceLanguage: options.sourceLanguage,
      generateVoiceClone: options.generateVoiceClone ?? true,
      webhookUrl: options.webhookUrl,
      priority: options.priority ?? 1,
      callbackMetadata: options.callbackMetadata
    };

    return this._sendRequest<{ jobId: string; status: string }>(request, ASYNC_SUBMIT_TIMEOUT);
  }

  /**
   * Get job status
   */
  async getJobStatus(userId: string, jobId: string): Promise<TranslationJob> {
    const request: VoiceJobStatusRequest = {
      type: 'voice_job_status',
      taskId: randomUUID(),
      userId,
      jobId
    };

    return this._sendRequest<TranslationJob>(request, 10000);
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(userId: string, jobId: string): Promise<{ success: boolean; message: string }> {
    const request: VoiceJobCancelRequest = {
      type: 'voice_job_cancel',
      taskId: randomUUID(),
      userId,
      jobId
    };

    return this._sendRequest<{ success: boolean; message: string }>(request, 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze voice characteristics
   */
  async analyzeVoice(
    userId: string,
    options: {
      audioBase64?: string;
      audioPath?: string;
      analysisTypes?: VoiceAnalysisType[];
    }
  ): Promise<VoiceAnalysisResult> {
    const request: VoiceAnalyzeRequest = {
      type: 'voice_analyze',
      taskId: randomUUID(),
      userId,
      audioBase64: options.audioBase64,
      audioPath: options.audioPath,
      analysisTypes: options.analysisTypes
    };

    return this._sendRequest<VoiceAnalysisResult>(request, 30000);
  }

  /**
   * Compare two voice samples
   */
  async compareVoices(
    userId: string,
    options: {
      audioBase64_1?: string;
      audioPath_1?: string;
      audioBase64_2?: string;
      audioPath_2?: string;
    }
  ): Promise<VoiceComparisonResult> {
    const request: VoiceCompareRequest = {
      type: 'voice_compare',
      taskId: randomUUID(),
      userId,
      audioBase64_1: options.audioBase64_1,
      audioPath_1: options.audioPath_1,
      audioBase64_2: options.audioBase64_2,
      audioPath_2: options.audioPath_2
    };

    return this._sendRequest<VoiceComparisonResult>(request, 30000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE PROFILES
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // NOTE: Voice profile management has been moved to VoiceProfileService
  // which provides:
  // - GDPR-compliant consent management
  // - Profile registration via attachmentId OR direct audio
  // - Profile calibration (add audio samples)
  // - Age-based expiration (minors vs adults)
  // - Database persistence
  //
  // Use VoiceProfileService for all profile operations.
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // FEEDBACK & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Submit feedback for a translation
   */
  async submitFeedback(
    userId: string,
    options: {
      translationId: string;
      rating: number;
      feedbackType?: 'quality' | 'accuracy' | 'voice_similarity' | 'other';
      comment?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{ success: boolean; feedbackId: string }> {
    const request: VoiceFeedbackRequest = {
      type: 'voice_feedback',
      taskId: randomUUID(),
      userId,
      translationId: options.translationId,
      rating: options.rating,
      feedbackType: options.feedbackType,
      comment: options.comment,
      metadata: options.metadata
    };

    return this._sendRequest<{ success: boolean; feedbackId: string }>(request, 10000);
  }

  /**
   * Get translation history
   */
  async getHistory(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ history: TranslationHistoryEntry[]; total: number }> {
    const request: VoiceHistoryRequest = {
      type: 'voice_history',
      taskId: randomUUID(),
      userId,
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      startDate: options?.startDate,
      endDate: options?.endDate
    };

    return this._sendRequest<{ history: TranslationHistoryEntry[]; total: number }>(request, 10000);
  }

  /**
   * Get user statistics
   */
  async getUserStats(
    userId: string,
    period?: VoiceStatsPeriod
  ): Promise<VoiceUserStats> {
    const request: VoiceStatsRequest = {
      type: 'voice_stats',
      taskId: randomUUID(),
      userId,
      period: period ?? 'all'
    };

    return this._sendRequest<VoiceUserStats>(request, 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN & MONITORING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get system metrics (admin only)
   */
  async getSystemMetrics(userId: string): Promise<VoiceSystemMetrics> {
    const request: VoiceAdminMetricsRequest = {
      type: 'voice_admin_metrics',
      taskId: randomUUID(),
      userId
    };

    return this._sendRequest<VoiceSystemMetrics>(request, 10000);
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<VoiceHealthStatus> {
    const request: VoiceHealthRequest = {
      type: 'voice_health',
      taskId: randomUUID()
    };

    return this._sendRequest<VoiceHealthStatus>(request, 5000);
  }

  /**
   * Get supported languages
   */
  async getSupportedLanguages(): Promise<VoiceSupportedLanguage[]> {
    const request: VoiceLanguagesRequest = {
      type: 'voice_languages',
      taskId: randomUUID()
    };

    return this._sendRequest<VoiceSupportedLanguage[]>(request, 5000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get pending requests count
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.zmqClient !== null;
  }

  /**
   * Clean up timed out requests
   */
  cleanupTimedOutRequests(): number {
    const now = Date.now();
    const timeout = DEFAULT_TIMEOUT * 2; // 2x timeout for cleanup
    let cleaned = 0;

    for (const [taskId, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > timeout) {
        clearTimeout(pending.timeout);
        pending.reject(new VoiceAPIError('Request cleanup timeout', 'CLEANUP_TIMEOUT'));
        this.pendingRequests.delete(taskId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.warn(`[VoiceAPI] Cleaned up ${cleaned} timed out requests`);
    }

    return cleaned;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class VoiceAPIError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'VoiceAPIError';
    this.code = code;
  }
}

// Singleton instance
let voiceAPIServiceInstance: VoiceAPIService | null = null;

export function getVoiceAPIService(zmqClient: ZMQTranslationClient): VoiceAPIService {
  if (!voiceAPIServiceInstance) {
    voiceAPIServiceInstance = new VoiceAPIService(zmqClient);
  }
  return voiceAPIServiceInstance;
}

export function resetVoiceAPIService(): void {
  voiceAPIServiceInstance = null;
}
