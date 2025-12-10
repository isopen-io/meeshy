import { buildApiUrl } from '@/lib/config';

/**
 * Password Reset Service
 * Handles forgot password and reset password flows
 * Matches backend API contract from SECURE_PASSWORD_RESET_ARCHITECTURE.md
 */

export interface ForgotPasswordRequest {
  email: string;
  captchaToken: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
  twoFactorCode?: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface VerifyTokenRequest {
  token: string;
}

export interface VerifyTokenResponse {
  success: boolean;
  valid: boolean;
  error?: string;
  requires2FA?: boolean;
}

class PasswordResetService {
  private static instance: PasswordResetService;

  private constructor() {}

  public static getInstance(): PasswordResetService {
    if (!PasswordResetService.instance) {
      PasswordResetService.instance = new PasswordResetService();
    }
    return PasswordResetService.instance;
  }

  /**
   * Request password reset email
   * Endpoint: POST /auth/forgot-password
   */
  async requestReset(request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: request.email,
          captchaToken: request.captchaToken,
        }),
      });

      const data = await response.json();

      // Backend always returns 200 OK with generic message to prevent enumeration
      return {
        success: data.success ?? true,
        message: data.message || 'If an account exists with this email, a password reset link has been sent.',
      };
    } catch (error) {
      console.error('[PasswordResetService] Error requesting reset:', error);
      return {
        success: true, // Return generic success even on error to prevent enumeration
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }
  }

  /**
   * Reset password with token
   * Endpoint: POST /auth/reset-password
   */
  async resetPassword(request: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/reset-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: request.token,
          newPassword: request.newPassword,
          confirmPassword: request.confirmPassword,
          twoFactorCode: request.twoFactorCode,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          message: data.message || 'Password reset successfully. All sessions have been invalidated.',
        };
      } else {
        return {
          success: false,
          error: data.error || 'An error occurred while resetting your password.',
        };
      }
    } catch (error) {
      console.error('[PasswordResetService] Error resetting password:', error);
      return {
        success: false,
        error: 'Network error. Please check your connection and try again.',
      };
    }
  }

  /**
   * Verify reset token validity
   * This is a client-side only check to provide early feedback
   * Backend performs the authoritative check
   */
  async verifyToken(request: VerifyTokenRequest): Promise<VerifyTokenResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/verify-reset-token'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: request.token,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          valid: data.valid ?? true,
          requires2FA: data.requires2FA ?? false,
        };
      } else {
        return {
          success: false,
          valid: false,
          error: data.error || 'Invalid or expired reset token.',
        };
      }
    } catch (error) {
      console.error('[PasswordResetService] Error verifying token:', error);
      return {
        success: false,
        valid: false,
        error: 'Network error. Please try again.',
      };
    }
  }

  /**
   * Validate password strength (client-side)
   * Returns validation errors if any
   */
  validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate password strength score (0-4)
   * 0: Very weak
   * 1: Weak
   * 2: Fair
   * 3: Strong
   * 4: Very strong
   */
  calculatePasswordStrength(password: string): number {
    let score = 0;

    if (!password) return score;

    // Length bonus
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character variety bonus
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Cap at 4
    return Math.min(score, 4);
  }

  /**
   * Get password strength label
   */
  getPasswordStrengthLabel(score: number): string {
    switch (score) {
      case 0:
      case 1:
        return 'Weak';
      case 2:
        return 'Fair';
      case 3:
        return 'Strong';
      case 4:
        return 'Very Strong';
      default:
        return 'Weak';
    }
  }

  /**
   * Get password strength color
   */
  getPasswordStrengthColor(score: number): string {
    switch (score) {
      case 0:
      case 1:
        return 'bg-red-500';
      case 2:
        return 'bg-yellow-500';
      case 3:
        return 'bg-blue-500';
      case 4:
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  }
}

export const passwordResetService = PasswordResetService.getInstance();
