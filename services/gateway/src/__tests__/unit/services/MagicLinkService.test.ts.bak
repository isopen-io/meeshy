/**
 * MagicLinkService Unit Tests
 *
 * Comprehensive tests for magic link passwordless authentication service covering:
 * - Magic link request flow
 * - Token validation (expiry, reuse, revocation)
 * - Rate limiting
 * - Session creation
 * - Security event logging
 * - Factory function
 *
 * Run with: pnpm test -- --testPathPattern="MagicLinkService"
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock jsonwebtoken
const mockJwtSign = jest.fn() as jest.Mock<any>;

jest.mock('jsonwebtoken', () => ({
  sign: (payload: any, secret: string, options: any) => mockJwtSign(payload, secret, options)
}));

// Mock SessionService
const mockInitSessionService = jest.fn() as jest.Mock<any>;
const mockCreateSession = jest.fn() as jest.Mock<any>;
const mockGenerateSessionToken = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/SessionService', () => ({
  initSessionService: (prisma: any) => mockInitSessionService(prisma),
  createSession: (input: any) => mockCreateSession(input),
  generateSessionToken: () => mockGenerateSessionToken()
}));

import {
  MagicLinkService,
  createMagicLinkService,
  MagicLinkRequest,
  MagicLinkValidation
} from '../../../services/MagicLinkService';
import { RequestContext } from '../../../services/GeoIPService';

// Mock Prisma Client
const mockPrisma = {
  user: {
    findFirst: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>
  },
  magicLinkToken: {
    findUnique: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    updateMany: jest.fn() as jest.Mock<any>
  },
  securityEvent: {
    create: jest.fn() as jest.Mock<any>
  }
} as any;

// Mock Redis Wrapper
const mockRedis = {
  get: jest.fn() as jest.Mock<any>,
  setex: jest.fn() as jest.Mock<any>
};

// Mock Email Service
const mockEmailService = {
  sendMagicLinkEmail: jest.fn() as jest.Mock<any>
};

// Mock GeoIP Service
const mockGeoIPService = {
  lookup: jest.fn() as jest.Mock<any>
};

// Sample test data
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  bio: 'Test bio',
  avatar: 'avatar.jpg',
  role: 'USER',
  phoneNumber: '+1234567890',
  isActive: true,
  systemLanguage: 'en',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  emailVerifiedAt: new Date(),
  phoneVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  userFeature: {
    twoFactorEnabledAt: null,
    autoTranslateEnabled: true,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    encryptionPreference: null
  }
};

const mockGeoData = {
  ip: '192.168.1.1',
  city: 'New York',
  region: 'NY',
  country: 'US',
  countryName: 'United States',
  location: 'New York, United States',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York'
};

const mockRequestContext: RequestContext = {
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
  geoData: mockGeoData,
  deviceInfo: {
    type: 'desktop',
    browser: 'Chrome',
    browserVersion: '120.0',
    os: 'Windows',
    osVersion: '10',
    vendor: null,
    model: null,
    isMobile: false,
    isTablet: false,
    rawUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'
  }
};

const validMagicLinkRequest: MagicLinkRequest = {
  email: 'test@example.com',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test Browser',
  deviceFingerprint: 'device-123',
  rememberDevice: false
};

const mockMagicLinkToken = {
  id: 'token-123',
  userId: 'user-123',
  tokenHash: 'mock-hash',
  expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute from now
  usedAt: null,
  isRevoked: false,
  rememberDevice: false,
  user: mockUser
};

const mockSession = {
  id: 'session-123',
  userId: 'user-123',
  deviceType: 'desktop',
  deviceVendor: null,
  deviceModel: null,
  osName: 'Windows',
  osVersion: '10',
  browserName: 'Chrome',
  browserVersion: '120.0',
  isMobile: false,
  ipAddress: '192.168.1.1',
  country: 'United States',
  city: 'New York',
  location: 'New York, United States',
  createdAt: new Date(),
  lastActivityAt: new Date(),
  isCurrentSession: true,
  isTrusted: false
};

describe('MagicLinkService', () => {
  let service: MagicLinkService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');

    mockGeoIPService.lookup.mockResolvedValue(mockGeoData);

    mockJwtSign.mockReturnValue('mock-jwt-token');
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSession);

    mockEmailService.sendMagicLinkEmail.mockResolvedValue(undefined);

    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.magicLinkToken.create.mockResolvedValue({ id: 'token-1' });
    mockPrisma.magicLinkToken.update.mockResolvedValue({ id: 'token-1' });
    mockPrisma.user.update.mockResolvedValue(mockUser);

    service = new MagicLinkService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================
  // requestMagicLink Tests
  // =========================================

  describe('requestMagicLink', () => {
    describe('Rate Limiting', () => {
      it('should return error when rate limit is exceeded', async () => {
        // In development mode, MAX_REQUESTS_PER_HOUR is 20
        // We need to simulate the count being >= MAX_REQUESTS_PER_HOUR
        mockRedis.get.mockResolvedValue('20');

        const result = await service.requestMagicLink(validMagicLinkRequest);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Too many requests');
        expect(result.error).toBe('RATE_LIMITED');
        expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      });

      it('should increment rate limit counter on successful request', async () => {
        mockRedis.get.mockResolvedValue('0');
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('ratelimit:magic-link:email:'),
          3600,
          '1'
        );
      });

      it('should increment existing rate limit counter', async () => {
        mockRedis.get.mockResolvedValue('5');
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('ratelimit:magic-link:email:'),
          3600,
          '6'
        );
      });

      it('should allow request on rate limit check error', async () => {
        mockRedis.get.mockRejectedValue(new Error('Redis error'));
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const result = await service.requestMagicLink(validMagicLinkRequest);

        // Should proceed despite Redis error
        expect(result.success).toBe(true);
        expect(mockPrisma.user.findFirst).toHaveBeenCalled();
      });
    });

    describe('User Not Found', () => {
      it('should return success when user is not found (prevents email enumeration)', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const result = await service.requestMagicLink(validMagicLinkRequest);

        expect(result.success).toBe(true);
        expect(result.message).toBe('If an account exists, a login link has been sent.');
        expect(mockPrisma.magicLinkToken.create).not.toHaveBeenCalled();
        expect(mockEmailService.sendMagicLinkEmail).not.toHaveBeenCalled();
      });

      it('should normalize email to lowercase', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestMagicLink({
          ...validMagicLinkRequest,
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

      it('should trim email whitespace', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await service.requestMagicLink({
          ...validMagicLinkRequest,
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
    });

    describe('Successful Magic Link Request', () => {
      beforeEach(() => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      });

      it('should revoke existing tokens before creating new one', async () => {
        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockPrisma.magicLinkToken.updateMany).toHaveBeenCalledWith({
          where: {
            userId: mockUser.id,
            usedAt: null,
            isRevoked: false
          },
          data: {
            isRevoked: true,
            revokedReason: 'NEW_REQUEST'
          }
        });
      });

      it('should create a new magic link token with correct data', async () => {
        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            tokenHash: expect.any(String),
            expiresAt: expect.any(Date),
            ipAddress: validMagicLinkRequest.ipAddress,
            userAgent: validMagicLinkRequest.userAgent,
            deviceFingerprint: validMagicLinkRequest.deviceFingerprint,
            geoLocation: 'New York, United States',
            rememberDevice: false
          })
        });
      });

      it('should send magic link email', async () => {
        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockEmailService.sendMagicLinkEmail).toHaveBeenCalledWith({
          to: mockUser.email,
          name: mockUser.firstName,
          magicLink: expect.stringContaining('token='),
          location: 'New York, United States',
          language: mockUser.systemLanguage
        });
      });

      it('should log security event for magic link request', async () => {
        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            eventType: 'MAGIC_LINK_REQUESTED',
            severity: 'LOW',
            status: 'SUCCESS'
          })
        });
      });

      it('should return success message', async () => {
        const result = await service.requestMagicLink(validMagicLinkRequest);

        expect(result.success).toBe(true);
        expect(result.message).toBe('If an account exists, a login link has been sent.');
      });

      it('should handle missing geo data gracefully', async () => {
        mockGeoIPService.lookup.mockResolvedValue(null);

        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            geoLocation: 'Unknown',
            geoCoordinates: null
          })
        });
      });

      it('should include geo coordinates when available', async () => {
        await service.requestMagicLink(validMagicLinkRequest);

        expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            geoCoordinates: '40.7128,-74.006'
          })
        });
      });

      it('should store rememberDevice flag server-side', async () => {
        await service.requestMagicLink({
          ...validMagicLinkRequest,
          rememberDevice: true
        });

        expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            rememberDevice: true
          })
        });
      });
    });

    describe('Error Handling', () => {
      it('should return success even on internal error (prevents info leakage)', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

        const result = await service.requestMagicLink(validMagicLinkRequest);

        expect(result.success).toBe(true);
        expect(result.message).toBe('If an account exists, a login link has been sent.');
      });

      it('should return success even when email sending fails', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockEmailService.sendMagicLinkEmail.mockRejectedValue(new Error('Email failed'));

        const result = await service.requestMagicLink(validMagicLinkRequest);

        // Should catch the error and return success to prevent info leakage
        expect(result.success).toBe(true);
      });
    });
  });

  // =========================================
  // validateMagicLink Tests
  // =========================================

  describe('validateMagicLink', () => {
    const validValidation: MagicLinkValidation = {
      token: 'valid-raw-token',
      requestContext: mockRequestContext
    };

    describe('Token Not Found', () => {
      it('should return error when token is not found', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue(null);

        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid or expired link. Please request a new one.');
      });
    });

    describe('Token Already Used', () => {
      it('should return error when token has already been used', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
          ...mockMagicLinkToken,
          usedAt: new Date() // Token already used
        });

        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(false);
        expect(result.error).toBe('This link has already been used. Please request a new one.');
      });

      it('should log security event for token reuse attempt', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
          ...mockMagicLinkToken,
          usedAt: new Date()
        });

        await service.validateMagicLink(validValidation);

        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockMagicLinkToken.userId,
            eventType: 'MAGIC_LINK_REUSE_ATTEMPT',
            severity: 'MEDIUM'
          })
        });
      });
    });

    describe('Token Revoked', () => {
      it('should return error when token is revoked', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
          ...mockMagicLinkToken,
          isRevoked: true
        });

        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(false);
        expect(result.error).toBe('This link is no longer valid. Please request a new one.');
      });
    });

    describe('Token Expired', () => {
      it('should return error when token is expired', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
          ...mockMagicLinkToken,
          expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
        });

        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(false);
        expect(result.error).toBe('This link has expired. Please request a new one.');
      });

      it('should log security event for expired token', async () => {
        const expiredToken = {
          ...mockMagicLinkToken,
          expiresAt: new Date(Date.now() - 1000)
        };
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue(expiredToken);

        await service.validateMagicLink(validValidation);

        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockMagicLinkToken.userId,
            eventType: 'MAGIC_LINK_EXPIRED',
            severity: 'LOW'
          })
        });
      });
    });

    describe('Successful Validation', () => {
      beforeEach(() => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue(mockMagicLinkToken);
      });

      it('should mark token as used', async () => {
        await service.validateMagicLink(validValidation);

        expect(mockPrisma.magicLinkToken.update).toHaveBeenCalledWith({
          where: { id: mockMagicLinkToken.id },
          data: { usedAt: expect.any(Date) }
        });
      });

      it('should generate JWT token', async () => {
        await service.validateMagicLink(validValidation);

        expect(mockJwtSign).toHaveBeenCalledWith(
          { userId: mockUser.id, username: mockUser.username },
          expect.any(String),
          { expiresIn: '24h' }
        );
      });

      it('should create session with request context', async () => {
        await service.validateMagicLink(validValidation);

        expect(mockCreateSession).toHaveBeenCalledWith({
          userId: mockUser.id,
          token: 'mock-session-token',
          requestContext: mockRequestContext
        });
      });

      it('should update user last login info', async () => {
        await service.validateMagicLink(validValidation);

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: {
            lastActiveAt: expect.any(Date),
            lastLoginIp: mockRequestContext.ip,
            lastLoginLocation: mockRequestContext.geoData?.location,
            lastLoginDevice: mockRequestContext.deviceInfo?.type
          }
        });
      });

      it('should log success security event', async () => {
        await service.validateMagicLink(validValidation);

        expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            eventType: 'MAGIC_LINK_LOGIN_SUCCESS',
            severity: 'LOW'
          })
        });
      });

      it('should return user data in SocketIOUser format', async () => {
        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(true);
        expect(result.user).toMatchObject({
          id: mockUser.id,
          username: mockUser.username,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          email: mockUser.email,
          role: mockUser.role,
          isOnline: true,
          systemLanguage: mockUser.systemLanguage
        });
      });

      it('should return JWT token', async () => {
        const result = await service.validateMagicLink(validValidation);

        expect(result.token).toBe('mock-jwt-token');
      });

      it('should return session token', async () => {
        const result = await service.validateMagicLink(validValidation);

        expect(result.sessionToken).toBe('mock-session-token');
      });

      it('should return session data', async () => {
        const result = await service.validateMagicLink(validValidation);

        expect(result.session).toBe(mockSession);
      });

      it('should return rememberDevice from server-side storage', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
          ...mockMagicLinkToken,
          rememberDevice: true
        });

        const result = await service.validateMagicLink(validValidation);

        expect(result.rememberDevice).toBe(true);
      });

      it('should include user feature settings in response', async () => {
        const result = await service.validateMagicLink(validValidation);

        expect(result.user).toMatchObject({
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          twoFactorEnabledAt: null
        });
      });
    });

    describe('Error Handling', () => {
      it('should return error on database failure', async () => {
        mockPrisma.magicLinkToken.findUnique.mockRejectedValue(new Error('Database error'));

        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(false);
        expect(result.error).toBe('An error occurred. Please try again.');
      });

      it('should return error on session creation failure', async () => {
        mockPrisma.magicLinkToken.findUnique.mockResolvedValue(mockMagicLinkToken);
        mockCreateSession.mockRejectedValue(new Error('Session creation failed'));

        const result = await service.validateMagicLink(validValidation);

        expect(result.success).toBe(false);
        expect(result.error).toBe('An error occurred. Please try again.');
      });
    });
  });

  // =========================================
  // Factory Function Tests
  // =========================================

  describe('createMagicLinkService', () => {
    it('should return an instance of MagicLinkService', () => {
      const instance = createMagicLinkService(
        mockPrisma,
        mockRedis as any,
        mockEmailService as any,
        mockGeoIPService as any
      );

      expect(instance).toBeInstanceOf(MagicLinkService);
    });

    it('should initialize session service with prisma', () => {
      createMagicLinkService(
        mockPrisma,
        mockRedis as any,
        mockEmailService as any,
        mockGeoIPService as any
      );

      expect(mockInitSessionService).toHaveBeenCalledWith(mockPrisma);
    });
  });
});

// =========================================
// Edge Cases and Security Tests
// =========================================

describe('MagicLinkService - Edge Cases', () => {
  let service: MagicLinkService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockGeoIPService.lookup.mockResolvedValue(null);
    mockJwtSign.mockReturnValue('mock-jwt-token');
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSession);
    mockEmailService.sendMagicLinkEmail.mockResolvedValue(undefined);
    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.magicLinkToken.create.mockResolvedValue({ id: 'token-1' });
    mockPrisma.user.update.mockResolvedValue(mockUser);

    service = new MagicLinkService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any
    );
  });

  it('should handle missing device fingerprint', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    const result = await service.requestMagicLink({
      ...validMagicLinkRequest,
      deviceFingerprint: undefined
    });

    expect(result.success).toBe(true);
  });

  it('should handle missing rememberDevice flag', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    await service.requestMagicLink({
      email: 'test@example.com',
      ipAddress: '192.168.1.1',
      userAgent: 'Test Browser'
      // rememberDevice not provided
    });

    expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rememberDevice: false
      })
    });
  });

  it('should handle security event logging failure gracefully', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.securityEvent.create.mockRejectedValue(new Error('Logging failed'));

    // Should not throw, should complete the request
    const result = await service.requestMagicLink(validMagicLinkRequest);

    // The request continues despite logging failure (wrapped in try-catch)
    expect(result.success).toBe(true);
  });

  it('should handle null geo coordinates', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockGeoIPService.lookup.mockResolvedValue({
      ...mockGeoData,
      latitude: null,
      longitude: null
    });

    await service.requestMagicLink(validMagicLinkRequest);

    expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        geoCoordinates: null
      })
    });
  });

  it('should handle validation with null geo data in request context', async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue(mockMagicLinkToken);

    const validationWithNullGeo: MagicLinkValidation = {
      token: 'valid-raw-token',
      requestContext: {
        ip: '192.168.1.1',
        geoData: null,
        deviceInfo: null
      } as any
    };

    const result = await service.validateMagicLink(validationWithNullGeo);

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: expect.objectContaining({
        lastLoginLocation: null,
        lastLoginDevice: null
      })
    });
  });
});

describe('MagicLinkService - Security Tests', () => {
  let service: MagicLinkService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockGeoIPService.lookup.mockResolvedValue(mockGeoData);
    mockJwtSign.mockReturnValue('mock-jwt-token');
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSession);
    mockEmailService.sendMagicLinkEmail.mockResolvedValue(undefined);
    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.magicLinkToken.create.mockResolvedValue({ id: 'token-1' });
    mockPrisma.user.update.mockResolvedValue(mockUser);

    service = new MagicLinkService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any
    );
  });

  it('should not leak whether email exists in response', async () => {
    // Test with existing user
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    const existingUserResult = await service.requestMagicLink(validMagicLinkRequest);

    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');

    // Test with non-existing user
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const nonExistingUserResult = await service.requestMagicLink({
      ...validMagicLinkRequest,
      email: 'nonexistent@example.com'
    });

    // Both responses should be identical
    expect(existingUserResult.success).toBe(nonExistingUserResult.success);
    expect(existingUserResult.message).toBe(nonExistingUserResult.message);
  });

  it('should use SHA-256 hashing for token storage', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    await service.requestMagicLink(validMagicLinkRequest);

    // Verify token hash is stored (64 character hex string = SHA-256)
    expect(mockPrisma.magicLinkToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    });
  });

  it('should enforce token expiry of 1 minute', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    const beforeRequest = Date.now();
    await service.requestMagicLink(validMagicLinkRequest);
    const afterRequest = Date.now();

    const createCall = mockPrisma.magicLinkToken.create.mock.calls[0][0];
    const expiresAt = new Date(createCall.data.expiresAt).getTime();

    // Token should expire in approximately 1 minute (60000ms)
    const expectedMinExpiry = beforeRequest + 60 * 1000;
    const expectedMaxExpiry = afterRequest + 60 * 1000;

    expect(expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry - 100);
    expect(expiresAt).toBeLessThanOrEqual(expectedMaxExpiry + 100);
  });

  it('should log all security-relevant events', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    await service.requestMagicLink(validMagicLinkRequest);

    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'MAGIC_LINK_REQUESTED',
        ipAddress: validMagicLinkRequest.ipAddress
      })
    });
  });

  it('should prevent token reuse', async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      ...mockMagicLinkToken,
      usedAt: new Date() // Already used
    });

    const result = await service.validateMagicLink({
      token: 'reused-token',
      requestContext: mockRequestContext
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'MAGIC_LINK_REUSE_ATTEMPT',
        severity: 'MEDIUM'
      })
    });
  });

  it('should revoke existing tokens when new one is requested', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    await service.requestMagicLink(validMagicLinkRequest);

    expect(mockPrisma.magicLinkToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: mockUser.id,
        usedAt: null,
        isRevoked: false
      },
      data: {
        isRevoked: true,
        revokedReason: 'NEW_REQUEST'
      }
    });
  });
});
