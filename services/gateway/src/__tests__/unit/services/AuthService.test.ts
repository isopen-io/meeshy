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
jest.mock('../../../services/SmsService', () => ({
  smsService: {
    sendVerificationCode: jest.fn(() => Promise.resolve({ success: true }))
  }
}));

import { AuthService, LoginCredentials, RegisterData, TokenPayload } from '../../../services/AuthService';

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
  conversationMember: {
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
  translateToSystemLanguage: true,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
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
  translateToSystemLanguage: true,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
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
      mockPrisma.conversationMember.findFirst.mockResolvedValue(null); // Not already a member
      mockPrisma.conversationMember.create.mockResolvedValue({});

      const result = await authService.register(validRegisterData);

      expect(result).not.toBeNull();
      expect(mockPrisma.conversationMember.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'global-conv-id',
          userId: 'new-user-id',
          role: 'MEMBER',
          canSendMessage: true,
          canSendFiles: true,
          canSendImages: true,
          canSendVideos: true,
          canSendAudios: true,
          canSendLocations: true,
          canSendLinks: true,
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
      mockPrisma.conversationMember.findFirst.mockResolvedValue(existingMember);

      const result = await authService.register(validRegisterData);

      expect(result).not.toBeNull();
      expect(mockPrisma.conversationMember.create).not.toHaveBeenCalled();
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
      mockPrisma.conversationMember.findFirst.mockResolvedValue(null);
      mockPrisma.conversationMember.create.mockRejectedValue(new Error('Member creation failed'));

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
        translateToSystemLanguage: mockUser.translateToSystemLanguage,
        translateToRegionalLanguage: mockUser.translateToRegionalLanguage,
        useCustomDestination: mockUser.useCustomDestination,
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
