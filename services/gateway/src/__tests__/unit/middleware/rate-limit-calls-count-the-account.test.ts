/**
 * Les trois limiteurs de la surface d'APPELS comptent le COMPTE, pas l'adresse.
 *
 * `createRateLimitConfig` (`middleware/rate-limit.ts`) déclare un
 * `keyGenerator` qui lit `authContext?.userId` et se replie sur
 * `ip:${request.ip}`. Sans `hook: 'preHandler'`, @fastify/rate-limit évalue
 * cette config au hook `onRequest` (`defaultHook`, index.js) — AVANT le
 * `preValidation` où `requiredAuth` (`routes/calls.ts`) pose `authContext`.
 * Le générateur reçoit donc `undefined` et retombe sur l'adresse À CHAQUE
 * FOIS : la clé « par compte » n'est pas un cas limite raté, c'est une
 * fiction complète sur ce chemin.
 *
 * ── Pourquoi DEUX comptes, et pourquoi un seul ne prouve rien ─────────────
 *
 * À UN seul compte, la version « par adresse » et la version « par compte »
 * rendent le MÊME verdict : les `max` premiers appels passent, le suivant
 * est refusé. Un témoin posé là ne peut pas tomber. Le défaut ne devient
 * observable qu'au SECOND compte, parce que c'est exactement ce qu'il
 * produit en production : deux comptes derrière une même sortie (opérateur
 * mobile, université, NAT d'entreprise) se partagent un seul crédit, et le
 * premier arrivé prive le second. Mesuré sur le vrai plugin :
 *
 *     SANS hook   → compte A : 200 200 429   compte B : 429 429 429
 *     AVEC hook   → compte A : 200 200 429   compte B : 200 200 429
 *
 * C'est le verdict du compte B qui porte toute la preuve.
 *
 * ── Pourquoi le VRAI plugin, et pas un double ─────────────────────────────
 *
 * Le défaut vit dans l'ORDONNANCEMENT des hooks de Fastify, que seul le
 * plugin réel reproduit. Un appel direct au `keyGenerator` — ce que fait
 * `rate-limit.test.ts` — ne peut pas le voir : il fournit lui-même
 * l'`authContext` que le plugin, à `onRequest`, n'a pas encore.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { RATE_LIMITS, ROUTE_RATE_LIMITS } from '../../../middleware/rate-limit';

const COMPTE_A = 'compte-a-000000000000000a';
const COMPTE_B = 'compte-b-000000000000000b';

type CleRoute = keyof typeof ROUTE_RATE_LIMITS;

/**
 * Monte la route SUR LE VRAI PLUGIN, dans la forme exacte de `routes/calls.ts` :
 * l'authentification en `preValidation`, la config épandue depuis
 * `ROUTE_RATE_LIMITS`. `skipOnError: true` au niveau du plugin reproduit le
 * global VIVANT (`registerGlobalRateLimiter`, `server.ts:560`), dont
 * @fastify/rate-limit fusionne les valeurs par `Object.assign` dans toute
 * config de route qui ne les redéclare pas.
 */
async function verdictsParCompte(
  route: CleRoute,
  appels: ReadonlyArray<readonly [compte: string, nombre: number]>
): Promise<Record<string, number[]>> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true });

  app.post(
    '/geste',
    {
      preValidation: [
        async (request: { authContext?: unknown; headers: Record<string, unknown> }) => {
          request.authContext = { userId: request.headers['x-compte'] };
        },
      ],
      ...ROUTE_RATE_LIMITS[route],
      schema: undefined,
    },
    async () => ({ ok: true })
  );

  await app.ready();

  const verdicts: Record<string, number[]> = {};
  for (const [compte, nombre] of appels) {
    verdicts[compte] = [];
    for (let i = 0; i < nombre; i += 1) {
      const reponse = await app.inject({
        method: 'POST',
        url: '/geste',
        headers: { 'x-compte': compte },
        payload: {},
      });
      verdicts[compte].push(reponse.statusCode);
    }
  }

  await app.close();
  return verdicts;
}

const SURFACES: ReadonlyArray<readonly [CleRoute, number]> = [
  ['initiateCall', RATE_LIMITS.INITIATE_CALL.max],
  ['joinCall', RATE_LIMITS.JOIN_CALL.max],
  ['callOperations', RATE_LIMITS.CALL_OPERATIONS.max],
];

