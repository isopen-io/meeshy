/**
 * `PATCH /users/me/password` avec le VRAI `updatePasswordSchema` (aucun mock de
 * `parse`) : les apps natives n'envoient jamais `confirmPassword`, contrôle
 * d'interface vérifié côté client. Les autres suites de la route mockent le
 * schéma et ne pouvaient donc pas voir ce 400 systématique.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logWarn: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

const mockVerify = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: (...args: any[]) => mockVerify(...args),
  hashPassword: jest.fn<any>().mockResolvedValue('hashed_new_password'),
}));

jest.mock('../../../../services/SessionService', () => ({
  getUserSessions: jest.fn<any>().mockResolvedValue([]),
  invalidateAllSessions: jest.fn<any>().mockResolvedValue(0),
}));
jest.mock('../../../../socketio/disconnectSession', () => ({
  disconnectSession: jest.fn<any>().mockResolvedValue(undefined),
}));

import { updateUserPassword } from '../../../../routes/users/profile-credentials';

const USER_ID = '507f1f77bcf86cd799439011';
const NEW_PASSWORD = 'Xk9$mQ2vLp8#nR4wZ';

async function buildApp(storedPassword: string | null): Promise<{ app: FastifyInstance; update: jest.Mock<any> }> {
  const update = jest.fn<any>().mockResolvedValue({});
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: USER_ID, password: storedPassword }),
      update,
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
  app.decorate('socketIOHandler', null as any);
  await updateUserPassword(app);
  await app.ready();
  return { app, update };
}

const patch = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: '/users/me/password', payload });

describe('PATCH /users/me/password — vrai schéma, sans confirmPassword', () => {
  it('accepte {currentPassword, newPassword} (corps iOS / Android)', async () => {
    const { app, update } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'ancien', newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('accepte {newPassword} seul pour un compte sans mot de passe', async () => {
    const { app, update } = await buildApp(null);
    const res = await patch(app, { newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('exige toujours currentPassword quand le compte a un mot de passe', async () => {
    mockVerify.mockResolvedValueOnce(false);
    const { app, update } = await buildApp('$2b$12$hash');
    const res = await patch(app, { newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Current password is incorrect');
    expect(mockVerify).toHaveBeenLastCalledWith('', '$2b$12$hash');
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un currentPassword fourni mais faux', async () => {
    mockVerify.mockResolvedValueOnce(false);
    const { app, update } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'faux', newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Current password is incorrect');
    expect(mockVerify).toHaveBeenLastCalledWith('faux', '$2b$12$hash');
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepte un confirmPassword identique (web)', async () => {
    const { app } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'ancien', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuse un confirmPassword fourni et différent', async () => {
    const { app, update } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'ancien', newPassword: NEW_PASSWORD, confirmPassword: 'autre-chose-12345' });
    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });
  it('porte le code CURRENT_PASSWORD_INCORRECT quand le mot de passe actuel est faux', async () => {
    mockVerify.mockResolvedValueOnce(false);
    const { app } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'faux', newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(res.json().error).toBe('Current password is incorrect');
    await app.close();
  });

  it('porte le code PASSWORD_TOO_WEAK quand le nouveau mot de passe est trop faible', async () => {
    mockVerify.mockResolvedValueOnce(true);
    const { app, update } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'ancien', newPassword: 'aaaaaaaaaaaa' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('PASSWORD_TOO_WEAK');
    expect(res.json().error).toMatch(/^Password requirements: /);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });

  it('porte le code VALIDATION_ERROR sur une erreur de schéma', async () => {
    const { app } = await buildApp('$2b$12$hash');
    const res = await patch(app, { currentPassword: 'ancien', newPassword: NEW_PASSWORD, confirmPassword: 'autre-chose-12345' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});
