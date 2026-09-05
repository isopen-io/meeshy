/**
 * Ce que les trois configs de #4687 FONT quand le magasin de compteurs tombe.
 *
 * ## Pourquoi un témoin d'EFFET en plus du cliquet de configuration
 *
 * `rate-limit-key-route-config-sweep.test.ts` lit du TEXTE : il exige que
 * `skipOnError` soit écrit, et il ne peut rien dire de la valeur qui arrive
 * jusqu'au plugin. Un cliquet de texte se laisse satisfaire par une annotation
 * de type, par une propriété posée sur le mauvais objet, ou par une fabrique
 * dont la valeur n'atteint jamais la route — trois façons d'être vert en
 * servant l'inverse. C'est la leçon du § « qui AFFICHE ce qu'il élit » : un
 * correctif dont la valeur n'atteint aucun consommateur n'a rien corrigé.
 *
 * Ce fichier mesure donc l'EFFET, sur le VRAI `@fastify/rate-limit`, avec les
 * VRAIS modules de route, sous une panne du magasin RÉELLE.
 *
 * ## Le montage reproduit le piège, il ne le suppose pas
 *
 * Le plugin est enregistré avec `skipOnError: true` — la valeur que pose
 * `registerGlobalRateLimiter` (`middleware/rate-limiter.ts`, montée par
 * `server.ts`) et que `mergeParams` (`Object.assign`, `index.js:190`) étale
 * dans toute config de route muette. Une config qui déclare la sienne DOIT
 * l'emporter sur cet héritage ; c'est précisément ce que le témoin de
 * `create` prouve, en obtenant l'inverse du global.
 *
 * `MagasinEnPanne` est passé en `store`, donc comme CLASSE : le plugin fait
 * `new Store(globalParams)` (`index.js:146`) et `store.child(params)` par
 * route (`index.js:177`) — passer une INSTANCE planterait au montage, ce que
 * `registerGlobalRateLimiter` documente à ses dépens (`new <instance>()` a
 * cassé le boot en staging).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { meConsentsRoutes } from '../../../routes/me/consents';
import { meCategoriesRoutes } from '../../../routes/me/categories';
import { createPreferenceRateLimitConfig } from '../../../routes/me/preferences/preference-rate-limit';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

/** Le magasin de compteurs indisponible — un Redis qui refuse la connexion. */
class MagasinEnPanne {
  incr(_cle: string, cb: (err: Error | null) => void): void {
    cb(new Error('ECONNREFUSED — magasin de compteurs indisponible'));
  }

  read(_cle: string, cb: (err: Error | null) => void): void {
    cb(new Error('ECONNREFUSED — magasin de compteurs indisponible'));
  }

  child(): MagasinEnPanne {
    return new MagasinEnPanne();
  }
}

type ColonnesDeConsentement = Readonly<Record<string, Date | null>>;

const COLONNES_VIDES: ColonnesDeConsentement = {
  dataProcessingConsentAt: null,
  voiceDataConsentAt: null,
  voiceProfileConsentAt: null,
  voiceCloningEnabledAt: null,
};

type CreationDeCategorie = { readonly data: Readonly<Record<string, unknown>> };

/**
 * Le double Prisma, réduit à ce que les deux modules de route APPELLENT.
 *
 * Rendu en `unknown` : la décoration `prisma` de Fastify est typée
 * `PrismaClient` par l'augmentation du dépôt, et une conversion au site de la
 * décoration dit ce qu'elle fait — ce double n'est pas un client Prisma, il
 * sert la poignée de méthodes que ces routes touchent.
 */
