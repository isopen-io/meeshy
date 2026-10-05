/**
 * #8238 — le délai de grâce de l'adresse à la connexion Socket.IO. Passé 28
 * jours sans preuve d'adresse et sans numéro, un JWT encore valide n'ouvre
 * plus de canal temps réel : `auth:session-revoked` avec
 * `reason: 'activation_required'`, puis déconnexion. Avant, le socket
 * s'authentifie comme toujours.
 *
 * Horloge INJECTÉE (`AuthHandlerDependencies.now`) : jamais l'horloge murale.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { AuthHandler } from '../AuthHandler';
import type { StatusService } from '../../../services/StatusService';
import { ACTIVATION_GRACE_EPOCH } from '../../../services/auth/account-activation';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date(ACTIVATION_GRACE_EPOCH.getTime() + DAY_MS);
const jour = (n: number): Date => new Date(CREATED.getTime() + n * DAY_MS);

const socketDe = (): Socket =>
  ({
    id: 'socket-8238',
    handshake: { auth: { token: 'jwt' }, headers: {} },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket;

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-8238',
  systemLanguage: 'fr',
  isActive: true,
  createdAt: CREATED,
  emailVerifiedAt: null,
  phoneNumber: null,
  emailReleasedAt: null,
  ...overrides,
});

const monter = (ligne: Record<string, unknown>, maintenant: Date) => {
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
    now: () => maintenant,
  });
  return { handler, connectedUsers, prisma };
};

afterEach(() => jest.restoreAllMocks());

describe('AuthHandler — le délai de grâce de l’adresse (#8238)', () => {
  it('J28, adresse non prouvée, aucun numéro : socket refusé, motif `activation_required`', async () => {
    process.env.JWT_SECRET = 'secret-8238';
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-8238' } as never);
    const { handler, connectedUsers } = monter(compte(), jour(28));
    const socket = socketDe();

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('auth:session-revoked', expect.objectContaining({ code: 'session_revoked', reason: 'activation_required' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });

  it('lit les colonnes de la loi dans la même requête que le compte', async () => {
    process.env.JWT_SECRET = 'secret-8238';
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-8238' } as never);
    const { handler, prisma } = monter(compte(), jour(28));

    await handler.handleTokenAuthentication(socketDe());

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ createdAt: true, emailVerifiedAt: true, phoneNumber: true, emailReleasedAt: true }),
      }),
    );
  });

  it.each([
    ['J27, pendant le délai', compte(), jour(27)],
    ['J400 avec un numéro', compte({ phoneNumber: '+33612345678' }), jour(400)],
    ['J400 adresse prouvée', compte({ emailVerifiedAt: jour(3) }), jour(400)],
  ])('%s : socket authentifié', async (_nom, ligne, maintenant) => {
    process.env.JWT_SECRET = 'secret-8238';
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-8238' } as never);
    const { handler, connectedUsers } = monter(ligne, maintenant);
    const socket = socketDe();

    await handler.handleTokenAuthentication(socket);

    expect(connectedUsers.size).toBe(1);
    expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({ success: true }));
  });
});
