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
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsentRequest {
  voiceRecordingConsent: boolean;
  voiceCloningConsent: boolean;
  birthDate?: string;  // ISO date string for age verification
}

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

export interface RegisterProfileRequest extends AudioInput {}

export interface UpdateProfileRequest extends AudioInput {}

export interface CalibrateProfileRequest extends AudioInput {
  // Additional calibration options
  replaceExisting?: boolean;  // Replace profile instead of adding samples
}

export interface VoiceProfileDetails {
  profileId: string;
  userId: string;
  qualityScore: number;
  audioDurationMs: number;
  audioCount: number;
  voiceCharacteristics: Record<string, any> | null;
  signatureShort: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  needsCalibration: boolean;
  consentStatus: {
    voiceRecordingConsentAt: Date | null;
    voiceCloningEnabledAt: Date | null;
    ageVerificationConsentAt: Date | null;
  };
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
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
      const now = new Date();
      const updateData: any = {};

      if (consent.voiceRecordingConsent) {
        updateData.voiceProfileConsentAt = now;
      }

      if (consent.voiceCloningConsent) {
        updateData.voiceCloningEnabledAt = now;
      }

      if (consent.birthDate) {
        updateData.birthDate = new Date(consent.birthDate);
        updateData.ageVerificationConsentAt = now;
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: false,
          error: 'No consent data provided',
          errorCode: 'NO_CONSENT_DATA'
        };
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: updateData
      });

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
    birthDate: Date | null;
  }>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          voiceProfileConsentAt: true,
          voiceCloningEnabledAt: true,
          ageVerificationConsentAt: true,
          birthDate: true
        }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          errorCode: 'USER_NOT_FOUND'
        };
      }

      return {
        success: true,
        data: {
          hasVoiceRecordingConsent: !!user.voiceProfileConsentAt,
          hasVoiceCloningConsent: !!user.voiceCloningEnabledAt,
          hasAgeVerification: !!user.ageVerificationConsentAt,
          birthDate: user.birthDate
        }
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
        select: {
          voiceProfileConsentAt: true,
          voiceCloningEnabledAt: true,
          birthDate: true,
          voiceModel: true
        }
      });

      if (!user) {
        return { success: false, error: 'User not found', errorCode: 'USER_NOT_FOUND' };
      }

      if (!user.voiceProfileConsentAt) {
        return { success: false, error: 'Voice recording consent required', errorCode: 'CONSENT_REQUIRED' };
      }

      // Check if profile already exists
      if (user.voiceModel) {
        return { success: false, error: 'Profile already exists. Use update or calibrate endpoint.', errorCode: 'PROFILE_EXISTS' };
      }

      // Resolve audio input (attachmentId or direct audio)
      const { audioData, audioFormat } = await this.resolveAudioInput(userId, request);

      // Send audio to Translator for analysis
      const requestId = randomUUID();
      const zmqRequest: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: requestId,
        user_id: userId,
        audio_data: audioData,
        audio_format: audioFormat,
        is_update: false
      };

      await this.zmqClient.sendVoiceProfileRequest(zmqRequest);

      // Wait for response
      const response = await this.waitForZmqResponse(requestId) as VoiceProfileAnalyzeResult;

      if (!response.success) {
        return { success: false, error: response.error || 'Analysis failed', errorCode: 'ANALYSIS_FAILED' };
      }

      // Calculate expiration based on age
      const expiresAt = this.calculateExpirationDate(user.birthDate);

      // Save to database
      const voiceModel = await this.prisma.userVoiceModel.create({
        data: {
          userId,
          profileId: response.profile_id || `vp_${userId.substring(0, 12)}`,
          embeddingPath: response.embedding_path || '',
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

      return {
        success: true,
        data: this.formatProfileDetails(voiceModel, user)
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
        include: { user: true }
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

      // Update database
      const updateData: any = {
        qualityScore: response.quality_score || voiceModel.qualityScore,
        version: voiceModel.version + 1,
        voiceCharacteristics: response.voice_characteristics || voiceModel.voiceCharacteristics,
        fingerprint: response.fingerprint || voiceModel.fingerprint,
        signatureShort: response.signature_short || voiceModel.signatureShort,
        nextRecalibrationAt: expiresAt
      };

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
        include: { user: true }
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

      // Reset consent fields
      await this.prisma.user.update({
        where: { id: userId },
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

    return {
      profileId: voiceModel.profileId || '',
      userId: voiceModel.userId,
      qualityScore: voiceModel.qualityScore,
      audioDurationMs: voiceModel.totalDurationMs,
      audioCount: voiceModel.audioCount,
      voiceCharacteristics: voiceModel.voiceCharacteristics as Record<string, any> | null,
      signatureShort: voiceModel.signatureShort,
      version: voiceModel.version,
      createdAt: voiceModel.createdAt,
      updatedAt: voiceModel.updatedAt,
      expiresAt: voiceModel.nextRecalibrationAt,
      needsCalibration,
      consentStatus: {
        voiceRecordingConsentAt: user.voiceProfileConsentAt,
        voiceCloningEnabledAt: user.voiceCloningEnabledAt,
        ageVerificationConsentAt: user.ageVerificationConsentAt
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
