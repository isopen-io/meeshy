/**
 * Tests for AuthHandler.handleManualAuthentication
 *
 * This method handles the client-side 'authenticate' event sent after the
 * initial socket connection — typically on reconnect or when the client
 * passes credentials in-band rather than in the Socket.IO handshake auth.
 *
 * Key behaviours:
 *  - Registered users authenticate via JWT token ({ token }) — userId-only is not accepted
 *  - Anonymous users authenticate via sessionToken ({ sessionToken })
 *  - user-not-found in DB emits an error AND disconnects the socket
 *  - An unexpected exception still disconnects (same hard-failure policy)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthHandler } from '../AuthHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Socket / Prisma mocks
// ---------------------------------------------------------------------------

const createMockSocket = (overrides: Record<string, unknown> = {}): Socket =>
  ({
    id: 'socket-manual-1',
    handshake: { auth: {}, headers: {} },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
    ...overrides
  } as unknown as Socket);

const createMockPrisma = (): PrismaClient =>
  ({
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

// ---------------------------------------------------------------------------
// Shared user fixture
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-manual-123',
  systemLanguage: 'en',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthHandler.handleManualAuthentication', () => {
  let authHandler: AuthHandler;
  let mockPrisma: PrismaClient;
  let mockStatusService: StatusService;
  let mockMaintenanceService: { updateUserOnlineStatus: jest.Mock; updateAnonymousOnlineStatus: jest.Mock };
  let mockCallService: { leaveCall: jest.Mock };
  let connectedUsers: Map<string, any>;
  let socketToUser: Map<string, string>;
  let userSockets: Map<string, Set<string>>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key';

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

    // JWT auth is now the registered-user path: decode a verified token to the
    // user's id. Individual tests override this when they need an error path.
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: MOCK_USER.id } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  it('should register a user and emit authenticated when JWT token is valid', async () => {
    const mockSocket = createMockSocket();
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(MOCK_USER as any);

    // jwt.verify (beforeEach) decodes to { userId: MOCK_USER.id }
    await authHandler.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token' } as any);

    expect(connectedUsers.size).toBe(1);
    expect(socketToUser.get('socket-manual-1')).toBe(MOCK_USER.id);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'authenticated',
      expect.objectContaining({
        success: true,
        user: expect.objectContaining({ id: MOCK_USER.id, isAnonymous: false })
      })
    );
  });

  it('should resolve language from systemLanguage on JWT auth, ignoring client-supplied language', async () => {
    const mockSocket = createMockSocket();
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(MOCK_USER as any);

    // JWT auth binds the socket language to the verified user's systemLanguage;
    // a client-supplied 'language' must NOT override identity-bound data.
    await authHandler.handleManualAuthentication(mockSocket, {
      token: 'valid-jwt-token',
      language: 'fr'
    } as any);

    const registered = connectedUsers.get(MOCK_USER.id);
    expect(registered?.language).toBe(MOCK_USER.systemLanguage);
  });

  it('should join personal Socket.IO rooms for a registered user', async () => {
    const mockSocket = createMockSocket();
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(MOCK_USER as any);

    await authHandler.handleManualAuthentication(mockSocket, { token: jwt.sign({ userId: MOCK_USER.id }, 'test-secret-key') });

    const joinCalls = (mockSocket.join as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(joinCalls).toContain(`user:${MOCK_USER.id}`);
    expect(joinCalls).toContain(`feed:${MOCK_USER.id}`);
  });

  it('should delegate to anonymous path when only sessionToken is provided', async () => {
    const mockSocket = createMockSocket();
    jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
      id: 'anon-participant-1',
      displayName: 'Guest',
      language: 'es',
      conversationId: 'conv-anon-1'
    });

    await authHandler.handleManualAuthentication(mockSocket, {
      sessionToken: 'anon-session-token-xyz'
    });

    expect(connectedUsers.size).toBe(1);
    const registered = [...connectedUsers.values()][0];
    expect(registered.isAnonymous).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Soft failures (error emitted, socket stays connected)
  // -------------------------------------------------------------------------

  it('should emit error and disconnect when user is not found in database', async () => {
    const mockSocket = createMockSocket();
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(null);

    // Token verifies (beforeEach) but the decoded user no longer exists: the
    // verified identity is invalid, so the socket is severed.
    await authHandler.handleManualAuthentication(mockSocket, {
      token: jwt.sign({ userId: 'nonexistent-user-id' }, 'test-secret-key'),
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.stringContaining('not found') })
    );
    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });

  it('should emit error (not disconnect) when neither userId nor sessionToken is provided', async () => {
    const mockSocket = createMockSocket();

    await authHandler.handleManualAuthentication(mockSocket, {});

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.stringContaining('sessionToken required') })
    );
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it('should emit error (not disconnect) on schema validation failure', async () => {
    const mockSocket = createMockSocket();

    // Pass a non-object to trigger Zod schema failure
    await authHandler.handleManualAuthentication(mockSocket, null as any);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: expect.stringContaining('Validation failed') })
    );
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Hard failure — unexpected exception → disconnect
  // -------------------------------------------------------------------------

  it('should emit error and disconnect socket on unexpected Prisma error', async () => {
    const mockSocket = createMockSocket();
    jest.spyOn(mockPrisma.user, 'findUnique').mockRejectedValue(
      new Error('connection timeout')
    );

    await authHandler.handleManualAuthentication(mockSocket, { token: jwt.sign({ userId: 'user-abc' }, 'test-secret-key') });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: 'Authentication failed' })
    );
    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });
});
