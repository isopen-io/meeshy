/**
 * #3625 — un socket ne revérifie jamais son JWT après le handshake.
 *
 * Séparé de `AuthHandler.test.ts` plutôt qu'ajouté à sa fin : ce fichier est
 * déjà dans la dette héritée du cliquet de taille des suites (#4531,
 * `gateway-test-file-size-budget.test.ts`), dont la règle 3 interdit toute
 * croissance du cumul de lignes hors budget. Un nouveau fichier, sous le
 * seuil, ne l'alourdit pas — cf. CLAUDE.md § Code Style : « Ajouter à un
 * fichier déjà hors budget est interdit : on extrait d'abord, on ajoute
 * ensuite. »
 *
 * Deux gardes distinctes :
 *  - `_authenticateJWTUser` refuse désormais un compte `isActive: false` —
 *    `disconnectRevokedSessions` coupe déjà les sockets VIVANTS au moment de
 *    la désactivation, mais ne peut rien pour une reconnexion ultérieure avec
 *    le même JWT, encore valide.
 *  - un minuteur armé sur `exp` émet `auth:token-expired` et déconnecte le
 *    socket quand le jeton expire PENDANT que la connexion reste ouverte —
 *    le miroir de `jwt.TokenExpiredError`, qui ne couvre qu'un jeton déjà
 *    expiré AU connect.
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

const activeUserRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  systemLanguage: 'en',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...overrides,
});

describe('AuthHandler — intégrité de session (#3625)', () => {
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

  // #3625 — un compte banni/désactivé APRÈS l'émission de son JWT gardait un
  // accès temps réel complet jusqu'à l'expiration naturelle du jeton (24h,
  // voire 365 jours avec `rememberDevice`).
  describe('compte désactivé', () => {
    it('refuses a disabled account and disconnects without registering it', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow({ isActive: false }) as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('disabled')
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
      expect(socketToUser.size).toBe(0);
    });

    it('refuses a disabled account on manual authentication too (same _authenticateJWTUser path)', async () => {
      const mockSocket = createMockSocket();
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow({ isActive: false }) as any);

      await authHandler.handleManualAuthentication(mockSocket, { token: 'valid-jwt-token' } as any);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(connectedUsers.size).toBe(0);
    });

    it('still authenticates an active account (isActive: true)', async () => {
      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow({ isActive: true }) as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      expect(connectedUsers.size).toBe(1);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  // #3625 — aucun minuteur ne surveillait `exp` : un JWT qui expire PENDANT
  // qu'un socket reste ouvert ne coupait jamais l'accès avant la prochaine
  // reconnexion (le client ne referme jamais spontanément une connexion
  // Socket.IO vivante).
  describe('expiration du JWT pendant la connexion', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('emits auth:token-expired and disconnects once the JWT exp elapses', async () => {
      jest.useFakeTimers();
      const nowSeconds = Math.floor(Date.now() / 1000);
      jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', exp: nowSeconds + 5 } as any);

      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow() as any);

      await authHandler.handleTokenAuthentication(mockSocket);
      (mockSocket.emit as jest.Mock).mockClear();
      (mockSocket.disconnect as jest.Mock).mockClear();

      jest.advanceTimersByTime(5_000);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth:token-expired', expect.objectContaining({
        code: 'token_expired'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('never disconnects a socket whose JWT carries no exp', async () => {
      jest.useFakeTimers();
      jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123' } as any);

      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow() as any);

      await authHandler.handleTokenAuthentication(mockSocket);
      (mockSocket.disconnect as jest.Mock).mockClear();

      jest.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('disarms the expiry timer on socket disconnect — a departed socket is never force-disconnected later', async () => {
      jest.useFakeTimers();
      const nowSeconds = Math.floor(Date.now() / 1000);
      jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', exp: nowSeconds + 5 } as any);

      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow() as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      const disconnectCallback = (mockSocket.on as jest.Mock).mock.calls
        .find(([event]) => event === 'disconnect')?.[1];
      expect(disconnectCallback).toBeDefined();
      disconnectCallback();

      (mockSocket.emit as jest.Mock).mockClear();
      (mockSocket.disconnect as jest.Mock).mockClear();

      jest.advanceTimersByTime(5_000);

      expect(mockSocket.emit).not.toHaveBeenCalledWith('auth:token-expired', expect.anything());
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('re-arms across the 32-bit setTimeout ceiling for a long-lived rememberDevice token', async () => {
      // `session-jwt.ts` mints a 365-day token when rememberDevice is set —
      // far past Node's ~24.8-day setTimeout ceiling. The timer must survive
      // by re-arming against the real `exp`, not by disconnecting early.
      jest.useFakeTimers();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
      jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123', exp: nowSeconds + THIRTY_DAYS_S } as any);

      const mockSocket = createMockSocket({
        handshake: { auth: { token: 'valid-jwt-token' } }
      });
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(activeUserRow() as any);

      await authHandler.handleTokenAuthentication(mockSocket);

      // First arm is capped well under the 32-bit ceiling — 20 days in must
      // not disconnect yet (10 of the 30 days remain).
      jest.advanceTimersByTime(20 * 24 * 60 * 60 * 1000);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();

      // The remaining ~10 days elapse on the re-armed timer.
      jest.advanceTimersByTime(10 * 24 * 60 * 60 * 1000 + 1_000);
      expect(mockSocket.emit).toHaveBeenCalledWith('auth:token-expired', expect.objectContaining({
        code: 'token_expired'
      }));
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });
});
