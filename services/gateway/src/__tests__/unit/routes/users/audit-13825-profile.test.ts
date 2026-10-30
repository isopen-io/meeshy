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


describe('W3 — PATCH /users/me : un prenom CHANGE en « A » + caractere de format passe la borne', () => {
  it.each([['LRM', 'A‎'], ['WORD JOINER', 'A⁠'], ['SOFT HYPHEN', 'A­'], ['HANGUL FILLER', 'Aㅤ']])(
    '« A » + %s doit rendre 400 et ne rien ecrire', async (_cas, valeur) => {
      const { app, prisma } = await monter(compte({}));
      const res = await patcher(app, { firstName: valeur });
      await app.close();
      expect(res.statusCode).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
});

describe('W4 — PATCH /users/me : compte herite stocke en NFD, renvoye en NFC (meme texte) pour changer la bio', () => {
  it('le nom INCHANGE a l oeil ne doit pas bloquer la bio', async () => {
    const { app } = await monter(compte({ firstName: 'É' }));
    const res = await patcher(app, { firstName: 'É', bio: 'Une nouvelle bio' });
    await app.close();
    expect(res.statusCode).toBe(200);
  });
});
