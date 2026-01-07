/**
 * PasswordResetService Unit Tests
 *
 * Comprehensive tests for password reset service covering:
 * - Password reset request flow
 * - Password reset completion flow
 * - Token validation (expiry, reuse, revocation)
 * - Password strength validation
 * - Rate limiting
 * - Account lockout
 * - 2FA verification
 * - Password history checking
 * - Anomaly detection
 * - Security event logging
 *
 * Run with: npm test -- PasswordResetService.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock bcryptjs - using any for mock function types to avoid TypeScript issues
const mockBcryptHash = jest.fn() as jest.Mock<any>;
const mockBcryptCompare = jest.fn() as jest.Mock<any>;

jest.mock('bcryptjs', () => ({
  hash: (password: string, rounds: number) => mockBcryptHash(password, rounds),
  compare: (password: string, hash: string) => mockBcryptCompare(password, hash)
}));

// Mock speakeasy for 2FA
const mockTotpVerify = jest.fn() as jest.Mock<any>;

jest.mock('speakeasy', () => ({
  totp: {
    verify: (options: any) => mockTotpVerify(options)
  }
}));

// Mock zxcvbn for password strength
const mockZxcvbn = jest.fn() as jest.Mock<any>;

jest.mock('zxcvbn', () => (password: string) => mockZxcvbn(password));

// Mock global fetch for CAPTCHA verification
const mockFetch = jest.fn() as jest.Mock<any>;
(global as any).fetch = mockFetch;

import {
  PasswordResetService,
  PasswordResetRequest,
  PasswordResetCompletion
} from '../../../services/PasswordResetService';

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
  $transaction: jest.fn((callback: Function) => callback(mockPrisma))
} as any;

// Mock Redis Wrapper
const mockRedis = {
  get: jest.fn() as jest.Mock<any>,
  set: jest.fn() as jest.Mock<any>,
  setex: jest.fn() as jest.Mock<any>,
  setnx: jest.fn() as jest.Mock<any>,
  expire: jest.fn() as jest.Mock<any>,
  del: jest.fn() as jest.Mock<any>,
  close: jest.fn() as jest.Mock<any>
};

// Mock Email Service
const mockEmailService = {
  sendPasswordResetEmail: jest.fn() as jest.Mock<any>,
  sendPasswordChangedEmail: jest.fn() as jest.Mock<any>,
  sendSecurityAlertEmail: jest.fn() as jest.Mock<any>
};

// Mock GeoIP Service
const mockGeoIPService = {
  lookup: jest.fn() as jest.Mock<any>
};

// Sample test data
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  emailVerifiedAt: new Date(),
  lockedUntil: null,
  passwordResetAttempts: 0,
  lastPasswordResetAttempt: null,
  firstName: 'Test',
  lastName: 'User',
  password: '$2b$12$hashedpassword',
  twoFactorEnabledAt: null,
  twoFactorSecret: null,
  lastLoginDevice: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastActiveAt: new Date()
};

const mockGeoData = {
  ip: '192.168.1.1',
  city: 'New York',
  region: 'NY',
  country: 'United States',
  countryCode: 'US',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York'
};

const validResetRequest: PasswordResetRequest = {
  email: 'test@example.com',
  captchaToken: 'valid-captcha-token',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test Browser',
  deviceFingerprint: 'device-123'
};

const validResetCompletion: PasswordResetCompletion = {
  token: 'valid-reset-token',
  newPassword: 'NewSecureP@ssw0rd123!',
  confirmPassword: 'NewSecureP@ssw0rd123!',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test Browser',
  deviceFingerprint: 'device-123'
};

describe('PasswordResetService', () => {
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.setnx.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.del.mockResolvedValue(1);

    mockGeoIPService.lookup.mockResolvedValue(mockGeoData);

    mockZxcvbn.mockReturnValue({
      score: 4,
      feedback: { warning: '', suggestions: [] }
    });

    mockBcryptHash.mockResolvedValue('$2b$12$newhashedpassword');
    mockBcryptCompare.mockResolvedValue(false);

    mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);
    mockEmailService.sendPasswordChangedEmail.mockResolvedValue(undefined);
    mockEmailService.sendSecurityAlertEmail.mockResolvedValue(undefined);

    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.passwordResetToken.count.mockResolvedValue(0);
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });
    mockPrisma.passwordHistory.findMany.mockResolvedValue([]);

    service = new PasswordResetService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any,
      'test-captcha-secret'
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================
  // requestPasswordReset Tests
  // =========================================

  describe('requestPasswordReset', () => {
    describe('CAPTCHA Verification', () => {
      it('should return generic response for invalid CAPTCHA', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: false })
        });

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
        expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      });

      it('should return generic response when CAPTCHA verification fails', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
      });

      it('should proceed when CAPTCHA is valid', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.user.findFirst).toHaveBeenCalled();
      });
    });

    describe('Rate Limiting', () => {
      it('should return generic response when email is rate limited', async () => {
        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes('email:')) return Promise.resolve('3');
          return Promise.resolve(null);
        });

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'RATE_LIMIT_EXCEEDED'
            })
          })
        );
      });

      it('should return generic response when IP is rate limited', async () => {
        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes('ip:')) return Promise.resolve('5');
          return Promise.resolve(null);
        });

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
      });

      it('should increment rate limit counters when not rate limited', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestPasswordReset(validResetRequest);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('email:'),
          3600,
          '1'
        );
        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('ip:'),
          3600,
          '1'
        );
      });

      it('should increment existing rate limit counters', async () => {
        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes('email:')) return Promise.resolve('1');
          if (key.includes('ip:')) return Promise.resolve('2');
          return Promise.resolve(null);
        });
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestPasswordReset(validResetRequest);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('email:'),
          3600,
          '2'
        );
        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('ip:'),
          3600,
          '3'
        );
      });
    });

    describe('User Lookup', () => {
      it('should return generic response for non-existent user', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
      });

      it('should search for user with case-insensitive email', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestPasswordReset({
          ...validResetRequest,
          email: 'TEST@EXAMPLE.COM'
        });

        expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
          where: {
            email: { equals: 'test@example.com', mode: 'insensitive' },
            isActive: true
          },
          select: expect.any(Object)
        });
      });

      it('should return generic response for unverified email', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({
          ...mockUser,
          emailVerifiedAt: null
        });

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_UNVERIFIED_EMAIL'
            })
          })
        );
      });
    });

    describe('Account Lockout', () => {
      it('should return generic response for locked account', async () => {
        const lockedUser = {
          ...mockUser,
          lockedUntil: new Date(Date.now() + 86400000) // 24 hours from now
        };
        mockPrisma.user.findFirst.mockResolvedValue(lockedUser);
        mockPrisma.user.findUnique.mockResolvedValue(lockedUser);

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_LOCKED_ACCOUNT'
            })
          })
        );
      });

      it('should auto-unlock expired lockout', async () => {
        const expiredLockUser = {
          ...mockUser,
          lockedUntil: new Date(Date.now() - 1000) // 1 second ago
        };
        mockPrisma.user.findFirst.mockResolvedValue(expiredLockUser);
        mockPrisma.user.findUnique.mockResolvedValue(expiredLockUser);
        mockPrisma.passwordResetToken.count.mockResolvedValue(0);
        mockRedis.setnx.mockResolvedValue(1);

        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            lockedUntil: null,
            lockedReason: null
          })
        });
      });
    });

    describe('Reset Attempts Limit', () => {
      it('should lock account when reset attempts exceed limit', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
        mockPrisma.passwordResetToken.count.mockResolvedValue(10);

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            lockedReason: 'PASSWORD_RESET_ABUSE'
          })
        });
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_ABUSE',
              severity: 'CRITICAL'
            })
          })
        );
      });
    });

    describe('Distributed Locking', () => {
      it('should return generic response when lock cannot be acquired', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
        mockPrisma.passwordResetToken.count.mockResolvedValue(0);
        mockRedis.setnx.mockResolvedValue(0); // Lock not acquired

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      });

      it('should release lock after processing', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
        mockPrisma.passwordResetToken.count.mockResolvedValue(0);
        mockRedis.setnx.mockResolvedValue(1);

        await service.requestPasswordReset(validResetRequest);

        expect(mockRedis.del).toHaveBeenCalledWith(
          expect.stringContaining('lock:password-reset:')
        );
      });

      it('should handle lock acquisition error gracefully', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
        mockPrisma.passwordResetToken.count.mockResolvedValue(0);
        mockRedis.setnx.mockRejectedValue(new Error('Redis error'));

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
      });
    });

    describe('Token Generation and Email Sending', () => {
      beforeEach(() => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
        mockPrisma.passwordResetToken.count.mockResolvedValue(0);
        mockRedis.setnx.mockResolvedValue(1);
      });

      it('should revoke existing tokens before creating new one', async () => {
        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
          where: {
            userId: mockUser.id,
            usedAt: null,
            isRevoked: false,
            expiresAt: { gt: expect.any(Date) }
          },
          data: {
            isRevoked: true,
            revokedReason: 'NEW_REQUEST'
          }
        });
      });

      it('should create password reset token with correct data', async () => {
        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            tokenHash: expect.any(String),
            expiresAt: expect.any(Date),
            ipAddress: validResetRequest.ipAddress,
            userAgent: validResetRequest.userAgent,
            deviceFingerprint: validResetRequest.deviceFingerprint
          })
        });
      });

      it('should update user reset attempts', async () => {
        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: {
            passwordResetAttempts: { increment: 1 },
            lastPasswordResetAttempt: expect.any(Date)
          }
        });
      });

      it('should send password reset email', async () => {
        await service.requestPasswordReset(validResetRequest);

        expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith({
          to: mockUser.email,
          name: `${mockUser.firstName} ${mockUser.lastName}`,
          resetLink: expect.stringContaining('token='),
          expiryMinutes: 15
        });
      });

      it('should log security event for password reset request', async () => {
        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: mockUser.id,
              eventType: 'PASSWORD_RESET_REQUEST',
              severity: 'MEDIUM'
            })
          })
        );
      });

      it('should include geolocation in token and logs', async () => {
        await service.requestPasswordReset(validResetRequest);

        expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            geoLocation: 'New York, United States',
            geoCoordinates: '40.7128,-74.006'
          })
        });
      });
    });

    describe('Error Handling', () => {
      it('should return generic response on any error', async () => {
        mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.success).toBe(true);
        expect(result.message).toContain('If an account exists');
      });
    });
  });

  // =========================================
  // completePasswordReset Tests
  // =========================================

  describe('completePasswordReset', () => {
    describe('Password Validation', () => {
      it('should reject mismatched passwords', async () => {
        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'Password123!',
          confirmPassword: 'DifferentPassword123!'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Passwords do not match');
      });

      it('should reject password shorter than 12 characters', async () => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'Short1!',
          confirmPassword: 'Short1!'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('minimum 12 characters');
      });

      it('should reject password without lowercase letter', async () => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'ALLUPPERCASE123!',
          confirmPassword: 'ALLUPPERCASE123!'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('one lowercase letter');
      });

      it('should reject password without uppercase letter', async () => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'alllowercase123!',
          confirmPassword: 'alllowercase123!'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('one uppercase letter');
      });

      it('should reject password without digit', async () => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'NoDigitsHere!!',
          confirmPassword: 'NoDigitsHere!!'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('one digit');
      });

      it('should reject password without special character', async () => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'NoSpecialChars123',
          confirmPassword: 'NoSpecialChars123'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('one special character');
      });

      it('should reject weak password based on zxcvbn score', async () => {
        mockZxcvbn.mockReturnValue({
          score: 1,
          feedback: { warning: 'This is a common password' }
        });

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'Password123!!!',
          confirmPassword: 'Password123!!!'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('password strength score');
      });

      it('should accept strong password meeting all requirements', async () => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          newPassword: 'VeryStr0ng@Pass!',
          confirmPassword: 'VeryStr0ng@Pass!'
        });

        // Will fail on token validation but password validation passed
        expect(result.error).toContain('Invalid or expired');
      });
    });

    describe('Token Validation', () => {
      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
      });

      it('should reject invalid token', async () => {
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid or expired reset token');
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_INVALID_TOKEN'
            })
          })
        );
      });

      it('should reject expired token', async () => {
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() - 1000), // Expired
          usedAt: null,
          isRevoked: false,
          user: mockUser
        });

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid or expired reset token');
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_EXPIRED_TOKEN'
            })
          })
        );
      });

      it('should reject already-used token', async () => {
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000), // Valid
          usedAt: new Date(), // Already used
          isRevoked: false,
          user: mockUser
        });

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid or expired reset token');
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_TOKEN_REUSE',
              severity: 'HIGH'
            })
          })
        );
      });

      it('should reject revoked token', async () => {
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: true,
          revokedReason: 'NEW_REQUEST',
          user: mockUser
        });

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid or expired reset token');
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'PASSWORD_RESET_REVOKED_TOKEN'
            })
          })
        );
      });
    });

    describe('Account Lockout During Reset', () => {
      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: false,
          user: mockUser
        });
      });

      it('should reject reset for locked account', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          lockedUntil: new Date(Date.now() + 86400000)
        });

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Account is locked. Please contact support.');
      });
    });

    describe('Two-Factor Authentication', () => {
      const userWith2FA = {
        ...mockUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: 'JBSWY3DPEHPK3PXP'
      };

      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: userWith2FA.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: false,
          user: userWith2FA
        });
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
      });

      it('should require 2FA code when 2FA is enabled', async () => {
        const result = await service.completePasswordReset({
          ...validResetCompletion,
          twoFactorCode: undefined
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('2FA code required');
      });

      it('should reject invalid 2FA code', async () => {
        mockPrisma.user.findUnique
          .mockResolvedValueOnce({ lockedUntil: null }) // For lockout check
          .mockResolvedValueOnce(userWith2FA); // For 2FA check
        mockTotpVerify.mockReturnValue(false);

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          twoFactorCode: '123456'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid 2FA code');
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: '2FA_FAILED',
              severity: 'HIGH'
            })
          })
        );
      });

      it('should accept valid 2FA code', async () => {
        mockPrisma.user.findUnique
          .mockResolvedValueOnce({ lockedUntil: null })
          .mockResolvedValueOnce(userWith2FA)
          .mockResolvedValueOnce({ lastLoginDevice: null, lastLoginIp: null });
        mockTotpVerify.mockReturnValue(true);
        mockPrisma.passwordHistory.findMany.mockResolvedValue([]);

        const result = await service.completePasswordReset({
          ...validResetCompletion,
          twoFactorCode: '123456'
        });

        expect(result.success).toBe(true);
      });
    });

    describe('Password History', () => {
      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: false,
          user: mockUser
        });
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
      });

      it('should reject password that matches previous passwords', async () => {
        mockPrisma.passwordHistory.findMany.mockResolvedValue([
          { passwordHash: '$2b$12$oldpassword1' },
          { passwordHash: '$2b$12$oldpassword2' }
        ]);
        mockBcryptCompare.mockResolvedValueOnce(true); // First password matches

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Password was used recently');
      });

      it('should accept password that is unique', async () => {
        mockPrisma.passwordHistory.findMany.mockResolvedValue([
          { passwordHash: '$2b$12$oldpassword1' }
        ]);
        mockBcryptCompare.mockResolvedValue(false);
        mockPrisma.user.findUnique.mockResolvedValue({
          lockedUntil: null,
          lastLoginDevice: null,
          lastLoginIp: null
        });

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(true);
      });
    });

    describe('Anomaly Detection', () => {
      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: false,
          user: mockUser
        });
        mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
        mockPrisma.passwordHistory.findMany.mockResolvedValue([]);
        mockBcryptCompare.mockResolvedValue(false);
      });

      it('should detect impossible travel and send security alert', async () => {
        mockPrisma.user.findUnique
          .mockResolvedValueOnce({ lockedUntil: null })
          .mockResolvedValueOnce({
            lastLoginLocation: 'Tokyo, Japan',
            lastActiveAt: new Date(Date.now() - 30 * 60 * 1000) // 30 mins ago
          });
        mockGeoIPService.lookup.mockResolvedValue({
          ...mockGeoData,
          city: 'New York',
          country: 'United States'
        });

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(true);
        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType: 'SUSPICIOUS_PASSWORD_RESET',
              severity: 'CRITICAL'
            })
          })
        );
        expect(mockEmailService.sendSecurityAlertEmail).toHaveBeenCalled();
      });

      it('should not flag travel as suspicious if enough time has passed', async () => {
        mockPrisma.user.findUnique
          .mockResolvedValueOnce({ lockedUntil: null })
          .mockResolvedValueOnce({
            lastLoginLocation: 'Tokyo, Japan',
            lastActiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
          });

        await service.completePasswordReset(validResetCompletion);

        const securityEventCalls = mockPrisma.securityEvent.create.mock.calls;
        const suspiciousCall = securityEventCalls.find(
          (call: any) => call[0]?.data?.eventType === 'SUSPICIOUS_PASSWORD_RESET'
        );
        expect(suspiciousCall).toBeUndefined();
      });
    });

    describe('Successful Password Reset', () => {
      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: false,
          user: mockUser
        });
        mockPrisma.user.findUnique.mockResolvedValue({
          lockedUntil: null,
          lastLoginDevice: null,
          lastLoginIp: null
        });
        mockPrisma.passwordHistory.findMany.mockResolvedValue([]);
        mockBcryptCompare.mockResolvedValue(false);
      });

      it('should update user password with bcrypt hash', async () => {
        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(true);
        expect(mockBcryptHash).toHaveBeenCalledWith(
          validResetCompletion.newPassword,
          12
        );
      });

      it('should mark token as used', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
          where: { id: 'token-1' },
          data: { usedAt: expect.any(Date) }
        });
      });

      it('should add password to history', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockPrisma.passwordHistory.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            passwordHash: expect.any(String),
            changedVia: 'RESET',
            ipAddress: validResetCompletion.ipAddress,
            userAgent: validResetCompletion.userAgent
          })
        });
      });

      it('should invalidate all user sessions', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
          where: { userId: mockUser.id, isValid: true },
          data: {
            isValid: false,
            invalidatedAt: expect.any(Date),
            invalidatedReason: 'PASSWORD_RESET'
          }
        });
      });

      it('should reset user lockout counters', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            passwordResetAttempts: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lockedReason: null
          })
        });
      });

      it('should log successful password reset', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: mockUser.id,
              eventType: 'PASSWORD_RESET_SUCCESS',
              severity: 'MEDIUM'
            })
          })
        );
      });

      it('should send password changed confirmation email', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockEmailService.sendPasswordChangedEmail).toHaveBeenCalledWith({
          to: mockUser.email,
          name: `${mockUser.firstName} ${mockUser.lastName}`,
          timestamp: expect.any(String),
          ipAddress: validResetCompletion.ipAddress,
          location: 'New York, United States'
        });
      });

      it('should return success message', async () => {
        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Password reset successfully');
        expect(result.message).toContain('sessions have been invalidated');
      });

      it('should use transaction for atomic updates', async () => {
        await service.completePasswordReset(validResetCompletion);

        expect(mockPrisma.$transaction).toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
      });

      it('should return error message on database failure', async () => {
        mockPrisma.passwordResetToken.findUnique.mockRejectedValue(
          new Error('Database error')
        );

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toContain('An error occurred');
      });

      it('should return error message on transaction failure', async () => {
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
          id: 'token-1',
          userId: mockUser.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 900000),
          usedAt: null,
          isRevoked: false,
          user: mockUser
        });
        mockPrisma.user.findUnique.mockResolvedValue({
          lockedUntil: null,
          lastLoginDevice: null
        });
        mockPrisma.passwordHistory.findMany.mockResolvedValue([]);
        mockBcryptCompare.mockResolvedValue(false);
        mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

        const result = await service.completePasswordReset(validResetCompletion);

        expect(result.success).toBe(false);
        expect(result.error).toContain('An error occurred');
      });
    });
  });

  // =========================================
  // Helper Methods Tests (via integration)
  // =========================================

  describe('Password Strength Validation (validatePasswordStrength)', () => {
    it('should accept password meeting all requirements', () => {
      mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });

      // Access private method through completion flow
      const validation = (service as any).validatePasswordStrength(
        'VeryStr0ng@Password!'
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should collect multiple validation errors', () => {
      mockZxcvbn.mockReturnValue({ score: 0, feedback: { warning: 'Too common' } });

      const validation = (service as any).validatePasswordStrength('weak');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(1);
    });

    it('should include zxcvbn warning in errors', () => {
      mockZxcvbn.mockReturnValue({
        score: 2,
        feedback: { warning: 'This is a commonly used password' }
      });

      const validation = (service as any).validatePasswordStrength(
        'Password123!'
      );

      expect(validation.errors).toContain('This is a commonly used password');
    });
  });

  describe('Generic Success Response', () => {
    it('should always return same message for security', async () => {
      // Test various failure scenarios all return same message
      const scenarios = [
        { captchaValid: false },
        { userExists: false },
        { emailVerified: false },
        { accountLocked: true }
      ];

      for (const scenario of scenarios) {
        jest.clearAllMocks();

        if (!scenario.captchaValid) {
          mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: false })
          });
        } else {
          mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }

        if (!scenario.userExists) {
          mockPrisma.user.findFirst.mockResolvedValue(null);
        } else if (!scenario.emailVerified) {
          mockPrisma.user.findFirst.mockResolvedValue({
            ...mockUser,
            emailVerifiedAt: null
          });
        } else if (scenario.accountLocked) {
          mockPrisma.user.findFirst.mockResolvedValue({
            ...mockUser,
            lockedUntil: new Date(Date.now() + 86400000)
          });
          mockPrisma.user.findUnique.mockResolvedValue({
            lockedUntil: new Date(Date.now() + 86400000)
          });
        }

        const result = await service.requestPasswordReset(validResetRequest);

        expect(result.message).toBe(
          'If an account exists with this email, a password reset link has been sent.'
        );
      }
    });
  });
});

describe('PasswordResetService - Edge Cases', () => {
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.setnx.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.del.mockResolvedValue(1);

    mockGeoIPService.lookup.mockResolvedValue(null);

    mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
    mockBcryptHash.mockResolvedValue('$2b$12$newhash');
    mockBcryptCompare.mockResolvedValue(false);

    mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);
    mockEmailService.sendPasswordChangedEmail.mockResolvedValue(undefined);

    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.passwordResetToken.count.mockResolvedValue(0);
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });
    mockPrisma.passwordHistory.findMany.mockResolvedValue([]);

    service = new PasswordResetService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any,
      'test-captcha-secret'
    );
  });

  it('should handle GeoIP lookup failure gracefully', async () => {
    mockGeoIPService.lookup.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

    const result = await service.requestPasswordReset(validResetRequest);

    expect(result.success).toBe(true);
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        geoLocation: null,
        geoCoordinates: null
      })
    });
  });

  it('should handle email with whitespace', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await service.requestPasswordReset({
      ...validResetRequest,
      email: '  test@example.com  '
    });

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: 'test@example.com', mode: 'insensitive' },
        isActive: true
      },
      select: expect.any(Object)
    });
  });

  it('should handle missing device fingerprint', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

    const result = await service.requestPasswordReset({
      ...validResetRequest,
      deviceFingerprint: undefined
    });

    expect(result.success).toBe(true);
  });

  it('should handle concurrent password reset requests with locking', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

    // First request gets lock, second doesn't
    mockRedis.setnx
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const results = await Promise.all([
      service.requestPasswordReset(validResetRequest),
      service.requestPasswordReset(validResetRequest)
    ]);

    // Both should return success (generic response)
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);

    // But only one should create a token
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it('should handle security event logging failure gracefully', async () => {
    mockPrisma.securityEvent.create.mockRejectedValue(new Error('Logging failed'));
    mockPrisma.user.findFirst.mockResolvedValue({
      ...mockUser,
      emailVerifiedAt: null
    });

    // Should not throw, should return generic response
    const result = await service.requestPasswordReset(validResetRequest);

    expect(result.success).toBe(true);
  });

  it('should handle email sending failure gracefully in request flow', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
    mockEmailService.sendPasswordResetEmail.mockRejectedValue(
      new Error('Email failed')
    );

    const result = await service.requestPasswordReset(validResetRequest);

    // Should return generic response even on email failure
    expect(result.success).toBe(true);
  });
});

describe('PasswordResetService - Security Tests', () => {
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.setnx.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.del.mockResolvedValue(1);

    mockGeoIPService.lookup.mockResolvedValue(mockGeoData);

    mockZxcvbn.mockReturnValue({ score: 4, feedback: {} });
    mockBcryptHash.mockResolvedValue('$2b$12$newhash');
    mockBcryptCompare.mockResolvedValue(false);

    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.passwordResetToken.count.mockResolvedValue(0);
    mockPrisma.passwordHistory.findMany.mockResolvedValue([]);

    service = new PasswordResetService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any,
      'test-captcha-secret'
    );
  });

  it('should not leak whether email exists in response', async () => {
    const existingUserResult = await (async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });
      return await service.requestPasswordReset(validResetRequest);
    })();

    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });
    mockRedis.get.mockResolvedValue(null);

    const nonExistingUserResult = await (async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      return await service.requestPasswordReset({
        ...validResetRequest,
        email: 'nonexistent@example.com'
      });
    })();

    expect(existingUserResult.message).toBe(nonExistingUserResult.message);
    expect(existingUserResult.success).toBe(nonExistingUserResult.success);
  });

  it('should use SHA-256 hashing for token storage', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

    await service.requestPasswordReset(validResetRequest);

    // Verify token hash is stored, not plain token
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    });
  });

  it('should use bcrypt with cost factor 12', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: mockUser.id,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 900000),
      usedAt: null,
      isRevoked: false,
      user: mockUser
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      lockedUntil: null,
      lastLoginDevice: null
    });

    await service.completePasswordReset(validResetCompletion);

    expect(mockBcryptHash).toHaveBeenCalledWith(
      validResetCompletion.newPassword,
      12
    );
  });

  it('should log all security-relevant events', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

    await service.requestPasswordReset(validResetRequest);

    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'PASSWORD_RESET_REQUEST',
          ipAddress: validResetRequest.ipAddress
        })
      })
    );
  });

  // Note: Session invalidation is comprehensively tested in the main
  // "Successful Password Reset" test suite with "should invalidate all user sessions" test

  it('should prevent token reuse', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: mockUser.id,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 900000),
      usedAt: new Date(), // Already used
      isRevoked: false,
      user: mockUser
    });

    const result = await service.completePasswordReset(validResetCompletion);

    expect(result.success).toBe(false);
    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'PASSWORD_RESET_TOKEN_REUSE',
          severity: 'HIGH'
        })
      })
    );
  });

  it('should enforce token expiry of 15 minutes', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null });

    await service.requestPasswordReset(validResetRequest);

    const createCall = mockPrisma.passwordResetToken.create.mock.calls[0][0];
    const expiresAt = new Date(createCall.data.expiresAt);
    const expectedExpiry = Date.now() + 15 * 60 * 1000;

    // Should expire within 1 second of expected time
    expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(1000);
  });
});
