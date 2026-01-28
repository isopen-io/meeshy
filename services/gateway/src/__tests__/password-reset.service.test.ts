/**
 * Password Reset Service Unit Tests
 *
 * Run with: npm test -- password-reset.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PasswordResetService } from '../services/PasswordResetService';
import { RedisWrapper } from '../services/RedisWrapper';
import { EmailService } from '../services/EmailService';
import { GeoIPService } from '../services/GeoIPService';

// Mock Prisma Client
const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn()
  },
  passwordHistory: {
    findMany: jest.fn(),
    create: jest.fn()
  },
  userSession: {
    updateMany: jest.fn()
  },
  securityEvent: {
    create: jest.fn()
  },
  $transaction: jest.fn((callback) => callback(mockPrisma))
};

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let redis: RedisWrapper;
  let emailService: EmailService;
  let geoIPService: GeoIPService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    redis = new RedisWrapper();
    emailService = new EmailService();
    geoIPService = new GeoIPService();

    service = new PasswordResetService(
      mockPrisma as any,
      redis,
      emailService,
      geoIPService,
      'test-captcha-secret'
    );
  });

  afterEach(async () => {
    await redis.close();
  });

  describe('requestPasswordReset', () => {
    it('should return generic response for invalid CAPTCHA', async () => {
      // Mock CAPTCHA failure
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: false })
        })
      ) as any;

      const result = await service.requestPasswordReset({
        email: 'test@example.com',
        captchaToken: 'invalid',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
    });

    it('should return generic response for non-existent email', async () => {
      // Mock successful CAPTCHA
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      ) as any;

      // Mock user not found
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await service.requestPasswordReset({
        email: 'nonexistent@example.com',
        captchaToken: 'valid',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
    });

    it('should return generic response for unverified email', async () => {
      // Mock successful CAPTCHA
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      ) as any;

      // Mock user with unverified email
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        emailVerifiedAt: null,
        firstName: 'Test',
        lastName: 'User'
      });

      const result = await service.requestPasswordReset({
        email: 'test@example.com',
        captchaToken: 'valid',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });
  });

  describe('completePasswordReset', () => {
    it('should reject weak passwords', async () => {
      const result = await service.completePasswordReset({
        token: 'valid-token',
        newPassword: 'weak',
        confirmPassword: 'weak',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password requirements');
    });

    it('should reject mismatched passwords', async () => {
      const result = await service.completePasswordReset({
        token: 'valid-token',
        newPassword: 'StrongPassword123!',
        confirmPassword: 'DifferentPassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('do not match');
    });

    it('should reject invalid token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      const result = await service.completePasswordReset({
        token: 'invalid-token',
        newPassword: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });

    it('should reject expired token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: 'user-id',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000), // Expired
        usedAt: null,
        isRevoked: false,
        user: {
          id: 'user-id',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        }
      });

      const result = await service.completePasswordReset({
        token: 'expired-token',
        newPassword: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });

    it('should reject already-used token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: 'user-id',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000), // Not expired
        usedAt: new Date(), // Already used
        isRevoked: false,
        user: {
          id: 'user-id',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        }
      });

      const result = await service.completePasswordReset({
        token: 'used-token',
        newPassword: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });
  });

  describe('Password Validation', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = [
        'MyS3cur3P@ssw0rd!',
        'C0mpl3x&Str0ng#2024',
        'R@nd0m$ecure!Pass123'
      ];

      strongPasswords.forEach(password => {
        const validation = (service as any).validatePasswordStrength(password);
        expect(validation.isValid).toBe(true);
      });
    });

    it('should reject passwords without uppercase', () => {
      const validation = (service as any).validatePasswordStrength('weakpassword123!');
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('one uppercase letter');
    });

    it('should reject passwords without lowercase', () => {
      const validation = (service as any).validatePasswordStrength('WEAKPASSWORD123!');
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('one lowercase letter');
    });

    it('should reject passwords without digits', () => {
      const validation = (service as any).validatePasswordStrength('WeakPassword!');
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('one digit');
    });

    it('should reject weak passwords based on zxcvbn score', () => {
      const validation = (service as any).validatePasswordStrength('WeakPassword123');
      expect(validation.isValid).toBe(false);
      // Check that the password is rejected due to low strength score (uses zxcvbn)
      const scoreError = validation.errors.find((err: string) => err.includes('password strength score'));
      expect(scoreError).toBeDefined();
      expect(scoreError).toContain('minimum: 3/4');
    });

    it('should reject passwords shorter than 8 characters', () => {
      const validation = (service as any).validatePasswordStrength('Sh1!');
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('minimum 8 characters');
    });
  });
});