function prismaDeTest(): unknown {
  return {
    user: {
      findUnique: jest.fn(async () => ({ ...COLONNES_VIDES })),
      update: jest.fn(async () => ({ ...COLONNES_VIDES })),
    },
    userPreferences: { findUnique: jest.fn(async () => null) },
    userConversationCategory: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: CreationDeCategorie) => ({
        id: 'cat-x',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
  };
}

/** L'authentification que ces montages posent : un compte, toujours le même. */
type RequeteAuthentifiee = FastifyRequest & {
  auth?: { readonly userId: string; readonly isAuthenticated: boolean };
};

function poserLeCompte(request: FastifyRequest): void {
  (request as RequeteAuthentifiee).auth = { userId: 'user-a', isAuthenticated: true };
}

/**
 * L'app, avec le magasin EN PANNE et le fail-open GLOBAL du dépôt.
 *
 * `global: true` n'est pas cosmétique : c'est ce qui rend l'héritage possible,
 * donc ce qui rend le témoin capable de distinguer « la config a choisi » de
 * « la config a hérité ».
 */
async function appEnPanneDeCompteur(
  monter: (app: FastifyInstance) => Promise<void>
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDeTest() as never);
  app.decorate('authenticate', async (req: FastifyRequest) => poserLeCompte(req));

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    skipOnError: true,
    store: MagasinEnPanne as never,
    keyGenerator: (request: FastifyRequest) => `global:${request.ip}`,
  });

  await monter(app);
  await app.ready();
  return app;
}

describe('Consentements — la panne du compteur ne referme PAS la porte', () => {
  const monter = (app: FastifyInstance) =>
    app.register(meConsentsRoutes, { prefix: '/api/v1/me' });

  it('GET /me/consents répond encore — l\'écran qui AFFICHE les consentements reste lisible', async () => {
    const app = await appEnPanneDeCompteur(monter);
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/consents' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /**
   * Le témoin qui porte l'arbitrage : `granted: false` est le RETRAIT, et
   * `ConsentValidationService` lit exactement ces colonnes pour autoriser le
   * traitement audio. Un 500 ici laisserait tourner le traitement sous un
   * consentement que la personne est en train d'enlever.
   */
  it('PUT /me/consents/:purpose accepte un RETRAIT pendant la panne', async () => {
    const app = await appEnPanneDeCompteur(monter);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/consents/data-processing',
      payload: { granted: false, policyVersion: '2026-05-01' },
    });

    expect(res.statusCode).not.toBe(500);
    await app.close();
  });
});

describe('Catégories — un seul label ferme, et c\'est celui qui CRÉE', () => {
  const monter = (app: FastifyInstance) =>
    app.register(meCategoriesRoutes, { prefix: '/api/v1/me' });

  it('GET /me/categories répond encore (lecture : ouvert)', async () => {
    const app = await appEnPanneDeCompteur(monter);
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/categories' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /**
   * Le seul label dont le dommage SURVIT à la panne : rien ne borne le nombre
   * de catégories d'un compte, et chaque création diffuse `CATEGORY_CREATED`
   * à tous ses appareils. Fermé, la panne du compteur refuse la création — et
   * elle la refuse CONTRE le `skipOnError: true` que le plugin porte
   * globalement, ce qui prouve du même coup que la config l'emporte sur
   * l'héritage.
   */
  it('POST /me/categories est REFUSÉ pendant la panne (création : fermé)', async () => {
    const app = await appEnPanneDeCompteur(monter);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/categories',
      payload: { name: 'Travail' },
    });

    expect(res.statusCode).toBe(500);
    await app.close();
  });

  /**
   * Sans magasin en panne, la même création passe : le 500 ci-dessus mesure
   * bien le SENS DE L'ÉCHEC et non une route cassée — la distinction que le
   * témoin ne pourrait pas faire seul.
   */
  it('la même création passe quand le compteur fonctionne', async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prismaDeTest() as never);
    app.decorate('authenticate', async (req: FastifyRequest) => poserLeCompte(req));
    await app.register(rateLimit, { global: false });
    await monter(app);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/categories',
      payload: { name: 'Travail' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('Préférences unifiées — les trois usages laissent passer', () => {
  /**
   * La config de production est montée sur une route MINIMALE plutôt que sur
   * `unified-routes.ts` : ce qui est mesuré est l'objet rendu par la fabrique,
   * traversant le vrai plugin. Le fait que `unified-routes.ts` monte bien
   * cette fabrique-là est, lui, gardé par le balayage de configuration.
   */
  it.each(['read', 'write', 'reset'] as const)(
    '`%s` répond encore pendant la panne du compteur',
    async (usage) => {
      const app = await appEnPanneDeCompteur(async (instance) => {
        instance.get(
          '/sonde',
          { config: { rateLimit: createPreferenceRateLimitConfig(usage) } },
          async () => ({ ok: true })
        );
      });

      const res = await app.inject({ method: 'GET', url: '/sonde' });

      expect(res.statusCode).toBe(200);
      await app.close();
    }
  );
});
