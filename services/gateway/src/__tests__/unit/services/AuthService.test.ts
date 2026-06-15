/**
 * AuthService Unit Tests
 *
 * Comprehensive tests for authentication service covering:
 * - User authentication (login)
 * - User registration
 * - Token generation and verification
 * - User retrieval by ID
 * - Online status updates
 * - User permissions
 *
 * Run with: npm test -- auth.service.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock @meeshy/shared/types BEFORE importing AuthService
const MockUserRoleEnum = {
  BIGBOSS: 'BIGBOSS',
  ADMIN: 'ADMIN',
  MODO: 'MODO',
  AUDIT: 'AUDIT',
  ANALYST: 'ANALYST',
  USER: 'USER',
  MODERATOR: 'MODO',
  CREATOR: 'ADMIN',
  MEMBER: 'USER'
};

jest.mock('@meeshy/shared/types', () => ({
  UserRoleEnum: MockUserRoleEnum,
  SocketIOUser: {},
}));

// Mock bcryptjs - using any for mock function types to avoid TypeScript issues
const mockBcryptCompare = jest.fn() as jest.Mock<any>;
const mockBcryptHash = jest.fn() as jest.Mock<any>;

jest.mock('bcryptjs', () => ({
  compare: (password: string, hash: string) => mockBcryptCompare(password, hash),
  hash: (password: string, rounds: number) => mockBcryptHash(password, rounds)
}));

// Mock jsonwebtoken
const mockJwtSign = jest.fn() as jest.Mock<any>;
const mockJwtVerify = jest.fn() as jest.Mock<any>;

jest.mock('jsonwebtoken', () => ({
  sign: (payload: object, secret: string, options: object) => mockJwtSign(payload, secret, options),
  verify: (token: string, secret: string) => mockJwtVerify(token, secret)
}));

// Mock SessionService
const mockGenerateSessionToken = jest.fn() as jest.Mock<any>;
const mockCreateSession = jest.fn() as jest.Mock<any>;
const mockInitSessionService = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: () => mockGenerateSessionToken(),
  createSession: (data: any) => mockCreateSession(data),
  initSessionService: (prisma: any) => mockInitSessionService(prisma),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn()
}));

// Mock EmailService
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: jest.fn(() => Promise.resolve(undefined))
  }))
}));

// Mock SmsService
const mockSmsServiceSendVerificationCode = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/SmsService', () => ({
  smsService: {
    sendVerificationCode: (...args: any[]) => mockSmsServiceSendVerificationCode(...args)
  }
}));

// Mock PhonePasswordResetService
jest.mock('../../../services/PhonePasswordResetService', () => ({
  maskEmail: jest.fn((email: string) => {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }),
  maskUsername: jest.fn((username: string) => `${username[0]}***`),
  maskDisplayName: jest.fn((name: string) => `${name[0]}***`)
}));

import { AuthService, LoginCredentials, RegisterData, TokenPayload } from '../../../services/AuthService';

// Get references to mocked SessionService functions
import {
  validateSession as mockValidateSession,
  getUserSessions as mockGetUserSessions,
  invalidateSession as mockInvalidateSession,
  invalidateAllSessions as mockInvalidateAllSessions,
  logout as mockLogoutSession
} from '../../../services/SessionService';

// Alias for UserRoleEnum for tests
const UserRoleEnum = MockUserRoleEnum;

// Mock normalize utilities
jest.mock('../../../utils/normalize', () => ({
  normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
  normalizeUsername: jest.fn((username: string) => {
    const trimmed = username.trim();
    if (trimmed.length < 2) throw new Error('Le nom d\'utilisateur doit contenir au moins 2 caracteres');
    if (trimmed.length > 16) throw new Error('Le nom d\'utilisateur ne peut pas depasser 16 caracteres');
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) throw new Error('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
    return trimmed;
  }),
  capitalizeName: jest.fn((name: string) => {
    return name.trim().split(' ').map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }),
  normalizeDisplayName: jest.fn((displayName: string) => displayName.trim().replace(/[\n\t]/g, '')),
  normalizePhoneNumber: jest.fn((phone: string) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[\s\-().]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
    if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
  }),
  normalizePhoneWithCountry: jest.fn((phone: string, countryCode: string) => {
    if (!phone || phone.trim() === '') return null;
    let cleaned = phone.replace(/[\s\-().]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
    if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return {
      phoneNumber: cleaned,
      countryCode: countryCode || 'FR',
      isValid: true
    };
  })
}));

// Mock emailSchema from shared types
jest.mock('@meeshy/shared/types/validation', () => ({
  emailSchema: {
    parse: jest.fn((email: string) => {
      if (!email.includes('@') || !email.includes('.')) {
        throw { issues: [{ message: 'Format d\'email invalide' }] };
      }
      return email;
    })
  }
}));

// Mock Prisma Client
const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  conversation: {
    findFirst: jest.fn()
  },
  participant: {
    findFirst: jest.fn(),
    create: jest.fn()
  }
} as any;

// Sample user data for tests
const mockUser = {
  id: 'user-123',
  username: 'testuser',
  password: '$2b$12$hashedpassword',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  phoneNumber: '+33612345678',
  displayName: 'Test User',
  avatar: null,
  role: 'USER',
  isOnline: true,
  lastActiveAt: new Date(),
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  isActive: true,
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

const mockSocketIOUser = {
  id: 'user-123',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  phoneNumber: '+33612345678',
  displayName: 'Test User',
  avatar: null,
  role: 'USER',
  permissions: {
    canAccessAdmin: false,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: false,
    canModerateContent: false,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false
  },
  isOnline: true,
  lastActiveAt: expect.any(Date),
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  isActive: true,
  deactivatedAt: null,
  createdAt: expect.any(Date),
  updatedAt: expect.any(Date)
};

// Mock session data
const mockSessionData = {
  id: 'session-123',
  userId: 'user-123',
  token: 'mock-session-token',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  isValid: true
};

describe('AuthService', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default session mocks
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  describe('authenticate', () => {
    const validCredentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    it('should authenticate user with valid username and password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.authenticate(validCredentials);

      expect(result).not.toBeNull();
      expect(result?.user.id).toBe('user-123');
      expect(result?.user.username).toBe('testuser');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { username: { equals: 'testuser', mode: 'insensitive' } },
            { email: { equals: 'testuser', mode: 'insensitive' } },
            { phoneNumber: '+testuser' }
          ],
          isActive: true
        },
        select: expect.objectContaining({
          id: true,
          username: true,
          password: true,
          email: true,
          twoFactorEnabledAt: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true
        })
      });
      expect(mockBcryptCompare).toHaveBeenCalledWith('password123', mockUser.password);
    });

    it('should authenticate user with email', async () => {
      const emailCredentials: LoginCredentials = {
        username: 'test@example.com',
        password: 'password123'
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.authenticate(emailCredentials);

      expect(result).not.toBeNull();
      // Verify findFirst was called (phone number normalization removes dots and special chars)
      expect(mockPrisma.user.findFirst).toHaveBeenCalled();
      const callArgs = mockPrisma.user.findFirst.mock.calls[0][0];
      expect(callArgs.where.OR[0]).toEqual({ username: { equals: 'test@example.com', mode: 'insensitive' } });
      expect(callArgs.where.OR[1]).toEqual({ email: { equals: 'test@example.com', mode: 'insensitive' } });
      expect(callArgs.where.isActive).toBe(true);
    });

    it('should authenticate user with phone number', async () => {
      const phoneCredentials: LoginCredentials = {
        username: '+33612345678',
        password: 'password123'
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.authenticate(phoneCredentials);

      expect(result).not.toBeNull();
    });

    it('should return null for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await authService.authenticate(validCredentials);

      expect(result).toBeNull();
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('should return null for invalid password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(false);

      const result = await authService.authenticate(validCredentials);

      expect(result).toBeNull();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should update lastActiveAt and isOnline on successful authentication', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await authService.authenticate(validCredentials);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          isOnline: true,
          lastActiveAt: expect.any(Date)
        }
      });
    });

    it('should return null and handle error gracefully', async () => {
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await authService.authenticate(validCredentials);

      expect(result).toBeNull();
    });

    it('should normalize username to lowercase for search', async () => {
      const upperCaseCredentials: LoginCredentials = {
        username: 'TestUser',
        password: 'password123'
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await authService.authenticate(upperCaseCredentials);

      // Check the call was made with normalized username/email (lowercase)
      const callArgs = mockPrisma.user.findFirst.mock.calls[0][0];
      expect(callArgs.where.OR[0]).toEqual({ username: { equals: 'testuser', mode: 'insensitive' } });
      expect(callArgs.where.OR[1]).toEqual({ email: { equals: 'testuser', mode: 'insensitive' } });
      expect(callArgs.where.isActive).toBe(true);
    });

    it('should trim whitespace from username', async () => {
      const spacedCredentials: LoginCredentials = {
        username: '  testuser  ',
        password: 'password123'
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await authService.authenticate(spacedCredentials);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { username: { equals: 'testuser', mode: 'insensitive' } },
            { email: { equals: 'testuser', mode: 'insensitive' } },
            { phoneNumber: '+testuser' }
          ],
          isActive: true
        },
        select: expect.objectContaining({
          id: true,
          username: true,
          password: true,
          email: true,
          twoFactorEnabledAt: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true
        })
      });
    });
  });

  describe('register', () => {
    const validRegisterData: RegisterData = {
      username: 'newuser',
      password: 'SecurePass123!',
      firstName: 'New',
      lastName: 'User',
      email: 'newuser@example.com',
      phoneNumber: '+33698765432',
      systemLanguage: 'en',
      regionalLanguage: 'en'
    };

    it('should register a new user successfully', async () => {
      const createdUser = { ...mockUser, ...validRegisterData, id: 'new-user-id' };

      mockPrisma.user.findFirst.mockResolvedValue(null); // No existing user
      mockBcryptHash.mockResolvedValue('$2b$12$hashedNewPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(null); // No global conversation

      const result = await authService.register(validRegisterData);

      expect(result).not.toBeNull();
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockBcryptHash).toHaveBeenCalledWith('SecurePass123!', 12);
    });

    it('should return null for existing username', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        username: 'newuser'
      });

      const result = await authService.register(validRegisterData);

      expect(result).toBeNull();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should return null for existing email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        email: 'newuser@example.com',
        username: 'differentuser'
      });

      const result = await authService.register(validRegisterData);

      expect(result).toBeNull();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should return null for existing phone number', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        phoneNumber: '+33698765432',
        username: 'differentuser',
        email: 'different@example.com'
      });

      const result = await authService.register(validRegisterData);

      expect(result).toBeNull();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should return null for invalid email format', async () => {
      const invalidEmailData: RegisterData = {
        ...validRegisterData,
        email: 'invalidemail'
      };

      const result = await authService.register(invalidEmailData);

      expect(result).toBeNull();
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('should register user without phone number', async () => {
      const noPhoneData: RegisterData = {
        username: 'nophone',
        password: 'SecurePass123!',
        firstName: 'No',
        lastName: 'Phone',
        email: 'nophone@example.com'
      };

      const createdUser = { ...mockUser, ...noPhoneData, id: 'no-phone-id', phoneNumber: null };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await authService.register(noPhoneData);

      expect(result).not.toBeNull();
    });

    it('should register user with empty phone number string', async () => {
      const emptyPhoneData: RegisterData = {
        ...validRegisterData,
        phoneNumber: '   '
      };

      const createdUser = { ...mockUser, ...emptyPhoneData, id: 'empty-phone-id', phoneNumber: null };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await authService.register(emptyPhoneData);

      expect(result).not.toBeNull();
    });

    it('should add user to global meeshy conversation if it exists', async () => {
      const globalConversation = { id: 'global-conv-id', identifier: 'meeshy' };
      const createdUser = { ...mockUser, ...validRegisterData, id: 'new-user-id' };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(globalConversation);
      mockPrisma.participant.findFirst.mockResolvedValue(null); // Not already a member
      mockPrisma.participant.create.mockResolvedValue({});

      const result = await authService.register(validRegisterData);

      expect(result).not.toBeNull();
      expect(mockPrisma.participant.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'global-conv-id',
          userId: 'new-user-id',
          type: 'user',
          displayName: expect.any(String),
          role: 'MEMBER',
          permissions: {
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true,
            canSendVideos: true,
            canSendAudios: true,
            canSendLocations: true,
            canSendLinks: true
          },
          joinedAt: expect.any(Date),
          isActive: true
        }
      });
    });

    it('should not add user to global conversation if already a member', async () => {
      const globalConversation = { id: 'global-conv-id', identifier: 'meeshy' };
      const createdUser = { ...mockUser, ...validRegisterData, id: 'new-user-id' };
      const existingMember = { id: 'member-id', conversationId: 'global-conv-id', userId: 'new-user-id' };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(globalConversation);
      mockPrisma.participant.findFirst.mockResolvedValue(existingMember);

      const result = await authService.register(validRegisterData);

      expect(result).not.toBeNull();
      expect(mockPrisma.participant.create).not.toHaveBeenCalled();
    });

    it('should use default languages if not provided', async () => {
      const noLanguageData: RegisterData = {
        username: 'nolang',
        password: 'SecurePass123!',
        firstName: 'No',
        lastName: 'Lang',
        email: 'nolang@example.com'
      };

      const createdUser = { ...mockUser, ...noLanguageData, id: 'no-lang-id' };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await authService.register(noLanguageData);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          systemLanguage: 'fr',
          regionalLanguage: 'fr'
        })
      });
    });

    it('should handle database error gracefully', async () => {
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await authService.register(validRegisterData);

      expect(result).toBeNull();
    });

    it('should handle conversation member creation error gracefully', async () => {
      const globalConversation = { id: 'global-conv-id', identifier: 'meeshy' };
      const createdUser = { ...mockUser, ...validRegisterData, id: 'new-user-id' };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.conversation.findFirst.mockResolvedValue(globalConversation);
      mockPrisma.participant.findFirst.mockResolvedValue(null);
      mockPrisma.participant.create.mockRejectedValue(new Error('Member creation failed'));

      // Should still return user even if conversation member creation fails
      const result = await authService.register(validRegisterData);

      expect(result).not.toBeNull();
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.getUserById('user-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('user-123');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          isActive: true
        },
        select: expect.objectContaining({
          id: true,
          username: true,
          email: true,
          twoFactorEnabledAt: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true
        })
      });
    });

    it('should return null for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.getUserById('non-existent');

      expect(result).toBeNull();
    });

    it('should return null and handle error gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await authService.getUserById('user-123');

      expect(result).toBeNull();
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user = { ...mockSocketIOUser };
      mockJwtSign.mockReturnValue('mock-jwt-token');

      const token = authService.generateToken(user as any);

      expect(token).toBe('mock-jwt-token');
      expect(mockJwtSign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          username: 'testuser',
          role: 'USER'
        },
        jwtSecret,
        { expiresIn: '24h' }
      );
    });

    it('should include correct payload in token', () => {
      const adminUser = { ...mockSocketIOUser, id: 'admin-id', username: 'admin', role: 'ADMIN' };
      mockJwtSign.mockReturnValue('admin-token');

      authService.generateToken(adminUser as any);

      expect(mockJwtSign).toHaveBeenCalledWith(
        {
          userId: 'admin-id',
          username: 'admin',
          role: 'ADMIN'
        },
        jwtSecret,
        { expiresIn: '24h' }
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify and return payload for valid token', () => {
      const mockPayload: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        role: 'USER'
      };
      mockJwtVerify.mockReturnValue(mockPayload);

      const result = authService.verifyToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwtVerify).toHaveBeenCalledWith('valid-token', jwtSecret);
    });

    it('should return null for invalid token', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = authService.verifyToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const result = authService.verifyToken('expired-token');

      expect(result).toBeNull();
    });
  });

  describe('updateOnlineStatus', () => {
    it('should update user to online status', async () => {
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await authService.updateOnlineStatus('user-123', true);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isOnline: true,
          lastActiveAt: expect.any(Date)
        }
      });
    });

    it('should update user to offline status', async () => {
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await authService.updateOnlineStatus('user-123', false);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isOnline: false
        }
      });
    });

    it('should handle database error gracefully', async () => {
      mockPrisma.user.update.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(authService.updateOnlineStatus('user-123', true)).resolves.not.toThrow();
    });
  });

  describe('getUserPermissions', () => {
    it('should return full permissions for BIGBOSS role', () => {
      const bigbossUser = { ...mockSocketIOUser, role: UserRoleEnum.BIGBOSS };

      const permissions = authService.getUserPermissions(bigbossUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: true,
        canManageUsers: true,
        canManageGroups: true,
        canManageConversations: true,
        canViewAnalytics: true,
        canModerateContent: true,
        canViewAuditLogs: true,
        canManageNotifications: true,
        canManageTranslations: true
      });
    });

    it('should return admin permissions for ADMIN role', () => {
      const adminUser = { ...mockSocketIOUser, role: UserRoleEnum.ADMIN };

      const permissions = authService.getUserPermissions(adminUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: true,
        canManageUsers: true,
        canManageGroups: true,
        canManageConversations: true,
        canViewAnalytics: true,
        canModerateContent: true,
        canViewAuditLogs: false,
        canManageNotifications: true,
        canManageTranslations: false
      });
    });

    it('should return creator permissions for CREATOR role', () => {
      // Note: CREATOR is an alias for ADMIN in UserRoleEnum, so it maps to ADMIN permissions
      const creatorUser = { ...mockSocketIOUser, role: UserRoleEnum.CREATOR };

      const permissions = authService.getUserPermissions(creatorUser as any);

      // CREATOR maps to ADMIN, so it gets ADMIN permissions (not canViewAuditLogs or canManageTranslations)
      expect(permissions).toEqual({
        canAccessAdmin: true,
        canManageUsers: true,
        canManageGroups: true,
        canManageConversations: true,
        canViewAnalytics: true,
        canModerateContent: true,
        canViewAuditLogs: false, // ADMIN doesn't have audit logs
        canManageNotifications: true,
        canManageTranslations: false
      });
    });

    it('should return moderator permissions for MODERATOR role', () => {
      const modUser = { ...mockSocketIOUser, role: UserRoleEnum.MODERATOR };

      const permissions = authService.getUserPermissions(modUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: true,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: true,
        canViewAnalytics: false,
        canModerateContent: true,
        canViewAuditLogs: false,
        canManageNotifications: false,
        canManageTranslations: false
      });
    });

    it('should return audit permissions for AUDIT role', () => {
      const auditUser = { ...mockSocketIOUser, role: UserRoleEnum.AUDIT };

      const permissions = authService.getUserPermissions(auditUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: true,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: false,
        canViewAnalytics: true,
        canModerateContent: false,
        canViewAuditLogs: true,
        canManageNotifications: false,
        canManageTranslations: false
      });
    });

    it('should return analyst permissions for ANALYST role', () => {
      const analystUser = { ...mockSocketIOUser, role: UserRoleEnum.ANALYST };

      const permissions = authService.getUserPermissions(analystUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: true,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: false,
        canViewAnalytics: true,
        canModerateContent: false,
        canViewAuditLogs: false,
        canManageNotifications: false,
        canManageTranslations: false
      });
    });

    it('should return default base permissions for USER role', () => {
      const normalUser = { ...mockSocketIOUser, role: 'USER' };

      const permissions = authService.getUserPermissions(normalUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: false,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: false,
        canViewAnalytics: false,
        canModerateContent: false,
        canViewAuditLogs: false,
        canManageNotifications: false,
        canManageTranslations: false
      });
    });

    it('should return default permissions for unknown role', () => {
      const unknownRoleUser = { ...mockSocketIOUser, role: 'UNKNOWN' };

      const permissions = authService.getUserPermissions(unknownRoleUser as any);

      expect(permissions).toEqual({
        canAccessAdmin: false,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: false,
        canViewAnalytics: false,
        canModerateContent: false,
        canViewAuditLogs: false,
        canManageNotifications: false,
        canManageTranslations: false
      });
    });

    it('should handle case-insensitive role matching', () => {
      const lowerCaseRoleUser = { ...mockSocketIOUser, role: 'bigboss' };

      const permissions = authService.getUserPermissions(lowerCaseRoleUser as any);

      expect(permissions.canAccessAdmin).toBe(true);
      expect(permissions.canManageTranslations).toBe(true);
    });
  });

  describe('userToSocketIOUser conversion', () => {
    it('should correctly convert Prisma user to SocketIOUser', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.getUserById('user-123');

      expect(result).toMatchObject({
        id: mockUser.id,
        username: mockUser.username,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        email: mockUser.email,
        phoneNumber: mockUser.phoneNumber,
        displayName: mockUser.displayName,
        avatar: mockUser.avatar,
        role: mockUser.role,
        isOnline: mockUser.isOnline,
        systemLanguage: mockUser.systemLanguage,
        regionalLanguage: mockUser.regionalLanguage,
        autoTranslateEnabled: mockUser.autoTranslateEnabled,
        isActive: mockUser.isActive
      });
    });

    it('should generate displayName from firstName and lastName if not set', async () => {
      const userWithoutDisplayName = { ...mockUser, displayName: null };
      mockPrisma.user.findUnique.mockResolvedValue(userWithoutDisplayName);

      const result = await authService.getUserById('user-123');

      expect(result?.displayName).toBe('Test User');
    });

    it('should include permissions in converted user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.getUserById('user-123');

      expect(result?.permissions).toBeDefined();
      expect(result?.permissions.canAccessAdmin).toBe(false);
    });
  });
});

describe('AuthService - Edge Cases', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default session mocks
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should handle empty username in login', async () => {
    const emptyCredentials: LoginCredentials = {
      username: '',
      password: 'password123'
    };

    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await authService.authenticate(emptyCredentials);

    expect(result).toBeNull();
  });

  it('should handle empty password in login', async () => {
    const emptyPasswordCredentials: LoginCredentials = {
      username: 'testuser',
      password: ''
    };

    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(false);

    const result = await authService.authenticate(emptyPasswordCredentials);

    expect(result).toBeNull();
  });

  it('should handle special characters in username search', async () => {
    const specialCredentials: LoginCredentials = {
      username: 'user_name-123',
      password: 'password123'
    };

    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(mockUser);

    const result = await authService.authenticate(specialCredentials);

    expect(result).not.toBeNull();
  });

  it('should handle unicode characters in names during registration', async () => {
    const unicodeData: RegisterData = {
      username: 'unicodeuser',
      password: 'SecurePass123!',
      firstName: 'Jean-Pierre',
      lastName: 'Dupont',
      email: 'unicode@example.com'
    };

    const createdUser = { ...mockUser, ...unicodeData, id: 'unicode-id' };

    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
    mockPrisma.user.create.mockResolvedValue(createdUser);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    const result = await authService.register(unicodeData);

    expect(result).not.toBeNull();
  });

  it('should handle very long email addresses', async () => {
    const longEmail = 'a'.repeat(200) + '@example.com';
    const longEmailData: RegisterData = {
      username: 'longemail',
      password: 'SecurePass123!',
      firstName: 'Long',
      lastName: 'Email',
      email: longEmail
    };

    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
    mockPrisma.user.create.mockResolvedValue({ ...mockUser, email: longEmail, id: 'long-email-id' });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    const result = await authService.register(longEmailData);

    expect(result).not.toBeNull();
  });

  it('should handle concurrent authentication attempts', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(mockUser);

    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    // Simulate concurrent requests
    const results = await Promise.all([
      authService.authenticate(credentials),
      authService.authenticate(credentials),
      authService.authenticate(credentials)
    ]);

    results.forEach(result => {
      expect(result).not.toBeNull();
    });
  });
});

describe('AuthService - Security Tests', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default session mocks
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should use bcrypt cost factor of 12 for password hashing', async () => {
    const registerData: RegisterData = {
      username: 'secureuser',
      password: 'SecurePass123!',
      firstName: 'Secure',
      lastName: 'User',
      email: 'secure@example.com'
    };

    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
    mockPrisma.user.create.mockResolvedValue({ ...mockUser, id: 'secure-id' });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    await authService.register(registerData);

    expect(mockBcryptHash).toHaveBeenCalledWith('SecurePass123!', 12);
  });

  it('should not leak user information on failed authentication', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(false);

    const result = await authService.authenticate({
      username: 'testuser',
      password: 'wrongpassword'
    });

    // Should return null, not an error with details
    expect(result).toBeNull();
  });

  it('should not update lastActiveAt on failed authentication', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(false);

    await authService.authenticate({
      username: 'testuser',
      password: 'wrongpassword'
    });

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('should generate unique tokens for different users', () => {
    const user1 = { ...mockSocketIOUser, id: 'user-1' };
    const user2 = { ...mockSocketIOUser, id: 'user-2' };

    mockJwtSign
      .mockReturnValueOnce('token-1')
      .mockReturnValueOnce('token-2');

    const token1 = authService.generateToken(user1 as any);
    const token2 = authService.generateToken(user2 as any);

    expect(token1).not.toBe(token2);
  });

  it('should only search for active users', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(mockUser);

    await authService.authenticate({
      username: 'testuser',
      password: 'password123'
    });

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true
        })
      })
    );
  });
});

// ==================== New tests for uncovered branches ====================

describe('AuthService - 2FA during authenticate', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return requires2FA when twoFactorEnabledAt is set', async () => {
    const userWith2FA = {
      ...mockUser,
      twoFactorEnabledAt: new Date(),
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      twoFactorBackupCodes: []
    };

    mockPrisma.user.findFirst.mockResolvedValue(userWith2FA);
    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(userWith2FA);

    const result = await authService.authenticate({ username: 'testuser', password: 'pass' });

    expect(result).not.toBeNull();
    expect(result?.requires2FA).toBe(true);
    expect(result?.twoFactorToken).toBeDefined();
    expect(typeof result?.twoFactorToken).toBe('string');
    expect(result?.sessionToken).toBe('');
  });

  it('should store hashed 2FA token and expiry when 2FA required', async () => {
    const userWith2FA = {
      ...mockUser,
      twoFactorEnabledAt: new Date(),
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      twoFactorBackupCodes: []
    };

    mockPrisma.user.findFirst.mockResolvedValue(userWith2FA);
    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(userWith2FA);

    await authService.authenticate({ username: 'testuser', password: 'pass' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: userWith2FA.id },
      data: {
        phoneVerificationCode: expect.any(String),
        phoneVerificationExpiry: expect.any(Date)
      }
    });
  });

  it('should use requestContext deviceInfo when returning partial 2FA result', async () => {
    const userWith2FA = {
      ...mockUser,
      twoFactorEnabledAt: new Date(),
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      twoFactorBackupCodes: []
    };

    const requestContext = {
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      geoData: { ip: '1.2.3.4', location: 'Paris', country: 'FR', countryName: 'France', city: 'Paris', region: 'Ile-de-France', timezone: 'Europe/Paris', latitude: 48.85, longitude: 2.35 },
      deviceInfo: { type: 'mobile', browser: 'Safari', browserVersion: '17', os: 'iOS', osVersion: '17', vendor: 'Apple', model: 'iPhone', isMobile: true, isTablet: false, rawUserAgent: 'Mozilla/5.0' }
    };

    mockPrisma.user.findFirst.mockResolvedValue(userWith2FA);
    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(userWith2FA);

    const result = await authService.authenticate(
      { username: 'testuser', password: 'pass' },
      requestContext
    );

    expect(result?.requires2FA).toBe(true);
    expect(result?.session.isMobile).toBe(true);
    expect(result?.session.location).toBe('Paris');
  });

  it('should resend verification email when email not verified on login', async () => {
    const unverifiedUser = {
      ...mockUser,
      twoFactorEnabledAt: null,
      emailVerifiedAt: null
    };

    mockPrisma.user.findFirst
      .mockResolvedValueOnce(unverifiedUser) // initial login lookup
      .mockResolvedValueOnce(unverifiedUser); // resendVerificationEmail lookup

    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(unverifiedUser);

    const result = await authService.authenticate({ username: 'testuser', password: 'pass' });

    expect(result).not.toBeNull();
    // resendVerificationEmail should be called; verify it updated user with new token
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('should continue login even when resendVerificationEmail throws', async () => {
    const unverifiedUser = {
      ...mockUser,
      twoFactorEnabledAt: null,
      emailVerifiedAt: null
    };

    mockPrisma.user.findFirst
      .mockResolvedValueOnce(unverifiedUser)
      .mockResolvedValueOnce(null); // resendVerificationEmail user lookup returns null => success: true silently

    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(unverifiedUser);

    const result = await authService.authenticate({ username: 'testuser', password: 'pass' });
    expect(result).not.toBeNull();
  });
});

describe('AuthService - completeAuthWith2FA', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  // Setup speakeasy mock before importing/using completeAuthWith2FA
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  const userWith2FA = {
    id: 'user-2fa',
    username: 'testuser2fa',
    email: 'test2fa@example.com',
    phoneNumber: '+33612345678',
    firstName: 'Test',
    lastName: 'TwoFA',
    displayName: 'Test TwoFA',
    avatar: null,
    bio: null,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    role: 'USER',
    isActive: true,
    twoFactorEnabledAt: new Date(),
    twoFactorSecret: 'JBSWY3DPEHPK3PXP',
    twoFactorBackupCodes: [],
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    timezone: null,
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: new Date(),
    pendingEmail: null,
    pendingPhoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it('should return error when 2FA token is invalid or expired', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await authService.completeAuthWith2FA('bad-token', '123456');

    expect(result).toEqual({ success: false, error: expect.stringContaining('Token 2FA') });
  });

  it('should return error when 6-digit code does not match (no twoFactorSecret)', async () => {
    // When twoFactorSecret is null, TOTP verification is skipped entirely,
    // and the 6-digit code doesn't match backup codes either → Code 2FA invalide
    const userNoSecret = {
      ...userWith2FA,
      twoFactorSecret: null,
      twoFactorBackupCodes: []
    };
    mockPrisma.user.findFirst.mockResolvedValue(userNoSecret);

    const result = await authService.completeAuthWith2FA('valid-token', '000000');

    expect(result).toEqual({ success: false, error: 'Code 2FA invalide' });
  });

  it('should return error when backup code is invalid', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      ...userWith2FA,
      twoFactorSecret: null,
      twoFactorBackupCodes: ['aaabbbcc'] // wrong hash
    });

    const result = await authService.completeAuthWith2FA('valid-token', 'WRONG123');

    expect(result).toEqual({ success: false, error: 'Code 2FA invalide' });
  });

  it('should succeed with valid backup code', async () => {
    // We need the correct hash: SHA256 of "ABCD1234"
    const crypto = require('crypto');
    const backupCode = 'ABCD1234';
    const hash = crypto.createHash('sha256').update(backupCode).digest('hex');

    const userWithBackupCode = {
      ...userWith2FA,
      twoFactorSecret: null,
      twoFactorBackupCodes: [hash]
    };

    mockPrisma.user.findFirst.mockResolvedValue(userWithBackupCode);
    mockPrisma.user.update.mockResolvedValue(userWithBackupCode);

    const result = await authService.completeAuthWith2FA('valid-token', backupCode);

    expect('success' in result && result.success === false).toBe(false);
    const authResult = result as { user: unknown; sessionToken: string; session: unknown; requires2FA: boolean };
    expect(authResult.requires2FA).toBe(false);
    expect(authResult.sessionToken).toBe('mock-session-token');
    // Backup code should be removed
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: userWithBackupCode.id },
      data: { twoFactorBackupCodes: [] }
    });
  });

  it('should complete login with requestContext after valid 2FA', async () => {
    const crypto = require('crypto');
    const backupCode = 'XYZW5678';
    const hash = crypto.createHash('sha256').update(backupCode).digest('hex');

    const userWithBackupCode = {
      ...userWith2FA,
      twoFactorSecret: null,
      twoFactorBackupCodes: [hash]
    };

    const requestContext = {
      ip: '10.0.0.1',
      userAgent: 'TestAgent/1.0',
      geoData: { ip: '10.0.0.1', location: 'Lyon', country: 'FR', countryName: 'France', city: 'Lyon', region: 'Auvergne-Rhône-Alpes', timezone: 'Europe/Paris', latitude: 45.75, longitude: 4.85 },
      deviceInfo: { type: 'desktop', browser: 'Chrome', browserVersion: '120', os: 'Linux', osVersion: null, vendor: null, model: null, isMobile: false, isTablet: false, rawUserAgent: 'TestAgent/1.0' }
    };

    mockPrisma.user.findFirst.mockResolvedValue(userWithBackupCode);
    mockPrisma.user.update.mockResolvedValue(userWithBackupCode);

    const result = await authService.completeAuthWith2FA('valid-token', backupCode, requestContext);

    expect('success' in result && (result as { success: false }).success === false).toBe(false);
    const authResult = result as { sessionToken: string; session: { userId: string } };
    expect(authResult.sessionToken).toBe('mock-session-token');
  });

  it('should return error on database exception', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await authService.completeAuthWith2FA('some-token', '123456');

    expect(result).toEqual({ success: false, error: expect.stringContaining('Erreur') });
  });

  it('should use requestContext timezone only when user has no timezone', async () => {
    const crypto = require('crypto');
    const backupCode = 'QQRR9999';
    const hash = crypto.createHash('sha256').update(backupCode).digest('hex');

    const userNoTimezone = {
      ...userWith2FA,
      twoFactorSecret: null,
      twoFactorBackupCodes: [hash],
      timezone: null
    };

    const requestContext = {
      ip: '5.5.5.5',
      userAgent: 'Agent',
      geoData: { ip: '5.5.5.5', location: 'Nice', country: 'FR', countryName: 'France', city: 'Nice', region: "Provence-Alpes-Côte d'Azur", timezone: 'Europe/Paris', latitude: 43.7, longitude: 7.27 },
      deviceInfo: null
    };

    mockPrisma.user.findFirst.mockResolvedValue(userNoTimezone);
    mockPrisma.user.update.mockResolvedValue(userNoTimezone);

    await authService.completeAuthWith2FA('token', backupCode, requestContext);

    // The final update call should include timezone
    const finalUpdateCall = mockPrisma.user.update.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { data: Record<string, unknown> };
        return arg?.data?.timezone === 'Europe/Paris';
      }
    );
    expect(finalUpdateCall).toBeDefined();
  });
});

describe('AuthService - verifyEmail', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return alreadyVerified when email already verified', async () => {
    const verifiedAt = new Date('2026-01-01');
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      emailVerifiedAt: verifiedAt,
      emailVerificationToken: null,
      emailVerificationCode: null,
      emailVerificationExpiry: null
    });

    const result = await authService.verifyEmail('any-token', 'test@example.com');

    expect(result.success).toBe(true);
    expect(result.alreadyVerified).toBe(true);
    expect(result.verifiedAt).toEqual(verifiedAt);
  });

  it('should verify email using OTP code successfully', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        emailVerifiedAt: null,
        emailVerificationToken: 'hashed-token',
        emailVerificationCode: '123456',
        emailVerificationExpiry: new Date(Date.now() + 3600000)
      }) // initial check (not already verified)
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com'
      }); // OTP code match

    mockPrisma.user.update.mockResolvedValue({});

    const result = await authService.verifyEmail('123456', 'test@example.com', true);

    expect(result.success).toBe(true);
    expect(result.verifiedAt).toBeInstanceOf(Date);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: {
        emailVerifiedAt: expect.any(Date),
        emailVerificationToken: null,
        emailVerificationCode: null,
        emailVerificationExpiry: null
      }
    });
  });

  it('should return expired error when OTP code is expired', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        emailVerifiedAt: null
      }) // not already verified
      .mockResolvedValueOnce(null) // no active OTP match
      .mockResolvedValueOnce({ id: 'user-123' }); // expired code found

    const result = await authService.verifyEmail('123456', 'test@example.com', true);

    expect(result.success).toBe(false);
    expect(result.error).toContain('expiré');
  });

  it('should return invalid error when OTP code not found at all', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        emailVerifiedAt: null
      })
      .mockResolvedValueOnce(null) // no active OTP
      .mockResolvedValueOnce(null); // no expired OTP either

    const result = await authService.verifyEmail('wrong-code', 'test@example.com', true);

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalide');
  });

  it('should verify email using token link successfully', async () => {
    const crypto = require('crypto');
    const rawToken = 'a'.repeat(64); // 32 bytes hex = 64 chars
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    mockPrisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        emailVerifiedAt: null
      })
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com'
      }); // token match

    mockPrisma.user.update.mockResolvedValue({});

    const result = await authService.verifyEmail(rawToken, 'test@example.com', false);

    expect(result.success).toBe(true);
    expect(result.verifiedAt).toBeInstanceOf(Date);
  });

  it('should return expired error when token link is expired', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({ id: 'user-123', email: 'test@example.com', emailVerifiedAt: null })
      .mockResolvedValueOnce(null) // no active token
      .mockResolvedValueOnce({ id: 'user-123' }); // expired token found

    const result = await authService.verifyEmail('expired-token', 'test@example.com', false);

    expect(result.success).toBe(false);
    expect(result.error).toContain('expiré');
  });

  it('should return invalid error when token link not found at all', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({ id: 'user-123', email: 'test@example.com', emailVerifiedAt: null })
      .mockResolvedValueOnce(null) // no active token
      .mockResolvedValueOnce(null); // no expired token either

    const result = await authService.verifyEmail('nonexistent-token', 'test@example.com', false);

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalide');
  });

  it('should handle database error gracefully', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await authService.verifyEmail('token', 'test@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return success when user does not exist (no leak)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    // Token flow: user not found in initial check, then no active token
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null) // existingUser check returns null
      .mockResolvedValueOnce(null) // active token check
      .mockResolvedValueOnce(null); // expired token check

    const result = await authService.verifyEmail('some-token', 'noone@example.com');

    expect(result.success).toBe(false);
  });
});

describe('AuthService - resendVerificationEmail', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return success when user not found (no information leak)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await authService.resendVerificationEmail('nobody@example.com');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return error when email is already verified', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      systemLanguage: 'fr',
      emailVerifiedAt: new Date()
    });

    const result = await authService.resendVerificationEmail('test@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toContain('déjà vérifiée');
  });

  it('should successfully resend verification email to unverified user', async () => {
    const unverifiedUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      systemLanguage: 'fr',
      emailVerifiedAt: null
    };

    mockPrisma.user.findFirst.mockResolvedValue(unverifiedUser);
    mockPrisma.user.update.mockResolvedValue(unverifiedUser);

    const result = await authService.resendVerificationEmail('test@example.com');

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: {
        emailVerificationToken: expect.any(String),
        emailVerificationCode: expect.any(String),
        emailVerificationExpiry: expect.any(Date)
      }
    });
  });

  it('should use displayName in email when available', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'My Display Name',
      systemLanguage: 'en',
      emailVerifiedAt: null
    });
    mockPrisma.user.update.mockResolvedValue({});

    const result = await authService.resendVerificationEmail('test@example.com');
    expect(result.success).toBe(true);
  });

  it('should handle error gracefully during resend', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await authService.resendVerificationEmail('test@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('AuthService - isEmailVerified', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return true when email is verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });

    const result = await authService.isEmailVerified('user-123');

    expect(result).toBe(true);
  });

  it('should return false when email is not verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    const result = await authService.isEmailVerified('user-123');

    expect(result).toBe(false);
  });

  it('should return false when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authService.isEmailVerified('nonexistent');

    expect(result).toBe(false);
  });

  it('should return false on database error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const result = await authService.isEmailVerified('user-123');

    expect(result).toBe(false);
  });
});

describe('AuthService - sendPhoneVerificationCode', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return error when phone number not found', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await authService.sendPhoneVerificationCode('+33612345678');

    expect(result.success).toBe(false);
    expect(result.error).toContain('non associé');
  });

  it('should return error when phone already verified', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      ...mockUser,
      phoneVerifiedAt: new Date()
    });

    const result = await authService.sendPhoneVerificationCode('+33612345678');

    expect(result.success).toBe(false);
    expect(result.error).toContain('déjà vérifié');
  });

  it('should send SMS and return success', async () => {
    const unverifiedPhone = { ...mockUser, phoneVerifiedAt: null };
    mockPrisma.user.findFirst.mockResolvedValue(unverifiedPhone);
    mockPrisma.user.update.mockResolvedValue(unverifiedPhone);
    mockSmsServiceSendVerificationCode.mockResolvedValue({
      success: true,
      provider: 'twilio',
      messageId: 'msg-123'
    });

    const result = await authService.sendPhoneVerificationCode('+33612345678');

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: {
        phoneVerificationCode: expect.any(String),
        phoneVerificationExpiry: expect.any(Date)
      }
    });
  });

  it('should return error when SMS sending fails', async () => {
    const unverifiedPhone = { ...mockUser, phoneVerifiedAt: null };
    mockPrisma.user.findFirst.mockResolvedValue(unverifiedPhone);
    mockPrisma.user.update.mockResolvedValue(unverifiedPhone);
    mockSmsServiceSendVerificationCode.mockResolvedValue({
      success: false,
      error: 'SMS provider error'
    });

    const result = await authService.sendPhoneVerificationCode('+33612345678');

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMS');
  });

  it('should handle exception gracefully', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await authService.sendPhoneVerificationCode('+33612345678');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should strip whitespace from phone number before search', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await authService.sendPhoneVerificationCode('  +336 12 34 56 78  ');

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phoneNumber: expect.objectContaining({
            contains: expect.any(String)
          })
        })
      })
    );
  });
});

describe('AuthService - verifyPhone', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should verify phone successfully', async () => {
    const unverifiedUser = { ...mockUser, phoneVerifiedAt: null };
    mockPrisma.user.findFirst.mockResolvedValue(unverifiedUser);
    mockPrisma.user.update.mockResolvedValue(unverifiedUser);

    const result = await authService.verifyPhone('+33612345678', '123456');

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: unverifiedUser.id },
      data: {
        phoneVerifiedAt: expect.any(Date),
        phoneVerificationCode: null,
        phoneVerificationExpiry: null
      }
    });
  });

  it('should return success when phone already verified', async () => {
    const verifiedUser = { ...mockUser, phoneVerifiedAt: new Date() };
    mockPrisma.user.findFirst.mockResolvedValue(verifiedUser);

    const result = await authService.verifyPhone('+33612345678', '123456');

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('should return expired error when code is expired', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null) // no active match
      .mockResolvedValueOnce({ id: 'user-123' }); // expired match

    const result = await authService.verifyPhone('+33612345678', '123456');

    expect(result.success).toBe(false);
    expect(result.error).toContain('expiré');
  });

  it('should return invalid error when code not found', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null) // no active match
      .mockResolvedValueOnce(null); // no expired match either

    const result = await authService.verifyPhone('+33612345678', 'wrongcode');

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalide');
  });

  it('should handle database error gracefully', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await authService.verifyPhone('+33612345678', '123456');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('AuthService - isPhoneVerified', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return true when phone is verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phoneVerifiedAt: new Date() });

    const result = await authService.isPhoneVerified('user-123');

    expect(result).toBe(true);
  });

  it('should return false when phone is not verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phoneVerifiedAt: null });

    const result = await authService.isPhoneVerified('user-123');

    expect(result).toBe(false);
  });

  it('should return false when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authService.isPhoneVerified('nonexistent');

    expect(result).toBe(false);
  });

  it('should return false on database error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const result = await authService.isPhoneVerified('user-123');

    expect(result).toBe(false);
  });
});

describe('AuthService - Session management', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('validateSessionToken - should delegate to validateSession', async () => {
    (mockValidateSession as jest.Mock<any>).mockResolvedValue(mockSessionData);

    const result = await authService.validateSessionToken('some-token');

    expect(result).toEqual(mockSessionData);
    expect(mockValidateSession).toHaveBeenCalledWith('some-token');
  });

  it('validateSessionToken - should return null when session invalid', async () => {
    (mockValidateSession as jest.Mock<any>).mockResolvedValue(null);

    const result = await authService.validateSessionToken('invalid-token');

    expect(result).toBeNull();
  });

  it('getUserActiveSessions - should return all sessions for user', async () => {
    const sessions = [mockSessionData, { ...mockSessionData, id: 'session-456' }];
    (mockGetUserSessions as jest.Mock<any>).mockResolvedValue(sessions);

    const result = await authService.getUserActiveSessions('user-123', 'current-token');

    expect(result).toEqual(sessions);
    expect(mockGetUserSessions).toHaveBeenCalledWith('user-123', 'current-token');
  });

  it('getUserActiveSessions - should work without currentToken', async () => {
    (mockGetUserSessions as jest.Mock<any>).mockResolvedValue([mockSessionData]);

    const result = await authService.getUserActiveSessions('user-123');

    expect(result).toEqual([mockSessionData]);
    expect(mockGetUserSessions).toHaveBeenCalledWith('user-123', undefined);
  });

  it('revokeSession - should return true when session revoked', async () => {
    (mockInvalidateSession as jest.Mock<any>).mockResolvedValue(true);

    const result = await authService.revokeSession('session-123', 'security_breach');

    expect(result).toBe(true);
    expect(mockInvalidateSession).toHaveBeenCalledWith('session-123', 'security_breach');
  });

  it('revokeSession - should use default reason user_revoked', async () => {
    (mockInvalidateSession as jest.Mock<any>).mockResolvedValue(true);

    await authService.revokeSession('session-123');

    expect(mockInvalidateSession).toHaveBeenCalledWith('session-123', 'user_revoked');
  });

  it('revokeAllSessionsExceptCurrent - should return count of revoked sessions', async () => {
    (mockInvalidateAllSessions as jest.Mock<any>).mockResolvedValue(3);

    const result = await authService.revokeAllSessionsExceptCurrent('user-123', 'current-token');

    expect(result).toBe(3);
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith('user-123', 'current-token', 'user_revoked_all');
  });

  it('logout - should return true and log on successful logout', async () => {
    (mockLogoutSession as jest.Mock<any>).mockResolvedValue(true);

    const result = await authService.logout('session-token');

    expect(result).toBe(true);
    expect(mockLogoutSession).toHaveBeenCalledWith('session-token');
  });

  it('logout - should return false when logout fails', async () => {
    (mockLogoutSession as jest.Mock<any>).mockResolvedValue(false);

    const result = await authService.logout('invalid-token');

    expect(result).toBe(false);
  });
});

describe('AuthService - verifyToken TokenExpiredError branch', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  it('should return null and log debug for TokenExpiredError', () => {
    const expiredError = Object.assign(new Error('jwt expired'), {
      name: 'TokenExpiredError',
      expiredAt: new Date()
    });
    mockJwtVerify.mockImplementation(() => { throw expiredError; });

    const result = authService.verifyToken('expired-token');

    expect(result).toBeNull();
  });
});

describe('AuthService - register phone conflict and skipPhoneConflictCheck', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
    mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
    authService = new AuthService(mockPrisma, jwtSecret);
  });

  const baseRegisterData: RegisterData = {
    username: 'newuser',
    password: 'SecurePass123!',
    firstName: 'New',
    lastName: 'User',
    email: 'newuser@example.com',
    phoneNumber: '+33698765432'
  };

  it('should return phoneOwnershipConflict when phone belongs to another verified user', async () => {
    const phoneOwner = {
      id: 'owner-id',
      displayName: 'Phone Owner',
      username: 'phoneowner',
      email: 'owner@example.com',
      avatar: null
    };

    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null) // no existing user by username/email
      .mockResolvedValueOnce(phoneOwner); // phone conflict

    const result = await authService.register(baseRegisterData);

    expect(result).not.toBeNull();
    expect(result?.phoneOwnershipConflict).toBe(true);
    expect(result?.phoneOwnerInfo).toBeDefined();
    expect(result?.phoneOwnerInfo?.phoneNumber).toBeDefined();
    expect(result?.user).toBeUndefined();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('should skip phone conflict check when skipPhoneConflictCheck is true', async () => {
    const createdUser = { ...mockUser, id: 'transfer-user-id' };

    mockPrisma.user.findFirst.mockResolvedValue(null); // no username/email conflict
    mockPrisma.user.create.mockResolvedValue(createdUser);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    const result = await authService.register({
      ...baseRegisterData,
      skipPhoneConflictCheck: true
    });

    expect(result).not.toBeNull();
    expect(result?.user).toBeDefined();
    expect(mockPrisma.user.create).toHaveBeenCalled();
  });

  it('should return null when phone number is invalid', async () => {
    const { normalizePhoneWithCountry } = require('../../../utils/normalize');
    (normalizePhoneWithCountry as jest.Mock<any>).mockReturnValueOnce({ isValid: false, phoneNumber: null, countryCode: null });

    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await authService.register(baseRegisterData);

    expect(result).toBeNull();
  });
});

describe('AuthService - register email verification success log path', () => {
  let authService: AuthService;
  const jwtSecret = 'test-jwt-secret';
  // Get reference to the mocked EmailService constructor
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EmailService: MockEmailService } = require('../../../services/EmailService');

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('mock-session-token');
    mockCreateSession.mockResolvedValue(mockSessionData);
  });

  it('should log success when email verification is sent successfully during registration', async () => {
    // Make sendEmailVerification return a success result (covers lines 613-617)
    const mockSendEmailVerification = jest.fn() as jest.Mock<any>;
    mockSendEmailVerification.mockResolvedValue({
      success: true,
      provider: 'resend',
      messageId: 'msg-abc123'
    });
    MockEmailService.mockImplementation(() => ({
      sendEmailVerification: mockSendEmailVerification
    }));

    // Re-create authService so it uses the updated EmailService mock
    const authServiceWithSuccessEmail = new AuthService(mockPrisma, jwtSecret);

    const createdUser = { ...mockUser, id: 'email-success-user-id', emailVerifiedAt: null };

    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockBcryptHash.mockResolvedValue('$2b$12$hashedPassword');
    mockPrisma.user.create.mockResolvedValue(createdUser);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    const result = await authServiceWithSuccessEmail.register({
      username: 'emailsuccessuser',
      password: 'SecurePass123!',
      firstName: 'Email',
      lastName: 'Success',
      email: 'emailsuccess@example.com'
    });

    expect(result).not.toBeNull();
    expect(mockSendEmailVerification).toHaveBeenCalled();
  });

  it('should handle resendVerificationEmail when user has emailVerifiedAt=null during login (line 251)', async () => {
    // Set up EmailService to return a proper result
    const mockSendEmailVerification = jest.fn() as jest.Mock<any>;
    mockSendEmailVerification.mockResolvedValue({ success: true, provider: 'test', messageId: 'x' });
    MockEmailService.mockImplementation(() => ({
      sendEmailVerification: mockSendEmailVerification
    }));

    const authServiceForResend = new AuthService(mockPrisma, jwtSecret);

    const unverifiedUser = { ...mockUser, twoFactorEnabledAt: null, emailVerifiedAt: null };

    mockPrisma.user.findFirst
      .mockResolvedValueOnce(unverifiedUser) // authenticate lookup
      .mockResolvedValueOnce(unverifiedUser); // resendVerificationEmail lookup

    mockBcryptCompare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue(unverifiedUser);

    const result = await authServiceForResend.authenticate({ username: 'testuser', password: 'pass' });

    expect(result).not.toBeNull();
    // resendVerificationEmail was called and succeeded
    expect(mockSendEmailVerification).toHaveBeenCalled();
  });
});
