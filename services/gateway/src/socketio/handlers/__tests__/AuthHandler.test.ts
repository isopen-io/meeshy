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

    it('joins the anonymous socket to the ROOMS.user personal room emitters target (regression: unread badge)', async () => {
      // Personal-event emitters (CONVERSATION_UNREAD_UPDATED, mentions, …) all
      // address `io.to(ROOMS.user(participant.userId ?? participant.id))`. For an
      // anonymous participant (no userId) that resolves to `user:<participantId>`.
      // The join therefore MUST use the same convention — joining the bare
      // participantId room left the socket where no emitter ever broadcasts, so
      // anonymous users never received their unread badge until a REST refetch.
      const mockSocket = createMockSocket({
        handshake: { auth: { sessionToken: 'anon-session-123' } }
      });

      jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
        id: 'anon-123',
        displayName: 'Anonymous',
        language: 'en',
        conversationId: 'conv-123'
      } as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      // Joins the personal room every emitter addresses…
      expect(mockSocket.join).toHaveBeenCalledWith('user:anon-123');
      // …and NOT the bare participantId room, which no emitter ever targets.
      expect(mockSocket.join).not.toHaveBeenCalledWith('anon-123');
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

    it('does not auto-leave calls for a registered user on last-socket disconnect', async () => {
      // CALL-RESILIENCE — call lifecycle on disconnect is owned by
      // CallEventsHandler (grace window for answered calls, immediate leave
      // pre-answer, shutdown guard). Auto-leaving here ended answered calls in
      // DB while their P2P media was still alive (socket blip / gateway
      // restart on a single-device user), defeating the grace window.
      (mockPrisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        {
          callSessionId: 'call-1',
          participantId: 'participant-a',
          callSession: { id: 'call-1', status: 'active', type: 'direct' }
        }
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

      expect(mockCallService.leaveCall).not.toHaveBeenCalled();
      expect(mockPrisma.callParticipant.findMany).not.toHaveBeenCalled();
      // Presence cleanup still fully applied
      expect(connectedUsers.has('user-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
      expect(userSockets.has('user-123')).toBe(false);
    });

    it('should still delete from connectedUsers when call leaveCall throws (anonymous)', async () => {
      mockCallService.leaveCall.mockRejectedValue(new Error('call service down'));
      (mockPrisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { callSessionId: 'call-99', participantId: 'p-1' }
      ]);

      socketToUser.set('socket-123', 'anon-123');
      connectedUsers.set('anon-123', {
        id: 'anon-123',
        socketId: 'socket-123',
        isAnonymous: true,
        language: 'en'
      });
      userSockets.set('anon-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      // Even though leaveCall threw, maps must be fully cleaned to avoid orphaned presence
      expect(connectedUsers.has('anon-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
      expect(userSockets.has('anon-123')).toBe(false);
    });

    it('should still clean maps when callParticipant.findMany throws (anonymous)', async () => {
      (mockPrisma.callParticipant.findMany as jest.Mock).mockRejectedValue(new Error('db timeout'));

      socketToUser.set('socket-123', 'anon-123');
      connectedUsers.set('anon-123', {
        id: 'anon-123',
        socketId: 'socket-123',
        isAnonymous: true,
        language: 'en'
      });
      userSockets.set('anon-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      expect(connectedUsers.has('anon-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
    });

    it('should auto-leave calls with correct args for an anonymous participant', async () => {
      // Anonymous participants are the one case CallEventsHandler's disconnect
      // handler cannot resolve (its lookup is keyed on participant.userId) and
      // they get no reconnect grace (ADR-6) — immediate auto-leave stays here.
      (mockPrisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { callSessionId: 'call-1', participantId: 'participant-a' },
        { callSessionId: 'call-2', participantId: 'participant-b' }
      ]);

      socketToUser.set('socket-123', 'anon-123');
      connectedUsers.set('anon-123', {
        id: 'anon-123',
        socketId: 'socket-123',
        isAnonymous: true,
        language: 'en'
      });
      userSockets.set('anon-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket());

      // Audit C5 (2026-07-02) — Prisma-on-Mongo `{leftAt: null}` does NOT match
      // documents whose leftAt field was never written; the filter must cover
      // both shapes or historical participations are invisible to the cleanup.
      expect(mockPrisma.callParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            participant: { id: 'anon-123' }
          })
        })
      );
      expect(mockCallService.leaveCall).toHaveBeenCalledTimes(2);
      expect(mockCallService.leaveCall).toHaveBeenCalledWith({
        callId: 'call-1',
        userId: 'anon-123',
        participantId: 'participant-a'
      });
      expect(mockCallService.leaveCall).toHaveBeenCalledWith({
        callId: 'call-2',
        userId: 'anon-123',
        participantId: 'participant-b'
      });
      // Maps cleaned despite leaving calls
      expect(connectedUsers.has('anon-123')).toBe(false);
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

    it('should call updateAnonymousOnlineStatus for anonymous user on disconnect', async () => {
      socketToUser.set('socket-123', 'anon-123');
      connectedUsers.set('anon-123', {
        id: 'anon-123',
        socketId: 'socket-123',
        isAnonymous: true,
        language: 'en'
      });
      userSockets.set('anon-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket({ id: 'socket-123' }));

      expect(mockMaintenanceService.updateAnonymousOnlineStatus).toHaveBeenCalledWith('anon-123', false, true);
      expect(mockMaintenanceService.updateUserOnlineStatus).not.toHaveBeenCalled();
      expect(connectedUsers.has('anon-123')).toBe(false);
    });

    it('should skip the stale offline broadcast when the user reconnects during anonymous call-cleanup await (race)', async () => {
      // The anonymous branch awaits callParticipant.findMany before reaching the
      // offline broadcast. If the client reconnects during that await (flaky
      // network / app foreground), the new socket's own auth flow already
      // broadcast isOnline:true — a subsequent unconditional isOnline:false here
      // would be a stale last-write-wins clobber of both the room broadcast and
      // the DB flag.
      (mockPrisma.callParticipant.findMany as jest.Mock).mockImplementation(async () => {
        userSockets.set('anon-123', new Set(['socket-456']));
        connectedUsers.set('anon-123', {
          id: 'anon-123',
          socketId: 'socket-456',
          isAnonymous: true,
          language: 'en'
        });
        return [];
      });

      socketToUser.set('socket-123', 'anon-123');
      connectedUsers.set('anon-123', {
        id: 'anon-123',
        socketId: 'socket-123',
        isAnonymous: true,
        language: 'en'
      });
      userSockets.set('anon-123', new Set(['socket-123']));

      await authHandler.handleDisconnection(createMockSocket({ id: 'socket-123' }));

      expect(mockMaintenanceService.updateAnonymousOnlineStatus).not.toHaveBeenCalled();
      // The reconnect's own connectedUsers entry must survive untouched
      expect(connectedUsers.get('anon-123')?.socketId).toBe('socket-456');
    });

    it('should still clean maps when updateUserOnlineStatus throws', async () => {
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      userSockets.set('user-123', new Set(['socket-123']));
      mockMaintenanceService.updateUserOnlineStatus.mockRejectedValue(new Error('service down'));

      await authHandler.handleDisconnection(createMockSocket());

      expect(connectedUsers.has('user-123')).toBe(false);
      expect(socketToUser.has('socket-123')).toBe(false);
    });
  });

  describe('handleTokenAuthentication — emitPresenceSnapshot and _joinUserConversations', () => {
    it('should join socket to conversation rooms returned by participant.findMany', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null
      } as any);
      jest.spyOn((mockPrisma as any).participant, 'findMany').mockResolvedValue([
        { conversationId: 'conv-aaa' },
        { conversationId: 'conv-bbb' }
      ]);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('conversation:conv-aaa');
      expect(mockSocket.join).toHaveBeenCalledWith('conversation:conv-bbb');
    });

    it('awaits all conversation room joins before handleTokenAuthentication resolves', async () => {
      const joinCompleted: string[] = [];
      const asyncJoin = jest.fn().mockImplementation(async (room: string) => {
        await new Promise(resolve => process.nextTick(resolve));
        joinCompleted.push(room);
      });
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } },
        join: asyncJoin,
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123', systemLanguage: 'en',
        regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      } as any);
      jest.spyOn((mockPrisma as any).participant, 'findMany').mockResolvedValue([
        { conversationId: 'conv-aaa' },
        { conversationId: 'conv-bbb' },
      ]);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(joinCompleted).toContain('conversation:conv-aaa');
      expect(joinCompleted).toContain('conversation:conv-bbb');
    });

    it('registers the JWT user in connectedUsers only after all conversation room joins resolve', async () => {
      // Regression test: delivery code (MessageHandler, MeeshySocketIOManager)
      // gates the offline-delivery queue purely on connectedUsers.has(userId).
      // If registration happened before the awaited room joins completed, a
      // message could land in that gap, be skipped from the offline queue
      // (recipient looks online) and never reach the room broadcast either —
      // permanently lost. See AuthHandler.ts _authenticateJWTUser comment.
      const order: string[] = [];
      const asyncJoin = jest.fn().mockImplementation(async (room: string) => {
        await new Promise(resolve => process.nextTick(resolve));
        order.push(`join:${room}`);
      });
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } },
        join: asyncJoin,
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123', systemLanguage: 'en',
        regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      } as any);
      jest.spyOn((mockPrisma as any).participant, 'findMany').mockResolvedValue([
        { conversationId: 'conv-aaa' },
      ]);
      jest.spyOn(connectedUsers, 'set').mockImplementation(((key: string, value: any) => {
        order.push('registered');
        return Map.prototype.set.call(connectedUsers, key, value);
      }) as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      const registeredIndex = order.indexOf('registered');
      const conversationJoinIndex = order.indexOf('join:conversation:conv-aaa');
      expect(registeredIndex).toBeGreaterThan(-1);
      expect(conversationJoinIndex).toBeGreaterThan(-1);
      expect(conversationJoinIndex).toBeLessThan(registeredIndex);
    });

    it('registers the anonymous participant in connectedUsers only after the conversation room join resolves', async () => {
      const order: string[] = [];
      const asyncJoin = jest.fn().mockImplementation(async (room: string) => {
        await new Promise(resolve => process.nextTick(resolve));
        order.push(`join:${room}`);
      });
      const mockSocket = createMockSocket({
        handshake: { auth: { sessionToken: 'anon-session-123' } },
        join: asyncJoin,
      });
      jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
        id: 'anon-123',
        displayName: 'Anonymous',
        language: 'en',
        conversationId: 'conv-123'
      } as any);
      jest.spyOn(connectedUsers, 'set').mockImplementation(((key: string, value: any) => {
        order.push('registered');
        return Map.prototype.set.call(connectedUsers, key, value);
      }) as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      const registeredIndex = order.indexOf('registered');
      const conversationJoinIndex = order.indexOf('join:conversation:conv-123');
      expect(registeredIndex).toBeGreaterThan(-1);
      expect(conversationJoinIndex).toBeGreaterThan(-1);
      expect(conversationJoinIndex).toBeLessThan(registeredIndex);
    });

    it('should not throw when participant.findMany fails in _joinUserConversations', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null
      } as any);
      jest.spyOn((mockPrisma as any).participant, 'findMany').mockRejectedValue(new Error('DB error'));

      // Should not throw despite DB error — _joinUserConversations swallows it
      await expect(authHandler.handleTokenAuthentication(mockSocket)).resolves.toBeUndefined();
      expect(connectedUsers.size).toBe(1);
    });

    it('should invoke emitPresenceSnapshot after JWT auto-auth', async () => {
      const mockEmitPresenceSnapshot = jest.fn().mockResolvedValue(undefined);
      const handlerWithSnapshot = new AuthHandler({
        prisma: mockPrisma,
        statusService: mockStatusService,
        maintenanceService: mockMaintenanceService,
        callService: mockCallService,
        connectedUsers,
        socketToUser,
        userSockets,
        emitPresenceSnapshot: mockEmitPresenceSnapshot
      });

      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null
      } as any);

      await handlerWithSnapshot.handleTokenAuthentication(mockSocket);
      await Promise.resolve();

      expect(mockEmitPresenceSnapshot).toHaveBeenCalledWith(mockSocket, 'user-123', false);
    });

    it('should invoke emitPresenceSnapshot after anonymous token auth', async () => {
      const mockEmitPresenceSnapshot = jest.fn().mockResolvedValue(undefined);
      const handlerWithSnapshot = new AuthHandler({
        prisma: mockPrisma,
        statusService: mockStatusService,
        maintenanceService: mockMaintenanceService,
        callService: mockCallService,
        connectedUsers,
        socketToUser,
        userSockets,
        emitPresenceSnapshot: mockEmitPresenceSnapshot
      });

      const mockSocket = createMockSocket({
        handshake: { auth: { sessionToken: 'anon-session-token' } }
      });
      jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
        id: 'anon-123',
        displayName: 'Anonymous',
        language: 'en',
        conversationId: 'conv-123'
      } as any);

      await handlerWithSnapshot.handleTokenAuthentication(mockSocket);
      await Promise.resolve();

      expect(mockEmitPresenceSnapshot).toHaveBeenCalledWith(mockSocket, 'anon-123', true);
    });

    it('should emit error when JWT_SECRET is not configured', async () => {
      const savedSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'some-jwt-token' } }
      });

      // Restore the real jwt.verify so the code path runs correctly
      jest.restoreAllMocks();

      await authHandler.handleTokenAuthentication(mockSocket);

      process.env.JWT_SECRET = savedSecret;

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'Authentication failed'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleTokenAuthentication — TokenExpiredError', () => {
    it('should emit AUTH_TOKEN_EXPIRED and disconnect when JWT is expired', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'expired-jwt-token' } }
      });

      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth:token-expired', expect.objectContaining({
        code: 'token_expired'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
    });
  });

  describe('handleManualAuthentication', () => {
    it('should authenticate registered user with valid JWT token', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null
      } as any);

      // jwt.verify is mocked in beforeEach to decode to { userId: 'user-123' }
      await authHandler.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token' } as any);

      expect(connectedUsers.size).toBe(1);
      expect(socketToUser.get('socket-123')).toBe('user-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        user: expect.objectContaining({ id: 'user-123', isAnonymous: false })
      }));
      expect(mockMaintenanceService.updateUserOnlineStatus).toHaveBeenCalledWith('user-123', true, true);
    });

    it('should authenticate anonymous user with sessionToken', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
        id: 'anon-123',
        displayName: 'Anonymous',
        language: 'fr',
        conversationId: 'conv-456'
      } as any);

      await authHandler.handleManualAuthentication(mockSocket, { sessionToken: 'anon-session-token' });

      expect(connectedUsers.size).toBe(1);
      expect(socketToUser.get('socket-123')).toBe('anon-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        user: expect.objectContaining({ id: 'anon-123', isAnonymous: true })
      }));
    });

    it('should emit error when neither userId nor sessionToken is provided', async () => {
      const mockSocket = createMockSocket();

      await authHandler.handleManualAuthentication(mockSocket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.any(String)
      }));
      expect(connectedUsers.size).toBe(0);
    });

    it('should emit error and disconnect when JWT user is not found in DB', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(null);

      // jwt.verify decodes (beforeEach) but the user no longer exists in DB
      await authHandler.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token' } as any);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('not found')
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
    });

    it('should emit AUTH_TOKEN_EXPIRED and disconnect on TokenExpiredError', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      await authHandler.handleManualAuthentication(mockSocket, { token: 'expired-jwt-token' } as any);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth:token-expired', expect.objectContaining({
        code: 'token_expired'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should emit error and disconnect on general unexpected error', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn(mockPrisma.user, 'findUnique').mockRejectedValue(new Error('database down'));

      // jwt.verify decodes (beforeEach); the Prisma lookup then fails unexpectedly
      await authHandler.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token' } as any);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'Authentication failed'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should resolve registered user language from systemLanguage on JWT auth, ignoring client-supplied language', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null
      } as any);

      // JWT auth binds language to the server-side systemLanguage; a client-supplied
      // 'language' must NOT override identity-bound data.
      await authHandler.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token', language: 'fr' } as any);

      // systemLanguage is the highest-priority source in resolveUserLanguage, so
      // the resolved language is 'en' (the user's systemLanguage), NOT the
      // client-supplied 'fr'.
      expect(connectedUsers.get('user-123')?.language).toBe('en');
    });

    it('should invoke emitPresenceSnapshot after registering user', async () => {
      const mockEmitPresenceSnapshot = jest.fn().mockResolvedValue(undefined);
      const handlerWithSnapshot = new AuthHandler({
        prisma: mockPrisma,
        statusService: mockStatusService,
        maintenanceService: mockMaintenanceService,
        callService: mockCallService,
        connectedUsers,
        socketToUser,
        userSockets,
        emitPresenceSnapshot: mockEmitPresenceSnapshot
      });

      const mockSocket = createMockSocket();
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null
      } as any);

      await handlerWithSnapshot.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token' } as any);

      // emitPresenceSnapshot is fire-and-forget (.catch) — flush microtasks
      await Promise.resolve();
      expect(mockEmitPresenceSnapshot).toHaveBeenCalledWith(mockSocket, 'user-123', false);
    });
  });

  describe('handleHeartbeat', () => {
    it('should return early when socket is not in socketToUser map', async () => {
      const mockSocket = createMockSocket({ id: 'unknown-socket' });

      await authHandler.handleHeartbeat(mockSocket);

      expect(mockStatusService.updateLastSeen).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should return early when user is not in connectedUsers map', async () => {
      socketToUser.set('socket-123', 'user-123');
      // connectedUsers intentionally empty

      await authHandler.handleHeartbeat(createMockSocket());

      expect(mockStatusService.updateLastSeen).not.toHaveBeenCalled();
    });

    it('should update lastSeen and DB lastActiveAt for registered user', async () => {
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });

      await authHandler.handleHeartbeat(createMockSocket());

      expect(mockStatusService.updateLastSeen).toHaveBeenCalledWith('user-123', false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: { lastActiveAt: expect.any(Date) }
        })
      );
    });

    it('should update lastSeen but skip DB update for anonymous user', async () => {
      socketToUser.set('socket-123', 'anon-123');
      connectedUsers.set('anon-123', {
        id: 'anon-123',
        socketId: 'socket-123',
        isAnonymous: true,
        language: 'fr'
      });

      await authHandler.handleHeartbeat(createMockSocket());

      expect(mockStatusService.updateLastSeen).toHaveBeenCalledWith('anon-123', true);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should not throw when prisma.user.update fails (best-effort)', async () => {
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });
      (mockPrisma.user.update as jest.Mock).mockRejectedValue(new Error('DB timeout'));

      await expect(authHandler.handleHeartbeat(createMockSocket())).resolves.toBeUndefined();
      expect(mockStatusService.updateLastSeen).toHaveBeenCalledWith('user-123', false);
    });

    it('should emit heartbeat:ack immediately with serverTime', async () => {
      const mockSocket = createMockSocket();
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });

      await authHandler.handleHeartbeat(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'heartbeat:ack',
        expect.objectContaining({ serverTime: expect.any(String) })
      );
    });

    it('should include latencyHintMs in heartbeat:ack when clientTime provided', async () => {
      const mockSocket = createMockSocket();
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });

      const clientTime = Date.now() - 50; // 50ms ago
      await authHandler.handleHeartbeat(mockSocket, { clientTime });

      const emitCall = (mockSocket.emit as jest.Mock).mock.calls.find(
        (c) => c[0] === 'heartbeat:ack'
      );
      expect(emitCall).toBeDefined();
      const payload = emitCall![1];
      expect(typeof payload.latencyHintMs).toBe('number');
      expect(payload.latencyHintMs).toBeGreaterThanOrEqual(0);
    });

    it('should not include latencyHintMs when clientTime not provided', async () => {
      const mockSocket = createMockSocket();
      socketToUser.set('socket-123', 'user-123');
      connectedUsers.set('user-123', {
        id: 'user-123',
        socketId: 'socket-123',
        isAnonymous: false,
        language: 'en'
      });

      await authHandler.handleHeartbeat(mockSocket, {});

      const emitCall = (mockSocket.emit as jest.Mock).mock.calls.find(
        (c) => c[0] === 'heartbeat:ack'
      );
      expect(emitCall).toBeDefined();
      expect(emitCall![1].latencyHintMs).toBeUndefined();
    });
  });
});
