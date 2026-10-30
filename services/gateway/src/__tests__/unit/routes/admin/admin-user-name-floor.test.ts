/**
 * #13825 (audit, rétrocompatibilité) — la console d'administration renvoie la
 * fiche ENTIÈRE. Un compte hérité à prénom d'un caractère doit rester
 * modifiable sur ses autres champs ; un nom CHANGÉ tient la borne de 2
 * caractères visibles, et le refus nomme son champ et son minimum.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

type Mocked = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const service: Record<string, Mocked> = {
  getUserById: jest.fn(),
  updateUser: jest.fn(),
};

const audit: Record<string, Mocked> = {
  createAuditLog: jest.fn(),
};

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => service),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => audit),
}));

import { userAdminRoutes } from '../../../../routes/admin/users';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const CIBLE_ID = '507f1f77bcf86cd799439022';
const CIBLE = {
  id: CIBLE_ID,
  username: 'cible',
  displayName: 'A',
  firstName: 'A',
  lastName: 'Nom',
  email: 'cible@meeshy.me',
  bio: '',
  role: 'USER',
  isActive: true,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: { authContext?: unknown }) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
    };
  });
  app.decorate('prisma', {
    user: { findUnique: async () => ({ role: 'USER' }) },
    participant: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  } as never);
  app.decorate('notificationService', { emitUserUpdated: jest.fn<any>().mockResolvedValue(undefined) } as never);
  await app.register(userAdminRoutes);
  await app.ready();
  return app;
}

const patcher = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: `/admin/users/${CIBLE_ID}`, payload });

beforeEach(() => {
  jest.clearAllMocks();
  service.getUserById.mockResolvedValue(CIBLE);
  service.updateUser.mockImplementation(async (_id, data) => ({ ...CIBLE, ...(data as object) }));
  audit.createAuditLog.mockResolvedValue(undefined);
});

describe('PATCH /admin/users/:userId — la borne d’un nom ne vaut que pour un nom CHANGÉ', () => {
  it('la fiche entière renvoyée avec le prénom hérité « A » et une bio changée rend 200', async () => {
    const app = await buildApp();

    const res = await patcher(app, { firstName: 'A', lastName: 'Nom', displayName: 'A', bio: 'Nouvelle bio' });

    expect(res.statusCode).toBe(200);
    expect(service.updateUser).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('changer le prénom en « B » rend 400, nomme le champ et le minimum, et n’écrit rien', async () => {
    const app = await buildApp();

    const res = await patcher(app, { firstName: 'B', lastName: 'Nom' });

    expect(res.statusCode).toBe(400);
    const corps = res.json();
    expect(corps.error).toBe('Invalid input data');
    expect(corps.message).toContain('firstName');
    expect(corps.message).toContain('2');
    expect(corps.violations).toEqual([{ path: 'firstName', message: expect.stringContaining('2'), minimum: 2 }]);
    expect(service.updateUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('« A » suivi d’un invisible ne fait pas un nom de 2', async () => {
    const app = await buildApp();

    expect((await patcher(app, { lastName: 'A​' })).statusCode).toBe(400);
    expect(service.updateUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('effacer le nom affiché reste permis ; « Al » passe', async () => {
    const app = await buildApp();

    expect((await patcher(app, { displayName: null })).statusCode).toBe(200);
    expect((await patcher(app, { firstName: 'Al' })).statusCode).toBe(200);
    await app.close();
  });
});
