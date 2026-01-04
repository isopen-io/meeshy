/**
 * Voice Profile Service
 *
 * Handles voice profile management:
 * - Consent workflow
 * - Profile registration (sends audio to Translator via ZMQ)
 * - Profile update with fingerprint verification
 * - Profile deletion
 *
 * Database operations (User, UserVoiceModel) are handled here.
 * Audio processing is delegated to Translator via ZMQ.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  ZMQTranslationClient,
  VoiceProfileAnalyzeRequest,
  VoiceProfileVerifyRequest,
  VoiceProfileAnalyzeResult,
  VoiceProfileVerifyResult,
  VoiceProfileEvent
} from './zmq-translation-client';

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

export interface RegisterProfileRequest {
  audioData: string;  // base64 encoded audio
  audioFormat: string;  // wav, mp3, ogg
}

export interface UpdateProfileRequest {
  audioData: string;
  audioFormat: string;
}

export interface VoiceProfileDetails {
  profileId: string;
  userId: string;
  qualityScore: number;
  audioDurationMs: number;
  voiceCharacteristics: Record<string, any> | null;
  signatureShort: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
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
  private pendingRequests: Map<string, {
    resolve: (value: VoiceProfileEvent) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(prisma: PrismaClient, zmqClient: ZMQTranslationClient) {
    super();
    this.prisma = prisma;
    this.zmqClient = zmqClient;

    // Listen for ZMQ events
    this.zmqClient.on('voice_profile_analyze_result', (event: VoiceProfileAnalyzeResult) => {
      this.handleZmqResponse(event);
    });
    this.zmqClient.on('voice_profile_verify_result', (event: VoiceProfileVerifyResult) => {
      this.handleZmqResponse(event);
    });
    this.zmqClient.on('voice_profile_error', (event: VoiceProfileEvent) => {
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
        return { success: false, error: 'Profile already exists. Use update endpoint.', errorCode: 'PROFILE_EXISTS' };
      }

      // Send audio to Translator for analysis
      const requestId = randomUUID();
      const zmqRequest: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: requestId,
        user_id: userId,
        audio_data: request.audioData,
        audio_format: request.audioFormat,
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
        data: {
          profileId: voiceModel.profileId || '',
          userId: voiceModel.userId,
          qualityScore: voiceModel.qualityScore,
          audioDurationMs: voiceModel.totalDurationMs,
          voiceCharacteristics: voiceModel.voiceCharacteristics as Record<string, any> | null,
          signatureShort: voiceModel.signatureShort,
          version: voiceModel.version,
          createdAt: voiceModel.createdAt,
          updatedAt: voiceModel.updatedAt,
          expiresAt: voiceModel.nextRecalibrationAt,
          consentStatus: {
            voiceRecordingConsentAt: user.voiceProfileConsentAt,
            voiceCloningEnabledAt: user.voiceCloningEnabledAt,
            ageVerificationConsentAt: null
          }
        }
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
  // PROFILE UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  async updateProfile(
    userId: string,
    profileId: string,
    request: UpdateProfileRequest
  ): Promise<ServiceResult<VoiceProfileDetails>> {
    try {
      // Get existing profile
      const voiceModel = await this.prisma.userVoiceModel.findUnique({
        where: { userId },
        include: { user: true }
      });

      if (!voiceModel) {
        return { success: false, error: 'Profile not found', errorCode: 'PROFILE_NOT_FOUND' };
      }

      if (voiceModel.profileId !== profileId) {
        return { success: false, error: 'Profile ID mismatch', errorCode: 'PROFILE_MISMATCH' };
      }

      // Send audio to Translator for analysis with fingerprint verification
      const requestId = randomUUID();
      const zmqRequest: VoiceProfileAnalyzeRequest = {
        type: 'voice_profile_analyze',
        request_id: requestId,
        user_id: userId,
        audio_data: request.audioData,
        audio_format: request.audioFormat,
        is_update: true,
        existing_fingerprint: voiceModel.fingerprint as Record<string, any> || undefined
      };

      await this.zmqClient.sendVoiceProfileRequest(zmqRequest);

      // Wait for response
      const response = await this.waitForZmqResponse(requestId) as VoiceProfileAnalyzeResult;

      if (!response.success) {
        return { success: false, error: response.error || 'Update failed', errorCode: 'UPDATE_FAILED' };
      }

      // Calculate new expiration
      const expiresAt = this.calculateExpirationDate(voiceModel.user.birthDate);

      // Update database
      const updated = await this.prisma.userVoiceModel.update({
        where: { userId },
        data: {
          audioCount: voiceModel.audioCount + 1,
          totalDurationMs: voiceModel.totalDurationMs + (response.audio_duration_ms || 0),
          qualityScore: response.quality_score || voiceModel.qualityScore,
          version: voiceModel.version + 1,
          voiceCharacteristics: response.voice_characteristics || voiceModel.voiceCharacteristics,
          fingerprint: response.fingerprint || voiceModel.fingerprint,
          signatureShort: response.signature_short || voiceModel.signatureShort,
          nextRecalibrationAt: expiresAt
        }
      });

      return {
        success: true,
        data: {
          profileId: updated.profileId || '',
          userId: updated.userId,
          qualityScore: updated.qualityScore,
          audioDurationMs: updated.totalDurationMs,
          voiceCharacteristics: updated.voiceCharacteristics as Record<string, any> | null,
          signatureShort: updated.signatureShort,
          version: updated.version,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          expiresAt: updated.nextRecalibrationAt,
          consentStatus: {
            voiceRecordingConsentAt: voiceModel.user.voiceProfileConsentAt,
            voiceCloningEnabledAt: voiceModel.user.voiceCloningEnabledAt,
            ageVerificationConsentAt: voiceModel.user.ageVerificationConsentAt
          }
        }
      };
    } catch (error) {
      console.error('[VoiceProfileService] Error updating profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update failed',
        errorCode: 'UPDATE_FAILED'
      };
    }
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
        data: {
          profileId: voiceModel.profileId || '',
          userId: voiceModel.userId,
          qualityScore: voiceModel.qualityScore,
          audioDurationMs: voiceModel.totalDurationMs,
          voiceCharacteristics: voiceModel.voiceCharacteristics as Record<string, any> | null,
          signatureShort: voiceModel.signatureShort,
          version: voiceModel.version,
          createdAt: voiceModel.createdAt,
          updatedAt: voiceModel.updatedAt,
          expiresAt: voiceModel.nextRecalibrationAt,
          consentStatus: {
            voiceRecordingConsentAt: voiceModel.user.voiceProfileConsentAt,
            voiceCloningEnabledAt: voiceModel.user.voiceCloningEnabledAt,
            ageVerificationConsentAt: voiceModel.user.ageVerificationConsentAt
          }
        }
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
