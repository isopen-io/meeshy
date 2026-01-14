/**
 * Phone Transfer Service
 * Frontend service for phone number transfer during registration
 *
 * When a user registers with a phone number that belongs to another account,
 * this service handles the SMS verification to transfer the phone to the new account.
 *
 * NEW FLOW (account NOT created first):
 * 1. User tries to register with a phone that belongs to another account
 * 2. Backend returns phoneOwnershipConflict: true with pendingRegistration data
 * 3. User chooses to transfer the phone
 * 4. Frontend calls initiateTransferForRegistration() to send SMS
 * 5. User enters code, frontend calls verifyTransferForRegistration()
 * 6. If verified, frontend re-calls /register with transferToken to complete registration + transfer
 */

import { buildApiUrl } from '@/lib/config';

// ============================================================================
// Types
// ============================================================================

export interface PhoneTransferOwnerInfo {
  maskedDisplayName: string;
  maskedUsername: string;
  maskedEmail: string;
  avatarUrl?: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export interface PhoneTransferInitRequest {
  newUserId: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export interface PhoneTransferInitResponse {
  success: boolean;
  transferId?: string;
  maskedOwnerInfo?: {
    displayName: string;
    username: string;
    email: string;
  };
  error?: string;
}

export interface PhoneTransferVerifyRequest {
  transferId: string;
  code: string;
}

export interface PhoneTransferVerifyResponse {
  success: boolean;
  transferred?: boolean;
  error?: string;
}

export interface PhoneTransferResendRequest {
  transferId: string;
}

export interface PhoneTransferResendResponse {
  success: boolean;
  error?: string;
}

export interface PhoneTransferCancelRequest {
  transferId: string;
}

// New interfaces for registration flow (account NOT created yet)

export interface PhoneTransferForRegistrationInitRequest {
  phoneNumber: string;
  phoneCountryCode: string;
  pendingUsername: string;
  pendingEmail: string;
}

export interface PhoneTransferForRegistrationInitResponse {
  success: boolean;
  transferId?: string;
  error?: string;
}

export interface PhoneTransferForRegistrationVerifyRequest {
  transferId: string;
  code: string;
}

export interface PhoneTransferForRegistrationVerifyResponse {
  success: boolean;
  verified?: boolean;
  transferToken?: string; // Token to use when calling /register to complete transfer
  error?: string;
}

// ============================================================================
// Error Messages
// ============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Trop de tentatives. Veuillez réessayer plus tard.',
  phone_not_found: 'Le numéro n\'est plus associé à un compte.',
  transfer_expired: 'La session de transfert a expiré. Veuillez recommencer.',
  max_attempts_exceeded: 'Trop de tentatives échouées. Veuillez recommencer.',
  invalid_code: 'Code invalide. Vérifiez et réessayez.',
  sms_send_failed: 'Impossible d\'envoyer le SMS. Veuillez réessayer.',
  internal_error: 'Une erreur est survenue. Veuillez réessayer.',
  validation_error: 'Données invalides.',
};

/**
 * Get user-friendly error message
 */
function getErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.internal_error;
}

// ============================================================================
// Service Class
// ============================================================================

class PhoneTransferService {
  /**
   * Initiate phone transfer - sends SMS to current owner
   * Used when account already exists (legacy flow)
   */
  async initiateTransfer(request: PhoneTransferInitRequest): Promise<PhoneTransferInitResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/phone-transfer/initiate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newUserId: request.newUserId,
          phoneNumber: request.phoneNumber,
          phoneCountryCode: request.phoneCountryCode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: getErrorMessage(data.error || 'internal_error'),
        };
      }

      return {
        success: true,
        transferId: data.data?.transferId,
        maskedOwnerInfo: data.data?.maskedOwnerInfo,
      };
    } catch (error) {
      console.error('[PhoneTransferService] Error in initiateTransfer:', error);
      return {
        success: false,
        error: getErrorMessage('internal_error'),
      };
    }
  }

  /**
   * Initiate phone transfer for registration flow
   * Account does NOT exist yet - we just verify SMS ownership
   */
  async initiateTransferForRegistration(
    request: PhoneTransferForRegistrationInitRequest
  ): Promise<PhoneTransferForRegistrationInitResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/phone-transfer/initiate-registration'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: request.phoneNumber,
          phoneCountryCode: request.phoneCountryCode,
          pendingUsername: request.pendingUsername,
          pendingEmail: request.pendingEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: getErrorMessage(data.error || 'internal_error'),
        };
      }

      return {
        success: true,
        transferId: data.data?.transferId,
      };
    } catch (error) {
      console.error('[PhoneTransferService] Error in initiateTransferForRegistration:', error);
      return {
        success: false,
        error: getErrorMessage('internal_error'),
      };
    }
  }

  /**
   * Verify SMS code for registration flow
   * Does NOT complete transfer - just verifies ownership and returns a token
   */
  async verifyTransferForRegistration(
    request: PhoneTransferForRegistrationVerifyRequest
  ): Promise<PhoneTransferForRegistrationVerifyResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/phone-transfer/verify-registration'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transferId: request.transferId,
          code: request.code,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: getErrorMessage(data.error || 'internal_error'),
        };
      }

      return {
        success: true,
        verified: data.data?.verified,
        transferToken: data.data?.transferToken,
      };
    } catch (error) {
      console.error('[PhoneTransferService] Error in verifyTransferForRegistration:', error);
      return {
        success: false,
        error: getErrorMessage('internal_error'),
      };
    }
  }

  /**
   * Verify SMS code and complete the transfer
   * Used when account already exists (legacy flow)
   */
  async verifyAndTransfer(request: PhoneTransferVerifyRequest): Promise<PhoneTransferVerifyResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/phone-transfer/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transferId: request.transferId,
          code: request.code,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: getErrorMessage(data.error || 'internal_error'),
        };
      }

      return {
        success: true,
        transferred: data.data?.transferred,
      };
    } catch (error) {
      console.error('[PhoneTransferService] Error in verifyAndTransfer:', error);
      return {
        success: false,
        error: getErrorMessage('internal_error'),
      };
    }
  }

  /**
   * Resend SMS code
   */
  async resendCode(request: PhoneTransferResendRequest): Promise<PhoneTransferResendResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/phone-transfer/resend'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transferId: request.transferId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: getErrorMessage(data.error || 'internal_error'),
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('[PhoneTransferService] Error in resendCode:', error);
      return {
        success: false,
        error: getErrorMessage('internal_error'),
      };
    }
  }

  /**
   * Cancel pending transfer
   */
  async cancelTransfer(request: PhoneTransferCancelRequest): Promise<{ success: boolean }> {
    try {
      const response = await fetch(buildApiUrl('/auth/phone-transfer/cancel'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transferId: request.transferId,
        }),
      });

      const data = await response.json();
      return { success: data.success || false };
    } catch (error) {
      console.error('[PhoneTransferService] Error in cancelTransfer:', error);
      return { success: false };
    }
  }
}

// Export singleton instance
export const phoneTransferService = new PhoneTransferService();
