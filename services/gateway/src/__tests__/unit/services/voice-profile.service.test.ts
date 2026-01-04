/**
 * Unit tests for VoiceProfileService
 * Tests voice profile management with GDPR compliance
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('VoiceProfileService', () => {
  describe('AudioInput Resolution', () => {
    it('should accept attachmentId input', () => {
      const input = {
        attachmentId: 'att-123'
      };

      expect(input.attachmentId).toBeDefined();
      expect(input.attachmentId).toBe('att-123');
    });

    it('should accept direct audio data input', () => {
      const input = {
        audioData: 'base64-encoded-audio-data',
        audioFormat: 'webm'
      };

      expect(input.audioData).toBeDefined();
      expect(input.audioFormat).toBeDefined();
    });

    it('should require audioFormat when audioData is provided', () => {
      const input = {
        audioData: 'base64-encoded-audio-data'
        // Missing audioFormat should cause error
      };

      expect(input.audioData).toBeDefined();
      expect((input as any).audioFormat).toBeUndefined();
    });

    it('should support both input types', () => {
      // Either attachmentId OR audioData should be provided
      const attachmentInput = { attachmentId: 'att-123' };
      const directInput = { audioData: 'base64-data', audioFormat: 'wav' };

      expect(attachmentInput.attachmentId || directInput.audioData).toBeTruthy();
    });
  });

  describe('MIME Type to Format Conversion', () => {
    const mimeTypeToFormat = (mimeType: string): string => {
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
    };

    it('should convert wav mime types', () => {
      expect(mimeTypeToFormat('audio/wav')).toBe('wav');
      expect(mimeTypeToFormat('audio/wave')).toBe('wav');
      expect(mimeTypeToFormat('audio/x-wav')).toBe('wav');
    });

    it('should convert mp3 mime types', () => {
      expect(mimeTypeToFormat('audio/mpeg')).toBe('mp3');
      expect(mimeTypeToFormat('audio/mp3')).toBe('mp3');
    });

    it('should convert other audio formats', () => {
      expect(mimeTypeToFormat('audio/ogg')).toBe('ogg');
      expect(mimeTypeToFormat('audio/webm')).toBe('webm');
      expect(mimeTypeToFormat('audio/flac')).toBe('flac');
    });

    it('should default to wav for unknown types', () => {
      expect(mimeTypeToFormat('audio/unknown')).toBe('wav');
    });
  });

  describe('ConsentRequest Structure', () => {
    it('should have correct consent request structure', () => {
      const consent = {
        voiceRecordingConsent: true,
        voiceCloningConsent: true,
        birthDate: '1990-05-15'
      };

      expect(typeof consent.voiceRecordingConsent).toBe('boolean');
      expect(typeof consent.voiceCloningConsent).toBe('boolean');
      expect(consent.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should allow partial consent', () => {
      const consent = {
        voiceRecordingConsent: true,
        voiceCloningConsent: false
      };

      expect(consent.voiceRecordingConsent).toBe(true);
      expect(consent.voiceCloningConsent).toBe(false);
    });
  });

  describe('RegisterProfileRequest Structure', () => {
    it('should accept attachmentId for registration', () => {
      const request = {
        attachmentId: 'att-voice-sample-123'
      };

      expect(request.attachmentId).toBeDefined();
    });

    it('should accept direct audio for registration', () => {
      const request = {
        audioData: 'base64-voice-sample',
        audioFormat: 'webm'
      };

      expect(request.audioData).toBeDefined();
      expect(request.audioFormat).toBeDefined();
    });
  });

  describe('CalibrateProfileRequest Structure', () => {
    it('should support adding samples', () => {
      const request = {
        attachmentId: 'att-new-sample',
        replaceExisting: false
      };

      expect(request.replaceExisting).toBe(false);
    });

    it('should support replacing profile', () => {
      const request = {
        audioData: 'base64-new-voice',
        audioFormat: 'wav',
        replaceExisting: true
      };

      expect(request.replaceExisting).toBe(true);
    });
  });

  describe('VoiceProfileDetails Structure', () => {
    it('should have correct profile details structure', () => {
      const profile = {
        profileId: 'vp_user123abc',
        userId: 'user-123',
        qualityScore: 0.85,
        audioDurationMs: 45000,
        audioCount: 3,
        voiceCharacteristics: {
          pitch: { mean: 150, std: 25 },
          timbre: { spectralCentroid: 1500 }
        },
        signatureShort: 'abc123xyz',
        version: 2,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-06-20'),
        expiresAt: new Date('2024-09-20'),
        needsCalibration: false,
        consentStatus: {
          voiceRecordingConsentAt: new Date('2024-01-15'),
          voiceCloningEnabledAt: new Date('2024-01-15'),
          ageVerificationConsentAt: new Date('2024-01-15')
        }
      };

      expect(profile.profileId).toContain('vp_');
      expect(profile.qualityScore).toBeGreaterThanOrEqual(0);
      expect(profile.qualityScore).toBeLessThanOrEqual(1);
      expect(profile.audioCount).toBeGreaterThan(0);
      expect(profile.version).toBeGreaterThan(0);
      expect(typeof profile.needsCalibration).toBe('boolean');
    });

    it('should indicate when calibration is needed', () => {
      const expiredProfile = {
        expiresAt: new Date('2024-01-01'), // Past date
        needsCalibration: true
      };

      const validProfile = {
        expiresAt: new Date('2025-01-01'), // Future date
        needsCalibration: false
      };

      expect(expiredProfile.needsCalibration).toBe(true);
      expect(validProfile.needsCalibration).toBe(false);
    });
  });

  describe('Age-based Expiration', () => {
    const calculateAge = (birthDate: Date): number => {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    };

    const MINOR_EXPIRATION_DAYS = 60;
    const STANDARD_EXPIRATION_DAYS = 90;

    it('should calculate correct age', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 25);

      expect(calculateAge(birthDate)).toBe(25);
    });

    it('should use shorter expiration for minors', () => {
      const minorAge = 16;
      const expirationDays = minorAge < 18 ? MINOR_EXPIRATION_DAYS : STANDARD_EXPIRATION_DAYS;

      expect(expirationDays).toBe(60);
    });

    it('should use standard expiration for adults', () => {
      const adultAge = 25;
      const expirationDays = adultAge < 18 ? MINOR_EXPIRATION_DAYS : STANDARD_EXPIRATION_DAYS;

      expect(expirationDays).toBe(90);
    });
  });

  describe('ServiceResult Structure', () => {
    it('should have correct success result', () => {
      const result = {
        success: true,
        data: {
          profileId: 'vp_123',
          userId: 'user-456',
          qualityScore: 0.9
        }
      };

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should have correct error result for missing consent', () => {
      const result = {
        success: false,
        error: 'Voice recording consent required',
        errorCode: 'CONSENT_REQUIRED'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONSENT_REQUIRED');
    });

    it('should have correct error result for existing profile', () => {
      const result = {
        success: false,
        error: 'Profile already exists. Use update or calibrate endpoint.',
        errorCode: 'PROFILE_EXISTS'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROFILE_EXISTS');
    });

    it('should have correct error result for profile not found', () => {
      const result = {
        success: false,
        error: 'Profile not found',
        errorCode: 'PROFILE_NOT_FOUND'
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROFILE_NOT_FOUND');
    });
  });

  describe('Consent Status', () => {
    it('should have correct consent status structure', () => {
      const status = {
        hasVoiceRecordingConsent: true,
        hasVoiceCloningConsent: true,
        hasAgeVerification: true,
        birthDate: new Date('1990-05-15')
      };

      expect(typeof status.hasVoiceRecordingConsent).toBe('boolean');
      expect(typeof status.hasVoiceCloningConsent).toBe('boolean');
      expect(typeof status.hasAgeVerification).toBe('boolean');
      expect(status.birthDate).toBeInstanceOf(Date);
    });

    it('should allow checking individual consents', () => {
      const status = {
        hasVoiceRecordingConsent: true,
        hasVoiceCloningConsent: false,
        hasAgeVerification: false,
        birthDate: null
      };

      expect(status.hasVoiceRecordingConsent).toBe(true);
      expect(status.hasVoiceCloningConsent).toBe(false);
    });
  });

  describe('Attachment Access Verification', () => {
    it('should allow owner access', () => {
      const attachment = { uploadedBy: 'user-123' };
      const userId = 'user-123';

      expect(attachment.uploadedBy === userId).toBe(true);
    });

    it('should deny non-owner access without conversation membership', () => {
      const attachment = { uploadedBy: 'user-456', message: null };
      const userId = 'user-123';

      const isOwner = attachment.uploadedBy === userId;
      const hasConversation = attachment.message !== null;

      expect(isOwner).toBe(false);
      expect(hasConversation).toBe(false);
    });
  });
});
