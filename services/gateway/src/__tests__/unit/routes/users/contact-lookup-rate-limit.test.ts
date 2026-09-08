/**
 * `GET /users/email/:email` et `GET /users/phone/:phone` sont l'annuaire
 * INVERSÉ (#4160) : elles joignent un identifiant de contact à une identité
 * civile. Authentifiées depuis #4160/#5xxx, elles restaient sans limiteur de
 * débit DÉDIÉ — seul le plafond global (300 req/min/IP) les couvrait, un
 * compte pouvant donc énumérer des milliers d'adresses/numéros par minute
 * tant qu'il reste sous ce plafond partagé avec tout le reste de l'API.
 *
 * Ce témoin garde le limiteur ajouté par #3629 : un seau PAR APPELANT
 * (`callerRateKey`), PARTAGÉ entre les deux routes — un essai qui bascule
 * entre email et téléphone ne rouvre pas le quota.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  presenceFor: () => null,
  applyPresenceVisibilityAsOffline: (rows: unknown) => rows,
  gateProfilePresence: async (_f: unknown, _r: unknown, user: unknown) => user,
  getOptionalAuth: () => async () => {},
}));

import { getUserByEmail, getUserByPhone } from '../../../../routes/users/profile';

const VIEWER_A = '507f1f77bcf86cd799439aaa';
const VIEWER_B = '507f1f77bcf86cd799439bbb';

const CIBLE = {
  id: '507f1f77bcf86cd799439ccc',
  username: 'cible',
  displayName: 'Cible',
  isActive: true,
};

function makePrisma() {
  return {
    user: {
      findFirst: jest.fn<any>(async () => CIBLE),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const compte = req.headers['x-test-account'] === 'B' ? VIEWER_B : VIEWER_A;
    (req as any).authContext = { isAuthenticated: true, userId: compte, registeredUser: { id: compte } };
    (req as any).user = { userId: compte };
  });
  await getUserByEmail(app);
  await getUserByPhone(app);
  await app.ready();
  return app;
}

const parEmail = (app: FastifyInstance, compte: 'A' | 'B', email: string) =>
  app.inject({
    method: 'GET',
    url: `/users/email/${encodeURIComponent(email)}`,
    headers: { 'x-test-account': compte },
  });

const parTelephone = (app: FastifyInstance, compte: 'A' | 'B', phone: string) =>
  app.inject({
    method: 'GET',
    url: `/users/phone/${encodeURIComponent(phone)}`,
    headers: { 'x-test-account': compte },
  });

describe('#3629 — GET /users/email/:email et GET /users/phone/:phone sont limitées PAR APPELANT', () => {
  it('refuse le 31e appel du même compte dans la fenêtre, tous identifiants confondus', async () => {
    const app = await buildApp(makePrisma());

    for (let i = 0; i < 30; i += 1) {
      const res = await parEmail(app, 'A', `cible-${i}@example.test`);
      expect(res.statusCode).toBe(200);
    }

    const res31 = await parEmail(app, 'A', 'cible-30@example.test');
    expect(res31.statusCode).toBe(429);

    await app.close();
  });

  it('partage le même seau entre la porte email et la porte téléphone', async () => {
    const app = await buildApp(makePrisma());

    for (let i = 0; i < 15; i += 1) {
      expect((await parEmail(app, 'B', `cible-${i}@example.test`)).statusCode).toBe(200);
    }
    for (let i = 0; i < 15; i += 1) {
      expect((await parTelephone(app, 'B', `+336000000${String(i).padStart(2, '0')}`)).statusCode).toBe(200);
    }

    // Le 31e appel COMBINÉ, sur l'autre porte, est refusé : un même seau.
    const res31 = await parEmail(app, 'B', 'une-de-plus@example.test');
    expect(res31.statusCode).toBe(429);

    await app.close();
  });

  it("n'affecte pas un autre compte appelant — le seau est PAR APPELANT, jamais global", async () => {
    const app = await buildApp(makePrisma());

    for (let i = 0; i < 30; i += 1) {
      expect((await parEmail(app, 'A', `cible-${i}@example.test`)).statusCode).toBe(200);
    }
    expect((await parEmail(app, 'A', 'cible-epuise@example.test')).statusCode).toBe(429);

    // Le compte B, qui n'a encore rien consommé, passe normalement.
    expect((await parEmail(app, 'B', 'cible-fraiche@example.test')).statusCode).toBe(200);

    await app.close();
  });
});
