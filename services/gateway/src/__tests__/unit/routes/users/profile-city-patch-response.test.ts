/**
 * `PATCH /users/me` rend au propriétaire la ville et le cercle qu'il vient d'écrire (#18862, revue).
 *
 * Passe par le VRAI `formatUserResponse` et le VRAI schéma de réponse : un client qui remplace
 * son cache par la réponse ne doit pas y perdre la ville qu'il vient de poser. Champs AJOUTÉS :
 * un ancien client les ignore.
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
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
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

import { updateUserProfile } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';

const storedUser = (over: Record<string, unknown> = {}) => ({
  id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  email: 'alice@example.com', phoneNumber: null, avatar: null, banner: null, bio: '', role: 'USER',
  isActive: true, systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null,
  profileCompletionRate: 0, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  preferences: null, city: null, cityCircle: null, ...over,
});

async function patch(payload: Record<string, unknown>, after: Record<string, unknown>) {
  const prisma = {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(storedUser()),
      update: jest.fn<any>().mockResolvedValue(storedUser(after)),
    },
    userVoiceModel: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
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
  return res;
}

describe('PATCH /users/me — la réponse reflète la ville', () => {
  it('rend la ville et le cercle écrits', async () => {
    const res = await patch({ city: 'Dakar', cityCircle: 'FRIEND' }, { city: 'Dakar', cityCircle: 'FRIEND' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toMatchObject({ city: 'Dakar', cityCircle: 'FRIEND' });
  });

  it('rend `null` quand la ville est effacée ou le cercle refermé', async () => {
    const res = await patch({ city: '', cityCircle: null }, { city: null, cityCircle: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toMatchObject({ city: null, cityCircle: null });
  });
});
