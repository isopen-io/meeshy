/**
 * `POST /admin/agent/topics/:id/test` — le débit compte le COMPTE, jamais
 * l'adresse, garde des seaux DISJOINTS, et échoue FERMÉ quand le magasin de
 * compteurs tombe (#4429).
 *
 * ## Ce que la mesure a trouvé — et où elle contredit la lecture naïve
 *
 * La garde de cette route vit en `onRequest`
 * (`onRequest: [fastify.authenticate, requireAgentAdmin]`), la MÊME phase où
 * `config.rateLimit` s'évalue par défaut. Mesuré sur le vrai plugin
 * (`addRouteRateHook`, `@fastify/rate-limit/index.js`) : sans `hook` déclaré,
 * il pousse son propre hook à la FIN du tableau `onRequest` déjà posé par la
 * route — donc APRÈS `fastify.authenticate` et `requireAgentAdmin`, qui l'y
 * précèdent dans le MÊME littéral. `authContext` était donc déjà lisible ici
 * AVANT ce lot — à la différence de `routes/calls.ts`, où la garde vit en
 * `preValidation`, une phase PLUS TARDIVE que l'`onRequest` par défaut du
 * plugin, ce qui y rend le défaut réel. Le premier `describe` ci-dessous
 * MESURE cette différence de mécanisme plutôt que de la supposer — avec un
 * plugin réel et une route minimale, indépendante de `agent-topics.ts`.
 *
 * Le défaut RÉEL que ce lot corrige est ailleurs : `skipOnError` n'était pas
 * déclaré sur `TEST_ROUTE_RATE_LIMIT`, et `mergeParams` (`Object.assign` du
 * plugin) le faisait donc HÉRITER, silencieusement, du `skipOnError: true`
 * du plugin global (`registerGlobalRateLimiter`, `server.ts:560`) — une panne
 * du magasin de compteurs ouvrait ce plafond en grand sans que personne l'ait
 * décidé. Le troisième `describe` le prouve, AVANT/APRÈS.
 *
 * ## Pourquoi DEUX comptes, et pas un seul
 *
 * À un seul compte, la clé « par compte » et une clé « par adresse » rendent
 * le même verdict — un témoin posé là ne peut pas tomber. Le second compte
 * est la preuve : il doit disposer de son crédit ENTIER quand `app.inject()`
 * simule la MÊME adresse pour les deux (comportement par défaut de l'inject
 * de Fastify, qui ne fait pas de socket réel).
 *
 * ## Pourquoi le VRAI plugin (`global: false`), jamais un double
 *
 * Le mécanisme mesuré ci-dessus vit dans l'ORDONNANCEMENT des hooks de
 * Fastify + `@fastify/rate-limit` — une fonction qui rejoue le `keyGenerator`
 * à la main (comme le fait `rate-limit.test.ts` pour `middleware/rate-limit.ts`)
 * ne peut voir ni cet ordonnancement, ni le comportement `skipOnError`. Les
 * deux exigent le VRAI plugin, monté exactement comme la route l'attend.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

jest.mock('../../../../services/CacheStore', () => {
  const store = new Map<string, string>();
  const mockStore = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    publish: jest.fn(async () => 1),
    isAvailable: jest.fn(() => false),
  };
  return { getCacheStore: () => mockStore };
});

jest.mock('../../../../services/AgentHttpClient', () => ({
  AgentHttpClient: jest.fn().mockImplementation(() => ({
    invalidateCache: jest.fn<any>().mockResolvedValue({}),
  })),
}));

import { agentTopicsRoutes, TEST_ROUTE_RATE_LIMIT } from '../../../../routes/admin/agent-topics';

const TOPIC_ID = '507f1f77bcf86cd799439099';
const COMPTE_A = '507f1f77bcf86cd799439011';
const COMPTE_B = '507f1f77bcf86cd799439012';

const storedTopic = {
  id: TOPIC_ID,
  slug: 'cinema',
  label: 'Cinéma',
  keywordPatterns: ['\\bfilm\\b'],
  instructionTemplate: 'Lance une discussion sur le cinéma récent.',
  searchHintTemplate: 'actualité cinéma',
  description: null,
  examples: [],
  cooldownMinutes: 60,
  isActive: true,
};

function makePrisma(): any {
  return {
    agentTopicCatalog: {
      findUnique: jest.fn<any>().mockResolvedValue(storedTopic),
    },
  };
}

/** Double d'authentification, calqué sur `middleware/auth.ts:527-534`. */
function productionShapedAuth(userId: string) {
  return async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      type: 'user',
      isAnonymous: false,
      userId,
      registeredUser: { id: userId, role: 'BIGBOSS' },
    };
  };
}

