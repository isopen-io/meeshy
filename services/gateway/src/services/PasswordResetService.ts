/**
 * Password Reset Service - Production-Ready Implementation
 *
 * Security Features:
 * - SHA-256 hashed tokens
 * - Constant-time comparison
 * - Distributed locking (Redis)
 * - Account lockout (10 attempts/24h)
 * - CAPTCHA verification
 * - Password history (last 10 passwords)
 * - 2FA verification (if enabled)
 * - Geolocation anomaly detection
 * - Session invalidation
 * - Comprehensive security logging
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import zxcvbn from 'zxcvbn';
import axios from 'axios';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { RedisWrapper } from './RedisWrapper';
import { EmailService } from './EmailService';
import { GeoIPService } from './GeoIPService';

const BCRYPT_COST = 12;
const TOKEN_EXPIRY_MINUTES = 15;
const MAX_RESET_ATTEMPTS_24H = 10;
const PASSWORD_HISTORY_COUNT = 10;
const MIN_PASSWORD_SCORE = 3; // zxcvbn score (0-4)

export interface PasswordResetRequest {
  email: string;
  captchaToken: string;
  deviceFingerprint?: string;
  ipAddress: string;
  userAgent: string;
}

export interface PasswordResetCompletion {
  token: string;
  newPassword: string;
  confirmPassword: string;
  twoFactorCode?: string;
  deviceFingerprint?: string;
  ipAddress: string;
  userAgent: string;
}

export class PasswordResetService {
  constructor(
    private prisma: PrismaClient,
    private redis: RedisWrapper,
    private emailService: EmailService,
    private geoIPService: GeoIPService,
    private captchaSecret: string
  ) {}

  /**
   * Request password reset - Step 1
   */
  async requestPasswordReset(
    request: PasswordResetRequest
  ): Promise<{ success: boolean; message: string }> {
    const { email, captchaToken, deviceFingerprint, ipAddress, userAgent } = request;

    try {
      // 1. Verify CAPTCHA
      const isCaptchaValid = await this.verifyCaptcha(captchaToken, ipAddress);
      if (!isCaptchaValid) {
        // Return generic response (don't reveal CAPTCHA failure)
        return this.genericSuccessResponse();
      }

      // 2. Rate limiting
      const isRateLimited = await this.checkRateLimit(email, ipAddress);
      if (isRateLimited) {
        await this.logSecurityEvent(null, 'RATE_LIMIT_EXCEEDED', 'MEDIUM', {
          email,
          ipAddress,
          type: 'password_reset_request'
        });
        return this.genericSuccessResponse();
      }

      // 3. Find user by email (case-insensitive)
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: email.toLowerCase().trim(), mode: 'insensitive' },
          isActive: true
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          lockedUntil: true,
          passwordResetAttempts: true,
          lastPasswordResetAttempt: true,
          firstName: true,
          lastName: true
        }
      });

      // 4. User not found - return generic response
      if (!user) {
        return this.genericSuccessResponse();
      }

      // 5. Email not verified - return generic response
      if (!user.emailVerifiedAt) {
        await this.logSecurityEvent(user.id, 'PASSWORD_RESET_UNVERIFIED_EMAIL', 'LOW', {
          email: user.email
        });
        return this.genericSuccessResponse();
      }

      // 6. Check account lockout
      const isLocked = await this.checkAccountLockout(user.id);
      if (isLocked) {
        await this.logSecurityEvent(user.id, 'PASSWORD_RESET_LOCKED_ACCOUNT', 'HIGH', {
          email: user.email,
          ipAddress
        });
        return this.genericSuccessResponse();
      }

      // 7. Check reset attempts in 24h
      const resetCount = await this.getResetAttemptsCount(user.id);
      if (resetCount >= MAX_RESET_ATTEMPTS_24H) {
        // Lock account for suspicious activity
        await this.lockAccount(user.id, 'PASSWORD_RESET_ABUSE');
        await this.logSecurityEvent(user.id, 'PASSWORD_RESET_ABUSE', 'CRITICAL', {
          resetCount,
          ipAddress
        });
        return this.genericSuccessResponse();
      }

      // 8. Acquire distributed lock
      const lockAcquired = await this.acquireLock(user.id);
      if (!lockAcquired) {
        // Another request is processing
        return this.genericSuccessResponse();
      }

      try {
        // 9. Revoke existing tokens
        await this.revokeExistingTokens(user.id);

        // 10. Generate secure token
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // 11. Get geolocation
        const geoData = await this.geoIPService.lookup(ipAddress);

        // 12. Create reset token in database
        await this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000),
            ipAddress,
            userAgent,
            deviceFingerprint,
            geoLocation: geoData ? `${geoData.city}, ${geoData.country}` : null,
            geoCoordinates: geoData ? `${geoData.latitude},${geoData.longitude}` : null
          }
        });

        // 13. Update user reset attempts
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetAttempts: { increment: 1 },
            lastPasswordResetAttempt: new Date()
          }
        });

        // 14. Log security event
        await this.logSecurityEvent(user.id, 'PASSWORD_RESET_REQUEST', 'MEDIUM', {
          email: user.email,
          ipAddress,
          geoLocation: geoData ? `${geoData.city}, ${geoData.country}` : null
        });

        // 15. Send reset email (with unhashed token)
        await this.emailService.sendPasswordResetEmail({
          to: user.email,
          name: `${user.firstName} ${user.lastName}`,
          resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${token}`,
          expiryMinutes: TOKEN_EXPIRY_MINUTES
        });

      } finally {
        // 16. Release lock
        await this.releaseLock(user.id);
      }

      return this.genericSuccessResponse();

    } catch (error) {
      console.error('[PasswordResetService] Error in requestPasswordReset:', error);
      // Return generic response even on error
      return this.genericSuccessResponse();
    }
  }

  /**
   * Complete password reset - Step 2
   */
  async completePasswordReset(
    request: PasswordResetCompletion
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const {
      token,
      newPassword,
      confirmPassword,
      twoFactorCode,
      deviceFingerprint,
      ipAddress,
      userAgent
    } = request;

    try {
      // 1. Validate passwords match
      if (newPassword !== confirmPassword) {
        return { success: false, error: 'Passwords do not match' };
      }

      // 2. Validate password strength
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: `Password requirements: ${passwordValidation.errors.join(', ')}`
        };
      }

      // 3. Hash submitted token
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // 4. Find token in database (with constant-time comparison via hash)
      const resetToken = await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true }
      });

      if (!resetToken) {
        await this.logSecurityEvent(null, 'PASSWORD_RESET_INVALID_TOKEN', 'MEDIUM', {
          ipAddress,
          tokenHash: tokenHash.substring(0, 8) // Log first 8 chars only
        });
        return { success: false, error: 'Invalid or expired reset token' };
      }

      // 5. Check token expiry
      if (resetToken.expiresAt < new Date()) {
        await this.logSecurityEvent(resetToken.userId, 'PASSWORD_RESET_EXPIRED_TOKEN', 'LOW', {
          ipAddress
        });
        return { success: false, error: 'Invalid or expired reset token' };
      }

      // 6. Check if token already used
      if (resetToken.usedAt) {
        await this.logSecurityEvent(resetToken.userId, 'PASSWORD_RESET_TOKEN_REUSE', 'HIGH', {
          ipAddress,
          originalUse: resetToken.usedAt.toISOString()
        });
        return { success: false, error: 'Invalid or expired reset token' };
      }

      // 7. Check if token is revoked
      if (resetToken.isRevoked) {
        await this.logSecurityEvent(resetToken.userId, 'PASSWORD_RESET_REVOKED_TOKEN', 'MEDIUM', {
          ipAddress,
          revokedReason: resetToken.revokedReason
        });
        return { success: false, error: 'Invalid or expired reset token' };
      }

      const user = resetToken.user;

      // 8. Check account lockout
      const isLocked = await this.checkAccountLockout(user.id);
      if (isLocked) {
        return { success: false, error: 'Account is locked. Please contact support.' };
      }

      // 9. Verify 2FA if enabled
      if (user.twoFactorEnabledAt) {
        if (!twoFactorCode) {
          return { success: false, error: '2FA code required' };
        }

        const is2FAValid = await this.verify2FA(user.id, twoFactorCode);
        if (!is2FAValid) {
          await this.logSecurityEvent(user.id, 'TWO_FA_FAILED', 'HIGH', {
            context: 'password_reset',
            ipAddress
          });
          return { success: false, error: 'Invalid 2FA code' };
        }
      }

      // 10. Check password history (prevent reuse)
      const isPasswordUnique = await this.checkPasswordHistory(user.id, newPassword);
      if (!isPasswordUnique) {
        return {
          success: false,
          error: 'Password was used recently. Please choose a different password.'
        };
      }

      // 11. Detect anomalies
      const geoData = await this.geoIPService.lookup(ipAddress);
      const anomaly = await this.detectAnomalies(
        user.id,
        deviceFingerprint || '',
        ipAddress,
        geoData ? `${geoData.city}, ${geoData.country}` : ''
      );

      if (anomaly.isAnomaly) {
        await this.logSecurityEvent(user.id, 'SUSPICIOUS_PASSWORD_RESET', 'CRITICAL', {
          reason: anomaly.reason,
          ipAddress,
          geoLocation: geoData ? `${geoData.city}, ${geoData.country}` : null
        });
        // Send security alert email
        await this.emailService.sendSecurityAlertEmail({
          to: user.email,
          name: `${user.firstName} ${user.lastName}`,
          alertType: 'Suspicious password reset detected',
          details: anomaly.reason || 'Anomaly detected'
        });
      }

      // 12. Hash new password (bcrypt cost=12)
      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

      // 13. Transaction: Update password, invalidate sessions, mark token used
      await this.prisma.$transaction(async (tx) => {
        // Update password
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            lastPasswordChange: new Date(),
            passwordResetAttempts: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lockedReason: null,
            lastLoginIp: ipAddress,
            lastLoginLocation: geoData ? `${geoData.city}, ${geoData.country}` : null,
            lastLoginDevice: deviceFingerprint || null
          }
        });

        // Add to password history
        await tx.passwordHistory.create({
          data: {
            userId: user.id,
            passwordHash: hashedPassword,
            changedVia: 'RESET',
            ipAddress,
            userAgent
          }
        });

        // Mark token as used
        await tx.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() }
        });

        // Invalidate all user sessions
        await tx.userSession.updateMany({
          where: { userId: user.id, isValid: true },
          data: {
            isValid: false,
            invalidatedAt: new Date(),
            invalidatedReason: 'PASSWORD_RESET'
          }
        });
      });

      // 14. Log successful reset
      await this.logSecurityEvent(user.id, 'PASSWORD_RESET_SUCCESS', 'MEDIUM', {
        ipAddress,
        geoLocation: geoData ? `${geoData.city}, ${geoData.country}` : null
      });

      // 15. Send confirmation email
      await this.emailService.sendPasswordChangedEmail({
        to: user.email,
        name: `${user.firstName} ${user.lastName}`,
        timestamp: new Date().toISOString(),
        ipAddress,
        location: geoData ? `${geoData.city}, ${geoData.country}` : 'Unknown'
      });

      return {
        success: true,
        message: 'Password reset successfully. All sessions have been invalidated.'
      };

    } catch (error) {
      console.error('[PasswordResetService] Error in completePasswordReset:', error);
      return {
        success: false,
        error: 'An error occurred while resetting your password. Please try again.'
      };
    }
  }

  // =====================================
  // HELPER METHODS
  // =====================================

  private genericSuccessResponse() {
    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    };
  }

  private async verifyCaptcha(token: string, ipAddress: string): Promise<boolean> {
    try {
      const response = await axios.post(
        'https://hcaptcha.com/siteverify',
        new URLSearchParams({
          secret: this.captchaSecret,
          response: token,
          remoteip: ipAddress
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      return response.data.success === true;
    } catch (error) {
      console.error('[PasswordResetService] CAPTCHA verification failed:', error);
      return false;
    }
  }

  private async checkRateLimit(email: string, ipAddress: string): Promise<boolean> {
    const emailKey = `ratelimit:password-reset:email:${email.toLowerCase()}`;
    const ipKey = `ratelimit:password-reset:ip:${ipAddress}`;

    // Check email rate limit (3 requests per hour)
    const emailCount = await this.redis.get(emailKey);
    if (emailCount && parseInt(emailCount) >= 3) {
      return true; // Rate limited
    }

    // Check IP rate limit (5 requests per hour)
    const ipCount = await this.redis.get(ipKey);
    if (ipCount && parseInt(ipCount) >= 5) {
      return true; // Rate limited
    }

    // Increment counters
    if (emailCount) {
      await this.redis.setex(emailKey, 3600, (parseInt(emailCount) + 1).toString());
    } else {
      await this.redis.setex(emailKey, 3600, '1');
    }

    if (ipCount) {
      await this.redis.setex(ipKey, 3600, (parseInt(ipCount) + 1).toString());
    } else {
      await this.redis.setex(ipKey, 3600, '1');
    }

    return false; // Not rate limited
  }

  private async checkAccountLockout(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true }
    });

    if (!user) return false;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return true; // Account is locked
    }

    // Auto-unlock if expired
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: null,
          lockedReason: null,
          passwordResetAttempts: 0,
          failedLoginAttempts: 0
        }
      });
      return false;
    }

    return false;
  }

  private async getResetAttemptsCount(userId: string): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const count = await this.prisma.passwordResetToken.count({
      where: {
        userId,
        createdAt: { gte: twentyFourHoursAgo }
      }
    });

    return count;
  }

  private async lockAccount(userId: string, reason: string): Promise<void> {
    const lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: lockUntil,
        lockedReason: reason
      }
    });

    await this.logSecurityEvent(userId, 'ACCOUNT_LOCKED', 'CRITICAL', {
      reason,
      lockUntil: lockUntil.toISOString()
    });
  }

  private async acquireLock(userId: string): Promise<boolean> {
    const lockKey = `lock:password-reset:${userId}`;
    const lockValue = crypto.randomUUID();

    try {
      // Use SETNX with EXPIRE pattern (atomic enough for this use case)
      const acquired = await this.redis.setnx(lockKey, lockValue);
      if (acquired === 1) {
        await this.redis.expire(lockKey, 10);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[PasswordResetService] Failed to acquire lock:', error);
      return false;
    }
  }

  private async releaseLock(userId: string): Promise<void> {
    const lockKey = `lock:password-reset:${userId}`;
    await this.redis.del(lockKey);
  }

  private async revokeExistingTokens(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        isRevoked: false,
        expiresAt: { gt: new Date() }
      },
      data: {
        isRevoked: true,
        revokedReason: 'NEW_REQUEST'
      }
    });
  }

  private validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Basic requirements
    if (password.length < 12) {
      errors.push('minimum 12 characters');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('one digit');
    }

    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('one special character');
    }

    // Use zxcvbn for advanced strength checking
    const result = zxcvbn(password);
    if (result.score < MIN_PASSWORD_SCORE) {
      errors.push(`password strength score is ${result.score}/4 (minimum: ${MIN_PASSWORD_SCORE}/4)`);
      if (result.feedback.warning) {
        errors.push(result.feedback.warning);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_COUNT,
      select: { passwordHash: true }
    });

    for (const entry of history) {
      const isMatch = await bcrypt.compare(newPassword, entry.passwordHash);
      if (isMatch) {
        return false; // Password was used before
      }
    }

    return true; // Password is unique
  }

  private async verify2FA(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabledAt: true }
    });

    if (!user?.twoFactorEnabledAt || !user.twoFactorSecret) {
      return true; // 2FA not enabled
    }

    // Verify TOTP (assuming twoFactorSecret is stored in base32 format)
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1 // 90-second window
    });

    return isValid;
  }

  private async detectAnomalies(
    userId: string,
    deviceFingerprint: string,
    ipAddress: string,
    geoLocation: string
  ): Promise<{ isAnomaly: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastLoginDevice: true,
        lastLoginIp: true,
        lastLoginLocation: true,
        lastActiveAt: true
      }
    });

    if (!user) return { isAnomaly: false };

    // Check for impossible travel
    if (user.lastLoginLocation && geoLocation) {
      const lastCountry = user.lastLoginLocation.split(',')[1]?.trim();
      const currentCountry = geoLocation.split(',')[1]?.trim();

      if (lastCountry && currentCountry && lastCountry !== currentCountry) {
        const lastActive = user.lastActiveAt ? new Date(user.lastActiveAt) : new Date();
        const hoursSinceLastActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastActive < 1) {
          return {
            isAnomaly: true,
            reason: `Impossible travel: ${lastCountry} to ${currentCountry} in ${hoursSinceLastActive.toFixed(1)}h`
          };
        }
      }
    }

    return { isAnomaly: false };
  }

  private async logSecurityEvent(
    userId: string | null,
    eventType: string,
    severity: string,
    metadata: any
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
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          deviceFingerprint: metadata.deviceFingerprint,
          geoLocation: metadata.geoLocation
        }
      });
    } catch (error) {
      console.error('[PasswordResetService] Failed to log security event:', error);
    }
  }
}
