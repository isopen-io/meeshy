/**
 * D-5 (#13947, lot #13954) — le handshake socket applique le plancher de
 * version : un client authentifié sous le plancher de SA plateforme reçoit
 * en bande `error` { code: UPGRADE_REQUIRED, minVersion, storeUrl } puis la
 * socket est fermée ; aucun utilisateur n'est enregistré. Le web (pwa) et un
 * handshake sans relevé ne sont jamais bloqués.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

const USER_ID = 'aaaaaaaaaaaaaaaaaaaa0123';

const createSocket = (auth: Record<string, unknown>): Socket => ({
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
    findUnique: jest.fn().mockResolvedValue({ id: USER_ID, systemLanguage: 'en' }),
    update: jest.fn().mockResolvedValue(undefined),
  },
  participant: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  callParticipant: { findMany: jest.fn().mockResolvedValue([]) },
  userSession: { findFirst: jest.fn().mockResolvedValue(liveSession()), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
} as unknown as PrismaClient);

const KEYS = ['MIN_APP_VERSION', 'MIN_APP_VERSION_IOS', 'MIN_APP_VERSION_ANDROID'] as const;

describe('AuthHandler — le handshake socket applique le plancher de version (#13954)', () => {
  const saved = KEYS.map((key) => [key, process.env[key]] as const);
  const connectedUsers = new Map<string, any>();
  const buildHandler = () => {
    connectedUsers.clear();
    return new AuthHandler({
      prisma: createPrisma(),
      statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
      maintenanceService: { updateUserOnlineStatus: jest.fn().mockResolvedValue(undefined), updateAnonymousOnlineStatus: jest.fn().mockResolvedValue(undefined) } as any,
      callService: { leaveCall: jest.fn().mockResolvedValue(undefined) } as any,
      connectedUsers,
      socketToUser: new Map(),
      userSockets: new Map(),
    });
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
    KEYS.forEach((key) => delete process.env[key]);
    process.env.MIN_APP_VERSION_IOS = '1.2.0';
    process.env.MIN_APP_VERSION_ANDROID = '3.1.0';
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: LIVE_SID, userId: USER_ID } as any);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    saved.forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it('iOS sous son plancher ⇒ error UPGRADE_REQUIRED (minVersion, storeUrl) puis déconnexion, personne n’est connecté', async () => {
    const socket = createSocket({ token: 'jwt', client: { appVersion: '1.1.4', platform: 'ios' } });

    await buildHandler().handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      code: 'UPGRADE_REQUIRED',
      minVersion: '1.2.0',
      storeUrl: 'https://apps.apple.com/app/id6760208591',
    }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });

  it('Android (plateforme brute « android ») sous son plancher ⇒ refusé avec l’URL du Play Store', async () => {
    const socket = createSocket({ token: 'jwt', client: { appVersion: '3.0.0', platform: 'android' } });

    await buildHandler().handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'UPGRADE_REQUIRED', minVersion: '3.1.0' }));
    expect((socket.emit as jest.Mock).mock.calls[0][1].storeUrl).toContain('play.google.com');
    expect(connectedUsers.size).toBe(0);
  });

  it('au plancher, web (pwa) et handshake sans relevé ⇒ connectés, aucune erreur', async () => {
    for (const client of [{ appVersion: '1.2.0', platform: 'ios' }, { appVersion: '0.0.1', platform: 'pwa' }, undefined]) {
      const socket = createSocket(client === undefined ? { token: 'jwt' } : { token: 'jwt', client });

      await buildHandler().handleTokenAuthentication(socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.objectContaining({ code: 'UPGRADE_REQUIRED' }));
      expect(connectedUsers.size).toBe(1);
    }
  });
});
