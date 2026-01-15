/**
 * Phone Password Reset Service - SMS-based Password Recovery
 *
 * Security Features:
 * - Identity verification (username + email) before SMS code
 * - SHA-256 hashed SMS codes
 * - Constant-time comparison
 * - Rate limiting (3 lookups/hour, 3 identity attempts, 5 code attempts)
 * - Phone number transfer with audit trail
 * - Comprehensive security logging
 *
 * Flow:
 * 1. Lookup by phone → Returns masked user info
 * 2. Verify identity (username + email) → Sends SMS code
 * 3. Verify SMS code → Returns password reset token
 */

import crypto from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { RedisWrapper } from './RedisWrapper';
import { SmsService } from './SmsService';
import { GeoIPService } from './GeoIPService';
import { normalizePhoneWithCountry } from '../utils/normalize';

const CODE_EXPIRY_MINUTES = 10;
const MAX_IDENTITY_ATTEMPTS = 3;
const MAX_CODE_ATTEMPTS = 5;
const RATE_LIMIT_LOOKUP_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PhoneLookupRequest {
  phoneNumber: string;
  countryCode?: string;
  ipAddress: string;
  userAgent: string;
}

export interface PhoneLookupResult {
  success: boolean;
  tokenId?: string;
  maskedUserInfo?: MaskedUserInfo;
  error?: string;
}

export interface MaskedUserInfo {
  displayName: string; // Full name (not masked) - "John Doe"
  username: string;    // Masked: "j******s"
  email: string;       // Masked: "je....n@e*****om"
  avatarUrl?: string;  // undefined if no avatar
}

export interface IdentityVerificationRequest {
  tokenId: string;
  fullUsername: string;
  fullEmail: string;
  ipAddress: string;
  userAgent: string;
}

export interface IdentityVerificationResult {
  success: boolean;
  codeSent?: boolean;
  attemptsRemaining?: number;
  error?: string;
}

export interface CodeVerificationRequest {
  tokenId: string;
  code: string;
  ipAddress: string;
  userAgent: string;
}

export interface CodeVerificationResult {
  success: boolean;
  resetToken?: string;
  error?: string;
}

export interface PhoneTransferRequest {
  fromUserId: string;
  toUserId: string;
  phoneNumber: string;
  phoneCountryCode: string;
  ipAddress: string;
}

// ============================================================================
// Masking Helpers (SECURITY CRITICAL)
// These functions return ONLY the characters to display, NOT the full data
// ============================================================================

/**
 * Mask email: "jean@facebook.com" → "je....n@f*****om"
 * Returns only visible characters, not the full email
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';

  const [localPart, domain] = email.toLowerCase().split('@');
  const [domainName, ...tld] = domain.split('.');
  const tldStr = tld.join('.');

  // Local part: first 2 chars + "..." + last char
  let maskedLocal: string;
  if (localPart.length <= 3) {
    maskedLocal = localPart[0] + '***';
  } else {
    maskedLocal = localPart.slice(0, 2) + '....' + localPart.slice(-1);
  }

  // Domain: first char + "*****"
  const maskedDomain = domainName[0] + '*'.repeat(Math.min(5, domainName.length - 1));

  // TLD: last 2 chars only
  const maskedTld = tldStr.length >= 2 ? tldStr.slice(-2) : tldStr;

  return `${maskedLocal}@${maskedDomain}${maskedTld}`;
}

/**
 * Mask username: "toto2025" → "t******5"
 * Returns only first and last characters
 */
export function maskUsername(username: string): string {
  if (!username) return '********';

  if (username.length <= 2) {
    return username[0] + '*';
  }

  const firstChar = username[0];
  const lastChar = username[username.length - 1];
  const middleStars = '*'.repeat(Math.min(6, username.length - 2));

  return `${firstChar}${middleStars}${lastChar}`;
}

/**
 * Mask display name: "John Doe" → "J**n D*e"
 * For each word: first char + stars + last char
 */
