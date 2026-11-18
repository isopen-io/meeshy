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

let SNAPSHOT_NAME = 'Alice Cooper';

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
  participant: {
    updateMany: jest.fn<any>(async (args: { where: { displayName: { not: string } } }) => ({
      count: SNAPSHOT_NAME === args.where.displayName.not ? 0 : 3,
    })),
  },
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
  it('ni user:updated, ni ligne réécrite, ni cache de frappe quand les instantanés sont cohérents', async () => {
    SNAPSHOT_NAME = 'Alice Cooper';
    const prisma = makePrisma({ bio: 'Nouvelle bio' });
    const { app, emitUserUpdated, refreshUserTypingIdentity } = await build(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Alice', lastName: 'Cooper', displayName: 'Alice Cooper', bio: 'Nouvelle bio' },
    });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await expect(prisma.participant.updateMany.mock.results[0].value).resolves.toEqual({ count: 0 });
    expect(refreshUserTypingIdentity).not.toHaveBeenCalled();
    await app.close();
  });

  it('des instantanés périmés réparés par un enregistrement aux noms inchangés sont rediffusés (audit B)', async () => {
    SNAPSHOT_NAME = 'Ancien Nom';
    const prisma = makePrisma({ bio: 'Nouvelle bio' });
    const { app, emitUserUpdated, refreshUserTypingIdentity } = await build(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Alice', lastName: 'Cooper', displayName: 'Alice Cooper', bio: 'Nouvelle bio' },
    });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).toHaveBeenCalledTimes(1);
    expect(refreshUserTypingIdentity).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it('un vrai changement de nom diffuse toujours', async () => {
    SNAPSHOT_NAME = 'Alice Cooper';
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

describe('PATCH /users/me — l’accent ne part aux partenaires que s’il a changé (#19298, #19201)', () => {
  it('un accent identique à celui stocké ne diffuse rien', async () => {
    const prisma = makePrisma({ profileAccentColor: '#4ECDC4' });
    prisma.user.findUnique.mockResolvedValue({ ...stored, profileAccentColor: '#4ECDC4' });
    const { app, emitUserUpdated } = await build(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { profileAccentColor: '#4ECDC4' } });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('un nouvel accent diffuse', async () => {
    const prisma = makePrisma({ profileAccentColor: '#FF6B6B' });
    prisma.user.findUnique.mockResolvedValue({ ...stored, profileAccentColor: '#4ECDC4' });
    const { app, emitUserUpdated } = await build(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { profileAccentColor: '#FF6B6B' } });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).toHaveBeenCalledWith({ userId: USER_ID, changes: { profileAccentColor: '#FF6B6B' } });
    await app.close();
  });
});

describe('PATCH /users/me — une écriture voisine en échec ne prive pas les partenaires du nouveau nom (#19298)', () => {
  it('le nom écrit part aux partenaires avant l’écriture voisine qui lève : la reprise, qui ne change plus rien, n’aurait plus rien diffusé', async () => {
    const prisma = makePrisma({ displayName: 'Alicia' });
    prisma.userVoiceModel.updateMany.mockRejectedValue(new Error('mongo down'));
    const { app, emitUserUpdated } = await build(prisma, updateUserProfile);
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { displayName: 'Alicia', voicePublic: true } });
    expect(res.statusCode).toBe(500);
    expect(emitUserUpdated).toHaveBeenCalledTimes(1);
    expect(emitUserUpdated.mock.calls[0][0]).toMatchObject({ changes: { displayName: 'Alicia' } });
    expect(prisma.participant.updateMany).toHaveBeenCalled();
    await app.close();
  });

  it('une reprise rejouée (même clientMutationId) rediffuse l’état absolu du nom aux partenaires', async () => {
    const { MutationLogDuplicate } = jest.requireActual('../../../../services/MutationLogService') as typeof import('../../../../services/MutationLogService');
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ ...stored, displayName: 'Alicia' });
    const { app, emitUserUpdated } = await buildWithMutationLog(prisma, async () => {
      throw new MutationLogDuplicate(USER_ID, 'updateProfile');
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: { 'x-client-mutation-id': '0123456789abcdef0123456789abcdef' },
      payload: { displayName: 'Alicia' },
    });
    expect(res.statusCode).toBe(200);
    expect(emitUserUpdated).toHaveBeenCalledTimes(1);
    expect(emitUserUpdated.mock.calls[0][0]).toMatchObject({ changes: { displayName: 'Alicia' } });
    await app.close();
  });
});

async function buildWithMutationLog(prisma: ReturnType<typeof makePrisma>, recordOrReturn: () => Promise<unknown>) {
  const emitUserUpdated = jest.fn<any>().mockResolvedValue(undefined);
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('mutationLogService', { recordOrReturn } as any);
  app.decorateRequest('clientMutationId', undefined);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any).clientMutationId = req.headers['x-client-mutation-id'];
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } };
  });
  app.decorate('notificationService', { emitUserUpdated } as any);
  app.decorate('socketIOHandler', { getManager: () => ({ refreshUserTypingIdentity: jest.fn(), refreshUserResolvedLanguages: jest.fn() }) } as any);
  await updateUserProfile(app as unknown as FastifyInstance);
  await app.ready();
  return { app, emitUserUpdated };
}
