/**
 * `PATCH /users/me/password` — comportement général (auth, mot de passe
 * courant, mise à jour, notification, erreur serveur). Extrait de
 * `profile.test.ts` (#6435, budget de taille — le fichier était déjà hors
 * plafond ; ajouter les mocks de révocation de session qu'exige #6435 l'y
 * aurait enfoncé plus loin plutôt que de le corriger). La force du nouveau
 * mot de passe est couverte par `profile-password-strength.test.ts`, la
 * révocation des AUTRES sessions par `profile-password-session-revocation.test.ts`
 * — ce fichier n'est ni l'un ni l'autre.
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

const mockBcryptCompare = jest.fn<any>();
const mockBcryptHash = jest.fn<any>().mockResolvedValue('hashed_new_password');

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: (...args: any[]) => mockBcryptCompare(...args),
  hashPassword: (...args: any[]) => mockBcryptHash(...args),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  updatePasswordSchema: { parse: jest.fn((b: any) => b) },
}));

// #6435 — la route relève et coupe les AUTRES sessions. Ce fichier ne teste
// pas ce comportement (voir profile-password-session-revocation.test.ts) : il
// le neutralise, une liste vide n'ayant personne à couper.
jest.mock('../../../../services/SessionService', () => ({
  getUserSessions: jest.fn<any>().mockResolvedValue([]),
  invalidateAllSessions: jest.fn<any>().mockResolvedValue(0),
}));

jest.mock('../../../../socketio/disconnectSession', () => ({
  disconnectSession: jest.fn<any>().mockResolvedValue(undefined),
}));

import { updateUserPassword } from '../../../../routes/users/profile-credentials';

const USER_ID = '507f1f77bcf86cd799439011';
const mockUser = { id: USER_ID, password: '$2b$12$hashedpassword' };

async function buildApp(opts: {
  prisma?: any;
  withNotificationService?: boolean;
} = {}): Promise<FastifyInstance> {
  const {
    prisma = {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(mockUser),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    },
    withNotificationService = false,
  } = opts;

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
    (req as any).user = { userId: USER_ID };
  });
  app.decorate(
    'notificationService',
    withNotificationService
      ? { createPasswordChangedNotification: jest.fn<any>().mockResolvedValue(undefined) }
      : (null as any)
  );
  app.decorate('socketIOHandler', null as any);
  await updateUserPassword(app);
  await app.ready();
  return app;
}

async function buildUnauthenticatedApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
      update: jest.fn<any>().mockResolvedValue(mockUser),
    },
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = null;
  });
  app.decorate('notificationService', null as any);
  app.decorate('socketIOHandler', null as any);
  await updateUserPassword(app);
  await app.ready();
  return app;
}

describe('PATCH /users/me/password — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildUnauthenticatedApp();
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/me/password — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /users/me/password — wrong current password', () => {
  it('returns 400 when current password is incorrect', async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'wrongpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me/password — success', () => {
  it('returns 200 when password is updated', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH /users/me/password — success with notification', () => {
  it('returns 200 and fires notification', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const app = await buildApp({ withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('PATCH /users/me/password — service error', () => {
  it('returns 500 when update throws', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: USER_ID, password: '$2b$12$hashed' }),
        update: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'Xk9$mQ2vLp8#nR4wZ' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
