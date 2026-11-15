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
  logWarn: jest.fn(),
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

// #6435 — la route relève et coupe les AUTRES sessions après tout changement,
// premier mot de passe compris (#6447). Ce harnais ne teste que la force et le
// premier mot de passe : il neutralise la révocation, qu'exerce
// profile-password-session-revocation.test.ts.
jest.mock('../../../../services/SessionService', () => ({
  getUserSessions: jest.fn<any>().mockResolvedValue([]),
  invalidateAllSessions: jest.fn<any>().mockResolvedValue(0),
}));

jest.mock('../../../../socketio/disconnectSession', () => ({
  disconnectSession: jest.fn<any>().mockResolvedValue(undefined),
}));

import { updateUserPassword } from '../../../../routes/users/profile';

const USER_ID = '507f1f77bcf86cd799439011';
const mockUser = { id: USER_ID, password: '$2b$12$hashedpassword' };

async function buildApp(compte: { id: string; password: string | null } = mockUser): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(compte),
      update: jest.fn<any>().mockResolvedValue(compte),
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


/**
 * POSER LE PREMIER MOT DE PASSE (#6424).
 *
 * Un compte né d'une inscription par e-mail seul n'a pas de mot de passe. Lui
 * réclamer un mot de passe « actuel » pour en poser un premier rendrait la
 * porte INATTEIGNABLE : la preuve exigée est exactement la chose que l'appel
 * vient créer.
 *
 * Ce qui la remplace n'est pas RIEN — c'est la SESSION. Un tel compte n'a
 * qu'une porte, le lien magique, et la franchir prouve le contrôle de la boîte
 * mail. Le témoin le plus important du groupe est le troisième : l'exception
 * doit être bornée par l'ÉTAT LU EN BASE, jamais par ce que la requête
 * déclare — sans quoi omettre `currentPassword` deviendrait une façon de
 * changer le mot de passe de n'importe qui.
 */
describe('PATCH /users/me/password — le PREMIER mot de passe (#6424)', () => {
  const SANS_MOT_DE_PASSE = { id: USER_ID, password: null };
  const FORT = 'Xk9$mQ2vLp8#nR4wZ';

  it("accepte l'appel SANS currentPassword quand le compte n'en a pas", async () => {
    const app = await buildApp(SANS_MOT_DE_PASSE);
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { newPassword: FORT },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('ne CONFRONTE rien dans ce cas — il n’y a rien à confronter', async () => {
    mockBcryptCompare.mockClear();
    const app = await buildApp(SANS_MOT_DE_PASSE);
    await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { newPassword: FORT },
    });

    expect(mockBcryptCompare).not.toHaveBeenCalled();
    await app.close();
  });

  it("REFUSE toujours l'appel sans currentPassword quand le compte EN A un", async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { newPassword: FORT },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Current password is incorrect');
    await app.close();
  });

  it('applique la MÊME exigence de robustesse au premier mot de passe', async () => {
    const app = await buildApp(SANS_MOT_DE_PASSE);
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { newPassword: 'aaaaaaaaaaaaaaaa' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Password requirements');
    await app.close();
  });
});
