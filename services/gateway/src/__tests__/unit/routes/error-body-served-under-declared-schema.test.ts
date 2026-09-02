/**
 * Le corps SÉRIALISÉ d'une erreur, sur une route qui DÉCLARE son statut (#4689).
 *
 * ## Pourquoi le témoin doit porter sur une route DÉCLARÉE
 *
 * `fast-json-stringify` ne supprime que là où un schéma EXISTE. Le défaut ne
 * peut donc se voir QUE sur une route qui déclare son 4xx : sur une route nue,
 * Fastify sérialise sans schéma et tout arrive intact. Un témoin monté sur une
 * route non déclarée passerait au vert **pour la mauvaise raison**.
 *
 * Le témoin central ci-dessous n'assert donc pas une liste de clés : il compare
 * la MÊME erreur typée servie par une route qui déclare son 429 et par une
 * route qui n'en déclare aucun. Avant ce lot, les deux corps différaient de
 * deux clés (`statusCode`, `timestamp`) — dans le sens désagréable :
 *
 *   429 **déclaré**     → `{success, error, message, code, retryAfter}`
 *   429 **non déclaré** → `… + statusCode + timestamp`
 *
 * > **Le geste vertueux — déclarer son schéma — était celui qui faisait perdre
 * > des champs**, sur 595 déclarations de statut 4xx/5xx.
 *
 * ## Ce que ce fichier prouve, et ce qu'il ne prouve pas
 *
 * Le gestionnaire enregistré vit dans une méthode de `MeeshyServer` : on ne
 * peut l'exercer qu'en montant tout le serveur (Prisma, Redis, ZMQ). Ce fichier
 * en monte donc une RÉPLIQUE, exactement comme
 * `schema-validation-error-shape.test.ts` le fait depuis #4212 — et elle appelle
 * les mêmes fonctions de production (`typedErrorResponse`,
 * `schemaValidationErrorResponse`) avec la même extraction du statut.
 *
 * Ce qu'elle prouve est la CONSÉQUENCE de sérialisation ; ce qui la lie au
 * gestionnaire réel est ailleurs, et volontairement :
 *   - le dernier `it` de ce fichier vérifie mot pour mot les deux envois du
 *     gestionnaire réel ;
 *   - la garde `__tests__/security/global-error-handler-field-closure-guard.test.ts`
 *     mesure, sur le FICHIER, que rien de non déclaré n'en part.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types';

import { RateLimitError, UserLockedError, typedErrorResponse } from '../../../errors/custom-errors';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';

/** La date de verrouillage sert DEUX fois : dans `lockedUntil` et dans `message`. */
const VERROU = new Date('2026-09-02T08:30:00.000Z');

/** La forme exacte du 429 de `auth/login.ts` — superset + le champ propre à la route. */
const schema429 = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    retryAfter: { type: 'number' },
  },
};

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  // Réplique des deux branches du gestionnaire global — mêmes fonctions de
  // décision, même extraction du statut hors du corps servi.
  app.setErrorHandler(async (error, _request, reply) => {
    const schemaRefusal = schemaValidationErrorResponse(error);
    if (schemaRefusal) {
      const { statusCode: refusStatus, ...corpsRefus } = schemaRefusal;
      return reply.code(refusStatus).send(corpsRefus);
    }

    const typed = typedErrorResponse(error);
    if (typed) {
      const { statusCode: typeStatus, ...corpsType } = typed;
      return reply.code(typeStatus).send(corpsType);
    }

    return reply.code(500).send({ error: 'Internal Server Error' });
  });

  const jette = (erreur: Error) => async () => { throw erreur; };

  app.get('/429-declare', { schema: { response: { 429: schema429 } } }, jette(new RateLimitError(30)));
  app.get('/429-nu', jette(new RateLimitError(30)));

  // `/auth/login` ne déclare PAS son 423 — mesuré : zéro occurrence de `423:`
  // dans `src/routes/`. Les deux routes ci-dessous tiennent les deux mondes
  // côte à côte, celui d'aujourd'hui et celui du jour où quelqu'un déclarera.
  app.get('/423-nu', jette(new UserLockedError(VERROU)));
  app.get('/423-declare', { schema: { response: { 423: errorResponseSchema } } }, jette(new UserLockedError(VERROU)));

  app.post('/400-declare', {
    schema: {
      body: { type: 'object', required: ['password'], properties: { password: { type: 'string', minLength: 6 } } },
      response: { 400: validationErrorResponseSchema },
    },
  }, async () => ({ ok: true }));

  await app.ready();
});