describe("Deux comptes ne partagent jamais le compteur d'une route d'appel", () => {
  it.each(SURFACES)(
    '%s : le compte qui épuise son crédit ne refuse pas celui du voisin',
    async (route, max) => {
      const verdicts = await verdictsParCompte(route, [
        [COMPTE_A, max + 1],
        [COMPTE_B, max],
      ]);

      expect(verdicts[COMPTE_A].slice(0, max)).toEqual(Array(max).fill(200));
      expect(verdicts[COMPTE_A][max]).toBe(429);

      // LA preuve : B n'a rien consommé, il doit disposer de son crédit
      // ENTIER. Sous le défaut, il reçoit 429 dès son premier appel parce
      // que A a vidé le seau de l'ADRESSE qu'ils partagent.
      expect(verdicts[COMPTE_B]).toEqual(Array(max).fill(200));
    },
    20_000
  );
});

/**
 * Magasin qui tombe en panne — ce que fait `RedisStore` quand Redis est
 * indisponible. `skipOnError` décide alors du SENS de l'échec, et la mesure
 * dit quel prix il coûte : `false` laisse l'erreur du magasin remonter, donc
 * un **500** (jamais un 429 propre) ; `true` laisse passer la requête.
 */
class MagasinEnPanne {
  child(): MagasinEnPanne {
    return new MagasinEnPanne();
  }
  incr(_cle: string, callback: (erreur: Error) => void): void {
    callback(new Error('Redis indisponible'));
  }
}

async function verdictRedisEnPanne(route: CleRoute): Promise<number> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
    skipOnError: true,
    store: MagasinEnPanne as unknown as never,
  });

  app.post(
    '/geste',
    {
      preValidation: [
        async (request: { authContext?: unknown }) => {
          request.authContext = { userId: COMPTE_A };
        },
      ],
      ...ROUTE_RATE_LIMITS[route],
      schema: undefined,
    },
    async () => ({ ok: true })
  );

  await app.ready();
  const reponse = await app.inject({ method: 'POST', url: '/geste', payload: {} });
  await app.close();
  return reponse.statusCode;
}

describe("Le sens de l'échec des routes d'appels est DÉCIDÉ, pas hérité", () => {
  /**
   * Le domaine échoue OUVERT (#4334, critère 2 : « fail-open assumé là où la
   * disponibilité prime — sons, appels »). `operations` couvre RACCROCHER et
   * QUITTER : refuser pendant une panne Redis enfermerait l'utilisateur dans
   * un appel qu'il ne peut plus quitter, et au prix d'un 500. Le plafond
   * protège d'un abus ; l'échec fermé fabriquerait ici la panne qu'il
   * prétend contenir.
   */
  it.each(['initiateCall', 'joinCall', 'callOperations'] as const)(
    '%s échoue OUVERT quand le magasin de compteurs est en panne',
    async (route) => {
      expect(await verdictRedisEnPanne(route)).toBe(200);
    }
  );

  /**
   * Le comportement ci-dessus s'obtiendrait AUSSI par simple héritage : le
   * global vivant pose `skipOnError: true` et @fastify/rate-limit le fusionne
   * par `Object.assign` dans toute config qui se tait. Un témoin de
   * comportement seul ne distingue donc pas « décidé » de « subi ». Celui-ci
   * lit la config : la valeur doit être ÉCRITE sur place. C'est la moitié qui
   * tombe aujourd'hui, et celle qui rougira si quelqu'un retire la ligne en
   * croyant supprimer un doublon.
   */
  it.each(['initiateCall', 'joinCall', 'callOperations'] as const)(
    '%s DÉCLARE son sens d\'échec au lieu de l\'hériter',
    (route) => {
      const rateLimit = ROUTE_RATE_LIMITS[route].config.rateLimit as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(rateLimit, 'skipOnError')).toBe(true);
      expect(rateLimit.skipOnError).toBe(true);
    }
  );

  /**
   * Le plugin `throw`e ce que rend `errorResponseBuilder`, et Fastify lit
   * `statusCode` sur l'objet lancé. Sans ce champ, un refus de débit
   * répondait 500 : indiscernable d'une panne, pour le client comme pour la
   * supervision.
   */
  it.each(['initiateCall', 'joinCall', 'callOperations'] as const)(
    '%s : un refus de débit se lit 429, jamais 500',
    async (route) => {
      const max = ROUTE_RATE_LIMITS[route].config.rateLimit.max;
      const verdicts = await verdictsParCompte(route, [[COMPTE_A, max + 1]]);
      expect(verdicts[COMPTE_A][max]).toBe(429);
    },
    20_000
  );
});
