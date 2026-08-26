/**
 * Le cliquet des schémas de réponse d'ERREUR.
 *
 * Le cycle 89 a réparé onze `400` écrits à la main qui supprimaient `error`,
 * `message` ou `code`. Il les avait trouvés par le balayage frère — donc par
 * accident : ces onze-là portaient AUSSI un tableau nu, ce qui les rendait
 * visibles. Le balayage frère ne voit pas une déclaration INCOMPLÈTE, seulement
 * une déclaration ABSENTE (cycle 91).
 *
 * Ce balayage-ci voit l'incomplétude, parce que l'erreur a un producteur
 * UNIQUE (`utils/response.ts:sendError`) et donc un superset connu. Il rend
 * l'inventaire VIDE plutôt que gelé : il n'y a pas de dette d'erreur légitime
 * à porter, la forme juste étant toujours la même constante partagée.
 *
 * Quand ce témoin tombe : un schéma d'erreur écrit à la main vient d'entrer, et
 * il supprime de la réponse SERVIE les clés qu'il ne déclare pas. La réparation
 * est d'étaler `errorResponseSchema` (ou `validationErrorResponseSchema` pour un
 * 400 de validation) et de garder EN PLUS les clés propres à la route que le
 * site déclarait — le `retryAfter` d'un 429, par exemple. Les perdre serait
 * échanger une troncature contre une autre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types/api-schemas';

import { ENVELOPE_KEYS, scanErrorSchemas, sweepErrorSchemas } from './error-schema-sweep';

const ROUTES_DIR = join(__dirname, '..');

describe('enveloppe d’erreur — les constantes partagées déclarent le producteur', () => {
  /**
   * La racine du défaut de ce cycle. `errorResponseSchema` déclarait `success`,
   * `error` et `code` — mais pas `message`, que `sendError` pose TOUJOURS
   * (`message: options?.message || error`). Trois cent cinquante-quatre déclarations l'étalent :
   * tous servaient une erreur amputée de sa phrase lisible, celle que
   * `api.service.ts:239` lit EN PREMIER (`data.message || data.error`).
   */
  it.each([
    ['errorResponseSchema', errorResponseSchema],
    ['validationErrorResponseSchema', validationErrorResponseSchema],
  ])('%s déclare les quatre clés que `sendError` pose toujours', (_name, schema) => {
    const declared = Object.keys((schema as { properties: Record<string, unknown> }).properties);

    expect(ENVELOPE_KEYS.filter((k) => !declared.includes(k))).toEqual([]);
  });

  it('`errorResponseSchema` déclare `violations`, que `sendError` pose sur demande', () => {
    const declared = Object.keys(errorResponseSchema.properties);

    expect(declared).toContain('violations');
  });
});

describe('balayage — aucun schéma d’erreur n’ampute l’enveloppe', () => {
  it('ne trouve aucun site tronquant dans les routes', () => {
    const actual = sweepErrorSchemas(ROUTES_DIR).map(
      (s) => `${s.file}|${s.statusCode}|-${s.missing.join(',')}|~${s.mistyped.join(',')}`
    );

    expect(actual).toEqual([]);
  });
});

describe('balayage d’erreur — ce qu’il discrimine', () => {
  it('signale un schéma qui omet `code`', () => {
    const source = `
      fastify.post('/x', { schema: { response: { 429: {
        type: 'object',
        properties: {
          success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' }
        }
      } } } });`;

    expect(scanErrorSchemas(source, 'x.ts')).toEqual([
      { file: 'x.ts', statusCode: '429', missing: ['code'], mistyped: [], extras: [] },
    ]);
  });

  /**
   * La forme que `calls.ts` portait sur ses dix-neuf schémas : une déclaration
   * COMPLÈTE en apparence, qui servait `{"success":false,"error":{}}` parce que
   * `sendError` pose une chaîne là où le schéma annonçait un objet.
   */
  it('signale une clé d’enveloppe déclarée du MAUVAIS type', () => {
    const source = `
      fastify.post('/x', { schema: { response: { 400: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'object', properties: { code: { type: 'string' } } }
        }
      } } } });`;

    const [site] = scanErrorSchemas(source, 'x.ts');
    expect(site).toMatchObject({ missing: ['message', 'code'], mistyped: ['error'] });
  });

  it('ne prend pas le `type` d’une propriété IMBRIQUÉE pour celui de la clé', () => {
    const source = `
      fastify.post('/x', { schema: { response: { 400: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { description: 'Code', type: 'string' },
          message: { type: 'string' },
          code: { type: 'string' }
        }
      } } } });`;

    expect(scanErrorSchemas(source, 'x.ts')).toEqual([]);
  });

  it('rapporte les clés HORS enveloppe, pour qu’une réparation ne les perde pas', () => {
    const source = `
      fastify.post('/x', { schema: { response: { 429: {
        type: 'object',
        properties: {
          success: { type: 'boolean' }, message: { type: 'string' },
          retryAfter: { type: 'number' }
        }
      } } } });`;

    const [site] = scanErrorSchemas(source, 'x.ts');
    expect(site).toMatchObject({ missing: ['error', 'code'], mistyped: [], extras: ['retryAfter'] });
  });

  it('tient un étalement de constante partagée pour complet', () => {
    const source = `
      fastify.post('/x', { schema: { response: {
        404: { description: 'Nope', ...errorResponseSchema }
      } } });`;

    expect(scanErrorSchemas(source, 'x.ts')).toEqual([]);
  });

  it('laisse passer `additionalProperties: true`, qui ne tronque rien', () => {
    const source = `
      fastify.post('/x', { schema: { response: { 404: {
        type: 'object', additionalProperties: true, properties: { error: { type: 'string' } }
      } } } });`;

    expect(scanErrorSchemas(source, 'x.ts')).toEqual([]);
  });

  it('ignore les statuts de SUCCÈS, dont le producteur n’est pas `sendError`', () => {
    const source = `
      fastify.post('/x', { schema: { response: { 200: {
        type: 'object', properties: { id: { type: 'string' } }
      } } } });`;

    expect(scanErrorSchemas(source, 'x.ts')).toEqual([]);
  });

  it('ne compte pas un schéma d’erreur cité dans un COMMENTAIRE', () => {
    const source = `
      // 404: { type: 'object', properties: { error: { type: 'string' } } }
      fastify.post('/x', { schema: { response: {
        404: { ...errorResponseSchema }
      } } });`;

    expect(scanErrorSchemas(source, 'x.ts')).toEqual([]);
  });
});
