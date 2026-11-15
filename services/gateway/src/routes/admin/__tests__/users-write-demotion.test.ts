/**
 * Rétrograder un administrateur le sort des rooms d'administration dans le même
 * geste (#10459 point 1). Un socket vérifie son rang à `admin-metrics:subscribe`
 * et jamais après : sans cette éviction, un ADMIN passé USER recevait les
 * métriques de l'hôte jusqu'à sa déconnexion.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
const passeTout = async () => undefined;
jest.mock('../../../middleware/authorize', () => ({
  requirePermission: () => passeTout,
  requireHierarchy: () => passeTout,
}));
jest.mock('../../../middleware/admin-user-auth.middleware', () => ({ requireUserModifyAccess: passeTout }));
jest.mock('../../../services/CacheStore', () => ({ getCacheStore: () => ({ del: jest.fn(async () => undefined) }) }));
jest.mock('../../../services/participantNameSnapshots', () => ({ refreshParticipantNameSnapshots: jest.fn(async () => undefined) }));

import { registerUserWriteRoutes } from '../users-write';

const cible = {
  id: 'u1',
  username: 'ancien-admin',
  email: 'a@meeshy.me',
  role: 'ADMIN',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

async function monter(evict: (userId: string) => Promise<unknown>, role = cible.role) {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async (request: unknown) => {
    (request as { authContext: unknown }).authContext = { registeredUser: { id: 'boss', role: 'BIGBOSS' } };
  });
  const updateRole = jest.fn(async (_id: string, data: { role: string }) => ({ ...cible, role: data.role }));
  await app.register(async (instance) => {
    registerUserWriteRoutes(instance, {
      userManagementService: { getUserById: async () => ({ ...cible, role }), updateRole } as never,
      userAuditService: { createAuditLog: jest.fn(async () => undefined) } as never,
      evictFromAdminRooms: evict,
    });
  });
  await app.ready();
  return { app, updateRole };
}

describe('PATCH /admin/users/:userId — rôle', () => {
  it('un passage sous le rang d’administration évince les sockets du compte des rooms admin, après l’écriture', async () => {
    const order: string[] = [];
    const evict = jest.fn(async (userId: string) => { order.push(`evict:${userId}`); });
    const { app, updateRole } = await monter(evict);
    updateRole.mockImplementation(async (_id, data) => { order.push('update'); return { ...cible, role: data.role }; });
    const response = await app.inject({ method: 'PATCH', url: '/admin/users/u1', payload: { role: 'USER' } });
    expect(response.statusCode).toBe(200);
    expect(order).toEqual(['update', 'evict:u1']);
    await app.close();
  });

  it('un passage VERS le rang d’administration n’évince personne', async () => {
    const evict = jest.fn(async () => undefined);
    const { app } = await monter(evict, 'MODERATOR');
    const response = await app.inject({ method: 'PATCH', url: '/admin/users/u1', payload: { role: 'ADMIN' } });
    expect(response.statusCode).toBe(200);
    expect(evict).not.toHaveBeenCalled();
    await app.close();
  });
});