/**
 * Monte la VRAIE route sur le VRAI plugin (`global: false`), comme la
 * production le fait via `registerGlobalRateLimiter` + `agentTopicsRoutes`.
 */
async function buildApp(actor: { current: string }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma());
  app.decorate('authenticate', async (request: any) => {
    await productionShapedAuth(actor.current)(request);
  });
  await app.register(rateLimit, { global: false });
  await app.register(agentTopicsRoutes);
  await app.ready();
  return app;
}

const appelTest = (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: `/topics/${TOPIC_ID}/test`,
    payload: { sampleText: 'un film' },
  });

describe(
  "Le mécanisme d'ordonnancement — pourquoi cette route diffère de `calls.ts`",
  () => {
    // Route MINIMALE, indépendante de `agent-topics.ts` : ne reproduit que la
    // forme qui compte — une garde en `onRequest` posant `authContext`,
    // suivie d'un `config.rateLimit` SANS `hook` déclaré (le défaut du
    // plugin, 'onRequest'). Ce n'est pas un double du plugin : c'est le VRAI
    // `@fastify/rate-limit`, monté sur une route neuve.
    async function buildMinimalOnRequestGuardedApp(actor: { current: string }) {
      const app = Fastify({ logger: false });
      await app.register(rateLimit, { global: false });
      app.post(
        '/geste',
        {
          onRequest: [
            async (request: any) => { request.authContext = { userId: actor.current }; },
          ],
          config: {
            rateLimit: {
              max: 2,
              timeWindow: '1 minute',
              // Volontairement AUCUN `hook` ici — c'est le point mesuré.
              keyGenerator: (request: any) => request.authContext?.userId ?? `ip:${request.ip}`,
              errorResponseBuilder: () => ({ success: false, statusCode: 429, error: 'nope' }),
            },
          },
        },
        async () => ({ ok: true }),
      );
      await app.ready();
      return app;
    }

    it(
      "compte déjà PAR COMPTE sans `hook` déclaré, quand la garde vit en `onRequest` — la MÊME phase",
      async () => {
        const actor = { current: 'compte-x' };
        const app = await buildMinimalOnRequestGuardedApp(actor);

        expect((await app.inject({ method: 'POST', url: '/geste' })).statusCode).toBe(200);
        expect((await app.inject({ method: 'POST', url: '/geste' })).statusCode).toBe(200);
        expect((await app.inject({ method: 'POST', url: '/geste' })).statusCode).toBe(429);

        // LA preuve : un second compte, même adresse simulée, dispose de son
        // crédit ENTIER — ce qui ne serait pas le cas si `authContext` était
        // encore `undefined` au moment du `keyGenerator` (les deux
        // retomberaient alors sur le MÊME seau `ip:127.0.0.1`).
        actor.current = 'compte-y';
        expect((await app.inject({ method: 'POST', url: '/geste' })).statusCode).toBe(200);

        await app.close();
      },
    );
  },
);

