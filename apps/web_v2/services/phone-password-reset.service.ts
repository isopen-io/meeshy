/**
 * Phone Password Reset Service
 * Frontend service for phone-based password reset flow
 */

import { buildApiUrl } from '@/lib/config';

// Types
export interface MaskedUserInfo {
  displayName: string;
  username: string;
  email: string;
  avatarUrl?: string;
}

export interface PhoneLookupRequest {
  phoneNumber: string;
  countryCode?: string;
}

export interface PhoneLookupResponse {
  success: boolean;
  tokenId?: string;
  maskedUserInfo?: MaskedUserInfo;
  error?: string;
}

export interface IdentityVerificationRequest {
  tokenId: string;
  fullUsername: string;
  fullEmail: string;
}

export interface IdentityVerificationResponse {
  success: boolean;
  codeSent?: boolean;
  attemptsRemaining?: number;
  error?: string;
}

export interface CodeVerificationRequest {
  tokenId: string;
  code: string;
}

export interface CodeVerificationResponse {
  success: boolean;
  resetToken?: string;
  error?: string;
}

export interface ResendCodeRequest {
  tokenId: string;
}

export interface ResendCodeResponse {
  success: boolean;
  error?: string;
}

// Known error codes - component will translate these using i18n
// Keys match t('phoneReset.errors.{code}') in locale files
const KNOWN_ERROR_CODES = [
  'rate_limited',
  'invalid_phone',
  'user_not_found',
  'phone_not_verified',
  'invalid_token',
  'token_expired',
  'invalid_step',
  'max_attempts_exceeded',
  'identity_mismatch',
  'sms_send_failed',
  'code_expired',
  'invalid_code',
  'validation_error',
  'internal_error',
] as const;

type ErrorCode = typeof KNOWN_ERROR_CODES[number];

class PhonePasswordResetService {
  /**
   * Step 1: Lookup user by phone number
   */
  async lookupByPhone(request: PhoneLookupRequest): Promise<PhoneLookupResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/forgot-password/phone/lookup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: this.getErrorCode(data.error || 'internal_error'),
        };
      }

      return data;
    } catch (error) {
      console.error('[PhonePasswordResetService] lookupByPhone error:', error);
      return {
        success: false,
        error: this.getErrorCode('internal_error'),
      };
    }
  }

  /**
   * Step 2: Verify identity (username + email)
   */
  async verifyIdentity(request: IdentityVerificationRequest): Promise<IdentityVerificationResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/forgot-password/phone/verify-identity'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: this.getErrorCode(data.error || 'internal_error'),
          attemptsRemaining: data.attemptsRemaining,
        };
      }

      return data;
    } catch (error) {
      console.error('[PhonePasswordResetService] verifyIdentity error:', error);
      return {
        success: false,
        error: this.getErrorCode('internal_error'),
      };
    }
  }

  /**
   * Step 3: Verify SMS code
   */
  async verifyCode(request: CodeVerificationRequest): Promise<CodeVerificationResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/forgot-password/phone/verify-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: this.getErrorCode(data.error || 'internal_error'),
        };
      }

      return data;
    } catch (error) {
      console.error('[PhonePasswordResetService] verifyCode error:', error);
      return {
        success: false,
        error: this.getErrorCode('internal_error'),
      };
    }
  }

  /**
   * Resend SMS code
   */
  async resendCode(request: ResendCodeRequest): Promise<ResendCodeResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/forgot-password/phone/resend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: this.getErrorCode(data.error || 'internal_error'),
        };
      }

      return data;
    } catch (error) {
      console.error('[PhonePasswordResetService] resendCode error:', error);
      return {
        success: false,
        error: this.getErrorCode('internal_error'),
      };
    }
  }

  /**
   * Return the error code as-is - component will translate using i18n
   * This allows for proper localization in all supported languages
   */
  private getErrorCode(errorCode: string): string {
    // Return known codes as-is, fallback to internal_error for unknown codes
    if (KNOWN_ERROR_CODES.includes(errorCode as ErrorCode)) {
      return errorCode;
    }
    return 'internal_error';
  }
}

export const phonePasswordResetService = new PhonePasswordResetService();