afterAll(async () => { await app.close(); });

const corpsDe = async (url: string): Promise<Record<string, unknown>> => {
  const reponse = await app.inject({ method: 'GET', url });
  return reponse.json();
};

describe('déclarer son statut ne fait plus perdre de champs (#4689 critère 2)', () => {
  it('sert le MÊME corps, que la route déclare son 429 ou non', async () => {
    // LE témoin du lot. Avant le correctif, la route NUE portait deux clés de
    // plus — `statusCode` et `timestamp` —, la route déclarée aucune des deux.
    expect(await corpsDe('/429-declare')).toEqual(await corpsDe('/429-nu'));
  });

  it('le corps SÉRIALISÉ de la route déclarée porte toute la substance de l’erreur', async () => {
    expect(await corpsDe('/429-declare')).toEqual({
      success: false,
      error: 'Rate Limit',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Trop de requêtes. Réessayez dans 30 secondes',
      retryAfter: 30,
    });
  });

  it('ni `statusCode` ni `timestamp` ne voyagent plus — le statut HTTP porte déjà le premier', async () => {
    const nu = await corpsDe('/429-nu');

    expect(nu).not.toHaveProperty('statusCode');
    expect(nu).not.toHaveProperty('timestamp');

    // Non-vacuité : le corps existe bel et bien, et le transport porte le code.
    expect((await app.inject({ method: 'GET', url: '/429-nu' })).statusCode).toBe(429);
    expect(Object.keys(nu)).toHaveLength(5);
  });
});

describe('#4138 re-mesurée : à quoi tient encore `lockedUntil` (critère 3)', () => {
  it('un 423 NON déclaré — l’état réel de `/auth/login` — porte toujours `lockedUntil`', async () => {
    const corps = await corpsDe('/423-nu');

    expect(corps.lockedUntil).toBe(VERROU.toISOString());
    expect(corps.message).toContain('Compte verrouillé');
  });

  it('un 423 DÉCLARÉ perdrait `lockedUntil` — la dépendance survit au remède, inchangée', async () => {
    // Le remède 2 ne restaure pas cette protection et ne l'aggrave pas :
    // `lockedUntil` n'est déclaré par AUCUN schéma, donc il continue de tomber
    // dès qu'un schéma existe pour ce statut. La différence tient à ce qui
    // RESTE : la phrase lisible, qui porte la date en clair, est déclarée par
    // le superset et survit — ce qui n'était pas le cas avant #4212, où un
    // compte verrouillé recevait « Internal Server Error ».
    const corps = await corpsDe('/423-declare');

    expect(corps).not.toHaveProperty('lockedUntil');
    expect(corps.message).toContain('Compte verrouillé');
    expect(corps.code).toBe('USER_LOCKED');
  });
});

describe('ce que l’inventaire gelé de la garde autorise encore, mesuré', () => {
  it('`details` survit sous `validationErrorResponseSchema`, qui le DÉCLARE', async () => {
    const reponse = await app.inject({ method: 'POST', url: '/400-declare', payload: { password: 'abc' } });
    const corps = reponse.json();

    expect(reponse.statusCode).toBe(400);
    expect(corps.details).toEqual([{ field: 'password', message: expect.any(String) }]);
    expect(corps).not.toHaveProperty('statusCode');
  });
});

describe('la réplique dit bien ce que fait le gestionnaire réel', () => {
  it('`server.ts` extrait le statut du corps servi, sur les DEUX branches', () => {
    const serveur = readFileSync(join(__dirname, '../../../server.ts'), 'utf8');

    expect(serveur).toContain('const { statusCode: refusStatus, ...corpsRefus } = schemaRefusal;');
    expect(serveur).toContain('return reply.code(refusStatus).send(corpsRefus);');
    expect(serveur).toContain('const { statusCode: typeStatus, ...corpsType } = typed;');
    expect(serveur).toContain('return reply.code(typeStatus).send(corpsType);');

    // Le gestionnaire n'a plus AUCUN `send` étalant un corps typé ou un refus
    // brut — la forme `...typed` / `...schemaRefusal`, qui était le site des
    // deux champs non déclarés. (Le `timestamp` qui subsiste dans `server.ts`
    // vit sur `WebSocketResponse`, un transport SANS schéma de réponse : la
    // garde de fermeture ne balaie que le gestionnaire HTTP, à raison.)
    expect(serveur).not.toContain('...typed,');
    expect(serveur).not.toContain('...schemaRefusal,');
  });
});
