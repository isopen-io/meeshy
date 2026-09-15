/**
 * `PATCH /users/me/password` révoque toute AUTRE session (#6435) — reprendre
 * un compte (lien magique → on pose un mot de passe) doit chasser l'intrus
 * qui y était déjà connecté, pas seulement changer le mot de passe. Extrait
 * en fichier dédié (`profile.test.ts` est déjà hors budget de taille) : ce
 * harnais n'exerce que la révocation, pas la suite de la route.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: jest.fn<any>().mockResolvedValue(true),
  hashPassword: jest.fn<any>().mockResolvedValue('hashed_new_password'),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  updatePasswordSchema: { parse: jest.fn((b: any) => b) },
}));

const mockGetUserSessions = jest.fn<any>();
const mockInvalidateAllSessions = jest.fn<any>().mockResolvedValue(1);

jest.mock('../../../../services/SessionService', () => ({
  getUserSessions: (...args: any[]) => mockGetUserSessions(...args),
  invalidateAllSessions: (...args: any[]) => mockInvalidateAllSessions(...args),
}));

const mockDisconnectSession = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../socketio/disconnectSession', () => ({
  disconnectSession: (...args: any[]) => mockDisconnectSession(...args),
}));

import { updateUserPassword } from '../../../../routes/users/profile-credentials';

const USER_ID = '507f1f77bcf86cd799439011';
const mockUser = { id: USER_ID, password: '$2b$12$hashedpassword' };
const CURRENT_TOKEN = 'current-session-token';

async function buildApp(compte: { id: string; password: string | null } = mockUser): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(compte),
      update: jest.fn<any>().mockResolvedValue(compte),
    },
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
    (req as any).user = { userId: USER_ID };
  });
  app.decorate('notificationService', null as any);
  const getIO = jest.fn(() => 'io-instance');
  app.decorate('socketIOHandler', { getManager: jest.fn(() => ({ getIO })) });
  await updateUserPassword(app);
  await app.ready();
  return app;
}

describe('PATCH /users/me/password — session revocation (#6435)', () => {
  it('revokes every OTHER session and disconnects only their sockets, keeping the caller', async () => {
    mockGetUserSessions.mockResolvedValueOnce([
      { id: 'session-current', isCurrentSession: true },
      { id: 'session-other-a', isCurrentSession: false },
      { id: 'session-other-b', isCurrentSession: false },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/password',
      headers: { 'x-session-token': CURRENT_TOKEN },
      payload: { currentPassword: 'correctpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });

    expect(res.statusCode).toBe(200);

    expect(mockGetUserSessions).toHaveBeenCalledWith(USER_ID, CURRENT_TOKEN);
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith(USER_ID, CURRENT_TOKEN, 'password_changed');

    // Les deux AUTRES sessions sont coupées — jamais la courante.
    const disconnectedSessionIds = mockDisconnectSession.mock.calls.map((call: any[]) => call[0].sessionId);
    expect(disconnectedSessionIds.sort()).toEqual(['session-other-a', 'session-other-b']);
    expect(disconnectedSessionIds).not.toContain('session-current');
    expect(mockDisconnectSession).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('revokes without excepting anyone when the caller sends no x-session-token', async () => {
    mockGetUserSessions.mockResolvedValueOnce([
      { id: 'session-only', isCurrentSession: false },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetUserSessions).toHaveBeenCalledWith(USER_ID, undefined);
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith(USER_ID, undefined, 'password_changed');
    expect(mockDisconnectSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-only', userId: USER_ID })
    );

    await app.close();
  });

  // #6447 — le cas même que #6435 nomme : un compte né d'une adresse seule
  // (#6424) reprend la main par lien magique et pose son PREMIER mot de passe.
  // L'intrus déjà connecté doit sortir, la session qui pose le mot de passe
  // rester. Aucun autre témoin ne porte sur un compte sans mot de passe.
  it('revokes the other sessions when the account sets its FIRST password (#6424, #6435)', async () => {
    mockInvalidateAllSessions.mockClear();
    mockDisconnectSession.mockClear();
    mockGetUserSessions.mockResolvedValueOnce([
      { id: 'session-current', isCurrentSession: true },
      { id: 'session-intruder', isCurrentSession: false },
    ]);

    const app = await buildApp({ id: USER_ID, password: null });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/password',
      headers: { 'x-session-token': CURRENT_TOKEN },
      payload: { newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith(USER_ID, CURRENT_TOKEN, 'password_changed');
    expect(mockDisconnectSession.mock.calls.map((call: any[]) => call[0].sessionId)).toEqual(['session-intruder']);

    await app.close();
  });
});
