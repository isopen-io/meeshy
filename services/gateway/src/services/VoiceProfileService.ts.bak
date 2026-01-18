/**
 * Voice Profile Service
 *
 * Handles voice profile management:
 * - Consent workflow (GDPR compliant)
 * - Profile registration via attachmentId OR direct audio
 * - Profile calibration (add audio samples)
 * - Profile update with fingerprint verification
 * - Profile deletion
 *
 * Database operations (User, UserVoiceModel) are handled here.
 * Audio processing is delegated to Translator via ZMQ.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import {
  ZMQTranslationClient,
  VoiceProfileAnalyzeRequest,
  VoiceProfileVerifyRequest,
  VoiceProfileAnalyzeResult,
  VoiceProfileVerifyResult,
  VoiceProfileEvent
} from './ZmqTranslationClient';
import {
  VoiceProfileConsentRequest,
  VoiceProfileConsentStatus,
  VoiceProfileDetails as SharedVoiceProfileDetails,
  VoiceProfileTranscription,
  BrowserTranscription,
  VoiceProfileSegment,
  ServiceResult,
  VoiceCloningUserSettings,
  DEFAULT_VOICE_CLONING_SETTINGS,
  VoicePreviewSample
} from '@meeshy/shared/types/voice-api';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Minimum audio duration for dedicated profile registration (10 seconds)
const MIN_PROFILE_AUDIO_DURATION_MS = 10000;

// Profile expiration
const MINOR_PROFILE_EXPIRATION_DAYS = 60;  // 2 months for <18
const STANDARD_PROFILE_EXPIRATION_DAYS = 90;  // 3 months standard

// Response timeout for ZMQ requests
const ZMQ_RESPONSE_TIMEOUT_MS = 60000;  // 60 seconds

// ═══════════════════════════════════════════════════════════════════════════
// TYPES - Re-export from shared + local extensions
// ═══════════════════════════════════════════════════════════════════════════

// Re-export shared types for consumers of this service
export type { VoiceProfileConsentRequest, VoiceProfileConsentStatus, ServiceResult };

// Alias for backward compatibility (internal use with Date instead of string)
export interface ConsentRequest extends VoiceProfileConsentRequest {}

/**
 * Audio input - either from attachment or direct upload
 */
export interface AudioInput {
  // Option 1: From existing attachment
  attachmentId?: string;

  // Option 2: Direct audio data
  audioData?: string;  // base64 encoded audio
  audioFormat?: string;  // wav, mp3, ogg, webm
}

export interface RegisterProfileRequest extends AudioInput {
  /** Request transcription from server (Whisper) - ignored if browserTranscription is provided */
  includeTranscription?: boolean;
  /** Browser-side transcription to use instead of server transcription */
  browserTranscription?: BrowserTranscription;
  /**
   * Voice cloning settings to save with the profile
   * These settings will be persisted in UserFeature and used for future voice cloning
   */
  voiceCloningSettings?: Partial<VoiceCloningUserSettings>;
  /**
   * Generate voice previews in different languages
   * Previews are returned in the response and should be saved client-side (IndexedDB)
   */
  generateVoicePreviews?: boolean;
  /**
   * Target languages for voice previews (e.g., ['en', 'fr', 'es'])
   * Default: ['en', 'es', 'fr'] if not specified and generateVoicePreviews=true
   */
  previewLanguages?: string[];
  /**
   * Source text for previews (optional)
   * Default: uses the transcription from the recorded audio
   */
  previewText?: string;
}

export interface UpdateProfileRequest extends AudioInput {}

export interface CalibrateProfileRequest extends AudioInput {
  // Additional calibration options
  replaceExisting?: boolean;  // Replace profile instead of adding samples
}

