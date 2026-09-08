/**
 * #5712 — un JWT authentique reste utilisable jusqu'à SA PROPRE expiration
 * (24h) même quand la `UserSession` qui l'a émis (nommée par le claim `sid`,
 * `services/auth/session-jwt.ts`) est, elle, périmée depuis des mois :
 * `POST /auth/refresh` la renouvelle indéfiniment (son filtre s'arrête à
 * `isValid`, décision assumée séparément dans `routes/auth/magic-link.ts`),
 * et rien côté socket ne relisait jamais la session nommée. Mesuré en
 * production : 34 comptes actifs sur des sessions expirées depuis jusqu'à
 * six mois.
 *
 * Séparé de `AuthHandler.test.ts` plutôt qu'ajouté à sa fin : ce fichier est
 * déjà dans la dette héritée du cliquet de taille des suites (#4531,
 * `gateway-test-file-size-budget.test.ts`), dont la règle 3 interdit toute
 * croissance du cumul de lignes hors budget. Un nouveau fichier, sous le
 * seuil, ne l'alourdit pas — cf. CLAUDE.md § Code Style : « Ajouter à un
 * fichier déjà hors budget est interdit : on extrait d'abord, on ajoute
 * ensuite. » Même patron que `AuthHandler.session-integrity.test.ts` (#3625).
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
    findFirst: jest.fn().mockResolvedValue(null)
  }
} as unknown as PrismaClient);

describe('AuthHandler — la session nommée par le JWT (`sid`) doit être valide ET non expirée (#5712)', () => {
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

  it('authentifie normalement quand la session nommée est valide et non expirée', async () => {
    const mockSocket = createMockSocket({
      handshake: { auth: { token: 'valid-jwt-token' } }
    });

    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', sid: 'session-abc' } as any);
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({ id: 'user-123', systemLanguage: 'en' } as any);
    jest.spyOn((mockPrisma as any).userSession, 'findFirst').mockResolvedValue({ id: 'session-abc' });

    await authHandler.handleTokenAuthentication(mockSocket);

    expect((mockPrisma as any).userSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-abc', userId: 'user-123', isValid: true, expiresAt: { gt: expect.any(Date) } },
      select: { id: true },
    });
    expect(connectedUsers.size).toBe(1);
    expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({ success: true }));
  });

  it('refuse la connexion quand la session nommée par `sid` est introuvable/révoquée/expirée', async () => {
    const mockSocket = createMockSocket({
      handshake: { auth: { token: 'valid-jwt-token' } }
    });

    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', sid: 'session-dead' } as any);
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({ id: 'user-123', systemLanguage: 'en' } as any);
    jest.spyOn((mockPrisma as any).userSession, 'findFirst').mockResolvedValue(null);

    await authHandler.handleTokenAuthentication(mockSocket);

    expect(mockSocket.emit).toHaveBeenCalledWith('auth:session-revoked', expect.objectContaining({
      code: 'session_revoked',
      reason: 'session_expired',
    }));
    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
    expect(socketToUser.size).toBe(0);
  });

  it("n'interroge pas `UserSession` et authentifie normalement quand le JWT ne porte aucun `sid` (jeton hérité, #4264)", async () => {
    const mockSocket = createMockSocket({
      handshake: { auth: { token: 'valid-jwt-token' } }
    });

    // Le `jwt.verify` par défaut du `beforeEach` ne pose pas `sid`.
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({ id: 'user-123', systemLanguage: 'en' } as any);

    await authHandler.handleTokenAuthentication(mockSocket);

    expect((mockPrisma as any).userSession.findFirst).not.toHaveBeenCalled();
    expect(connectedUsers.size).toBe(1);
    expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({ success: true }));
  });
});
