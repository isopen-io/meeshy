/**
 * `X-Client-Mutation-Id` mal formé — ce que le client REÇOIT (#4434).
 *
 * Les témoins voisins (`clientMutationId.test.ts`) exercent le hook contre un
 * DOUBLE de `reply` : ils attestent l'objet qu'on lui passe, jamais l'octet
 * qui part. Sous ce harnais, `error: { code, message }` passe intact — et le
 * défaut a vécu là, entre l'objet posé et la charge servie.
 *
 * Mesuré sur staging (build `c39f5b4`) :
 *
 *     POST /api/v1/me/categories, X-Client-Mutation-Id: sonde-4359-…
 *     → 400 {"success":false,"error":"[object Object]"}
 *
 * `errorResponseSchema` déclare `error` en CHAÎNE, et fast-json-stringify
 * COERCE un objet au lieu de le supprimer — c'est la « troisième forme » du
 * `CLAUDE.md` du gateway, prise dans l'autre sens : ici l'émetteur pose un
 * objet là où le schéma déclare une chaîne. `INVALID_MUTATION_ID`, que le
 * doc-comment du middleware promet, n'atteignait donc AUCUN client.
 *
 * Ce témoin monte une VRAIE app avec le schéma d'erreur de production et lit
 * ce qui sort.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared';

import { registerClientMutationIdHook } from '../../../middleware/clientMutationId';

/**
 * Une route d'écriture ORDINAIRE : elle déclare son 400 avec la constante que
 * le dépôt impose (`errorResponseSchema`), comme les routes réelles. C'est
 * cette déclaration, et elle seule, qui révèle le défaut.
 */
async function monterApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerClientMutationIdHook(app);
  app.post('/sonde', {
    schema: {
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        400: errorResponseSchema,
      },
    },
  }, async () => ({ success: true }));
  await app.ready();
  return app;
}

const CMIDS_REFUSES = [
  ['un identifiant hors format', 'sonde-4359-1788085000'],
  ['un uuid sans le préfixe', '550e8400-e29b-41d4-a716-446655440000'],
  ['un uuid en majuscules', 'cmid_550E8400-E29B-41D4-A716-446655440000'],
] as const;

describe("l'enveloppe SERVIE d'un cmid refusé (#4434)", () => {
  it.each(CMIDS_REFUSES)('sert le CODE, jamais « [object Object] » — %s', async (_libelle, cmid) => {
    const app = await monterApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/sonde',
        headers: { 'x-client-mutation-id': cmid },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const corps = res.json();
      // L'assertion qui tombe sur le défaut : `error` est la CHAÎNE que
      // l'enveloppe déclare, et elle porte le code que le doc-comment promet.
      expect(corps.error).toBe('INVALID_MUTATION_ID');
      expect(corps.success).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('sert aussi le MESSAGE, que le client lit AVANT le code', async () => {
    // `api.service.ts` lit `data.message || data.error` : un message enfermé
    // dans un objet coercé disparaît avec lui, et c'est le texte que
    // l'utilisateur voit.
    const app = await monterApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/sonde',
        headers: { 'x-client-mutation-id': 'pas-un-cmid' },
        payload: {},
      });
      expect(res.json().message).toBe('Invalid cmid format');
    } finally {
      await app.close();
    }
  });

  it('laisse passer un cmid BIEN formé — la garde ne refuse pas tout', async () => {
    const app = await monterApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/sonde',
        headers: { 'x-client-mutation-id': 'cmid_550e8400-e29b-41d4-a716-446655440000' },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
