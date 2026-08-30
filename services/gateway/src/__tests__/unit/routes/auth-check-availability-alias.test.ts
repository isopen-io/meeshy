/**
 * L'alias `GET /auth/check-availability` ne dit plus si une adresse a un compte (#4158).
 *
 * C'est la SEULE bascule de ce lot qui change une RÉPONSE et pas seulement une
 * adresse. L'ancienne route rendait `emailAvailable` et `phoneNumberAvailable` :
 * elle confirmait **sans compte** qu'une adresse ou un numéro appartient à un
 * utilisateur Meeshy, pendant que `/forgot-password` et `/magic-link/request`
 * répondent délibérément « succès » dans tous les cas pour ne rien révéler.
 *
 * Ces témoins sont NÉGATIFS sur les deux champs qui fuyaient — c'est leur
 * raison d'être. Un témoin qui ne vérifierait que la présence des nouveaux
 * champs resterait vert si les anciens revenaient à côté.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: async () => ({ geoData: { country: 'FR' } }),
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createRegisterRateLimiter: () => ({ middleware: () => async () => {} }),
  createAuthGlobalRateLimiter: () => ({ middleware: () => async () => {} }),
}));

import { registerRegistrationRoutes } from '../../../routes/auth/register';

const PREFIXE = '/api/v1/auth';

async function monter(pseudoPris: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    user: {
      findFirst: jest.fn<any>(async () => (pseudoPris ? { id: 'u-1' } : null)),
      findMany: jest.fn<any>(async () => []),
    },
  } as never);
  await app.register(async (instance) => {
    registerRegistrationRoutes({ fastify: instance, authService: {} as never, redis: undefined } as never);
  }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const appeler = (app: FastifyInstance, q: string) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/check-availability?${q}` });

describe('L’alias ne rend plus les champs qui fuyaient', () => {
  it('ne rend AUCUN `emailAvailable`, pour une adresse existante ou non', async () => {
    const app = await monter(true);

    const res = await appeler(app, 'email=deja.inscrit%40exemple.test');

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).not.toHaveProperty('emailAvailable');
    // Ce qu'elle rend à la place : un verdict de FORME.
    expect(data.emailValid).toBe(true);

    await app.close();
  });

  it('ne rend AUCUN `phoneNumberAvailable`', async () => {
    const app = await monter(true);

    const res = await appeler(app, 'phoneNumber=%2B33612345678');

    const data = res.json().data;
    expect(data).not.toHaveProperty('phoneNumberAvailable');
    expect(data.phoneNumberValid).toBe(true);
    expect(data.phoneNumberE164).toBe('+33612345678');

    await app.close();
  });
});

describe('… et garde ce qui pouvait l’être', () => {
  it('sert toujours `usernameAvailable` — un pseudo est une clé publique', async () => {
    const app = await monter(false);

    const res = await appeler(app, 'username=libre');

    expect(res.json().data.usernameAvailable).toBe(true);

    await app.close();
  });

  it('sert toujours des suggestions quand le pseudo est pris', async () => {
    const app = await monter(true);

    const res = await appeler(app, 'username=pris');

    const data = res.json().data;
    expect(data.usernameAvailable).toBe(false);
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);

    await app.close();
  });

  it('refuse un appel sans aucun identifiant', async () => {
    const app = await monter(false);

    const res = await appeler(app, '');

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});
