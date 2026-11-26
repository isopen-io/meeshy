/**
 * `POST /admin/users` et `PATCH /admin/users/:userId` rendent une adresse
 * réservée ou jetable en 400 `EMAIL_DOMAIN_NOT_ALLOWED` (#16492) — la même
 * réponse que les portes publiques, jamais un 500 ni un succès.
 *
 * Le service est doublé : le refus lui-même a ses témoins dans
 * `services/admin/user-management-email-domain.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { EmailDomainRefusedError } from '../../../../services/auth/email-domain-guard';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

type Mocked = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const service: Record<string, Mocked> = {
  getUserById: jest.fn(),
  updateUser: jest.fn(),
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
const CIBLE_ID = '507f1f77bcf86cd799439022';
const CIBLE = { id: CIBLE_ID, username: 'cible', email: 'cible@meeshy.me', role: 'USER', isActive: true };

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
  app.decorate('prisma', { user: { findUnique: async () => ({ role: 'USER' }) } } as never);
  await app.register(userAdminRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  service.getUserById.mockResolvedValue(CIBLE);
  audit.createAuditLog.mockResolvedValue(undefined);
  audit.logCreateUser.mockResolvedValue(undefined);
});

describe('adresse réservée ou jetable saisie par un administrateur — 400 typé (#16492)', () => {
  it('POST /admin/users answers 400 EMAIL_DOMAIN_NOT_ALLOWED and leaves no audit line', async () => {
    service.createUser.mockRejectedValue(new EmailDomainRefusedError());
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: {
        username: 'nouveau',
        firstName: 'Nou',
        lastName: 'Veau',
        email: 'nouveau@mailinator.com',
        password: 'Tr0ub4dor&3-horse-battery',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'EMAIL_DOMAIN_NOT_ALLOWED', error: expect.any(String) });
    expect(audit.logCreateUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('PATCH /admin/users/:userId answers 400 EMAIL_DOMAIN_NOT_ALLOWED and leaves no audit line', async () => {
    service.updateUser.mockRejectedValue(new EmailDomainRefusedError());
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${CIBLE_ID}`,
      payload: { email: 'cible@example.com' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
    expect(audit.createAuditLog).not.toHaveBeenCalled();
    await app.close();
  });
});