describe(
  "Le débit compte le COMPTE, jamais l'adresse partagée par `app.inject()`",
  () => {
    let app: FastifyInstance | undefined;
    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    it(
      'dix appels du compte A passent, le onzième est refusé, le compte B dispose de son crédit ENTIER',
      async () => {
        const actor = { current: COMPTE_A };
        app = await buildApp(actor);

        for (let i = 0; i < 10; i += 1) {
          expect((await appelTest(app)).statusCode).toBe(200);
        }
        expect((await appelTest(app)).statusCode).toBe(429);

        actor.current = COMPTE_B;
        expect((await appelTest(app)).statusCode).toBe(200);
      },
      20_000,
    );

    it('un refus de débit se lit 429, jamais 500 — le corps NOMME la route', async () => {
      const actor = { current: 'compte-throttle' };
      app = await buildApp(actor);

      for (let i = 0; i < 10; i += 1) {
        expect((await appelTest(app)).statusCode).toBe(200);
      }
      const refuse = await appelTest(app);
      expect(refuse.statusCode).toBe(429);
      const body = refuse.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('agent-topics/test');
    }, 20_000);
  },
);

describe(
  'Préfixes DISJOINTS `acct:`/`ip:` — et la sentinelle `userId: \'anonymous\'`',
  () => {
    const { keyGenerator } = TEST_ROUTE_RATE_LIMIT;

    it('un compte réel obtient une clé `acct:`', () => {
      const req = { authContext: { userId: COMPTE_A }, ip: '10.0.0.5' } as any;
      expect(keyGenerator(req)).toBe(`agent-topics:test:acct:${COMPTE_A}`);
    });

    it("l'absence d'`authContext` retombe sur une clé `ip:`, jamais nue", () => {
      const req = { ip: '10.0.0.9' } as any;
      const key = keyGenerator(req);
      expect(key).toBe('agent-topics:test:ip:10.0.0.9');
      expect(key).not.toContain('undefined');
    });

    it(
      "la SENTINELLE `userId: 'anonymous'` de `createUnauthenticatedContext()` ne devient JAMAIS un compte",
      () => {
        // Un repli naïf (`userId ?? repli`) rangerait CETTE valeur — VRAIE —
        // dans le même seau `acct:anonymous` que tout visiteur sans
        // justificatif, partout où cette forme d'`authContext` circulerait.
        const req = { authContext: { userId: 'anonymous' }, ip: '10.0.0.7' } as any;
        const key = keyGenerator(req);
        expect(key).toBe('agent-topics:test:ip:10.0.0.7');
        expect(key).not.toContain('acct:anonymous');
      },
    );

    it("un compte et un visiteur `ip:` ne partagent jamais de seau, même à identifiants qui se ressembleraient", () => {
      const compteReq = { authContext: { userId: '10.0.0.5' }, ip: '10.0.0.9' } as any;
      const visiteurReq = { ip: '10.0.0.5' } as any;
      expect(keyGenerator(compteReq)).toBe('agent-topics:test:acct:10.0.0.5');
      expect(keyGenerator(visiteurReq)).toBe('agent-topics:test:ip:10.0.0.5');
      expect(keyGenerator(compteReq)).not.toBe(keyGenerator(visiteurReq));
    });
  },
);

describe(
  "`hook`/`skipOnError` sont DÉCLARÉS sur la config, pas hérités en silence",
  () => {
    it("déclare `hook: 'preHandler'`", () => {
      expect(TEST_ROUTE_RATE_LIMIT.hook).toBe('preHandler');
    });

    it('déclare `skipOnError: false` — le sens FERMÉ, écrit sur place', () => {
      expect(Object.prototype.hasOwnProperty.call(TEST_ROUTE_RATE_LIMIT, 'skipOnError')).toBe(
        true,
      );
      expect(TEST_ROUTE_RATE_LIMIT.skipOnError).toBe(false);
    });
  },
);

/**
 * Magasin qui tombe en panne — ce que fait `RedisStore` quand Redis est
 * indisponible. `skipOnError` décide alors du SENS de l'échec :
 * `false` laisse l'erreur du magasin remonter (500, jamais un 429 propre),
 * `true` laisse passer la requête.
 */
