/**
 * #13825 (audit, rétrocompatibilité) — la borne d'un nom (2 caractères
 * visibles) ne s'applique, en MODIFICATION, qu'aux noms CHANGÉS.
 *
 * L'iOS publié (`ProfileView.swift`, enregistrement du profil) renvoie prénom,
 * nom et nom affiché INCHANGÉS à chaque enregistrement. Un compte créé sous
 * l'ancienne borne (« A ») qui ne change que sa bio doit recevoir un 200 ; un
 * nom qu'on CHANGE en « B » reçoit un 400 qui nomme son champ et son minimum.
 *
 * La borne se mesure sur la valeur NETTOYÉE (celle que la route écrit) : « A »
 * suivi d'un invisible, d'un caractère de contrôle ou d'une balise vide, et
 * « É » décomposé, ne font pas un nom de 2.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserProfile } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';

const compte = (noms: Record<string, string | null>) => ({
  id: USER_ID,
  username: 'alice',
  displayName: 'Alice Cooper',
  firstName: 'Alice',
  lastName: 'Cooper',
  email: 'alice@example.com',
  phoneNumber: null,
  avatar: null,
  banner: null,
  bio: '',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...noms,
});

function makePrisma(stored: ReturnType<typeof compte>) {
  return {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(stored),
      update: jest.fn<any>(async ({ data }: any) => ({ ...stored, ...data })),
    },
    participant: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
}

async function monter(stored: ReturnType<typeof compte>) {
  const prisma = makePrisma(stored);
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  });
  app.decorate('notificationService', { emitUserUpdated: jest.fn<any>().mockResolvedValue(undefined) } as any);
  await updateUserProfile(app as unknown as FastifyInstance);
  await app.ready();
  return { app, prisma };
}

const patcher = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: '/users/me', payload });

const HERITE = compte({ firstName: 'A', lastName: 'B', displayName: 'A' });

describe('PATCH /users/me — un compte hérité à nom d’un caractère reste modifiable', () => {
  it('le corps COMPLET de l’iOS publié (noms inchangés, bio changée) rend 200', async () => {
    const { app, prisma } = await monter(HERITE);

    const res = await patcher(app, { firstName: 'A', lastName: 'B', displayName: 'A', bio: 'Une nouvelle bio', systemLanguage: 'fr' });

    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update.mock.calls[0][0].data.bio).toBe('Une nouvelle bio');
    await app.close();
  });

  it('un nom stocké en minuscules et renvoyé tel quel est jugé INCHANGÉ (même normalisation des deux côtés)', async () => {
    const { app } = await monter(compte({ firstName: 'a' }));

    expect((await patcher(app, { firstName: 'a', bio: 'Une nouvelle bio' })).statusCode).toBe(200);
    await app.close();
  });

  it('CHANGER le prénom en « B » rend 400, nomme le champ et le minimum, et n’écrit rien', async () => {
    const { app, prisma } = await monter(HERITE);

    const res = await patcher(app, { firstName: 'B', lastName: 'B', displayName: 'A', bio: 'Une nouvelle bio' });

    expect(res.statusCode).toBe(400);
    const corps = res.json();
    expect(corps.error).toBe('Invalid data');
    expect(corps.message).toContain('firstName');
    expect(corps.message).toContain('2');
    expect(corps.violations).toEqual([{ path: 'firstName', message: expect.stringContaining('2'), minimum: 2 }]);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('CHANGER le nom affiché en « B » rend 400 ; l’EFFACER reste permis', async () => {
    const { app } = await monter(compte({}));

    const refus = await patcher(app, { displayName: 'B' });
    expect(refus.statusCode).toBe(400);
    expect(refus.json().violations).toEqual([{ path: 'displayName', message: expect.stringContaining('2'), minimum: 2 }]);

    expect((await patcher(app, { displayName: '' })).statusCode).toBe(200);
    await app.close();
  });
});

describe('PATCH /users/me — la borne se mesure sur la valeur NETTOYÉE, en graphèmes', () => {
  it.each([
    ['un espace de largeur nulle', 'A​'],
    ['un caractère de contrôle', 'A\u0001'],
    ['une balise vide', 'A<b></b>'],
    ['un « É » décomposé (un seul graphème)', 'É'],
  ])('« A » suivi de %s ne fait pas un prénom de 2', async (_cas, valeur) => {
    const { app, prisma } = await monter(compte({}));

    const res = await patcher(app, { firstName: valeur });

    expect(res.statusCode).toBe(400);
    expect(res.json().violations).toEqual([{ path: 'firstName', message: expect.stringContaining('2'), minimum: 2 }]);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('« Al », « Ly » et « Él » passent', async () => {
    const { app } = await monter(compte({}));

    expect((await patcher(app, { firstName: 'Al', lastName: 'Ly' })).statusCode).toBe(200);
    expect((await patcher(app, { firstName: 'Él' })).statusCode).toBe(200);
    await app.close();
  });
});
