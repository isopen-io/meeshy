/**
 * #13928 — la présence d'un AMI est binaire, celle d'un PROCHE est détaillée.
 *
 * `GET /directory/presence` sert `isOnline` et `lastActiveAt` à côté l'un de
 * l'autre : un gate posé sur le seul drapeau « en ligne » laisserait partir la
 * dernière connexion. Le témoin interroge donc la CHARGE servie, jamais la
 * carte de visibilité : un Ami reçoit « en ligne » ou rien, un Proche reçoit
 * les deux.
 *
 * Fichier à part de `presence.test.ts` : `getPresenceVisibilityService` est un
 * singleton lié au PREMIER `prisma` qu'il voit, et ce test-ci a besoin du sien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { directoryPresenceRoutes } from '../../../../routes/directory/presence';

const PREFIXE = '/api/v1/directory';
const LECTEUR = '507f1f77bcf86cd799439099';
const AMI = '507f1f77bcf86cd799439044';
const PROCHE = '507f1f77bcf86cd799439055';
const VU_A = new Date('2026-08-01T10:00:00Z');

type Niveau = 'FRIEND' | 'CLOSE';
type Servi = { userId: string; isOnline: boolean; lastActiveAt: string | null };

const ligne = (avec: string, niveau: Niveau) => {
  const [userLowId, userHighId] = [LECTEUR, avec].sort();
  return { id: `rel-${avec}`, userLowId, userHighId, grantedByLow: niveau, grantedByHigh: niveau, transitions: [] };
};

async function monter(enLigne: string[]): Promise<FastifyInstance> {
  const prisma = {
    user: {
      findMany: jest.fn<any>(async (args: any) =>
        args?.where?.blockedUserIds ? [] : [{ id: AMI, lastActiveAt: VU_A }, { id: PROCHE, lastActiveAt: VU_A }]),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
    participant: { findMany: jest.fn<any>(async () => []) },
    friendRequest: { findMany: jest.fn<any>(async () => []) },
    userRelation: { findMany: jest.fn<any>(async () => [ligne(AMI, 'FRIEND'), ligne(PROCHE, 'CLOSE')]) },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('presenceChecker', {
    bulk: (ids: readonly string[]) => new Map(ids.map((id) => [id, enLigne.includes(id)])),
  } as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: LECTEUR,
      registeredUser: { id: LECTEUR, role: 'USER' },
    };
  });
  await app.register(directoryPresenceRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const lire = async (app: FastifyInstance, id: string): Promise<Servi> =>
  (await app.inject({ method: 'GET', url: `${PREFIXE}/presence?ids=${id}` })).json().data.users[0];

describe('#13928 — un Ami voit « en ligne » ou rien ; un Proche voit la présence détaillée', () => {
  it('un Ami en ligne est servi en ligne, SANS lastActiveAt', async () => {
    const app = await monter([AMI]);

    const servi = await lire(app, AMI);

    expect(servi.isOnline).toBe(true);
    expect(servi.lastActiveAt).toBeNull();
    await app.close();
  });

  it('un Ami hors ligne ne montre RIEN : ni état, ni « vu il y a »', async () => {
    const app = await monter([]);

    const servi = await lire(app, AMI);

    expect(servi.isOnline).toBe(false);
    expect(servi.lastActiveAt).toBeNull();
    await app.close();
  });

  it('un Proche est servi en détail : en ligne ET dernière activité', async () => {
    const app = await monter([PROCHE]);

    const servi = await lire(app, PROCHE);

    expect(servi.isOnline).toBe(true);
    expect(servi.lastActiveAt).toBe(VU_A.toISOString());
    await app.close();
  });
});
