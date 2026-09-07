/**
 * PATCH /users/me et PATCH /users/me/avatar recalculent `profileCompletionRate`
 * (#3688) quand un des cinq champs de la formule change. Extrait de
 * `profile.test.ts` dans son propre fichier : ce dernier est déjà au-dessus du
 * budget de taille du dépôt (1200 lignes, `gateway-test-file-size-budget.test.ts`)
 * et l'ajout de ces trois cas l'aurait fait grossir — interdit tant qu'il n'est
 * pas d'abord découpé (`CLAUDE.md` § Code Style).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
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

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

jest.mock('../../../../utils/normalize', () => ({
  normalizeEmail: jest.fn((e: string) => e.toLowerCase().trim()),
  capitalizeName: jest.fn((n: string) => n),
  normalizeDisplayName: jest.fn((n: string) => n),
  normalizePhoneNumber: jest.fn((p: string) => p),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  updateUserProfileSchema: { parse: jest.fn((b: any) => b) },
  updateAvatarSchema: { parse: jest.fn((b: any) => b) },
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserProfile, updateUserAvatar } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';

// displayName + bio (11 car., > 10) + phoneNumber + email présents, avatar
// absent ⇒ 4/5 = 80 au départ ; chaque test change un seul champ de la formule
// depuis cet état pour isoler ce qu'il fait bouger.
const mockUser = {
  id: USER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  email: 'alice@example.com',
  phoneNumber: '+33612345678',
  avatar: null,
  bio: 'Hello world',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
};

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
      update: jest.fn<any>().mockResolvedValue(mockUser),
    },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>, route: typeof updateUserProfile) {
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
  app.decorate('socketIOHandler', null as any);
  await route(app as unknown as FastifyInstance);
  await app.ready();
  return app;
}

describe('PATCH /users/me — recalcule profileCompletionRate (#3688)', () => {
  it('recompose le taux depuis les champs actuels + le displayName modifié', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { displayName: 'Bob Jones' },
    });
    expect(res.statusCode).toBe(200);
    // displayName (nouveau, présent) + avatar null + bio 11 car. (>10) +
    // phoneNumber + email ⇒ 4/5 = 80.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ profileCompletionRate: 80 }) })
    );
    await app.close();
  });

  it('recompose le taux quand seule la bio change, en gardant le displayName actuel', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { bio: 'x' }, // 1 caractère : ne compte plus dans la formule
    });
    expect(res.statusCode).toBe(200);
    // displayName présent (inchangé) + avatar null + bio courte (false) +
    // phoneNumber + email ⇒ 3/5 = 60.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ profileCompletionRate: 60 }) })
    );
    await app.close();
  });

  it('ne touche pas profileCompletionRate quand aucun des cinq champs ne change', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { systemLanguage: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ profileCompletionRate: expect.anything() }),
      })
    );
    await app.close();
  });
});

describe('PATCH /users/me/avatar — recalcule profileCompletionRate (#3688)', () => {
  it('recompose le taux depuis les quatre autres champs + le nouvel avatar', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma, updateUserAvatar as unknown as typeof updateUserProfile);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/avatar',
      payload: { avatar: 'https://example.com/avatar.jpg' },
    });
    expect(res.statusCode).toBe(200);
    // displayName + bio (11 car.) + phoneNumber + email + avatar (nouveau) ⇒ 5/5 = 100.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avatar: 'https://example.com/avatar.jpg',
          profileCompletionRate: 100,
        }),
      })
    );
    await app.close();
  });
});
