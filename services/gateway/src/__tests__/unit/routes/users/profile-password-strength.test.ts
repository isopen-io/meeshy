/**
 * `PATCH /users/me/password` gagne le gate de force de mot de passe partagé
 * (#3629, `utils/password-strength.ts`). Extrait de `profile.test.ts` (#4531,
 * budget de taille) — ce fichier n'est qu'un harnais MINIMAL pour cette route,
 * pas un doublon de la suite complète.
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

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

const mockBcryptCompare = jest.fn<any>().mockResolvedValue(true);
const mockBcryptHash = jest.fn<any>().mockResolvedValue('hashed_new_password');

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: (...args: any[]) => mockBcryptCompare(...args),
  hashPassword: (...args: any[]) => mockBcryptHash(...args),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  updatePasswordSchema: { parse: jest.fn((b: any) => b) },
}));

import { updateUserPassword } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';
const mockUser = { id: USER_ID, password: '$2b$12$hashedpassword' };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
      update: jest.fn<any>().mockResolvedValue(mockUser),
    },
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
    (req as any).user = { userId: USER_ID };
  });
  app.decorate('notificationService', null as any);
  await updateUserPassword(app);
  await app.ready();
  return app;
}

describe('PATCH /users/me/password — weak new password (#3629)', () => {
  it('rejects a new password that meets the length bound but fails strength checks', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      // 12+ chars (passes the Zod length gate) but all-lowercase, no digit —
      // exactly what the schema alone let through before this fix.
      payload: { currentPassword: 'correctpassword', newPassword: 'aaaaaaaaaaaaaaaa' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Password requirements');
    await app.close();
  });
});
