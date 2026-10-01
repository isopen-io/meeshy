/**
 * #8959 — les jalons de profil : `profile.avatar`, `profile.bio` et
 * `profile.second_language` sont crédités quand l'écriture les rend vrais, et
 * seulement pour le champ que le corps a touché.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger', () => ({
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

const recordActivity = jest.fn<any>(async () => undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn<any>().mockImplementation(() => ({ recordActivity })),
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserProfile, updateUserAvatar } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';

// displayName + bio (11 car., > 10) + phoneNumber + email présents, avatar
// absent ⇒ 4/5 = 80 au départ ; chaque test change un seul champ de la formule
// depuis cet état pour isoler ce qu'il fait bouger.
const mockUser: Record<string, unknown> & { avatar: string | null; bio: string | null; regionalLanguage: string | null } = {
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

function makePrisma(written: Partial<typeof mockUser> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
      update: jest.fn<any>().mockResolvedValue({ ...mockUser, ...written }),
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

async function patch(route: typeof updateUserProfile, url: string, payload: object, written: object) {
  recordActivity.mockClear();
  const app = await buildApp(makePrisma(written as never), route);
  const res = await app.inject({ method: 'PATCH', url, payload });
  await app.close();
  expect(res.statusCode).toBe(200);
  return recordActivity.mock.calls.map((call) => (call as unknown[])[1]);
}

describe('#8959 — jalons de profil', () => {
  it('crédite `profile.avatar` quand un avatar est posé', async () => {
    const ops = await patch(updateUserAvatar, '/users/me/avatar', { avatar: '/api/v1/attachments/a.jpg' }, { avatar: '/api/v1/attachments/a.jpg' });

    expect(ops).toEqual(['profile.avatar']);
    expect(recordActivity).toHaveBeenCalledWith(USER_ID, 'profile.avatar');
  });

  it("ne crédite pas `profile.avatar` pour un avatar vide", async () => {
    expect(await patch(updateUserAvatar, '/users/me/avatar', { avatar: '' }, { avatar: '' })).toEqual([]);
  });

  it('crédite `profile.bio` pour une bio de plus de dix caractères', async () => {
    expect(await patch(updateUserProfile, '/users/me', { bio: 'Polyglotte curieux' }, { bio: 'Polyglotte curieux' }))
      .toEqual(['profile.bio']);
  });

  it("ne crédite pas `profile.bio` pour une bio d'espaces ou trop courte", async () => {
    expect(await patch(updateUserProfile, '/users/me', { bio: '             ' }, { bio: '             ' })).toEqual([]);
    expect(await patch(updateUserProfile, '/users/me', { bio: 'Salut' }, { bio: 'Salut' })).toEqual([]);
  });

  it('crédite `profile.second_language` pour une langue secondaire distincte de la primaire', async () => {
    expect(await patch(updateUserProfile, '/users/me', { regionalLanguage: 'en' }, { regionalLanguage: 'en' }))
      .toEqual(['profile.second_language']);
  });

  it('ne crédite pas une langue secondaire effacée ou égale à la primaire', async () => {
    expect(await patch(updateUserProfile, '/users/me', { regionalLanguage: '' }, { regionalLanguage: null })).toEqual([]);
    expect(await patch(updateUserProfile, '/users/me', { regionalLanguage: 'fr' }, { regionalLanguage: 'fr' })).toEqual([]);
  });

  it("ne recrédite rien pour un champ que le corps n'a pas touché", async () => {
    expect(await patch(updateUserProfile, '/users/me', { firstName: 'Alicia' }, { firstName: 'Alicia' })).toEqual([]);
  });
});
