/**
 * Les visites de mon lien de profil (#19206) — les portes qui comptent.
 *
 * `GET /directory/people/:handle` (où `/@pseudo` redirige) et `GET /u/:username` comptent
 * l'ouverture de la fiche par un AUTRE lecteur. Ne comptent pas : le propriétaire, un robot
 * d'aperçu, la carte d'un lien collé dans une conversation (`?via=link`), « Voir comme »
 * (`?as=`), ni une fiche refusée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

import { directoryPersonRoutes } from '../../../../routes/directory/person';
import { getUserByUsername } from '../../../../routes/users/profile';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const CIBLE = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';
const NAVIGATEUR = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function prismaDouble(opts: { cibleBloqueLecteur?: boolean } = {}) {
  return {
    profileLinkVisitDay: {
      update: jest.fn<any>(async () => ({})),
      create: jest.fn<any>(async () => ({})),
    },
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    profileAddress: { findMany: async () => [] },
    communityMember: { findMany: async () => [] },
    user: {
      findMany: jest.fn<any>(async (args: any) =>
        (args?.where?.id?.in ?? []).map((id: string) => ({ id, role: 'USER', birthDate: null, isActive: true, deletedAt: null, deactivatedAt: null })),
      ),
      findFirst: jest.fn<any>(async (args?: any) =>
        args?.where?.blockedUserIds
          ? (opts.cibleBloqueLecteur ? { id: CIBLE } : null)
          : args?.where?.OR
            ? null
            : { id: CIBLE, username: 'cible', role: 'USER', isOnline: false, lastActiveAt: null, deactivatedAt: null, createdAt: new Date('2025-01-01T00:00:00Z'), voiceModel: null },
      ),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [], createdAt: new Date('2025-01-01') })),
    },
    userRelation: { findUnique: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []) },
    friendRequest: { findFirst: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
  };
}

type Double = ReturnType<typeof prismaDouble>;

async function monter(viewerId: string | null, prisma: Double): Promise<FastifyInstance> {
  clearPrivacyPreferencesCache();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.addHook('onRequest', async (req: any) => {
    req.authContext = viewerId
      ? { isAuthenticated: true, type: 'user', userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: '/api/v1/directory' });
  await app.register(async (scope) => getUserByUsername(scope), { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const comptes = (prisma: Double) =>
  prisma.profileLinkVisitDay.update.mock.calls.length + prisma.profileLinkVisitDay.create.mock.calls.length;

async function ouvrir(viewerId: string | null, url: string, ua: string = NAVIGATEUR, opts: { cibleBloqueLecteur?: boolean } = {}) {
  const prisma = prismaDouble(opts);
  const app = await monter(viewerId, prisma);
  const res = await app.inject({ method: 'GET', url, headers: { 'user-agent': ua } });
  await flush();
  await app.close();
  return { res, prisma };
}

describe('les portes de la fiche comptent les visites des autres', () => {
  it("/directory/people/:handle compte l'ouverture par un autre lecteur, sur la ligne du propriétaire", async () => {
    const { res, prisma } = await ouvrir(LECTEUR, `/api/v1/directory/people/${CIBLE}`);
    expect(res.statusCode).toBe(200);
    expect(comptes(prisma)).toBe(1);
    const [{ where }] = prisma.profileLinkVisitDay.update.mock.calls[0] as [{ where: { userId_day: { userId: string } } }];
    expect(where.userId_day.userId).toBe(CIBLE);
  });

  it("/u/:username compte aussi", async () => {
    const { res, prisma } = await ouvrir(LECTEUR, '/api/v1/u/cible');
    expect(res.statusCode).toBe(200);
    expect(comptes(prisma)).toBe(1);
  });

  it('le propriétaire qui ouvre sa propre fiche ne gonfle pas son compteur', async () => {
    const { res, prisma } = await ouvrir(CIBLE, `/api/v1/directory/people/${CIBLE}`);
    expect(res.statusCode).toBe(200);
    expect(comptes(prisma)).toBe(0);
  });

  it("un robot d'aperçu ne compte pas", async () => {
    const { prisma } = await ouvrir(LECTEUR, `/api/v1/directory/people/${CIBLE}`, 'facebookexternalhit/1.1');
    expect(comptes(prisma)).toBe(0);
  });

  it('la carte d’un lien collé dans une conversation et « Voir comme » ne comptent pas', async () => {
    const carte = await ouvrir(LECTEUR, `/api/v1/directory/people/${CIBLE}?via=link`);
    expect(comptes(carte.prisma)).toBe(0);
    const voirComme = await ouvrir(CIBLE, `/api/v1/directory/people/${CIBLE}?as=FRIEND`);
    expect(comptes(voirComme.prisma)).toBe(0);
  });

  it('une fiche refusée (la cible a bloqué le lecteur) ne compte pas', async () => {
    const { res, prisma } = await ouvrir(LECTEUR, `/api/v1/directory/people/${CIBLE}`, NAVIGATEUR, { cibleBloqueLecteur: true });
    expect(res.statusCode).toBe(404);
    expect(comptes(prisma)).toBe(0);
  });
});
