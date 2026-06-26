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
const createMockSocket = (overrides: Record<string, unknown> = {}): Socket => ({
  id: 'socket-123',
  handshake: {
    auth: {},
    headers: {}
  },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
  ...overrides
} as unknown as Socket);

const createMockPrisma = (): PrismaClient => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined)
  },
  participant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([])
  },
  callParticipant: {
    findMany: jest.fn().mockResolvedValue([])
  }
} as unknown as PrismaClient);

describe('AuthHandler', () => {
  let authHandler: AuthHandler;
  let mockPrisma: PrismaClient;
  let mockStatusService: StatusService;
  let mockMaintenanceService: any;
  let mockCallService: any;
  let connectedUsers: Map<string, any>;
  let socketToUser: Map<string, string>;
  let userSockets: Map<string, Set<string>>;

  beforeEach(() => {
    // Configure JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';

    mockPrisma = createMockPrisma();
    mockStatusService = {
      updateLastSeen: jest.fn(),
      markConnected: jest.fn(),
      markDisconnected: jest.fn()
    } as unknown as StatusService;

    mockMaintenanceService = {
      updateUserOnlineStatus: jest.fn().mockResolvedValue(undefined),
      updateAnonymousOnlineStatus: jest.fn().mockResolvedValue(undefined)
    };

    mockCallService = {
      leaveCall: jest.fn().mockResolvedValue(undefined)
    };

    connectedUsers = new Map();
    socketToUser = new Map();
    userSockets = new Map();

    authHandler = new AuthHandler({
      prisma: mockPrisma,
      statusService: mockStatusService,
      maintenanceService: mockMaintenanceService,
      callService: mockCallService,
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
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          id: 'user-123',
          isAnonymous: false
        })
      }));
    });

    it('should authenticate anonymous user with session token', async () => {
      const mockSocket = createMockSocket({
        handshake: {
          auth: {
            sessionToken: 'anon-session-123'
          }
        }
      });

      jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
        id: 'anon-123',
        displayName: 'Anonymous',
        language: 'en',
        conversationId: 'conv-123'
      } as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(connectedUsers.size).toBe(1);
      expect(socketToUser.get('socket-123')).toBe('anon-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          id: 'anon-123',
          isAnonymous: true
        })
      }));
    });

    it('should handle missing tokens gracefully', async () => {
      jest.useFakeTimers();
      const mockSocket = createMockSocket();

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(connectedUsers.size).toBe(0);
      expect(socketToUser.size).toBe(0);
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should disconnect socket when JWT user is not found in database', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });

      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(null);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('not found')
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
    });

    it('should disconnect socket when anonymous session token is not found', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { sessionToken: 'unknown-session' } }
      });

      jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue(null);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('not found')
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
    });

    it('should disconnect socket and emit error on unexpected JWT verification failure', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'malformed-token' } }
      });

      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'Authentication failed'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
    });
  });

  describe('handleDisconnection', () => {
    it('should cleanup user data on disconnect', async () => {
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

      await authHandler.handleDisconnection(mockSocket);

      expect(connectedUsers.size).toBe(0);
      expect(socketToUser.size).toBe(0);
      expect(userSockets.size).toBe(0);
    });

    it('should handle multi-device disconnect correctly', async () => {
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

      await authHandler.handleDisconnection(mockSocket);

      // User should still have 1 socket active
      expect(userSockets.get('user-123')?.size).toBe(1);
      expect(userSockets.get('user-123')?.has('socket-456')).toBe(true);
      expect(socketToUser.has('socket-123')).toBe(false);
    });

    it('should update connectedUsers with remaining socketId on multi-device disconnect', async () => {
      socketToUser.set('socket-123', 'user-123');
      socketToUser.set('socket-456', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123', 'socket-456']));

      await authHandler.handleDisconnection(createMockSocket({ id: 'socket-123' }));

      // connectedUsers must point to the surviving socket so presence lookups stay valid
      expect(connectedUsers.get('user-123')?.socketId).toBe('socket-456');
    });

    it('should return early without mutating maps when socketId is unknown', async () => {
      // Simulate race: socket not in socketToUser (already cleaned up or never registered)
      const mockSocket = createMockSocket({ id: 'unknown-socket' });

      await authHandler.handleDisconnection(mockSocket);

      // Nothing mutated
      expect(connectedUsers.size).toBe(0);
      expect(socketToUser.size).toBe(0);
      expect(userSockets.size).toBe(0);
    });

    it('should still delete from connectedUsers when call leaveCall throws', async () => {
      mockCallService.leaveCall.mockRejectedValue(new Error('call service down'));
      (mockPrisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { callSessionId: 'call-99', participantId: 'p-1' }
      ]);

      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      // Even though leaveCall threw, maps must be fully cleaned to avoid orphaned presence
      expect(connectedUsers.has('user-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
      expect(userSockets.has('user-123')).toBe(false);
    });

    it('should still clean maps when callParticipant.findMany throws', async () => {
      (mockPrisma.callParticipant.findMany as jest.Mock).mockRejectedValue(new Error('db timeout'));

      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      expect(connectedUsers.has('user-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
    });

    it('should call leaveCall with correct args for each active call participation', async () => {
      (mockPrisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { callSessionId: 'call-1', participantId: 'participant-a' },
        { callSessionId: 'call-2', participantId: 'participant-b' }
      ]);

      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      expect(mockCallService.leaveCall).toHaveBeenCalledTimes(2);
      expect(mockCallService.leaveCall).toHaveBeenCalledWith({
        callId: 'call-1',
        userId: 'user-123',
        participantId: 'participant-a'
      });
      expect(mockCallService.leaveCall).toHaveBeenCalledWith({
        callId: 'call-2',
        userId: 'user-123',
        participantId: 'participant-b'
      });
      // Maps cleaned despite leaving calls
      expect(connectedUsers.has('user-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
    });

    it('should not call leaveCall when there are no active call participations', async () => {
      (mockPrisma.callParticipant.findMany as jest.Mock).mockResolvedValue([]);

      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      expect(mockCallService.leaveCall).not.toHaveBeenCalled();
      expect(connectedUsers.has('user-123')).toBe(false);
    });
  });
});
