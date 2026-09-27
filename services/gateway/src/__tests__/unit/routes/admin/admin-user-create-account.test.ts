/**
 * `POST /admin/users` — ce que la création d'un compte écrit À CÔTÉ du compte (#8217).
 *
 * - La trace d'audit recopiait le corps VALIDÉ, mot de passe EN CLAIR compris,
 *   dans `AdminAuditLog.changes` : un secret lisible par quiconque lit le
 *   journal d'audit. Elle nomme désormais que le mot de passe a été posé,
 *   jamais sa valeur.
 * - `emailVerified: true` (l'administrateur atteste l'adresse) traverse la
 *   loi du champ `emailVerified`, comme sur `PATCH …/verifications`.
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
  createUser: jest.fn(),
};

const audit: Record<string, Mocked> = {
  createAuditLog: jest.fn(),
  logCreateUser: jest.fn(),
};

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => service),
}));

jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => audit),
}));

import { userAdminRoutes } from '../../../../routes/admin/users';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const SECRET = 'Tr0ub4dor&3-horse-battery';

async function buildApp(role = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: { authContext?: unknown }) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
    };
  });
  app.decorate('prisma', { user: { findUnique: async () => ({ role: 'USER' }) } } as never);
  await app.register(userAdminRoutes);
  await app.ready();
  return app;
}

const corps = (extra: Record<string, unknown> = {}) => ({
  username: 'nouveau',
  firstName: 'Nou',
  lastName: 'Veau',
  email: 'nouveau@meeshy.me',
  password: SECRET,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  service.createUser.mockResolvedValue({ id: 'u-new', username: 'nouveau', email: 'nouveau@meeshy.me', role: 'USER' });
  audit.logCreateUser.mockResolvedValue(undefined);
});

describe('POST /admin/users — la trace d’audit ne porte jamais le mot de passe', () => {
  it('journalise la création sans la valeur du mot de passe', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: corps() });

    expect(res.statusCode).toBe(201);
    const trace = audit.logCreateUser.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(JSON.stringify(trace)).not.toContain(SECRET);
    expect(trace).toMatchObject({ username: 'nouveau', email: 'nouveau@meeshy.me' });
    expect(trace.password).toBe('[set]');
    await app.close();
  });
});

describe('POST /admin/users — attester l’adresse', () => {
  it('transmet l’attestation au service', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: corps({ emailVerified: true }) });

    expect(res.statusCode).toBe(201);
    expect(service.createUser.mock.calls[0]?.[0]).toMatchObject({ emailVerified: true });
    await app.close();
  });

  it('refuse un corps dont l’attestation n’est pas un booléen', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: corps({ emailVerified: 'yes' }) });

    expect(res.statusCode).toBe(400);
    expect(service.createUser).not.toHaveBeenCalled();
    await app.close();
  });
});
