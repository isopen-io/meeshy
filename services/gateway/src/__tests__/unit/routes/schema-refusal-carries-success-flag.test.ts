/**
 * Un refus de SCHÉMA sert `success: false`, comme toute autre erreur (#4688).
 *
 * ## Le défaut, et pourquoi il ne rougissait nulle part
 *
 * `schemaValidationErrorResponse` — le producteur du corps servi quand Ajv
 * refuse une requête — ne posait pas `success`. Le corps réellement servi
 * était donc :
 *
 *     {"error":"Validation Error","message":"body must have required property 'a'",
 *      "code":"VALIDATION_ERROR","details":[{"field":"a","message":"…"}]}
 *
 * …alors que `validationErrorResponseSchema` DÉCLARE `success`, que le format
 * de réponse du dépôt est `{ success, data?, error? }`, et que la branche
 * VOISINE du même gestionnaire — `typedErrorResponse` — le pose depuis
 * toujours. Une `ValidationError` LEVÉE et un refus d'Ajv sortaient donc du
 * même gestionnaire, sous le même statut, sous le même `code`, sous le même
 * schéma — et avec deux enveloppes différentes.
 *
 * > C'est le MIROIR de la classe de défaut habituelle du dépôt (#4689) : là,
 * > un champ calculé disparaissait faute d'être DÉCLARÉ ; ici la déclaration
 * > est juste et c'est la VALEUR qui manque. Aucune des deux gardes de #4689
 * > ne pouvait le voir : la fermeture de champs mesure « ce qui PART ⊆ ce qui
 * > est DÉCLARÉ », une inclusion qu'un champ ABSENT satisfait trivialement.
 *
 * ## Pourquoi ce témoin-ci, et pas un de plus sur le producteur
 *
 * Chaque suite de route qui exerce ce chemin BOUCHONNE
 * `validationErrorResponseSchema` par `{ type: 'object', properties: {} }`
 * (`password-reset.test.ts:70`, `tracking-links/*.test.ts`) : le témoin
 * regarde alors un contrat qu'il a écrit lui-même, et fast-json-stringify est
 * désarmé. Ce fichier monte donc une vraie instance Fastify, avec le VRAI
 * schéma importé de `@meeshy/shared`, et assert sur le JSON SÉRIALISÉ.
 *
 * Le gestionnaire enregistré vit dans une méthode de `MeeshyServer` : on ne
 * peut l'exercer qu'en montant tout le serveur (Prisma, Redis, ZMQ). Ce
 * fichier en monte donc une RÉPLIQUE, comme le font déjà
 * `schema-validation-error-shape.test.ts` (#4212) et
 * `error-body-served-under-declared-schema.test.ts` (#4689) — et le dernier
 * `describe` vérifie mot pour mot, sur la SOURCE de `server.ts`, que la
 * réplique dit bien ce que fait la production.
 *
 * ## `statusCode` : mesuré, laissé, et gardé
 *
 * Le producteur pose `statusCode: 400` et le schéma ne le déclare pas — mais
 * il ne « fuit » pas pour autant : le gestionnaire l'EXTRAIT du corps
 * (`const { statusCode: refusStatus, ...corpsRefus }`) et s'en sert comme
 * statut HTTP. C'est un canal de retour typé, pas un champ de fil, exactement
 * comme `TypedErrorBody.statusCode`. Le dernier `it` du deuxième `describe` le
 * mesure plutôt que de l'affirmer.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import { validationErrorResponseSchema } from '@meeshy/shared/types';

import { ValidationError, typedErrorResponse } from '../../../errors/custom-errors';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';

const SERVEUR = join(__dirname, '../../../server.ts');

/** Le corps qu'Ajv refuse : `password` est requis, et borné à 6 caractères. */
const CORPS_REFUSE = { password: 'abc' } as const;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  // Réplique des DEUX branches 400 du gestionnaire global, dans leur ordre de
  // production — le refus d'Ajv passe AVANT la branche typée.
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

  const schemaDeCorps = {
    type: 'object',
    required: ['password'],
    properties: { password: { type: 'string', minLength: 6 } },
  } as const;

  // La route DÉCLARÉE : fast-json-stringify est armé, donc le corps servi est
  // celui d'une vraie route du dépôt (`auth/register.ts:99`,
  // `password-reset.ts:166`, `signal-protocol.ts:180`, …).
  app.post('/refus-declare', {
    schema: { body: schemaDeCorps, response: { 400: validationErrorResponseSchema } },
  }, async () => ({ ok: true }));

  // La MÊME route, sans déclaration de 400 : Fastify sérialise sans schéma.
  app.post('/refus-nu', { schema: { body: schemaDeCorps } }, async () => ({ ok: true }));

  // Le JUMEAU : même statut, même `code`, même schéma — mais une erreur LEVÉE,
  // donc l'autre branche du gestionnaire.
  app.post('/levee-declaree', {
    schema: { response: { 400: validationErrorResponseSchema } },
  }, async () => {
    throw new ValidationError('Données invalides', { password: 'Trop court' });
  });

  await app.ready();
});

afterAll(async () => { await app.close(); });

const corpsServi = async (url: string): Promise<Record<string, unknown>> => {
  const reponse = await app.inject({ method: 'POST', url, payload: CORPS_REFUSE });
  return reponse.json();
};

