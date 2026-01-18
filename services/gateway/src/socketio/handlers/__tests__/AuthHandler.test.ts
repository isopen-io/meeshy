/**
 * Tests unitaires pour AuthHandler
 * Exemple de tests pour la nouvelle architecture Socket.IO
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

// Mocks
const createMockSocket = (overrides = {}): Socket => ({
  id: 'socket-123',
  handshake: {
    auth: {},
    headers: {}
  },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  ...overrides
} as unknown as Socket);

const createMockPrisma = (): PrismaClient => ({
  user: {
    findUnique: jest.fn()
  },
  anonymousParticipant: {
    findUnique: jest.fn()
  }
} as unknown as PrismaClient);

describe('AuthHandler', () => {
  let authHandler: AuthHandler;
  let mockPrisma: PrismaClient;
  let mockStatusService: StatusService;
  let connectedUsers: Map<string, any>;
  let socketToUser: Map<string, string>;
  let userSockets: Map<string, Set<string>>;

  beforeEach(() => {
    // Configure JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';

    mockPrisma = createMockPrisma();
    mockStatusService = {
      updateLastSeen: jest.fn()
    } as unknown as StatusService;

    connectedUsers = new Map();
    socketToUser = new Map();
    userSockets = new Map();

    authHandler = new AuthHandler({
      prisma: mockPrisma,
      statusService: mockStatusService,
      connectedUsers,
      socketToUser,
      userSockets
    });

    // Mock jwt.verify to return a valid decoded token
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123' } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleTokenAuthentication', () => {
    it('should authenticate user with valid JWT token', async () => {
      const mockSocket = createMockSocket({
        handshake: {
          auth: {
            token: 'valid-jwt-token'
          }
        }
      });

      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en'
      } as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(connectedUsers.size).toBe(1);
      expect(socketToUser.get('socket-123')).toBe('user-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        userId: 'user-123',
        isAnonymous: false
      });
    });

    it('should authenticate anonymous user with session token', async () => {
      const mockSocket = createMockSocket({
        handshake: {
          auth: {
            sessionToken: 'anon-session-123'
          }
        }
      });

      jest.spyOn(mockPrisma.anonymousParticipant, 'findUnique').mockResolvedValue({
        id: 'anon-123',
        sessionToken: 'anon-session-123'
      } as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(connectedUsers.size).toBe(1);
      expect(socketToUser.get('socket-123')).toBe('anon-session-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        userId: 'anon-123',
        isAnonymous: true,
        sessionToken: 'anon-session-123'
      });
    });

    it('should handle missing tokens gracefully', async () => {
      const mockSocket = createMockSocket();

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(connectedUsers.size).toBe(0);
      expect(socketToUser.size).toBe(0);
    });
  });

  describe('handleDisconnection', () => {
    it('should cleanup user data on disconnect', () => {
      // Setup connected user
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123']));

      const mockSocket = createMockSocket();

      authHandler.handleDisconnection(mockSocket);

      expect(connectedUsers.size).toBe(0);
      expect(socketToUser.size).toBe(0);
      expect(userSockets.size).toBe(0);
    });

    it('should handle multi-device disconnect correctly', () => {
      // User with 2 devices
      socketToUser.set('socket-123', 'user-123');
      socketToUser.set('socket-456', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123', 'socket-456']));

      const mockSocket = createMockSocket({ id: 'socket-123' });

      authHandler.handleDisconnection(mockSocket);

      // User should still have 1 socket active
      expect(userSockets.get('user-123')?.size).toBe(1);
      expect(userSockets.get('user-123')?.has('socket-456')).toBe(true);
      expect(socketToUser.has('socket-123')).toBe(false);
    });
  });
});
