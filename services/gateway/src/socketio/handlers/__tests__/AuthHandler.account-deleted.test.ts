/**
 * #10264 — à la connexion Socket.IO, un JWT signé d'un compte SUPPRIMÉ reçoit
 * le même refus qu'un compte désactivé (`error` « Account disabled », puis
 * déconnexion — rien ne change pour un ancien client) et, en plus, le code
 * `ACCOUNT_DELETED` qui permet à l'appareil de purger les données de CE
 * compte. Un compte seulement désactivé ne le reçoit jamais.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { AuthHandler } from '../AuthHandler';
import type { StatusService } from '../../../services/StatusService';

const socketDe = (): Socket =>
  ({
    id: 'socket-10264',
    handshake: { auth: { token: 'jwt' }, headers: {} },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket;

const compte = (overrides: Record<string, unknown>) => ({
  id: 'user-10264',
  systemLanguage: 'fr',
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  emailVerifiedAt: new Date('2026-01-02T00:00:00Z'),
  phoneNumber: null,
  emailReleasedAt: null,
  ...overrides,
});

const monter = (ligne: Record<string, unknown>) => {
  const prisma = {
    user: { findUnique: jest.fn(async () => ligne), update: jest.fn(async () => undefined) },
    participant: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    callParticipant: { findMany: jest.fn(async () => []) },
    userSession: { findFirst: jest.fn(async () => null) },
  } as unknown as PrismaClient;
  const connectedUsers = new Map();
  const handler = new AuthHandler({
    prisma,
    statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
    maintenanceService: { updateUserOnlineStatus: jest.fn(async () => undefined), updateAnonymousOnlineStatus: jest.fn(async () => undefined) } as never,
    callService: { leaveCall: jest.fn(async () => undefined) } as never,
    connectedUsers,
    socketToUser: new Map(),
    userSockets: new Map(),
    now: () => new Date('2026-10-13T00:00:00Z'),
  });
  return { handler, connectedUsers, prisma };
};

const connecter = async (ligne: Record<string, unknown>) => {
  process.env.JWT_SECRET = 'secret-10264';
  jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-10264' } as never);
  const { handler, connectedUsers, prisma } = monter(ligne);
  const socket = socketDe();
  await handler.handleTokenAuthentication(socket);
  return { socket, connectedUsers, prisma };
};

afterEach(() => jest.restoreAllMocks());

describe('AuthHandler — un compte supprimé (#10264)', () => {
  it('refusé, avec le code `ACCOUNT_DELETED` sur l’événement d’erreur existant', async () => {
    const { socket, connectedUsers } = await connecter(compte({ isActive: false, deletedAt: new Date('2026-10-01T00:00:00Z') }));

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Account disabled', code: 'ACCOUNT_DELETED' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });

  it('compte seulement désactivé : le refus d’avant, sans code', async () => {
    const { socket } = await connecter(compte({ isActive: false }));

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Account disabled' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('lit `deletedAt` dans la même requête que le compte', async () => {
    const { prisma } = await connecter(compte({ isActive: false, deletedAt: new Date('2026-10-01T00:00:00Z') }));

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ deletedAt: true }) }));
  });
});
