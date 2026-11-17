/**
 * `PATCH /users/me` écrit la ville DÉCLARÉE et le cercle qui la lit (#18862, revue).
 *
 * Passe par le VRAI schéma Ajv du corps (`updateUserRequestSchema`) et le VRAI Zod
 * (`updateUserProfileSchema`) : le premier refusait `cityCircle: null` — « personne d'autre que
 * moi », la valeur documentée par défaut — parce que son `enum` ne portait pas `null`. Un
 * propriétaire qui avait ouvert sa ville ne pouvait plus la refermer.
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

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

import { updateUserProfile } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';

const mockUser = {
  id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  email: 'alice@example.com', phoneNumber: null, avatar: null, bio: '', role: 'USER',
  systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null,
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

async function patch(payload: Record<string, unknown>) {
  const prisma = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } } });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } };
  });
  app.decorate('notificationService', null as any);
  app.decorate('socketIOHandler', null as any);
  await updateUserProfile(app as unknown as FastifyInstance);
  await app.ready();
  const res = await app.inject({ method: 'PATCH', url: '/users/me', payload });
  await app.close();
  const written = (prisma.user.update.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined)?.data;
  return { status: res.statusCode, written };
}

describe('PATCH /users/me — ville et cercle', () => {
  it('écrit la ville rognée et le cercle choisi', async () => {
    const { status, written } = await patch({ city: '  Dakar  ', cityCircle: 'FRIEND' });
    expect(status).toBe(200);
    expect(written?.city).toBe('Dakar');
    expect(written?.cityCircle).toBe('FRIEND');
  });

  it('referme la ville : `cityCircle: null` est accepté et écrit (personne d autre que soi)', async () => {
    const { status, written } = await patch({ cityCircle: null });
    expect(status).toBe(200);
    expect(written).toHaveProperty('cityCircle', null);
  });

  it('efface la ville sur chaîne vide ou null', async () => {
    expect((await patch({ city: '' })).written).toHaveProperty('city', null);
    expect((await patch({ city: null })).written).toHaveProperty('city', null);
  });

  it('refuse Atome (réservé) et un cercle inconnu sans rien écrire', async () => {
    for (const cityCircle of ['ATOM', 'EVERYONE']) {
      const { status, written } = await patch({ cityCircle });
      expect(status).toBe(400);
      expect(written).toBeUndefined();
    }
  });
});
