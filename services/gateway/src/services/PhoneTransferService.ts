/**
 * Phone Transfer Service - Transfer phone number during registration
 *
 * When a user registers with a phone number that already belongs to another account,
 * this service handles the verification and transfer process.
 *
 * Flow:
 * 1. Registration detects phone belongs to another user
 * 2. User requests phone transfer verification → SMS sent to phone
 * 3. User enters code → Phone transferred to new account
 * 4. If user skips/fails → Account created without phone
 *
 * Security Features:
 * - SMS verification required
 * - SHA-256 hashed codes
 * - Rate limiting (3 attempts per code)
 * - Atomic transfer with audit trail
 */

import crypto from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { RedisWrapper } from './RedisWrapper';
import { SmsService } from './SmsService';
import { maskEmail, maskUsername, maskDisplayName } from './PhonePasswordResetService';

const CODE_EXPIRY_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PhoneTransferInitRequest {
  phoneNumber: string;
  phoneCountryCode: string;
  newUserId: string;
  ipAddress: string;
  userAgent: string;
}

export interface PhoneTransferInitResult {
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
  ipAddress: string;
}

export interface PhoneTransferVerifyResult {
  success: boolean;
  transferred?: boolean;
  error?: string;
}

// Interfaces for registration flow (account NOT yet created)

export interface PhoneTransferForRegistrationInitRequest {
  phoneNumber: string;
  phoneCountryCode: string;
  pendingUsername: string;
  pendingEmail: string;
  ipAddress: string;
  userAgent: string;
}

export interface PhoneTransferForRegistrationInitResult {
  success: boolean;
  transferId?: string;
  error?: string;
}

export interface PhoneTransferVerifyForRegistrationRequest {
  transferId: string;
  code: string;
  ipAddress: string;
}

export interface PhoneTransferVerifyForRegistrationResult {
  success: boolean;
  verified?: boolean;
  transferToken?: string; // Token to use in /register call
  error?: string;
}

// ============================================================================
// Phone Transfer Service Class
// ============================================================================

export class PhoneTransferService {
  constructor(
    private prisma: PrismaClient,
    private redis: RedisWrapper,
    private smsService: SmsService
  ) {}

  /**
   * Check if phone belongs to another user and return masked info
   */
  async checkPhoneOwnership(
    phoneNumber: string
  ): Promise<{
    exists: boolean;
    ownerId?: string;
    maskedInfo?: { displayName: string; username: string; email: string };
  }> {
    const owner = await this.prisma.user.findFirst({
      where: {
        phoneNumber,
        isActive: true,
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        email: true,
        phoneVerifiedAt: true,
      },
    });

    if (!owner) {
      return { exists: false };
    }

    // Phone must be verified to transfer
    if (!owner.phoneVerifiedAt) {
      return { exists: false };
    }

    return {
      exists: true,
      ownerId: owner.id,
      maskedInfo: {
        displayName: maskDisplayName(owner.displayName),
        username: maskUsername(owner.username),
        email: maskEmail(owner.email),
      },
    };
  }