// Type aligné avec SharedVoiceProfileDetails (utilise strings ISO pour les dates)
export interface VoiceProfileDetails extends SharedVoiceProfileDetails {
  transcription?: VoiceProfileTranscription;  // Included if requested
  /** Voice previews in different languages - to be saved in IndexedDB by client */
  voicePreviews?: VoicePreviewSample[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class VoiceProfileService extends EventEmitter {
  private prisma: PrismaClient;
  private zmqClient: ZMQTranslationClient;
  private uploadBasePath: string;
  private pendingRequests: Map<string, {
    resolve: (value: VoiceProfileEvent) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(prisma: PrismaClient, zmqClient: ZMQTranslationClient) {
    super();
    this.prisma = prisma;
    this.zmqClient = zmqClient;
    this.uploadBasePath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads', 'attachments');

    // Listen for ZMQ events (camelCase event names from ZMQ client)
    this.zmqClient.on('voiceProfileAnalyzeResult', (event: VoiceProfileAnalyzeResult) => {
      this.handleZmqResponse(event);
    });
    this.zmqClient.on('voiceProfileVerifyResult', (event: VoiceProfileVerifyResult) => {
      this.handleZmqResponse(event);
    });
    this.zmqClient.on('voiceProfileCompareResult', (event: VoiceProfileEvent) => {
      this.handleZmqResponse(event);
    });
    this.zmqClient.on('voiceProfileError', (event: VoiceProfileEvent) => {
      this.handleZmqResponse(event);
    });
  }

  private handleZmqResponse(event: VoiceProfileEvent) {
    const requestId = event.request_id;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(event);
    }
  }

  private async waitForZmqResponse(requestId: string): Promise<VoiceProfileEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('ZMQ request timeout'));
      }, ZMQ_RESPONSE_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO INPUT RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve audio input to base64 data and format
   * Supports both attachmentId and direct audio data
   */
  private async resolveAudioInput(
    userId: string,
    input: AudioInput
  ): Promise<{ audioData: string; audioFormat: string }> {
    // Option 1: Direct audio data
    if (input.audioData) {
      if (!input.audioFormat) {
        throw new Error('audioFormat is required when providing audioData directly');
      }
      return {
        audioData: input.audioData,
        audioFormat: input.audioFormat
      };
    }

    // Option 2: From attachment
    if (input.attachmentId) {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: input.attachmentId },
        include: {
          message: {
            select: {
              conversationId: true,
              senderId: true
            }
          }
        }
      });

      if (!attachment) {
        throw new Error('Attachment not found');
      }

      // Verify it's an audio file
      if (!attachment.mimeType.startsWith('audio/')) {
        throw new Error(`Invalid attachment type: ${attachment.mimeType}. Expected audio file.`);
      }

      // Verify user has access
      const hasAccess = await this.verifyAttachmentAccess(userId, attachment);
      if (!hasAccess) {
        throw new Error('Access denied to this attachment');
      }

      // Read audio file
      const fullPath = path.join(this.uploadBasePath, attachment.filePath);
      const audioBuffer = await fs.readFile(fullPath);
      const audioData = audioBuffer.toString('base64');

      // Determine format from mime type
      const audioFormat = this.mimeTypeToFormat(attachment.mimeType);

      return { audioData, audioFormat };
    }

    throw new Error('Either attachmentId or audioData must be provided');
  }

  private async verifyAttachmentAccess(userId: string, attachment: any): Promise<boolean> {
    // User uploaded the attachment
    if (attachment.uploadedBy === userId) {
      return true;
    }

    // User is part of the conversation
    if (attachment.message?.conversationId) {
      const member = await this.prisma.conversationMember.findFirst({
        where: {
          conversationId: attachment.message.conversationId,
          userId: userId,
          isActive: true
        }
      });
      return !!member;
    }

    return false;
  }

  private mimeTypeToFormat(mimeType: string): string {
    const formats: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/flac': 'flac'
    };
    return formats[mimeType] || 'wav';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSENT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async updateConsent(
    userId: string,
    consent: ConsentRequest
  ): Promise<ServiceResult<{ consentUpdated: boolean }>> {
    try {
      console.log('[VoiceProfileService] updateConsent called:', { userId, consent });
      const now = new Date();
      const userFeatureData: any = {};
      const userData: any = {};

      // Récupérer l'état actuel pour gérer les dépendances
      const existingFeature = await this.prisma.userFeature.findUnique({
        where: { userId },
        select: {
          dataProcessingConsentAt: true,
          voiceDataConsentAt: true,
          voiceProfileConsentAt: true,
        }
      });
      console.log('[VoiceProfileService] Existing feature:', existingFeature);

      // Les consentements vocaux sont dans UserFeature
      // IMPORTANT: Respecter la chaîne de dépendances:
      // dataProcessingConsentAt → voiceDataConsentAt → voiceProfileConsentAt → voiceCloningEnabledAt
      if (consent.voiceRecordingConsent !== undefined) {
        if (consent.voiceRecordingConsent) {
          // Activer voiceProfileConsentAt et ses dépendances
          userFeatureData.voiceProfileConsentAt = now;
          // Activer automatiquement les dépendances si pas déjà activées
          if (!existingFeature?.voiceDataConsentAt) {
            userFeatureData.voiceDataConsentAt = now;
          }
          if (!existingFeature?.dataProcessingConsentAt) {
            userFeatureData.dataProcessingConsentAt = now;
          }
        } else {
          // Désactiver seulement voiceProfileConsentAt (ne pas toucher aux dépendances)
          userFeatureData.voiceProfileConsentAt = null;
        }
      }

      if (consent.voiceCloningConsent !== undefined) {
        if (consent.voiceCloningConsent) {
          userFeatureData.voiceCloningEnabledAt = now;
          // S'assurer que voiceProfileConsentAt est activé (dépendance)
          if (!existingFeature?.voiceProfileConsentAt && !userFeatureData.voiceProfileConsentAt) {
            userFeatureData.voiceProfileConsentAt = now;
          }
          // Et ses dépendances
          if (!existingFeature?.voiceDataConsentAt && !userFeatureData.voiceDataConsentAt) {
            userFeatureData.voiceDataConsentAt = now;
          }
          if (!existingFeature?.dataProcessingConsentAt && !userFeatureData.dataProcessingConsentAt) {
            userFeatureData.dataProcessingConsentAt = now;
          }
        } else {
          userFeatureData.voiceCloningEnabledAt = null;
        }
      }

      // birthDate est sur User, ageVerifiedAt est sur UserFeature
      if (consent.birthDate) {
        userData.birthDate = new Date(consent.birthDate);
        userFeatureData.ageVerifiedAt = now;
      }

      if (Object.keys(userFeatureData).length === 0 && Object.keys(userData).length === 0) {
        return {
          success: false,
          error: 'No consent data provided',
          errorCode: 'NO_CONSENT_DATA'
        };
      }

      // Mettre à jour UserFeature (créer si n'existe pas)
      if (Object.keys(userFeatureData).length > 0) {
        console.log('[VoiceProfileService] Upserting userFeature with:', userFeatureData);
        const result = await this.prisma.userFeature.upsert({
          where: { userId },
          update: userFeatureData,
          create: {
            userId,
            ...userFeatureData
          }
        });
        console.log('[VoiceProfileService] Upsert result:', {
          voiceProfileConsentAt: result.voiceProfileConsentAt,
          voiceDataConsentAt: result.voiceDataConsentAt,
          dataProcessingConsentAt: result.dataProcessingConsentAt,
          voiceCloningEnabledAt: result.voiceCloningEnabledAt
        });
      }

      // Mettre à jour User si nécessaire (birthDate)
      if (Object.keys(userData).length > 0) {
        await this.prisma.user.update({
          where: { id: userId },
          data: userData
        });
      }

      console.log('[VoiceProfileService] Consent updated successfully');
      return {
        success: true,
        data: { consentUpdated: true }
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error updating consent:', error);
      return {
        success: false,
        error: 'Failed to update consent',
        errorCode: 'CONSENT_UPDATE_FAILED'
      };
    }
  }

  async getConsentStatus(userId: string): Promise<ServiceResult<{
    hasVoiceRecordingConsent: boolean;
    hasVoiceCloningConsent: boolean;
    hasAgeVerification: boolean;
    birthDate: string | null;
    // Timestamps ISO pour compatibilité avec VoiceProfileConsentStatus du frontend
    voiceRecordingConsentAt: string | null;
    voiceCloningEnabledAt: string | null;
    ageVerificationConsentAt: string | null;
  }>> {
    try {
      console.log('[VoiceProfileService] getConsentStatus called for userId:', userId);
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          birthDate: true,
          userFeature: {
            select: {
              voiceProfileConsentAt: true,
              voiceCloningEnabledAt: true,
              ageVerifiedAt: true
            }
          }
        }
      });

      if (!user) {
        console.log('[VoiceProfileService] User not found');
        return {
          success: false,
          error: 'User not found',
          errorCode: 'USER_NOT_FOUND'
        };
      }

      console.log('[VoiceProfileService] User feature from DB:', user.userFeature);

      // Helper pour convertir Date en string ISO ou null
      const toISOString = (date: Date | null | undefined): string | null => {
        return date ? date.toISOString() : null;
      };

      const result = {
        hasVoiceRecordingConsent: !!user.userFeature?.voiceProfileConsentAt,
        hasVoiceCloningConsent: !!user.userFeature?.voiceCloningEnabledAt,
        hasAgeVerification: !!user.userFeature?.ageVerifiedAt,
        birthDate: toISOString(user.birthDate),
        // Timestamps ISO pour le frontend
        voiceRecordingConsentAt: toISOString(user.userFeature?.voiceProfileConsentAt),
        voiceCloningEnabledAt: toISOString(user.userFeature?.voiceCloningEnabledAt),
        ageVerificationConsentAt: toISOString(user.userFeature?.ageVerifiedAt)
      };

      console.log('[VoiceProfileService] Returning consent status:', result);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error getting consent status:', error);
      return {
        success: false,
        error: 'Failed to get consent status',
        errorCode: 'CONSENT_STATUS_FAILED'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  async registerProfile(
    userId: string,
    request: RegisterProfileRequest
  ): Promise<ServiceResult<VoiceProfileDetails>> {
    try {
      // Check consent
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userFeature: {
            select: {
              voiceProfileConsentAt: true,
              voiceCloningEnabledAt: true
            }
          },
          voiceModel: true
        }
      });

      if (!user) {
        return { success: false, error: 'User not found', errorCode: 'USER_NOT_FOUND' };
      }

      if (!user.userFeature?.voiceProfileConsentAt) {
        return { success: false, error: 'Voice recording consent required', errorCode: 'CONSENT_REQUIRED' };
      }

      // Check if profile already exists
      if (user.voiceModel) {
        return { success: false, error: 'Profile already exists. Use update or calibrate endpoint.', errorCode: 'PROFILE_EXISTS' };
      }

      // Resolve audio input (attachmentId or direct audio)
      const { audioData, audioFormat } = await this.resolveAudioInput(userId, request);

      // Check if browser transcription is provided - if so, skip server transcription
      const hasBrowserTranscription = !!request.browserTranscription?.text;
      const shouldRequestServerTranscription = request.includeTranscription && !hasBrowserTranscription;

      // Send audio to Translator for analysis
      const requestId = randomUUID();
      const zmqRequest: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: requestId,
        user_id: userId,
        audio_data: audioData,
        audio_format: audioFormat,
        is_update: false,
        include_transcription: shouldRequestServerTranscription,
        // Voice preview options
        generate_previews: request.generateVoicePreviews,
        preview_languages: request.previewLanguages,
        preview_text: request.previewText || request.browserTranscription?.text
      };

      await this.zmqClient.sendVoiceProfileRequest(zmqRequest);

      // Wait for response
      const response = await this.waitForZmqResponse(requestId) as VoiceProfileAnalyzeResult;

      if (!response.success) {
        return { success: false, error: response.error || 'Analysis failed', errorCode: 'ANALYSIS_FAILED' };
      }

      // Calculate expiration based on age
      const expiresAt = this.calculateExpirationDate(user.birthDate);

      // Decode embedding binary from base64 (for MongoDB storage)
      // Prisma's Bytes type expects Uint8Array<ArrayBuffer>, so we use a type assertion
      let embeddingBuffer: Uint8Array<ArrayBuffer> | null = null;
      if (response.embedding_data) {
        const buffer = Buffer.from(response.embedding_data, 'base64');
        embeddingBuffer = new Uint8Array(buffer).slice() as Uint8Array<ArrayBuffer>;
      }

      // Save to database
      const voiceModel = await this.prisma.userVoiceModel.create({
        data: {
          userId,
          profileId: response.profile_id || `vp_${userId.substring(0, 12)}`,
          embedding: embeddingBuffer,  // Binary embedding stored directly in MongoDB
          embeddingDimension: response.embedding_dimension || 256,
          embeddingPath: response.embedding_path || '',  // Legacy, kept for backwards compatibility
          audioCount: 1,
          totalDurationMs: response.audio_duration_ms || 0,
          qualityScore: response.quality_score || 0,
          version: 1,
          voiceCharacteristics: response.voice_characteristics || null,
          fingerprint: response.fingerprint || null,
          signatureShort: response.signature_short || null,
          nextRecalibrationAt: expiresAt
        }
      });

      // Save voice cloning settings to UserFeature if provided
      if (request.voiceCloningSettings) {
        const cloningSettings = request.voiceCloningSettings;
        const updateData: Record<string, number | string> = {};

        // Validate and apply each setting with bounds checking
        if (cloningSettings.voiceCloningExaggeration !== undefined) {
          updateData.voiceCloningExaggeration = Math.max(0, Math.min(1, cloningSettings.voiceCloningExaggeration));
        }
        if (cloningSettings.voiceCloningCfgWeight !== undefined) {
          updateData.voiceCloningCfgWeight = Math.max(0, Math.min(1, cloningSettings.voiceCloningCfgWeight));
        }
        if (cloningSettings.voiceCloningTemperature !== undefined) {
          updateData.voiceCloningTemperature = Math.max(0.1, Math.min(2, cloningSettings.voiceCloningTemperature));
        }
        if (cloningSettings.voiceCloningTopP !== undefined) {
          updateData.voiceCloningTopP = Math.max(0, Math.min(1, cloningSettings.voiceCloningTopP));
        }
        if (cloningSettings.voiceCloningQualityPreset !== undefined) {
          const validPresets = ['fast', 'balanced', 'high_quality'];
          if (validPresets.includes(cloningSettings.voiceCloningQualityPreset)) {
            updateData.voiceCloningQualityPreset = cloningSettings.voiceCloningQualityPreset;
          }
        }

        if (Object.keys(updateData).length > 0) {
          await this.prisma.userFeature.update({
            where: { userId },
            data: updateData
          });
          console.log('[VoiceProfileService] Saved voice cloning settings:', updateData);
        }
      }

      // Format profile details
      const profileDetails = this.formatProfileDetails(voiceModel, user);

      // Add transcription - prefer browser transcription if provided, else use server transcription
      if (hasBrowserTranscription && request.browserTranscription) {
        // Use browser-provided transcription
        const browserTx = request.browserTranscription;
        profileDetails.transcription = {
          text: browserTx.text,
          language: browserTx.language,
          confidence: browserTx.confidence,
          durationMs: browserTx.durationMs,
          source: 'browser',
          segments: browserTx.segments,
          processingTimeMs: 0, // No server processing time
          browserDetails: browserTx.browserDetails
        };
      } else if (response.transcription) {
        // Use server transcription (Whisper)
        // Cast source to VoiceProfileTranscriptionSource - server returns 'whisper' which is valid
        const serverSource = (response.transcription.source || 'whisper') as import('@meeshy/shared/types/voice-api').VoiceProfileTranscriptionSource;
        profileDetails.transcription = {
          text: response.transcription.text,
          language: response.transcription.language,
          confidence: response.transcription.confidence,
          durationMs: response.transcription.duration_ms,
          source: serverSource,
          model: response.transcription.model,
          segments: response.transcription.segments?.map(seg => ({
            text: seg.text,
            startMs: seg.start_ms,
            endMs: seg.end_ms,
            confidence: seg.confidence
          })),
          processingTimeMs: response.transcription.processing_time_ms
        };
      }

      // Add voice previews if generated
      if (response.voice_previews && response.voice_previews.length > 0) {
        profileDetails.voicePreviews = response.voice_previews.map(preview => ({
          language: preview.language,
          originalText: preview.original_text,
          translatedText: preview.translated_text,
          audioBase64: preview.audio_base64,
          audioFormat: preview.audio_format,
          durationMs: preview.duration_ms,
          generatedAt: preview.generated_at
        }));
        console.log(`[VoiceProfileService] Generated ${profileDetails.voicePreviews.length} voice previews`);
      }

      return {
        success: true,
        data: profileDetails
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error registering profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
        errorCode: 'REGISTRATION_FAILED'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE CALIBRATION (Add audio samples)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add audio samples to calibrate/improve the voice profile
   * This allows users to progressively improve their profile quality
   */
  async calibrateProfile(
    userId: string,
    request: CalibrateProfileRequest
  ): Promise<ServiceResult<VoiceProfileDetails>> {
    try {
      // Get existing profile
      const voiceModel = await this.prisma.userVoiceModel.findUnique({
        where: { userId },
        include: {
          user: {
            include: {
              userFeature: {
                select: {
                  voiceProfileConsentAt: true,
                  voiceCloningEnabledAt: true,
                  ageVerifiedAt: true
                }
              }
            }
          }
        }
      });

      if (!voiceModel) {
        return { success: false, error: 'Profile not found. Register first.', errorCode: 'PROFILE_NOT_FOUND' };
      }

      // Resolve audio input
      const { audioData, audioFormat } = await this.resolveAudioInput(userId, request);

      // Send audio to Translator for analysis
      const requestId = randomUUID();
      const zmqRequest: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: requestId,
        user_id: userId,
        audio_data: audioData,
        audio_format: audioFormat,
        is_update: !request.replaceExisting,
        existing_fingerprint: request.replaceExisting ? undefined : (voiceModel.fingerprint as Record<string, any> || undefined)
      };

      await this.zmqClient.sendVoiceProfileRequest(zmqRequest);

      // Wait for response
      const response = await this.waitForZmqResponse(requestId) as VoiceProfileAnalyzeResult;

      if (!response.success) {
        return { success: false, error: response.error || 'Calibration failed', errorCode: 'CALIBRATION_FAILED' };
      }

      // Calculate new expiration
      const expiresAt = this.calculateExpirationDate(voiceModel.user.birthDate);

      // Decode embedding binary from base64 (for MongoDB storage)
      // Prisma's Bytes type expects Uint8Array<ArrayBuffer>, so we use a type assertion
      let embeddingBuffer: Uint8Array<ArrayBuffer> | null = null;
      if (response.embedding_data) {
        const buffer = Buffer.from(response.embedding_data, 'base64');
        embeddingBuffer = new Uint8Array(buffer).slice() as Uint8Array<ArrayBuffer>;
      }

      // Update database
      const updateData: any = {
        qualityScore: response.quality_score || voiceModel.qualityScore,
        version: voiceModel.version + 1,
        voiceCharacteristics: response.voice_characteristics || voiceModel.voiceCharacteristics,
        fingerprint: response.fingerprint || voiceModel.fingerprint,
        signatureShort: response.signature_short || voiceModel.signatureShort,
        nextRecalibrationAt: expiresAt
      };

      // Update embedding if provided
      if (embeddingBuffer) {
        updateData.embedding = embeddingBuffer;
        updateData.embeddingDimension = response.embedding_dimension || 256;
      }

      if (request.replaceExisting) {
        // Replace: reset counts
        updateData.audioCount = 1;
        updateData.totalDurationMs = response.audio_duration_ms || 0;
      } else {
        // Add: increment counts
        updateData.audioCount = voiceModel.audioCount + 1;
        updateData.totalDurationMs = voiceModel.totalDurationMs + (response.audio_duration_ms || 0);
      }

      const updated = await this.prisma.userVoiceModel.update({
        where: { userId },
        data: updateData
      });

      return {
        success: true,
        data: this.formatProfileDetails(updated, voiceModel.user)
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error calibrating profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Calibration failed',
        errorCode: 'CALIBRATION_FAILED'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE UPDATE (with fingerprint verification)
  // ═══════════════════════════════════════════════════════════════════════════

  async updateProfile(
    userId: string,
    request: UpdateProfileRequest
  ): Promise<ServiceResult<VoiceProfileDetails>> {
    // Update is essentially calibration without replacement
    return this.calibrateProfile(userId, { ...request, replaceExisting: false });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  async getProfile(userId: string): Promise<ServiceResult<VoiceProfileDetails>> {
    try {
      const voiceModel = await this.prisma.userVoiceModel.findUnique({
        where: { userId },
        include: {
          user: {
            include: {
              userFeature: {
                select: {
                  voiceProfileConsentAt: true,
                  voiceCloningEnabledAt: true,
                  ageVerifiedAt: true
                }
              }
            }
          }
        }
      });

      if (!voiceModel) {
        return { success: false, error: 'Profile not found', errorCode: 'PROFILE_NOT_FOUND' };
      }

      return {
        success: true,
        data: this.formatProfileDetails(voiceModel, voiceModel.user)
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error getting profile:', error);
      return {
        success: false,
        error: 'Failed to get profile',
        errorCode: 'GET_PROFILE_FAILED'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE DELETION
  // ═══════════════════════════════════════════════════════════════════════════

  async deleteProfile(userId: string): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      // Delete voice model
      await this.prisma.userVoiceModel.delete({
        where: { userId }
      });

      // Reset consent fields in UserFeature
      await this.prisma.userFeature.update({
        where: { userId },
        data: {
          voiceProfileConsentAt: null,
          voiceCloningEnabledAt: null
        }
      });

      return {
        success: true,
        data: { deleted: true }
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error deleting profile:', error);
      return {
        success: false,
        error: 'Failed to delete profile',
        errorCode: 'DELETE_FAILED'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private formatProfileDetails(voiceModel: any, user: any): VoiceProfileDetails {
    const now = new Date();
    const needsCalibration = voiceModel.nextRecalibrationAt
      ? voiceModel.nextRecalibrationAt < now
      : false;

    // Les consentements sont dans UserFeature, pas dans User
    const userFeature = user.userFeature;

    // Helper pour convertir Date en string ISO ou null
    const toISOString = (date: Date | null | undefined): string | null => {
      return date ? date.toISOString() : null;
    };

    return {
      profileId: voiceModel.profileId || null,
      userId: voiceModel.userId,
      exists: true, // Si on arrive ici, le profil existe
      qualityScore: voiceModel.qualityScore,
      audioDurationMs: voiceModel.totalDurationMs,
      audioCount: voiceModel.audioCount,
      voiceCharacteristics: voiceModel.voiceCharacteristics as Record<string, unknown> | null,
      signatureShort: voiceModel.signatureShort,
      version: voiceModel.version,
      createdAt: toISOString(voiceModel.createdAt),
      updatedAt: toISOString(voiceModel.updatedAt),
      expiresAt: toISOString(voiceModel.nextRecalibrationAt),
      needsCalibration,
      consentStatus: {
        voiceRecordingConsentAt: toISOString(userFeature?.voiceProfileConsentAt),
        voiceCloningEnabledAt: toISOString(userFeature?.voiceCloningEnabledAt),
        ageVerificationConsentAt: toISOString(userFeature?.ageVerifiedAt)
      }
    };
  }

  private calculateExpirationDate(birthDate: Date | null): Date {
    const now = new Date();

    if (birthDate) {
      const age = this.calculateAge(birthDate);
      if (age < 18) {
        // Minors: 2 months expiration
        now.setDate(now.getDate() + MINOR_PROFILE_EXPIRATION_DAYS);
        return now;
      }
    }

    // Standard: 3 months expiration
    now.setDate(now.getDate() + STANDARD_PROFILE_EXPIRATION_DAYS);
    return now;
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }
}
