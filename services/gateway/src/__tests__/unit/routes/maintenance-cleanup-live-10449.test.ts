/**
 * #10449 — le nettoyage déclenché par un administrateur (`POST /maintenance/cleanup`)
 * coupe EN DIRECT les invités qu'il révoque.
 *
 * La route construisait son propre `MaintenanceService` sans lui remettre le
 * vivant (`setShareLinkRevocationLive`) que le manager Socket.IO remet au
 * service du balayage journalier : `revokeShareLinkGuests` désactivait bien les
 * invités d'un lien expiré, mais sans `io` ni manager — leurs sockets restaient
 * dans la room et recevaient les `message:new` jusqu'à la relecture suivante
 * (4 à 6 minutes). Le vivant se RÉSOUT à l'appel : le manager naît après
 * l'enregistrement des routes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

type Live = { resolveIO?: () => unknown; resolveManager?: () => unknown };
const sweeps: Array<{ prisma: unknown; live: Live }> = [];

jest.mock('../../../services/cleanupExpiredData', () => ({
  cleanupExpiredData: async (prisma: unknown, live: Live = {}) => {
    sweeps.push({ prisma, live });
  },
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/StatusService', () => ({
  StatusService: jest.fn().mockImplementation(() => ({})),
}));

import { maintenanceRoutes } from '../../../routes/maintenance';

type FakeManager = { getIO(): unknown };

async function buildApp(socketIOHandler: { getManager(): FakeManager | null } | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  if (socketIOHandler) app.decorate('socketIOHandler', socketIOHandler as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as { authContext?: unknown }).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      type: 'user',
      userId: 'admin_1',
      registeredUser: { id: 'admin_1', username: 'admin', role: 'ADMIN' },
    };
  });
  await app.register(maintenanceRoutes, { prefix: '/maintenance' });
  await app.ready();
  return app;
}

describe('POST /maintenance/cleanup — les invités révoqués sont coupés en direct (#10449)', () => {
  it('remet au balayage le io et le manager Socket.IO, résolus à l’appel et non à l’enregistrement', async () => {
    sweeps.length = 0;
    const io = { name: 'io' };
    const manager: FakeManager = { getIO: () => io };
    let current: FakeManager | null = null;
    const app = await buildApp({ getManager: () => current });

    current = manager;
    const res = await app.inject({ method: 'POST', url: '/maintenance/cleanup' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].live.resolveIO?.()).toBe(io);
    expect(sweeps[0].live.resolveManager?.()).toBe(manager);
  });

  it('sans manager Socket.IO, le balayage a lieu quand même (la révocation reste entière en base)', async () => {
    sweeps.length = 0;
    const app = await buildApp(null);

    const res = await app.inject({ method: 'POST', url: '/maintenance/cleanup' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].live.resolveIO?.() ?? null).toBeNull();
    expect(sweeps[0].live.resolveManager?.() ?? null).toBeNull();
  });
});
