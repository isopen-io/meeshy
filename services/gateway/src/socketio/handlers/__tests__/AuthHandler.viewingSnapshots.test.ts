/**
 * AuthHandler — emitViewingSnapshots, après authentification (#8892).
 *
 * Extrait de AuthHandler.test.ts (#8992) : la feature présence (#8920/#8923)
 * y avait ajouté ces deux témoins, portant le fichier historique à 1698
 * lignes contre un budget déclaré à 1645 (gateway-test-file-size-budget.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

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

describe('AuthHandler — emitViewingSnapshots (#8892)', () => {
  let mockPrisma: PrismaClient;
  let mockStatusService: StatusService;
  let mockMaintenanceService: any;
  let mockCallService: any;
  let connectedUsers: Map<string, any>;
  let socketToUser: Map<string, string>;
  let userSockets: Map<string, Set<string>>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';

    mockPrisma = createMockPrisma();
    mockStatusService = {
      updateLastSeen: jest.fn(),
      noteHeartbeat: jest.fn(),
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

    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123' } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redit qui est dans chaque conversation après une authentification JWT (#8892)', async () => {
    const emitViewingSnapshots = jest.fn().mockResolvedValue(undefined);
    const handler = new AuthHandler({
      prisma: mockPrisma,
      statusService: mockStatusService,
      maintenanceService: mockMaintenanceService,
      callService: mockCallService,
      connectedUsers,
      socketToUser,
      userSockets,
      emitViewingSnapshots,
    });
    const mockSocket = createMockSocket({ handshake: { auth: { token: 'valid-jwt-token' } } });
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
      id: 'user-123',
      systemLanguage: 'en',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: null
    } as any);

    await handler.handleTokenAuthentication(mockSocket);
    await Promise.resolve();

    expect(emitViewingSnapshots).toHaveBeenCalledWith(mockSocket);
  });

  it('redit qui est dans la conversation après une authentification anonyme (#8892)', async () => {
    const emitViewingSnapshots = jest.fn().mockResolvedValue(undefined);
    const handler = new AuthHandler({
      prisma: mockPrisma,
      statusService: mockStatusService,
      maintenanceService: mockMaintenanceService,
      callService: mockCallService,
      connectedUsers,
      socketToUser,
      userSockets,
      emitViewingSnapshots,
    });
    const mockSocket = createMockSocket({ handshake: { auth: { sessionToken: 'anon-session-token' } } });
    jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
      id: 'anon-123',
      displayName: 'Anonymous',
      language: 'en',
      conversationId: 'conv-123'
    } as any);

    await handler.handleTokenAuthentication(mockSocket);
    await Promise.resolve();

    expect(emitViewingSnapshots).toHaveBeenCalledWith(mockSocket);
  });
});