class MagasinEnPanne {
  child(): MagasinEnPanne {
    return new MagasinEnPanne();
  }
  incr(_cle: string, callback: (erreur: Error) => void): void {
    callback(new Error('Redis indisponible'));
  }
}

async function buildAppAvecMagasinEnPanne(
  registerSettings: { skipOnError: boolean },
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma());
  app.decorate('authenticate', productionShapedAuth(COMPTE_A));
  // `skipOnError: true` au niveau du PLUGIN reproduit le global VIVANT
  // (`registerGlobalRateLimiter`, `server.ts:560`) : c'est CE réglage que
  // `mergeParams` (`Object.assign`) fait hériter à toute config de route qui
  // ne le redéclare pas — exactement le piège que ce lot ferme.
  await app.register(rateLimit, {
    global: false,
    skipOnError: registerSettings.skipOnError,
    store: MagasinEnPanne as unknown as never,
  });
  await app.register(agentTopicsRoutes);
  await app.ready();
  return app;
}

describe(
  "Le sens de l'échec est FERMÉ — la panne du magasin ne doit pas ouvrir le plafond en silence",
  () => {
    it(
      'AVEC la config LIVRÉE (skipOnError: false déclaré) : la panne répond 500, jamais un passage silencieux',
      async () => {
        const app = await buildAppAvecMagasinEnPanne({ skipOnError: true });
        const res = await appelTest(app);
        // Le plugin global vivant pose skipOnError:true ; la config de route
        // DÉCLARE false et l'emporte dans le merge — c'est ce que ce test
        // prouve : même le global ouvert n'ouvre pas CETTE route.
        expect(res.statusCode).toBe(500);
        await app.close();
      },
    );

    it(
      "AVANT ce lot (skipOnError NON déclaré sur la route) : la panne aurait laissé passer — reproduit avec la forme d'origine",
      async () => {
        // Reproduit fidèlement la forme du fichier AVANT #4429 : même
        // `keyGenerator`/`errorResponseBuilder`, SANS `hook` ni `skipOnError`
        // — pour prouver, plutôt que d'affirmer, ce que l'héritage silencieux
        // ouvrait. `TEST_ROUTE_RATE_LIMIT` lui-même n'est plus dans cet état
        // (témoin précédent) ; c'est pourquoi ce witness construit la forme
        // D'ORIGINE localement au lieu de muter l'export en cours de test.
        const app = Fastify({ logger: false });
        app.decorate('prisma', makePrisma());
        app.decorate('authenticate', productionShapedAuth(COMPTE_A));
        await app.register(rateLimit, {
          global: false,
          skipOnError: true, // le global vivant, hérité faute de mieux sur la route
          store: MagasinEnPanne as unknown as never,
        });
        app.post(
          '/topics/:id/test',
          {
            onRequest: [
              (app as unknown as { authenticate: any }).authenticate,
            ],
            config: {
              rateLimit: {
                max: 10,
                timeWindow: '1 minute',
                keyGenerator: (request: any) => {
                  const authContext = request.authContext;
                  const id = authContext?.userId ?? `ip:${request.ip}`;
                  return `agent-topics:test:${id}`;
                },
                errorResponseBuilder: () => ({
                  success: false,
                  error: 'Trop de tests de motifs (agent-topics/test). Veuillez patienter.',
                  statusCode: 429,
                }),
              },
            },
          },
          async () => ({ success: true, data: { matches: {}, refused: [] } }),
        );
        await app.ready();

        const res = await app.inject({
          method: 'POST',
          url: `/topics/${TOPIC_ID}/test`,
          payload: { sampleText: 'un film' },
        });

        // ROUGE, tel que mesuré avant ce lot : la panne du magasin de
        // compteurs était invisible, la requête passait normalement.
        expect(res.statusCode).toBe(200);
        await app.close();
      },
    );
  },
);