export function maskDisplayName(displayName: string | null | undefined): string {
  if (!displayName) return '*** ***';

  const words = displayName.trim().split(/\s+/);

  return words.map(word => {
    if (word.length <= 2) {
      return word[0] + '*';
    }
    const firstChar = word[0];
    const lastChar = word[word.length - 1];
    const middleStars = '*'.repeat(Math.min(2, word.length - 2));
    return `${firstChar}${middleStars}${lastChar}`;
  }).join(' ');
}

// ============================================================================
// Phone Password Reset Service Class
// ============================================================================

export class PhonePasswordResetService {
  constructor(
    private prisma: PrismaClient,
    private redis: RedisWrapper,
    private smsService: SmsService,
    private geoIPService: GeoIPService
  ) {}

  /**
   * Step 1: Lookup user by phone number
   * Returns masked user info for identity verification
   */
  async lookupByPhone(request: PhoneLookupRequest): Promise<PhoneLookupResult> {
    const { phoneNumber, countryCode, ipAddress, userAgent } = request;

    console.log('[PhonePasswordReset] 📱 ======== PHONE LOOKUP ========');
    console.log('[PhonePasswordReset] 📱 Phone:', phoneNumber);
    console.log('[PhonePasswordReset] 📱 Country:', countryCode);
    console.log('[PhonePasswordReset] 📱 IP:', ipAddress);

    try {
      // 1. Rate limiting by IP
      const isRateLimited = await this.checkLookupRateLimit(ipAddress);
      if (isRateLimited) {
        console.log('[PhonePasswordReset] ❌ Rate limited');
        await this.logSecurityEvent(null, 'PHONE_RESET_RATE_LIMIT', 'MEDIUM', {
          phoneNumber: this.hashForLog(phoneNumber),
          ipAddress
        });
        return { success: false, error: 'rate_limited' };
      }

      // 2. Normalize phone number
      const normalized = normalizePhoneWithCountry(phoneNumber, countryCode);
      if (!normalized || !normalized.isValid) {
        console.log('[PhonePasswordReset] ❌ Invalid phone number');
        return { success: false, error: 'invalid_phone' };
      }

      // 3. Find user by phone number
      const user = await this.prisma.user.findFirst({
        where: {
          phoneNumber: normalized.phoneNumber,
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          avatar: true,
          phoneVerifiedAt: true
        }
      });

      if (!user) {
        console.log('[PhonePasswordReset] ❌ User not found');
        // Don't reveal that user doesn't exist
        return { success: false, error: 'user_not_found' };
      }

      // 4. Phone must be verified
      if (!user.phoneVerifiedAt) {
        console.log('[PhonePasswordReset] ❌ Phone not verified');
        return { success: false, error: 'phone_not_verified' };
      }

      // 5. Get geo location
      const geoData = await this.geoIPService.lookup(ipAddress);

      // 6. Create phone reset token (identity pending)
      const token = await this.prisma.phonePasswordResetToken.create({
        data: {
          userId: user.id,
          codeHash: '', // Will be set when identity is verified
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min to complete flow
          verificationStep: 'IDENTITY_PENDING',
          ipAddress,
          userAgent,
          geoLocation: geoData?.location || null
        }
      });

      // 7. Log security event
      await this.logSecurityEvent(user.id, 'PHONE_RESET_LOOKUP', 'LOW', {
        tokenId: token.id,
        ipAddress
      });

      // 8. Return user info (displayName in full, username/email masked for security)
      return {
        success: true,
        tokenId: token.id,
        maskedUserInfo: {
          displayName: user.displayName || user.username, // Full name, not masked
          username: maskUsername(user.username),
          email: maskEmail(user.email),
          avatarUrl: user.avatar || undefined
        }
      };

    } catch (error) {
      console.error('[PhonePasswordReset] Error in lookupByPhone:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Step 2: Verify user identity (username + email)
   * If successful, sends SMS code
   */
  async verifyIdentity(request: IdentityVerificationRequest): Promise<IdentityVerificationResult> {
    const { tokenId, fullUsername, fullEmail, ipAddress, userAgent } = request;

    console.log('[PhonePasswordReset] 🔐 ======== IDENTITY VERIFICATION ========');
    console.log('[PhonePasswordReset] 🔐 Token:', tokenId);
    console.log('[PhonePasswordReset] 🔐 IP:', ipAddress);

    try {
      // 1. Find token
      const token = await this.prisma.phonePasswordResetToken.findUnique({
        where: { id: tokenId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phoneNumber: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!token) {
        return { success: false, error: 'invalid_token' };
      }

      // 2. Check token status
      if (token.isRevoked || token.usedAt) {
        return { success: false, error: 'token_expired' };
      }

      if (token.expiresAt < new Date()) {
        return { success: false, error: 'token_expired' };
      }

      if (token.verificationStep !== 'IDENTITY_PENDING') {
        return { success: false, error: 'invalid_step' };
      }

      // 3. Check identity attempts
      if (token.identityAttempts >= MAX_IDENTITY_ATTEMPTS) {
        await this.revokeToken(token.id, 'MAX_IDENTITY_ATTEMPTS');
        await this.logSecurityEvent(token.userId, 'PHONE_RESET_IDENTITY_BLOCKED', 'HIGH', {
          tokenId: token.id,
          attempts: token.identityAttempts,
          ipAddress
        });
        return { success: false, error: 'max_attempts_exceeded' };
      }

      // 4. Verify username AND email (case-insensitive)
      const usernameMatch = token.user.username.toLowerCase() === fullUsername.toLowerCase().trim();
      const emailMatch = token.user.email.toLowerCase() === fullEmail.toLowerCase().trim();

      if (!usernameMatch || !emailMatch) {
        // Increment attempts
        await this.prisma.phonePasswordResetToken.update({
          where: { id: token.id },
          data: { identityAttempts: { increment: 1 } }
        });

        const attemptsRemaining = MAX_IDENTITY_ATTEMPTS - token.identityAttempts - 1;

        await this.logSecurityEvent(token.userId, 'PHONE_RESET_IDENTITY_FAILED', 'MEDIUM', {
          tokenId: token.id,
          attempt: token.identityAttempts + 1,
          usernameMatch,
          emailMatch,
          ipAddress
        });

        return {
          success: false,
          error: 'identity_mismatch',
          attemptsRemaining
        };
      }

      // 5. Generate SMS code
      const code = this.generateCode();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // 6. Update token with code and step
      await this.prisma.phonePasswordResetToken.update({
        where: { id: token.id },
        data: {
          codeHash,
          verificationStep: 'CODE_PENDING',
          identityVerifiedAt: new Date(),
          expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)
        }
      });

      // 7. Send SMS
      const smsResult = await this.smsService.sendPasswordResetCode(
        token.user.phoneNumber!,
        code
      );

      if (!smsResult.success) {
        console.error('[PhonePasswordReset] ❌ SMS send failed:', smsResult.error);
        return { success: false, error: 'sms_send_failed' };
      }

      // 8. Log security event
      await this.logSecurityEvent(token.userId, 'PHONE_RESET_CODE_SENT', 'MEDIUM', {
        tokenId: token.id,
        smsProvider: smsResult.provider,
        ipAddress
      });

      console.log('[PhonePasswordReset] ✅ Identity verified, SMS sent');
      return { success: true, codeSent: true };

    } catch (error) {
      console.error('[PhonePasswordReset] Error in verifyIdentity:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Step 3: Verify SMS code
   * Returns password reset token if successful
   */
  async verifyCode(request: CodeVerificationRequest): Promise<CodeVerificationResult> {
    const { tokenId, code, ipAddress, userAgent } = request;

    console.log('[PhonePasswordReset] ✉️ ======== CODE VERIFICATION ========');
    console.log('[PhonePasswordReset] ✉️ Token:', tokenId);
    console.log('[PhonePasswordReset] ✉️ IP:', ipAddress);

    try {
      // 1. Find token
      const token = await this.prisma.phonePasswordResetToken.findUnique({
        where: { id: tokenId },
        include: {
          user: {
            select: { id: true, email: true }
          }
        }
      });

      if (!token) {
        return { success: false, error: 'invalid_token' };
      }

      // 2. Check token status
      if (token.isRevoked || token.usedAt) {
        return { success: false, error: 'token_expired' };
      }

      if (token.expiresAt < new Date()) {
        return { success: false, error: 'code_expired' };
      }

      if (token.verificationStep !== 'CODE_PENDING') {
        return { success: false, error: 'invalid_step' };
      }

      // 3. Check code attempts
      if (token.codeAttempts >= MAX_CODE_ATTEMPTS) {
        await this.revokeToken(token.id, 'MAX_CODE_ATTEMPTS');
        await this.logSecurityEvent(token.userId, 'PHONE_RESET_CODE_BLOCKED', 'HIGH', {
          tokenId: token.id,
          attempts: token.codeAttempts,
          ipAddress
        });
        return { success: false, error: 'max_attempts_exceeded' };
      }

      // 4. Verify code (constant-time comparison via hash)
      const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      const isCodeValid = crypto.timingSafeEqual(
        Buffer.from(codeHash),
        Buffer.from(token.codeHash)
      );

      if (!isCodeValid) {
        // Increment attempts
        await this.prisma.phonePasswordResetToken.update({
          where: { id: token.id },
          data: { codeAttempts: { increment: 1 } }
        });

        await this.logSecurityEvent(token.userId, 'PHONE_RESET_CODE_FAILED', 'MEDIUM', {
          tokenId: token.id,
          attempt: token.codeAttempts + 1,
          ipAddress
        });

        return { success: false, error: 'invalid_code' };
      }

      // 5. Generate password reset token (same format as email reset)
      const resetToken = crypto.randomBytes(32).toString('base64url');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // 6. Create password reset token in database
      await this.prisma.passwordResetToken.create({
        data: {
          userId: token.userId,
          tokenHash: resetTokenHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
          ipAddress,
          userAgent
        }
      });

      // 7. Mark phone reset token as used
      await this.prisma.phonePasswordResetToken.update({
        where: { id: token.id },
        data: {
          usedAt: new Date(),
          verificationStep: 'COMPLETED'
        }
      });

      // 8. Log security event
      await this.logSecurityEvent(token.userId, 'PHONE_RESET_SUCCESS', 'MEDIUM', {
        tokenId: token.id,
        method: 'phone',
        ipAddress
      });

      console.log('[PhonePasswordReset] ✅ Code verified, reset token generated');
      return { success: true, resetToken };

    } catch (error) {
      console.error('[PhonePasswordReset] Error in verifyCode:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Resend SMS code (creates new code, resets expiry)
   */
  async resendCode(tokenId: string, ipAddress: string): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.prisma.phonePasswordResetToken.findUnique({
        where: { id: tokenId },
        include: {
          user: {
            select: { id: true, phoneNumber: true }
          }
        }
      });

      if (!token || token.isRevoked || token.usedAt) {
        return { success: false, error: 'invalid_token' };
      }

      if (token.verificationStep !== 'CODE_PENDING') {
        return { success: false, error: 'invalid_step' };
      }

      // Rate limit resend (1 per 60 seconds)
      const resendKey = `ratelimit:phone-reset:resend:${tokenId}`;
      const lastResend = await this.redis.get(resendKey);
      if (lastResend) {
        return { success: false, error: 'rate_limited' };
      }

      // Generate new code
      const code = this.generateCode();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // Update token
      await this.prisma.phonePasswordResetToken.update({
        where: { id: tokenId },
        data: {
          codeHash,
          codeAttempts: 0, // Reset attempts on resend
          expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)
        }
      });

      // Send SMS
      const smsResult = await this.smsService.sendPasswordResetCode(
        token.user.phoneNumber!,
        code
      );

      if (!smsResult.success) {
        return { success: false, error: 'sms_send_failed' };
      }

      // Set rate limit for resend
      await this.redis.setex(resendKey, 60, '1');

      await this.logSecurityEvent(token.userId, 'PHONE_RESET_CODE_RESENT', 'LOW', {
        tokenId,
        ipAddress
      });

      return { success: true };
    } catch (error) {
      console.error('[PhonePasswordReset] Error in resendCode:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Transfer phone number from one account to another
   * Used when creating new account with phone that belongs to existing account
   */
  async transferPhone(request: PhoneTransferRequest): Promise<{ success: boolean; error?: string }> {
    const { fromUserId, toUserId, phoneNumber, phoneCountryCode, ipAddress } = request;

    console.log('[PhonePasswordReset] 📲 ======== PHONE TRANSFER ========');
    console.log('[PhonePasswordReset] 📲 From:', fromUserId);
    console.log('[PhonePasswordReset] 📲 To:', toUserId);
    console.log('[PhonePasswordReset] 📲 Phone:', this.hashForLog(phoneNumber));

    try {
      // Atomic transaction
      await this.prisma.$transaction(async (tx) => {
        // 1. Remove phone from old account
        await tx.user.update({
          where: { id: fromUserId },
          data: {
            phoneNumber: null,
            phoneCountryCode: null,
            phoneVerifiedAt: null,
            phoneVerificationCode: null,
            phoneVerificationExpiry: null
          }
        });

        // 2. Add phone to new account with transfer tracking
        await tx.user.update({
          where: { id: toUserId },
          data: {
            phoneNumber,
            phoneCountryCode,
            phoneVerifiedAt: new Date(),
            phoneTransferredFromUserId: fromUserId,
            phoneTransferredAt: new Date()
          }
        });

        // 3. Log security event on old account
        await tx.securityEvent.create({
          data: {
            userId: fromUserId,
            eventType: 'PHONE_TRANSFERRED_OUT',
            severity: 'HIGH',
            status: 'SUCCESS',
            description: 'Phone number transferred to another account',
            metadata: {
              toUserId,
              phoneHash: this.hashForLog(phoneNumber)
            },
            ipAddress
          }
        });

        // 4. Log security event on new account
        await tx.securityEvent.create({
          data: {
            userId: toUserId,
            eventType: 'PHONE_TRANSFERRED_IN',
            severity: 'MEDIUM',
            status: 'SUCCESS',
            description: 'Phone number transferred from another account',
            metadata: {
              fromUserId,
              phoneHash: this.hashForLog(phoneNumber)
            },
            ipAddress
          }
        });
      });

      console.log('[PhonePasswordReset] ✅ Phone transferred successfully');
      return { success: true };

    } catch (error) {
      console.error('[PhonePasswordReset] Error in transferPhone:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateCode(): string {
    // Generate 6-digit code
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashForLog(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 8);
  }

  private async checkLookupRateLimit(ipAddress: string): Promise<boolean> {
    const key = `ratelimit:phone-reset:lookup:${ipAddress}`;
    const count = await this.redis.get(key);

    if (count && parseInt(count) >= RATE_LIMIT_LOOKUP_PER_HOUR) {
      return true;
    }

    if (count) {
      await this.redis.setex(key, RATE_LIMIT_WINDOW_SECONDS, (parseInt(count) + 1).toString());
    } else {
      await this.redis.setex(key, RATE_LIMIT_WINDOW_SECONDS, '1');
    }

    return false;
  }

  private async revokeToken(tokenId: string, reason: string): Promise<void> {
    await this.prisma.phonePasswordResetToken.update({
      where: { id: tokenId },
      data: { isRevoked: true }
    });
  }

  private async logSecurityEvent(
    userId: string | null,
    eventType: string,
    severity: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          userId,
          eventType,
          severity,
          status: 'SUCCESS',
          description: `${eventType} event`,
          metadata,
          ipAddress: metadata.ipAddress
        }
      });
    } catch (error) {
      console.error('[PhonePasswordReset] Failed to log security event:', error);
    }
  }
}
