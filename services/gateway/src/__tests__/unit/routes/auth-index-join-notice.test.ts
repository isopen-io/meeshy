/**
 * `routes/auth/index.ts` — le câblage de la cinquième porte d'entrée.
 *
 * `AuthService` n'a pas de socket : c'est le point d'enregistrement des routes
 * qui lui donne accès au manager Socket.IO, et il le fait PARESSEUSEMENT — le
 * manager n'existe pas encore quand les routes s'enregistrent (il est créé par
 * `socketIOHandler.initialize()`), et une capture retiendrait `null` pour
 * toujours. Le témoin appelle donc la fonction APRÈS que le manager existe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const mockAuthServiceCtor = jest.fn<any>();
jest.mock('../../../services/AuthService', () => ({
  AuthService: jest.fn().mockImplementation((...args: unknown[]) => {
    mockAuthServiceCtor(...args);
    return { register: jest.fn() };
  }),
}));

jest.mock('../../../services/PhoneTransferService', () => ({
  PhoneTransferService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/SmsService', () => ({
  SmsService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({}),
}));
jest.mock('../../../routes/auth/login', () => ({ registerLoginRoutes: jest.fn() }));
jest.mock('../../../routes/auth/register', () => ({ registerRegistrationRoutes: jest.fn() }));
jest.mock('../../../routes/auth/magic-link', () => ({ registerMagicLinkRoutes: jest.fn() }));
jest.mock('../../../routes/auth/phone-transfer', () => ({ registerPhoneTransferRoutes: jest.fn() }));
jest.mock('../../../routes/auth/revoke-all-sessions', () => ({ registerRevokeAllSessionsRoute: jest.fn() }));

import { authRoutes } from '../../../routes/auth/index';

describe('authRoutes — AuthService reçoit le manager Socket.IO, résolu à l’appel', () => {
  it('passe un `resolveSocketManager` qui rend le manager COURANT du handler', async () => {
    const manager = { broadcastMessage: jest.fn() };
    let current: unknown = null;
    const fastify: any = {
      prisma: {},
      redis: {},
      socketIOHandler: { getManager: () => current },
    };

    await authRoutes(fastify);

    expect(mockAuthServiceCtor).toHaveBeenCalledTimes(1);
    const [prisma, , options] = mockAuthServiceCtor.mock.calls[0] as [unknown, string, { resolveSocketManager: () => unknown }];
    expect(prisma).toBe(fastify.prisma);
    // Avant l'initialisation : rien. Après : le manager — sans réenregistrer.
    expect(options.resolveSocketManager()).toBeNull();
    current = manager;
    expect(options.resolveSocketManager()).toBe(manager);
  });

  it('survit à un handler Socket.IO absent (tests, outils) — l’avis reste persisté', async () => {
    const fastify: any = { prisma: {}, redis: {} };

    await authRoutes(fastify);

    const options = mockAuthServiceCtor.mock.calls.at(-1)?.[2] as { resolveSocketManager: () => unknown };
    expect(options.resolveSocketManager()).toBeUndefined();
  });
});
