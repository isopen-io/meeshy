/**
 * #9610 — une socket ne porte pas d'en-têtes `X-Meeshy-*` (la liste CORS de
 * Socket.IO est fermée) : elle remet le MÊME relevé sous `handshake.auth.client`,
 * et la session que le JWT nomme le retient, sans rien effacer de ce que le
 * client ne déclare pas.
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
  },
  // La porte `sid` n'interroge cette table que lorsque le JWT décodé porte
  // un claim `sid` — résolu à `null` par défaut : un test qui active la
  // porte SANS stubber explicitement cette méthode échoue fermé plutôt que
  // de passer par accident.
  userSession: {
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 })
  }
} as unknown as PrismaClient);

const relevéDeLaSession = { appVersion: '2.0.2', appBuild: null, platform: 'pwa', deviceName: null, deviceModel: null, osVersion: null };

const attendreLeRelevé = () => new Promise((resolve) => setImmediate(resolve));

describe('AuthHandler — la session nommée retient le relevé de la socket (#9610)', () => {
  let authHandler: AuthHandler;
  let mockPrisma: PrismaClient;
  let connectedUsers: Map<string, any>;
  let socketToUser: Map<string, string>;
  let userSockets: Map<string, Set<string>>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';

    mockPrisma = createMockPrisma();
    const mockStatusService = {
      updateLastSeen: jest.fn(),
      noteHeartbeat: jest.fn(),
      markConnected: jest.fn(),
      markDisconnected: jest.fn()
    } as unknown as StatusService;
    const mockMaintenanceService = {
      updateUserOnlineStatus: jest.fn().mockResolvedValue(undefined),
      updateAnonymousOnlineStatus: jest.fn().mockResolvedValue(undefined)
    };
    const mockCallService = { leaveCall: jest.fn().mockResolvedValue(undefined) };

    connectedUsers = new Map();
    socketToUser = new Map();
    userSockets = new Map();

    authHandler = new AuthHandler({
      prisma: mockPrisma,
      statusService: mockStatusService,
      maintenanceService: mockMaintenanceService as any,
      callService: mockCallService as any,
      connectedUsers,
      socketToUser,
      userSockets
    });

    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123' } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const brancherLaSession = () =>
    jest.spyOn((mockPrisma as any).userSession, 'findFirst').mockImplementation(async (args: any) =>
      args?.select?.appVersion ? relevéDeLaSession : { id: 'session-abc' });

  it('une application mise à jour écrit sa nouvelle version sur la session du `sid`, et rien d’autre', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', sid: 'session-abc' } as any);
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({ id: 'user-123', systemLanguage: 'en' } as any);
    brancherLaSession();
    const socket = createMockSocket({
      handshake: { auth: { token: 'jwt', client: { appVersion: '2.0.3', platform: 'pwa', deviceName: 'Chrome sur Mac' } }, headers: {} },
    });

    await authHandler.handleTokenAuthentication(socket);
    await attendreLeRelevé();

    expect((mockPrisma as any).userSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-abc', userId: 'user-123', isValid: true },
      data: { appVersion: '2.0.3', deviceName: 'Chrome sur Mac' },
    });
    expect(connectedUsers.size).toBe(1);
  });

  it('une socket sans relevé (ancien client) ne touche pas la session', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', sid: 'session-abc' } as any);
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({ id: 'user-123', systemLanguage: 'en' } as any);
    brancherLaSession();

    await authHandler.handleTokenAuthentication(createMockSocket({ handshake: { auth: { token: 'jwt' }, headers: {} } }));
    await attendreLeRelevé();

    expect((mockPrisma as any).userSession.updateMany).not.toHaveBeenCalled();
    expect(connectedUsers.size).toBe(1);
  });
});
