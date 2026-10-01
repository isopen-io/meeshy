/**
 * #8886 — changer sa photo LIBÈRE les instantanés `Participant.avatar` que
 * l'ajout à une conversation avait recopiés depuis le compte. Sans cela, la
 * loi de lecture (surcharge locale d'abord) servait l'ancienne photo dans
 * chaque conversation où l'on avait été AJOUTÉ, à tout le monde.
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

import { updateUserAvatar, updateUserBanner } from '../../../../routes/users/profile';
import { releaseParticipantAvatarSnapshots } from '../../../../services/participantAvatarSnapshots';

const USER_ID = '507f1f77bcf86cd799439011';
const NEW_AVATAR = '2026/09/507f1f77bcf86cd799439011/avatar_2.webp';

const account = {
  id: USER_ID,
  username: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  phoneNumber: null,
  avatar: NEW_AVATAR,
  banner: null,
  bio: '',
  role: 'USER',
};

function makePrisma(options: { readonly participantFails?: boolean } = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(account),
      update: jest.fn<any>().mockResolvedValue(account),
    },
    participant: {
      updateMany: options.participantFails
        ? jest.fn<any>().mockRejectedValue(new Error('mongo down'))
        : jest.fn<any>().mockResolvedValue({ count: 3 }),
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
  app.decorate('notificationService', null as any);
  await route(app as unknown as FastifyInstance);
  await app.ready();
  return app;
}

const RELEASE = {
  where: { userId: USER_ID, type: 'user', avatar: { not: null } },
  data: { avatar: null },
};

describe('releaseParticipantAvatarSnapshots', () => {
  it('ne réécrit que les lignes du compte qui portent un instantané', async () => {
    const prisma = makePrisma();
    expect(await releaseParticipantAvatarSnapshots(prisma as any, USER_ID)).toBe(3);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith(RELEASE);
  });
});

describe('PATCH /users/me/avatar — les conversations suivent la nouvelle photo (#8886)', () => {
  it('libère les instantanés de photo du compte dans ses conversations', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserAvatar);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: NEW_AVATAR } });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith(RELEASE);
    await app.close();
  });

  it('un échec de la libération ne défait pas la photo posée', async () => {
    const prisma = makePrisma({ participantFails: true });
    const app = await buildApp(prisma, updateUserAvatar);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: NEW_AVATAR } });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
    await app.close();
  });

  it('la bannière ne touche à aucune ligne de conversation — elle n’y est pas recopiée', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserBanner);
    const res = await app.inject({ method: 'PATCH', url: '/users/me/banner', payload: { banner: NEW_AVATAR } });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    await app.close();
  });
});
