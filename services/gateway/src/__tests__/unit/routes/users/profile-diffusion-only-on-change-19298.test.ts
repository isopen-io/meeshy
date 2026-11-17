/**
 * #19298 — enregistrer sa bio ne diffuse plus son nom aux partenaires.
 *
 * L'iOS publié renvoie prénom, nom et nom affiché INCHANGÉS à chaque
 * enregistrement. `user:updated` et la réécriture des instantanés de noms ne
 * partent que si un champ diffusé a changé par rapport à la ligne STOCKÉE ;
 * avatar et bannière comparent de même avant de diffuser.
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

import { updateUserAvatar, updateUserBanner, updateUserProfile } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';
const AVATAR = `2026/11/${USER_ID}/avatar_1.webp`;
const BANNER = `2026/11/${USER_ID}/banner_1.webp`;

const stored = {
  id: USER_ID,
  username: 'alice',
  displayName: 'Alice Cooper',
  firstName: 'Alice',
  lastName: 'Cooper',
  email: 'alice@example.com',
  phoneNumber: null,
  avatar: AVATAR,
  banner: BANNER,
  bio: '',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  updatedAt: new Date('2026-11-17T09:30:00.000Z'),
  password: 'hash',
};

const makePrisma = (written: Record<string, unknown> = {}) => ({
  userPreferences: { findMany: jest.fn<any>(async () => []) },
  userPreference: { findMany: jest.fn<any>(async () => []) },
  userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  user: {
    findUnique: jest.fn<any>().mockResolvedValue(stored),
    findFirst: jest.fn<any>().mockResolvedValue(null),
    findMany: jest.fn<any>().mockResolvedValue([]),
    update: jest.fn<any>().mockResolvedValue({ ...stored, ...written }),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
  },
  messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'att-own' }) },
  participant: { updateMany: jest.fn<any>().mockResolvedValue({ count: 3 }) },
});

const build = async (prisma: ReturnType<typeof makePrisma>, route: (app: FastifyInstance) => Promise<void>) => {
  const emitUserUpdated = jest.fn<any>().mockResolvedValue(undefined);
  const refreshUserTypingIdentity = jest.fn();
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  });
  app.decorate('notificationService', { emitUserUpdated } as any);
  app.decorate('socketIOHandler', { getManager: () => ({ refreshUserTypingIdentity, refreshUserResolvedLanguages: jest.fn() }) } as any);
  await route(app as unknown as FastifyInstance);
  await app.ready();
  return { app, emitUserUpdated, refreshUserTypingIdentity };
};

describe('PATCH /users/me — le corps publié par l’iOS (noms inchangés + bio) ne diffuse rien (#19298)', () => {
  it('ni user:updated, ni réécriture des instantanés, ni cache de frappe', async () => {
    const prisma = makePrisma({ bio: 'Nouvelle bio' });
    const { app, emitUserUpdated, refreshUserTypingIdentity } = await build(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Alice', lastName: 'Cooper', displayName: 'Alice Cooper', bio: 'Nouvelle bio' },
    });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).not.toHaveBeenCalled();
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    expect(refreshUserTypingIdentity).not.toHaveBeenCalled();
    await app.close();
  });

  it('un vrai changement de nom diffuse toujours', async () => {
    const prisma = makePrisma({ displayName: 'Alicia' });
    const { app, emitUserUpdated, refreshUserTypingIdentity } = await build(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Alice', lastName: 'Cooper', displayName: 'Alicia', bio: 'x' },
    });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).toHaveBeenCalledTimes(1);
    expect(emitUserUpdated.mock.calls[0][0]).toMatchObject({ changes: { displayName: 'Alicia', firstName: 'Alice' } });
    expect(prisma.participant.updateMany).toHaveBeenCalled();
    expect(refreshUserTypingIdentity).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });
});

describe('PATCH /users/me/avatar et /banner — comparent à la valeur stockée (#19298)', () => {
  it('un avatar identique à celui stocké ne diffuse rien', async () => {
    const { app, emitUserUpdated } = await build(makePrisma(), updateUserAvatar);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: AVATAR } });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('un nouvel avatar diffuse', async () => {
    const next = `2026/11/${USER_ID}/avatar_2.webp`;
    const { app, emitUserUpdated } = await build(makePrisma({ avatar: next }), updateUserAvatar);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: next } });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('une bannière identique à celle stockée ne diffuse rien', async () => {
    const { app, emitUserUpdated } = await build(makePrisma(), updateUserBanner);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/banner', payload: { banner: BANNER } });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('une nouvelle bannière diffuse', async () => {
    const next = `2026/11/${USER_ID}/banner_2.webp`;
    const { app, emitUserUpdated } = await build(makePrisma({ banner: next }), updateUserBanner);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/banner', payload: { banner: next } });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