describe('le corps SÉRIALISÉ d’un refus de schéma porte `success` (#4688 critère 1)', () => {
  it('sert `success: false` sur une route qui DÉCLARE son 400', async () => {
    expect(await corpsServi('/refus-declare')).toMatchObject({ success: false });
  });

  it('le sert AUSSI sans déclaration — le producteur, pas le schéma, en décide', async () => {
    expect(await corpsServi('/refus-nu')).toMatchObject({ success: false });
  });

  /**
   * LE témoin du lot. `if (!body.success)` s'en sortait par accident sur
   * `undefined` ; `if (body.success === false)` — la forme qu'un contrat typé
   * encourage, et celle de `isErrorResponse` / `isPreferenceErrorResponse` —
   * ne reconnaissait pas le refus. C'est la seule assertion qui distingue le
   * champ SERVI du champ absent : les deux passent la forme lâche.
   */
  it('la forme STRICTE `body.success === false` reconnaît le refus', async () => {
    const corps = await corpsServi('/refus-declare');

    expect(corps.success === false).toBe(true);
    expect(Object.keys(corps)).toContain('success');
  });

  it('ne perd rien de ce que le refus disait déjà', async () => {
    expect(await corpsServi('/refus-declare')).toEqual({
      success: false,
      error: 'Validation Error',
      message: expect.stringContaining('password'),
      code: 'VALIDATION_ERROR',
      details: [{ field: 'password', message: expect.any(String) }],
    });
  });
});

describe('non-vacuité : le témoin regarde bien la vraie couche', () => {
  /**
   * Un témoin monté sur un schéma BOUCHONNÉ passerait au vert pour la mauvaise
   * raison — c'est exactement ce qui a tenu ce défaut invisible. Le schéma
   * importé doit donc DÉCLARER `success`, sans quoi fast-json-stringify le
   * supprimerait et l'assertion ci-dessus ne pourrait jamais passer.
   */
  it('le schéma importé de `@meeshy/shared` déclare bien `success`', () => {
    expect(Object.keys(validationErrorResponseSchema.properties)).toContain('success');
  });

  /**
   * Et fast-json-stringify est bien ARMÉ sur la route déclarée : la preuve est
   * qu'un champ non déclaré y disparaît alors qu'il survit sur la route nue.
   */
  it('fast-json-stringify est armé sur la route déclarée, muet sur la route nue', async () => {
    const declare = await corpsServi('/refus-declare');
    const nu = await corpsServi('/refus-nu');

    // `details` est déclaré : il survit des deux côtés.
    expect(declare).toHaveProperty('details');
    expect(nu).toHaveProperty('details');

    // Le producteur ne pose AUCUN champ hors du schéma — le seul candidat,
    // `statusCode`, est extrait par le gestionnaire (voir l'`it` suivant).
    expect(Object.keys(declare).sort()).toEqual(Object.keys(nu).sort());
  });

  /**
   * `statusCode` : DÉCISION — laissé sur le producteur.
   *
   * Il n'est pas un champ de fil que le schéma supprimerait : le gestionnaire
   * le DESTRUCTURE hors du corps et s'en sert comme statut HTTP. Le retirer du
   * producteur priverait `server.ts` de son statut ; le déclarer dans
   * `validationErrorResponseSchema` (`packages/shared`) le ferait voyager sur
   * 595 déclarations de statut, ce que #4689 vient précisément de retirer.
   */
  it('`statusCode` ne voyage sur AUCUNE des deux routes — il est le canal du statut', async () => {
    const reponse = await app.inject({ method: 'POST', url: '/refus-nu', payload: CORPS_REFUSE });

    expect(reponse.statusCode).toBe(400);
    expect(reponse.json()).not.toHaveProperty('statusCode');
    expect(await corpsServi('/refus-declare')).not.toHaveProperty('statusCode');
  });
});

describe('les deux 400 du gestionnaire servent la MÊME enveloppe (#4688 critère 3)', () => {
  /**
   * Même statut, même `code`, même schéma — et, avant ce lot, deux enveloppes
   * différentes selon que le 400 venait d'Ajv ou d'un `throw`. C'est cette
   * divergence-là qu'un client typé ne pouvait pas absorber.
   */
  it('un refus Ajv et une `ValidationError` LEVÉE s’accordent sur `success`', async () => {
    const refus = await corpsServi('/refus-declare');
    const levee = await corpsServi('/levee-declaree');

    expect(levee.success).toBe(false);
    expect(refus.success).toBe(levee.success);
    expect(refus.code).toBe(levee.code);
  });
});

describe('la réplique dit bien ce que fait le gestionnaire réel', () => {
  it('`server.ts` extrait le statut du refus et envoie le RESTE du corps', () => {
    const serveur = readFileSync(SERVEUR, 'utf8');

    expect(serveur).toContain('const { statusCode: refusStatus, ...corpsRefus } = schemaRefusal;');
    expect(serveur).toContain('return reply.code(refusStatus).send(corpsRefus);');

    // Le gestionnaire ne recompose RIEN autour du corps du producteur : tout
    // ce qui part d'ici vient de `schemaValidationErrorResponse`, donc le
    // témoin ci-dessus mesure bien le corps de production.
    expect(serveur).not.toContain('...schemaRefusal,');
  });
});
