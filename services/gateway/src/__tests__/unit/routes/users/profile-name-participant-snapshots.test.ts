/**
 * #8890 — un changement de NOM se propage dans chaque conversation, comme la
 * photo (#8886). `Participant.displayName` est une COPIE du nom du compte,
 * posée à l'ajout (`participants-writes.ts`, `link-admission.ts`,
 * `sharing.ts`, l'inscription), et la loi de lecture la fait passer AVANT le
 * nom du compte (`resolveParticipantDisplayName`) — c'est aussi le titre d'une
 * conversation directe. Après un renommage, chaque conversation continuait de
 * servir l'ANCIEN nom, à tout le monde, même après un rechargement.
 *
 * La colonne est REQUISE (`String`) : on ne peut pas la libérer comme
 * l'avatar. Le changement de nom la RÉÉCRIT donc avec le nom composé du compte.
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

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: jest.fn<any>().mockResolvedValue(true),
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserProfile, updateUsername } from '../../../../routes/users/profile';
import {
  accountDisplayName,
  refreshParticipantNameSnapshots,
} from '../../../../services/participantNameSnapshots';

const USER_ID = '507f1f77bcf86cd799439011';

const account = {
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
  usernameHistory: [],
  password: 'hash',
};

function makePrisma(options: { readonly participantFails?: boolean; readonly served?: Record<string, unknown> } = {}) {
  const served = { ...account, ...(options.served ?? {}) };
  return {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(account),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue(served),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    participant: {
      updateMany: options.participantFails
        ? jest.fn<any>().mockRejectedValue(new Error('mongo down'))
        : jest.fn<any>().mockResolvedValue({ count: 4 }),
    },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>, route: (app: FastifyInstance) => Promise<void>) {
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
  await route(app as unknown as FastifyInstance);
  await app.ready();
  return app;
}

const refreshTo = (name: string) => ({
  where: { userId: USER_ID, type: 'user', displayName: { not: name } },
  data: { displayName: name },
});

describe('accountDisplayName — le nom que le compte porte, composé comme les clients le composent', () => {
  it('le nom d’affichage prime', () => {
    expect(accountDisplayName({ displayName: 'Ada', firstName: 'A', lastName: 'L', username: 'ada' })).toBe('Ada');
  });

  it('un nom d’affichage vide ou blanc retombe sur « Prénom Nom »', () => {
    expect(accountDisplayName({ displayName: '  ', firstName: 'Ada', lastName: 'Lovelace', username: 'ada' })).toBe('Ada Lovelace');
    expect(accountDisplayName({ displayName: null, firstName: 'Ada', lastName: null, username: 'ada' })).toBe('Ada');
  });

  it('sans nom ni prénom, le pseudo', () => {
    expect(accountDisplayName({ displayName: null, firstName: '', lastName: null, username: 'ada' })).toBe('ada');
  });
});

describe('refreshParticipantNameSnapshots', () => {
  it('ne réécrit que les lignes INSCRITES du compte qui portent un autre nom', async () => {
    const prisma = makePrisma();
    const count = await refreshParticipantNameSnapshots(prisma as any, USER_ID, {
      displayName: 'Bob',
      firstName: null,
      lastName: null,
      username: 'bob',
    });
    expect(count).toBe(4);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith(refreshTo('Bob'));
  });
});

describe('PATCH /users/me — les conversations suivent le nouveau nom (#8890)', () => {
  it('réécrit la copie du nom dans chaque conversation du compte', async () => {
    const prisma = makePrisma({ served: { displayName: 'Alicia' } });
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Alicia' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith(refreshTo('Alicia'));
    await app.close();
  });

  it('un nom d’affichage EFFACÉ fait retomber la copie sur « Prénom Nom »', async () => {
    const prisma = makePrisma({ served: { displayName: null } });
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: '' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith(refreshTo('Alice Cooper'));
    await app.close();
  });

  it('un échec de la réécriture ne défait pas le nom posé', async () => {
    const prisma = makePrisma({ participantFails: true, served: { displayName: 'Alicia' } });
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Alicia' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
    await app.close();
  });

  it('une bio seule ne touche à aucune ligne de conversation', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { bio: 'Bonjour' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /users/me/username — le pseudo suit aussi (#8890)', () => {
  it('réécrit la copie avec le nom composé du compte renommé', async () => {
    const prisma = makePrisma({ served: { username: 'alicia', displayName: null, firstName: null, lastName: null } });
    const app = await buildApp(prisma, updateUsername);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/username',
      payload: { newUsername: 'alicia', currentPassword: 'pass' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith(refreshTo('alicia'));
    await app.close();
  });
});
