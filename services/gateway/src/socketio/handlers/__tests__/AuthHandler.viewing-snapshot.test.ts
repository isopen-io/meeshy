/**
 * AuthHandler — qui est déjà là se redit à l'arrivée (#8892).
 *
 * Une fois les rooms jointes, l'authentification JWT comme l'anonyme remet
 * la socket à `emitViewingSnapshots`, pour que la liste montre les pairs qui
 * ont déjà la conversation ouverte sans attendre qu'ils la rouvrent.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

const createSocket = (auth: Record<string, string>): Socket => ({
  id: 'socket-123',
  handshake: { auth, headers: {} },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
} as unknown as Socket);

const createPrisma = (): PrismaClient => ({
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'user-123',
      systemLanguage: 'en',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: null,
    }),
    update: jest.fn().mockResolvedValue(undefined),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue({
      id: 'anon-123',
      displayName: 'Anonymous',
      language: 'en',
      conversationId: 'conv-123',
    }),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  callParticipant: { findMany: jest.fn().mockResolvedValue([]) },
} as unknown as PrismaClient);

const createHandler = (emitViewingSnapshots: (socket: Socket) => Promise<void>) => new AuthHandler({
  prisma: createPrisma(),
  statusService: {
    updateLastSeen: jest.fn(),
    noteHeartbeat: jest.fn(),
    markConnected: jest.fn(),
    markDisconnected: jest.fn(),
  } as unknown as StatusService,
  maintenanceService: {
    updateUserOnlineStatus: jest.fn().mockResolvedValue(undefined),
    updateAnonymousOnlineStatus: jest.fn().mockResolvedValue(undefined),
  } as never,
  callService: { leaveCall: jest.fn().mockResolvedValue(undefined) } as never,
  connectedUsers: new Map(),
  socketToUser: new Map(),
  userSockets: new Map(),
  emitViewingSnapshots,
});

describe('AuthHandler — qui est déjà là (#8892)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['une authentification JWT', { token: 'valid-jwt-token' }],
    ['une authentification anonyme', { sessionToken: 'anon-session-token' }],
  ])('redit qui est dans chaque conversation après %s', async (_label, auth) => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123' } as never);
    const emitViewingSnapshots = jest.fn().mockResolvedValue(undefined);
    const socket = createSocket(auth);

    await createHandler(emitViewingSnapshots).handleTokenAuthentication(socket);
    await Promise.resolve();

    expect(emitViewingSnapshots).toHaveBeenCalledWith(socket);
  });
});