  /**
   * Initiate phone transfer - sends SMS code to existing owner's phone
   */
  async initiateTransfer(request: PhoneTransferInitRequest): Promise<PhoneTransferInitResult> {
    const { phoneNumber, phoneCountryCode, newUserId, ipAddress, userAgent } = request;

    console.log('[PhoneTransfer] 📱 ======== INITIATE TRANSFER ========');
    console.log('[PhoneTransfer] 📱 Phone:', phoneNumber);
    console.log('[PhoneTransfer] 📱 New User ID:', newUserId);
    console.log('[PhoneTransfer] 📱 IP:', ipAddress);

    try {
      // 1. Find current owner
      const currentOwner = await this.prisma.user.findFirst({
        where: {
          phoneNumber,
          isActive: true,
          phoneVerifiedAt: { not: null },
        },
        select: {
          id: true,
          displayName: true,
          username: true,
          email: true,
        },
      });

      if (!currentOwner) {
        console.log('[PhoneTransfer] ❌ No verified owner found for this phone');
        return { success: false, error: 'phone_not_found' };
      }

      // Note: Rate limiting is handled by middleware (phoneTransferRateLimiter)
      // No need for internal rate limiting here

      // 2. Generate SMS code
      const code = this.generateCode();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // 4. Create transfer token using Redis (temporary, no need for DB model)
      const transferId = crypto.randomBytes(16).toString('hex');
      const transferData = {
        fromUserId: currentOwner.id,
        toUserId: newUserId,
        phoneNumber,
        phoneCountryCode,
        codeHash,
        attempts: 0,
        createdAt: Date.now(),
        ipAddress,
        userAgent,
      };

      // Store in Redis with 10 min expiry
      await this.redis.setex(
        `phone-transfer:${transferId}`,
        CODE_EXPIRY_MINUTES * 60,
        JSON.stringify(transferData)
      );

      // 5. Send SMS
      const smsResult = await this.smsService.sendPasswordResetCode(phoneNumber, code);

      if (!smsResult.success) {
        console.error('[PhoneTransfer] ❌ SMS send failed:', smsResult.error);
        await this.redis.del(`phone-transfer:${transferId}`);
        return { success: false, error: 'sms_send_failed' };
      }

      // 6. Log security event on current owner
      await this.logSecurityEvent(currentOwner.id, 'PHONE_TRANSFER_INITIATED', 'MEDIUM', {
        requestedBy: newUserId,
        ipAddress,
      });

      console.log('[PhoneTransfer] ✅ Transfer initiated, SMS sent');
      return {
        success: true,
        transferId,
        maskedOwnerInfo: {
          displayName: maskDisplayName(currentOwner.displayName),
          username: maskUsername(currentOwner.username),
          email: maskEmail(currentOwner.email),
        },
      };
    } catch (error) {
      console.error('[PhoneTransfer] Error in initiateTransfer:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Verify SMS code and complete the transfer
   */
  async verifyAndTransfer(request: PhoneTransferVerifyRequest): Promise<PhoneTransferVerifyResult> {
    const { transferId, code, ipAddress } = request;

    console.log('[PhoneTransfer] ✉️ ======== VERIFY TRANSFER ========');
    console.log('[PhoneTransfer] ✉️ Transfer ID:', transferId);
    console.log('[PhoneTransfer] ✉️ IP:', ipAddress);

    try {
      // 1. Get transfer data from Redis
      const transferDataRaw = await this.redis.get(`phone-transfer:${transferId}`);
      if (!transferDataRaw) {
        return { success: false, error: 'transfer_expired' };
      }

      const transferData = JSON.parse(transferDataRaw);

      // 2. Check attempts
      if (transferData.attempts >= MAX_CODE_ATTEMPTS) {
        await this.redis.del(`phone-transfer:${transferId}`);
        return { success: false, error: 'max_attempts_exceeded' };
      }

      // 3. Verify code
      const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(codeHash),
        Buffer.from(transferData.codeHash)
      );

      if (!isValid) {
        // Increment attempts
        transferData.attempts += 1;
        await this.redis.setex(
          `phone-transfer:${transferId}`,
          CODE_EXPIRY_MINUTES * 60,
          JSON.stringify(transferData)
        );

        await this.logSecurityEvent(transferData.toUserId, 'PHONE_TRANSFER_CODE_FAILED', 'MEDIUM', {
          transferId,
          attempt: transferData.attempts,
          ipAddress,
        });

        return { success: false, error: 'invalid_code' };
      }

      // 4. Execute transfer atomically
      await this.prisma.$transaction(async (tx) => {
        // Remove phone from old account
        await tx.user.update({
          where: { id: transferData.fromUserId },
          data: {
            phoneNumber: null,
            phoneCountryCode: null,
            phoneVerifiedAt: null,
            phoneVerificationCode: null,
            phoneVerificationExpiry: null,
          },
        });

        // Add phone to new account with transfer tracking
        await tx.user.update({
          where: { id: transferData.toUserId },
          data: {
            phoneNumber: transferData.phoneNumber,
            phoneCountryCode: transferData.phoneCountryCode,
            phoneVerifiedAt: new Date(),
            phoneTransferredFromUserId: transferData.fromUserId,
            phoneTransferredAt: new Date(),
          },
        });

        // Log security events
        await tx.securityEvent.create({
          data: {
            userId: transferData.fromUserId,
            eventType: 'PHONE_TRANSFERRED_OUT',
            severity: 'HIGH',
            status: 'SUCCESS',
            description: 'Phone number transferred to new account during registration',
            metadata: {
              toUserId: transferData.toUserId,
              phoneHash: this.hashForLog(transferData.phoneNumber),
              method: 'registration_transfer',
            },
            ipAddress,
          },
        });

        await tx.securityEvent.create({
          data: {
            userId: transferData.toUserId,
            eventType: 'PHONE_TRANSFERRED_IN',
            severity: 'MEDIUM',
            status: 'SUCCESS',
            description: 'Phone number transferred from existing account during registration',
            metadata: {
              fromUserId: transferData.fromUserId,
              phoneHash: this.hashForLog(transferData.phoneNumber),
              method: 'registration_transfer',
            },
            ipAddress,
          },
        });
      });

      // 5. Clean up Redis
      await this.redis.del(`phone-transfer:${transferId}`);

      console.log('[PhoneTransfer] ✅ Phone transferred successfully');
      return { success: true, transferred: true };
    } catch (error) {
      console.error('[PhoneTransfer] Error in verifyAndTransfer:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Cancel a pending transfer
   */
  async cancelTransfer(transferId: string): Promise<void> {
    await this.redis.del(`phone-transfer:${transferId}`);
  }

  /**
   * Resend SMS code for transfer
   */
  async resendCode(
    transferId: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Get transfer data
      const transferDataRaw = await this.redis.get(`phone-transfer:${transferId}`);
      if (!transferDataRaw) {
        return { success: false, error: 'transfer_expired' };
      }

      const transferData = JSON.parse(transferDataRaw);

      // 2. Rate limit resend (1 per 60 seconds)
      const resendKey = `ratelimit:phone-transfer:resend:${transferId}`;
      const lastResend = await this.redis.get(resendKey);
      if (lastResend) {
        return { success: false, error: 'rate_limited' };
      }

      // 3. Generate new code
      const code = this.generateCode();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // 4. Update transfer data
      transferData.codeHash = codeHash;
      transferData.attempts = 0;
      await this.redis.setex(
        `phone-transfer:${transferId}`,
        CODE_EXPIRY_MINUTES * 60,
        JSON.stringify(transferData)
      );

      // 5. Send SMS
      const smsResult = await this.smsService.sendPasswordResetCode(
        transferData.phoneNumber,
        code
      );

      if (!smsResult.success) {
        return { success: false, error: 'sms_send_failed' };
      }

      // 6. Set resend rate limit
      await this.redis.setex(resendKey, 60, '1');

      return { success: true };
    } catch (error) {
      console.error('[PhoneTransfer] Error in resendCode:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  // ============================================================================
  // Registration Flow Methods (account NOT yet created)
  // ============================================================================

  /**
   * Initiate phone transfer for registration - account does NOT exist yet
   * Sends SMS to verify phone ownership before creating the account
   */
  async initiateTransferForRegistration(
    request: PhoneTransferForRegistrationInitRequest
  ): Promise<PhoneTransferForRegistrationInitResult> {
    const { phoneNumber, phoneCountryCode, pendingUsername, pendingEmail, ipAddress, userAgent } = request;

    console.log('[PhoneTransfer] 📱 ======== INITIATE REGISTRATION TRANSFER ========');
    console.log('[PhoneTransfer] 📱 Phone:', phoneNumber);
    console.log('[PhoneTransfer] 📱 Pending Username:', pendingUsername);
    console.log('[PhoneTransfer] 📱 IP:', ipAddress);

    try {
      // 1. Find current owner
      const currentOwner = await this.prisma.user.findFirst({
        where: {
          phoneNumber,
          isActive: true,
          phoneVerifiedAt: { not: null },
        },
        select: {
          id: true,
          displayName: true,
          username: true,
          email: true,
        },
      });

      if (!currentOwner) {
        console.log('[PhoneTransfer] ❌ No verified owner found for this phone');
        return { success: false, error: 'phone_not_found' };
      }

      // 2. Generate SMS code
      const code = this.generateCode();
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // 3. Create transfer token using Redis
      // For registration flow, we store pending registration data instead of newUserId
      const transferId = crypto.randomBytes(16).toString('hex');
      const transferData = {
        type: 'registration', // Mark as registration flow
        fromUserId: currentOwner.id,
        phoneNumber,
        phoneCountryCode,
        pendingUsername,
        pendingEmail,
        codeHash,
        attempts: 0,
        verified: false,
        createdAt: Date.now(),
        ipAddress,
        userAgent,
      };

      // Store in Redis with 10 min expiry
      await this.redis.setex(
        `phone-transfer:${transferId}`,
        CODE_EXPIRY_MINUTES * 60,
        JSON.stringify(transferData)
      );

      // 4. Send SMS
      const smsResult = await this.smsService.sendPasswordResetCode(phoneNumber, code);

      if (!smsResult.success) {
        console.error('[PhoneTransfer] ❌ SMS send failed:', smsResult.error);
        await this.redis.del(`phone-transfer:${transferId}`);
        return { success: false, error: 'sms_send_failed' };
      }

      // 5. Log security event on current owner
      await this.logSecurityEvent(currentOwner.id, 'PHONE_TRANSFER_REGISTRATION_INITIATED', 'MEDIUM', {
        pendingUsername,
        ipAddress,
      });

      console.log('[PhoneTransfer] ✅ Registration transfer initiated, SMS sent');
      return {
        success: true,
        transferId,
      };
    } catch (error) {
      console.error('[PhoneTransfer] Error in initiateTransferForRegistration:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Verify SMS code for registration transfer
   * Does NOT execute the transfer - just verifies and returns a token
   * The actual transfer happens when /register is called with the transferToken
   */
  async verifyForRegistration(
    request: PhoneTransferVerifyForRegistrationRequest
  ): Promise<PhoneTransferVerifyForRegistrationResult> {
    const { transferId, code, ipAddress } = request;

    console.log('[PhoneTransfer] ✉️ ======== VERIFY REGISTRATION TRANSFER ========');
    console.log('[PhoneTransfer] ✉️ Transfer ID:', transferId);
    console.log('[PhoneTransfer] ✉️ IP:', ipAddress);

    try {
      // 1. Get transfer data from Redis
      const transferDataRaw = await this.redis.get(`phone-transfer:${transferId}`);
      if (!transferDataRaw) {
        return { success: false, error: 'transfer_expired' };
      }

      const transferData = JSON.parse(transferDataRaw);

      // 2. Verify this is a registration transfer
      if (transferData.type !== 'registration') {
        return { success: false, error: 'invalid_transfer_type' };
      }

      // 3. Check attempts
      if (transferData.attempts >= MAX_CODE_ATTEMPTS) {
        await this.redis.del(`phone-transfer:${transferId}`);
        return { success: false, error: 'max_attempts_exceeded' };
      }

      // 4. Verify code
      const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(codeHash),
        Buffer.from(transferData.codeHash)
      );

      if (!isValid) {
        // Increment attempts
        transferData.attempts += 1;
        await this.redis.setex(
          `phone-transfer:${transferId}`,
          CODE_EXPIRY_MINUTES * 60,
          JSON.stringify(transferData)
        );

        return { success: false, error: 'invalid_code' };
      }

      // 5. Mark as verified and generate transfer token
      // The transfer token is used to prove verification when calling /register
      const transferToken = crypto.randomBytes(32).toString('hex');
      const transferTokenHash = crypto.createHash('sha256').update(transferToken).digest('hex');

      // Update transfer data with verified status and token
      transferData.verified = true;
      transferData.transferTokenHash = transferTokenHash;
      transferData.verifiedAt = Date.now();

      // Extend expiry for 30 minutes to allow registration completion
      await this.redis.setex(
        `phone-transfer:${transferId}`,
        30 * 60, // 30 minutes
        JSON.stringify(transferData)
      );

      // Also store the transfer token → transferId mapping for quick lookup
      await this.redis.setex(
        `phone-transfer-token:${transferTokenHash}`,
        30 * 60,
        transferId
      );

      console.log('[PhoneTransfer] ✅ Registration transfer verified');
      return {
        success: true,
        verified: true,
        transferToken, // Return raw token to frontend
      };
    } catch (error) {
      console.error('[PhoneTransfer] Error in verifyForRegistration:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Execute phone transfer for registration
   * Called by AuthService.register() when transferToken is provided
   */
  async executeRegistrationTransfer(
    transferToken: string,
    newUserId: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Find transfer by token
      const tokenHash = crypto.createHash('sha256').update(transferToken).digest('hex');
      const transferId = await this.redis.get(`phone-transfer-token:${tokenHash}`);

      if (!transferId) {
        return { success: false, error: 'invalid_transfer_token' };
      }

      // 2. Get transfer data
      const transferDataRaw = await this.redis.get(`phone-transfer:${transferId}`);
      if (!transferDataRaw) {
        return { success: false, error: 'transfer_expired' };
      }

      const transferData = JSON.parse(transferDataRaw);

      // 3. Verify token and status
      if (!transferData.verified || transferData.transferTokenHash !== tokenHash) {
        return { success: false, error: 'invalid_transfer_token' };
      }

      // 4. Execute transfer atomically
      await this.prisma.$transaction(async (tx) => {
        // Remove phone from old account
        await tx.user.update({
          where: { id: transferData.fromUserId },
          data: {
            phoneNumber: null,
            phoneCountryCode: null,
            phoneVerifiedAt: null,
            phoneVerificationCode: null,
            phoneVerificationExpiry: null,
          },
        });

        // Add phone to new account with transfer tracking
        await tx.user.update({
          where: { id: newUserId },
          data: {
            phoneNumber: transferData.phoneNumber,
            phoneCountryCode: transferData.phoneCountryCode,
            phoneVerifiedAt: new Date(),
            phoneTransferredFromUserId: transferData.fromUserId,
            phoneTransferredAt: new Date(),
          },
        });

        // Log security events
        await tx.securityEvent.create({
          data: {
            userId: transferData.fromUserId,
            eventType: 'PHONE_TRANSFERRED_OUT',
            severity: 'HIGH',
            status: 'SUCCESS',
            description: 'Phone number transferred to new account during registration',
            metadata: {
              toUserId: newUserId,
              phoneHash: this.hashForLog(transferData.phoneNumber),
              method: 'registration_verified_transfer',
            },
            ipAddress,
          },
        });

        await tx.securityEvent.create({
          data: {
            userId: newUserId,
            eventType: 'PHONE_TRANSFERRED_IN',
            severity: 'MEDIUM',
            status: 'SUCCESS',
            description: 'Phone number transferred from existing account during registration',
            metadata: {
              fromUserId: transferData.fromUserId,
              phoneHash: this.hashForLog(transferData.phoneNumber),
              method: 'registration_verified_transfer',
            },
            ipAddress,
          },
        });
      });

      // 5. Clean up Redis
      await this.redis.del(`phone-transfer:${transferId}`);
      await this.redis.del(`phone-transfer-token:${tokenHash}`);

      console.log('[PhoneTransfer] ✅ Registration transfer executed successfully');
      return { success: true };
    } catch (error) {
      console.error('[PhoneTransfer] Error in executeRegistrationTransfer:', error);
      return { success: false, error: 'internal_error' };
    }
  }

  /**
   * Get transfer data by token (for validation in register)
   */
  async getTransferDataByToken(
    transferToken: string
  ): Promise<{
    valid: boolean;
    phoneNumber?: string;
    phoneCountryCode?: string;
    fromUserId?: string;
  }> {
    try {
      const tokenHash = crypto.createHash('sha256').update(transferToken).digest('hex');
      const transferId = await this.redis.get(`phone-transfer-token:${tokenHash}`);

      if (!transferId) {
        return { valid: false };
      }

      const transferDataRaw = await this.redis.get(`phone-transfer:${transferId}`);
      if (!transferDataRaw) {
        return { valid: false };
      }

      const transferData = JSON.parse(transferDataRaw);

      if (!transferData.verified || transferData.transferTokenHash !== tokenHash) {
        return { valid: false };
      }

      return {
        valid: true,
        phoneNumber: transferData.phoneNumber,
        phoneCountryCode: transferData.phoneCountryCode,
        fromUserId: transferData.fromUserId,
      };
    } catch (error) {
      console.error('[PhoneTransfer] Error in getTransferDataByToken:', error);
      return { valid: false };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashForLog(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 8);
  }

  private async logSecurityEvent(
    userId: string,
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
          ipAddress: metadata.ipAddress,
        },
      });
    } catch (error) {
      console.error('[PhoneTransfer] Failed to log security event:', error);
    }
  }
}
