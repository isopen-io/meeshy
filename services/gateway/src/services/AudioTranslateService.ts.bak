/**
 * AudioTranslateService - Service de traduction audio avec persistance
 *
 * Gère:
 * - Transcription audio (Whisper)
 * - Traduction audio avec clonage vocal (TTS)
 * - Analyse et comparaison de voix
 * - Persistance en base de données (transcriptions, traductions, profils vocaux)
 * - Communication Gateway <-> Translator via ZMQ
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { ZMQTranslationClient } from './ZmqTranslationClient';
import { logger } from '../utils/logger';
import type {
  VoiceTranslateRequest,
  VoiceTranslateAsyncRequest,
  VoiceAnalyzeRequest,
  VoiceCompareRequest,
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
  TranslationHistoryEntry,
  VoiceUserStats,
  VoiceSystemMetrics,
  VoiceHealthStatus,
  VoiceSupportedLanguage,
  VoiceAnalysisType,
  VoiceStatsPeriod,
  // Types partagés pour l'API audio
  TranscriptionResult,
  TranslatedAudioResult,
  AudioTranslationOptions,
  ServiceResult,
  VoiceProfileData
} from '@meeshy/shared/types';

// Response timeout in milliseconds
const DEFAULT_TIMEOUT = 60000; // 60 seconds for voice processing
const ASYNC_SUBMIT_TIMEOUT = 5000; // 5 seconds to submit async job

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
  requestType: string;
  timestamp: number;
}

// Types re-exportés depuis shared pour compatibilité
export type {
  TranscriptionResult,
  TranslatedAudioResult,
  AudioTranslationOptions,
  ServiceResult
} from '@meeshy/shared/types';

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class AudioTranslateService extends EventEmitter {
  private prisma: PrismaClient;
  private zmqClient: ZMQTranslationClient;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private initialized: boolean = false;

  constructor(prisma: PrismaClient, zmqClient: ZMQTranslationClient) {
    super();
    this.prisma = prisma;
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

    // Listen for transcription-only responses
    this.zmqClient.on('transcriptionCompleted', (event: any) => {
      this._handleTranscriptionSuccess(event);
    });

    this.zmqClient.on('transcriptionError', (event: any) => {
      this._handleTranscriptionError(event);
    });

    this.initialized = true;
    logger.info('[AudioTranslateService] Service initialized');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private _handleTranscriptionSuccess(event: {
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
  }): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.resolve({
        text: event.transcription.text,
        language: event.transcription.language,
        confidence: event.transcription.confidence,
        durationMs: event.transcription.durationMs,
        source: event.transcription.source,
        segments: event.transcription.segments,
        messageId: event.messageId,
        attachmentId: event.attachmentId,
        processingTimeMs: event.processingTimeMs
      });
      logger.info(`[AudioTranslateService] Transcription completed: ${event.taskId} (${event.processingTimeMs}ms)`);
    }
  }

  private _handleTranscriptionError(event: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    error: string;
    errorCode: string;
  }): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.reject(new AudioTranslateError(event.error, event.errorCode));
      logger.error(`[AudioTranslateService] Transcription failed: ${event.taskId} - ${event.errorCode}: ${event.error}`);
    }
  }

  private _handleSuccess(event: VoiceAPISuccessEvent): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.resolve(event.result);
      logger.info(`[AudioTranslateService] Request completed: ${event.taskId} (${event.processingTimeMs}ms)`);
    }
  }

  private _handleError(event: VoiceAPIErrorEvent): void {
    const pending = this.pendingRequests.get(event.taskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.taskId);
      pending.reject(new AudioTranslateError(event.error, event.errorCode));
      logger.error(`[AudioTranslateService] Request failed: ${event.taskId} - ${event.errorCode}: ${event.error}`);
    }
  }

  private async _sendRequest<T>(
    request: VoiceAPIRequest,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(request.taskId);
        reject(new AudioTranslateError('Request timeout', 'TIMEOUT'));
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
        reject(new AudioTranslateError(`Failed to send request: ${error.message}`, 'SEND_FAILED'));
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Transcription seule - sans traduction ni TTS
   * Retourne uniquement le texte transcrit de l'audio
   *
   * Supporte deux modes:
   * - audioPath: Chemin vers un fichier audio (pour attachments)
   * - audioBase64 + audioFormat: Audio encodé en base64 (pour transcription directe)
   */
  async transcribeOnly(
    userId: string,
    options: {
      audioBase64?: string;
      audioFormat?: string;  // Requis si audioBase64 est fourni (wav, mp3, ogg, webm, m4a)
      audioPath?: string;
      messageId?: string;
      attachmentId?: string;
      language?: string;
      saveToDatabase?: boolean;
    }
  ): Promise<TranscriptionResult> {
    const messageId = options.messageId || randomUUID();
    const attachmentId = options.attachmentId || randomUUID();

    // Valider qu'on a soit audioPath soit audioBase64
    if (!options.audioPath && !options.audioBase64) {
      throw new AudioTranslateError('Either audioPath or audioBase64 is required', 'INVALID_REQUEST');
    }

    // Si audioBase64 est fourni, audioFormat est requis
    if (options.audioBase64 && !options.audioFormat) {
      throw new AudioTranslateError('audioFormat is required when providing audioBase64', 'INVALID_REQUEST');
    }

    return new Promise(async (resolve, reject) => {
      let taskId: string;

      try {
        // Construire la requête selon le mode (fichier OU base64)
        // Le ZMQ client envoie toujours en multipart binaire
        taskId = await this.zmqClient.sendTranscriptionOnlyRequest({
          messageId,
          attachmentId: options.attachmentId,
          // Mode 1: Chemin du fichier (pour attachments existants)
          audioPath: options.audioPath,
          // Mode 2: Audio en base64 (pour transcription directe API)
          audioData: options.audioBase64,
          audioFormat: options.audioFormat,
        });

        const timeoutHandle = setTimeout(() => {
          this.pendingRequests.delete(taskId);
          reject(new AudioTranslateError('Transcription timeout', 'TIMEOUT'));
        }, 30000);

        this.pendingRequests.set(taskId, {
          resolve: async (result: TranscriptionResult) => {
            // Sauvegarder en base si demandé
            if (options.saveToDatabase && options.attachmentId) {
              await this._saveTranscription(options.attachmentId, result);
            }
            resolve(result);
          },
          reject,
          timeout: timeoutHandle,
          requestType: 'transcription_only',
          timestamp: Date.now()
        });

      } catch (error: any) {
        reject(new AudioTranslateError(`Failed to send transcription request: ${error.message}`, 'SEND_FAILED'));
      }
    });
  }

  /**
   * Transcrire un attachement existant avec persistance automatique
   */
  async transcribeAttachment(attachmentId: string): Promise<ServiceResult<TranscriptionResult>> {
    try {
      // Vérifier si une transcription existe déjà
      const existing = await this.prisma.messageAudioTranscription.findFirst({
        where: { attachmentId }
      });

      if (existing) {
        return {
          success: true,
          data: {
            text: existing.transcribedText,
            language: existing.language,
            confidence: existing.confidence,
            durationMs: existing.audioDurationMs || 0,
            source: existing.source,
            segments: existing.segments as any,
            attachmentId,
            processingTimeMs: 0
          }
        };
      }

      // Récupérer l'attachement
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, fileUrl: true, mimeType: true, messageId: true }
      });

      if (!attachment) {
        return { success: false, error: 'Attachment not found', errorCode: 'NOT_FOUND' };
      }

      if (!attachment.mimeType?.startsWith('audio/')) {
        return { success: false, error: 'Not an audio attachment', errorCode: 'INVALID_TYPE' };
      }

      // Construire le chemin ABSOLU audio (décoder l'URL encodée)
      const relativePath = `uploads/attachments${decodeURIComponent(attachment.fileUrl.replace('/api/v1/attachments/file', ''))}`;
      const audioPath = path.resolve(process.cwd(), relativePath);

      // Transcrire avec sauvegarde
      const result = await this.transcribeOnly('system', {
        audioPath,
        messageId: attachment.messageId,
        attachmentId,
        saveToDatabase: true
      });

      return { success: true, data: result };

    } catch (error: any) {
      logger.error(`[AudioTranslateService] transcribeAttachment error: ${error.message}`);
      return { success: false, error: error.message, errorCode: 'TRANSCRIPTION_FAILED' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Traduction audio synchrone - attend le résultat
   */
  async translateSync(
    userId: string,
    options: AudioTranslationOptions
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

    const result = await this._sendRequest<VoiceTranslationResult>(request);

    // Sauvegarder en base si demandé
    if (options.saveToDatabase && options.attachmentId) {
      await this._saveTranslationResult(options.attachmentId, result);
    }

    return result;
  }

  /**
   * Traduction audio asynchrone - retourne le jobId immédiatement
   */
  async translateAsync(
    userId: string,
    options: AudioTranslationOptions & {
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
   * Traduire un attachement existant avec persistance automatique
   */
  async translateAttachment(
    attachmentId: string,
    options: {
      targetLanguages: string[];
      generateVoiceClone?: boolean;
    }
  ): Promise<ServiceResult<VoiceTranslationResult>> {
    try {
      // Vérifier les traductions existantes
      const existingTranslations = await this.prisma.messageTranslatedAudio.findMany({
        where: { attachmentId }
      });

      const existingLanguages = new Set(existingTranslations.map(t => t.targetLanguage));
      const languagesToTranslate = options.targetLanguages.filter(lang => !existingLanguages.has(lang));

      // Si toutes les langues sont déjà traduites, retourner le cache
      if (languagesToTranslate.length === 0) {
        const transcription = await this.prisma.messageAudioTranscription.findFirst({
          where: { attachmentId }
        });

        return {
          success: true,
          data: {
            translationId: `cached_${attachmentId}`,
            originalAudio: transcription ? {
              transcription: transcription.transcribedText,
              language: transcription.language,
              durationMs: transcription.audioDurationMs || 0,
              confidence: transcription.confidence
            } : undefined,
            translations: existingTranslations.map(t => ({
              targetLanguage: t.targetLanguage,
              translatedText: t.translatedText,
              audioUrl: t.audioUrl || undefined,
              durationMs: t.durationMs,
              voiceCloned: t.voiceCloned,
              voiceQuality: t.voiceQuality || undefined
            })),
            processingTimeMs: 0
          } as VoiceTranslationResult
        };
      }

      // Récupérer l'attachement
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, fileUrl: true, filePath: true, mimeType: true, uploadedBy: true }
      });

      if (!attachment) {
        return { success: false, error: 'Attachment not found', errorCode: 'NOT_FOUND' };
      }

      if (!attachment.mimeType?.startsWith('audio/')) {
        return { success: false, error: 'Not an audio attachment', errorCode: 'INVALID_TYPE' };
      }

      // Lire le fichier audio (décoder l'URL encodée et convertir en chemin absolu)
      const relativePath = attachment.filePath || `uploads/attachments${decodeURIComponent(attachment.fileUrl.replace('/api/v1/attachments/file', ''))}`;
      const audioPath = path.isAbsolute(relativePath) ? relativePath : path.resolve(process.cwd(), relativePath);

      // Traduire avec sauvegarde
      const result = await this.translateSync(attachment.uploadedBy || 'system', {
        audioPath,
        attachmentId,
        targetLanguages: languagesToTranslate,
        generateVoiceClone: options.generateVoiceClone,
        saveToDatabase: true
      });

      // Merger avec les traductions existantes
      if (existingTranslations.length > 0) {
        const cachedTranslations = existingTranslations
          .filter(t => options.targetLanguages.includes(t.targetLanguage))
          .map(t => ({
            targetLanguage: t.targetLanguage,
            translatedText: t.translatedText,
            audioUrl: t.audioUrl || undefined,
            durationMs: t.durationMs,
            voiceCloned: t.voiceCloned,
            voiceQuality: t.voiceQuality || undefined
          }));
        result.translations = [...result.translations, ...cachedTranslations];
      }

      return { success: true, data: result };

    } catch (error: any) {
      logger.error(`[AudioTranslateService] translateAttachment error: ${error.message}`);
      return { success: false, error: error.message, errorCode: 'TRANSLATION_FAILED' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JOB MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

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

  /**
   * Get voice profile for a user
   */
  async getVoiceProfile(userId: string): Promise<any | null> {
    return this.prisma.userVoiceModel.findUnique({
      where: { userId }
    });
  }

  /**
   * Save voice profile to database
   */
  async saveVoiceProfile(
    userId: string,
    profileData: {
      embedding?: Buffer;
      qualityScore?: number;
      audioCount?: number;
      totalDurationMs?: number;
      fingerprint?: Record<string, any>;
      voiceCharacteristics?: Record<string, any>;
    }
  ): Promise<any> {
    return this.prisma.userVoiceModel.upsert({
      where: { userId },
      create: {
        userId,
        profileId: `vfp_${userId}`,
        embedding: profileData.embedding,
        qualityScore: profileData.qualityScore || 0,
        audioCount: profileData.audioCount || 1,
        totalDurationMs: profileData.totalDurationMs || 0,
        fingerprint: profileData.fingerprint || null,
        voiceCharacteristics: profileData.voiceCharacteristics || null,
        version: 1
      },
      update: {
        embedding: profileData.embedding,
        qualityScore: profileData.qualityScore,
        audioCount: profileData.audioCount,
        totalDurationMs: profileData.totalDurationMs,
        fingerprint: profileData.fingerprint,
        voiceCharacteristics: profileData.voiceCharacteristics,
        updatedAt: new Date()
      }
    });
  }

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
  // DATABASE PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sauvegarder une transcription en base
   */
  private async _saveTranscription(attachmentId: string, result: TranscriptionResult): Promise<void> {
    try {
      // Récupérer le messageId à partir de l'attachment
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { messageId: true }
      });

      if (!attachment?.messageId) {
        logger.warn(`[AudioTranslateService] Cannot save transcription: no messageId for attachment ${attachmentId}`);
        return;
      }

      await this.prisma.messageAudioTranscription.upsert({
        where: { attachmentId },
        create: {
          attachmentId,
          messageId: attachment.messageId,
          transcribedText: result.text,
          language: result.language,
          confidence: result.confidence,
          audioDurationMs: result.durationMs,
          source: result.source,
          segments: (result.segments || []) as any
        },
        update: {
          transcribedText: result.text,
          language: result.language,
          confidence: result.confidence,
          audioDurationMs: result.durationMs,
          source: result.source,
          segments: (result.segments || []) as any
        }
      });
      logger.info(`[AudioTranslateService] Transcription saved for attachment ${attachmentId}`);
    } catch (error: any) {
      logger.error(`[AudioTranslateService] Failed to save transcription: ${error.message}`);
    }
  }

  /**
   * Sauvegarder un résultat de traduction en base
   */
  private async _saveTranslationResult(attachmentId: string, result: VoiceTranslationResult): Promise<void> {
    try {
      // Récupérer le messageId à partir de l'attachment
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { messageId: true }
      });

      if (!attachment?.messageId) {
        logger.warn(`[AudioTranslateService] Cannot save translation: no messageId for attachment ${attachmentId}`);
        return;
      }

      const messageId = attachment.messageId;

      // Sauvegarder la transcription originale
      if (result.originalAudio) {
        await this.prisma.messageAudioTranscription.upsert({
          where: { attachmentId },
          create: {
            attachmentId,
            messageId,
            transcribedText: result.originalAudio.transcription,
            language: result.originalAudio.language,
            confidence: result.originalAudio.confidence,
            audioDurationMs: result.originalAudio.durationMs || 0,
            source: 'whisper'
          },
          update: {
            transcribedText: result.originalAudio.transcription,
            language: result.originalAudio.language,
            confidence: result.originalAudio.confidence,
            audioDurationMs: result.originalAudio.durationMs || 0
          }
        });
      }

      // Sauvegarder les traductions audio
      for (const translation of result.translations) {
        await this.prisma.messageTranslatedAudio.upsert({
          where: {
            attachmentId_targetLanguage: {
              attachmentId,
              targetLanguage: translation.targetLanguage
            }
          },
          create: {
            attachmentId,
            messageId,
            targetLanguage: translation.targetLanguage,
            translatedText: translation.translatedText,
            audioUrl: translation.audioUrl || '',
            audioPath: translation.audioUrl || '', // Use audioUrl as path fallback
            durationMs: translation.durationMs || 0,
            voiceCloned: translation.voiceCloned,
            voiceQuality: translation.voiceQuality || 0
          },
          update: {
            translatedText: translation.translatedText,
            audioUrl: translation.audioUrl || '',
            audioPath: translation.audioUrl || '',
            durationMs: translation.durationMs || 0,
            voiceCloned: translation.voiceCloned,
            voiceQuality: translation.voiceQuality || 0
          }
        });
      }

      logger.info(`[AudioTranslateService] Translation saved for attachment ${attachmentId} (${result.translations.length} languages)`);
    } catch (error: any) {
      logger.error(`[AudioTranslateService] Failed to save translation: ${error.message}`);
    }
  }

  /**
   * Récupérer un attachement avec sa transcription et ses traductions
   */
  async getAttachmentWithTranscription(attachmentId: string): Promise<{
    attachment: any;
    transcription: any | null;
    translatedAudios: any[];
  } | null> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId }
    });

    if (!attachment) return null;

    const transcription = await this.prisma.messageAudioTranscription.findFirst({
      where: { attachmentId }
    });

    const translatedAudios = await this.prisma.messageTranslatedAudio.findMany({
      where: { attachmentId }
    });

    return { attachment, transcription, translatedAudios };
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
    const timeout = DEFAULT_TIMEOUT * 2;
    let cleaned = 0;

    for (const [taskId, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > timeout) {
        clearTimeout(pending.timeout);
        pending.reject(new AudioTranslateError('Request cleanup timeout', 'CLEANUP_TIMEOUT'));
        this.pendingRequests.delete(taskId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.warn(`[AudioTranslateService] Cleaned up ${cleaned} timed out requests`);
    }

    return cleaned;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AudioTranslateError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AudioTranslateError';
    this.code = code;
  }
}

// Singleton instance
let audioTranslateServiceInstance: AudioTranslateService | null = null;

export function getAudioTranslateService(prisma: PrismaClient, zmqClient: ZMQTranslationClient): AudioTranslateService {
  if (!audioTranslateServiceInstance) {
    audioTranslateServiceInstance = new AudioTranslateService(prisma, zmqClient);
  }
  return audioTranslateServiceInstance;
}

export function resetAudioTranslateService(): void {
  audioTranslateServiceInstance = null;
}
