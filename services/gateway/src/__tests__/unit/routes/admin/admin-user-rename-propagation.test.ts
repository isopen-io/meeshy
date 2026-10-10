/**
 * #8890 — un compte renommé par l'ADMINISTRATION se propage comme un compte
 * renommé par son porteur : la copie `Participant.displayName` de chaque
 * conversation est réécrite, et les co-participants reçoivent `user:updated`
 * avec le groupe des quatre composants du nom (règle de groupe du contrat,
 * `UserUpdatedEventData`). Avant, `PATCH /admin/users/:userId` écrivait le
 * nom en base et ne disait rien à personne.
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
  displayName: 'Ancien Nom',
  firstName: 'Ancien',
  lastName: 'Nom',
  email: 'cible@meeshy.me',
  role: 'USER',
  isActive: true,
};

const participantUpdateMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const emitUserUpdated = jest.fn<(...args: unknown[]) => Promise<unknown>>();

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
    participant: { updateMany: participantUpdateMany },
  } as never);
  app.decorate('notificationService', { emitUserUpdated } as never);
  await app.register(userAdminRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  service.getUserById.mockResolvedValue(CIBLE);
  audit.createAuditLog.mockResolvedValue(undefined);
  participantUpdateMany.mockResolvedValue({ count: 2 });
  emitUserUpdated.mockResolvedValue(undefined);
});

describe('PATCH /admin/users/:userId — un renommage se propage (#8890)', () => {
  it('réécrit la copie du nom dans les conversations et prévient les co-participants', async () => {
    service.updateUser.mockResolvedValue({ ...CIBLE, displayName: 'Nouveau Nom' });
    const app = await buildApp();

    const res = await app.inject({ method: 'PATCH', url: `/admin/users/${CIBLE_ID}`, payload: { displayName: 'Nouveau Nom' } });

    expect(res.statusCode).toBe(200);
    expect(participantUpdateMany).toHaveBeenCalledWith({
      where: { userId: CIBLE_ID, type: 'user', displayName: { not: 'Nouveau Nom' } },
      data: { displayName: 'Nouveau Nom' },
    });
    expect(emitUserUpdated).toHaveBeenCalledWith({
      userId: CIBLE_ID,
      changes: { displayName: 'Nouveau Nom', firstName: 'Ancien', lastName: 'Nom', username: 'cible' },
    });
    await app.close();
  });

  it('une adresse e-mail changée ne touche ni les conversations ni les pairs', async () => {
    service.updateUser.mockResolvedValue({ ...CIBLE, email: 'autre@meeshy.me' });
    const app = await buildApp();

    const res = await app.inject({ method: 'PATCH', url: `/admin/users/${CIBLE_ID}`, payload: { email: 'autre@meeshy.me' } });

    expect(res.statusCode).toBe(200);
    expect(participantUpdateMany).not.toHaveBeenCalled();
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('un échec de la réécriture ne défait pas le renommage', async () => {
    service.updateUser.mockResolvedValue({ ...CIBLE, displayName: 'Nouveau Nom' });
    participantUpdateMany.mockRejectedValue(new Error('mongo down'));
    const app = await buildApp();

    const res = await app.inject({ method: 'PATCH', url: `/admin/users/${CIBLE_ID}`, payload: { displayName: 'Nouveau Nom' } });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
