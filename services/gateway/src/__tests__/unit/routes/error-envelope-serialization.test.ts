/**
 * L'enveloppe d'erreur atteint-elle le fil ?
 *
 * `utils/response.ts` produit, pour toute erreur :
 *
 *   { ...details, success: false, error, message, code, violations? }
 *
 * `details` est ÉTALÉ à la racine — ce n'est pas une clé — et le seul tableau
 * que l'enveloppe sache porter s'appelle `violations`.
 *
 * Onze schémas `400` écrits à la main déclaraient pourtant un tableau
 * `details` ou `errors` au premier niveau (que rien ne pose), et omettaient
 * selon les cas `error`, `message` ou `code` — que fast-json-stringify
 * supprimait donc à la sérialisation.
 *
 * Portée réelle du défaut, dite sans l'enfler : le TEXTE survivait toujours,
 * parce que chaque schéma gardait `error` ou `message`, et que l'enveloppe pose
 * `message = message ?? error`. Ce qui se perdait, c'est l'AUTRE clé et,
 * surtout, `code` — qu'`api.service.ts:239` lit pour construire son
 * `ApiServiceError`. Aucun de ces onze chemins ne passe de `code` aujourd'hui :
 * c'était un piège armé, pas une panne. La première personne à en poser un
 * l'aurait vu disparaître en silence.
 *
 * Ces témoins figent l'enveloppe COMPLÈTE contre le schéma partagé, à travers
 * le vrai sérialiseur.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import { validationErrorResponseSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendBadRequest, sendError } from '../../../utils/response';

async function serve(schema: unknown, handler: (reply: any) => void) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.post('/x', { schema: { response: { 400: schema as never } } }, async (_req, reply) => {
    handler(reply);
  });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/x', payload: {} });
  await app.close();
  return res.json();
}

describe('enveloppe d’erreur — `validationErrorResponseSchema`', () => {
  it('sert `error`, `message` et `success`', async () => {
    const body = await serve(validationErrorResponseSchema, (reply) =>
      sendBadRequest(reply, 'Donnees invalides')
    );

    expect(body).toMatchObject({
      success: false,
      error: 'Donnees invalides',
      message: 'Donnees invalides',
    });
  });

  // Le piège que les onze schémas armaient : `code` déclaré nulle part, donc
  // supprimé — et `api.service.ts` le lit.
  it('sert `code` quand l’appelant en pose un', async () => {
    const body = await serve(validationErrorResponseSchema, (reply) =>
      sendBadRequest(reply, 'Pseudo pris', { code: 'USERNAME_TAKEN' })
    );

    expect(body.code).toBe('USERNAME_TAKEN');
  });

  // Le schéma déclare `violations.items` comme `{ path, message }` — c'est la
  // forme du contrat, et un élément d'une autre forme sortirait vide. Ce témoin
  // fige la forme DÉCLARÉE, pas celle qu'on aurait devinée.
  it('sert `violations` — le seul tableau que l’enveloppe porte', async () => {
    const body = await serve(validationErrorResponseSchema, (reply) =>
      sendError(reply, 400, 'Invalide', {
        violations: [{ path: 'email', message: 'requis' }],
      })
    );

    expect(body.violations).toEqual([{ path: 'email', message: 'requis' }]);
  });

  // `details` n'est PAS une clé de l'enveloppe : elle est étalée. Un schéma qui
  // déclare `details` ne décrit donc rien — c'est le défaut que ce lot retire.
  it('n’expose jamais une clé `details` — elle est ÉTALÉE à la racine', async () => {
    const body = await serve(
      { ...validationErrorResponseSchema,
        properties: { ...validationErrorResponseSchema.properties, suggestedNickname: { type: 'string' } } },
      (reply) => sendBadRequest(reply, 'Pseudo pris', { details: { suggestedNickname: 'alice_2' } })
    );

    expect(body.details).toBeUndefined();
    expect(body.suggestedNickname).toBe('alice_2');
  });
});

describe('enveloppe d’erreur — `errorResponseSchema` ne déclare pas `message`', () => {
  // Constat, pas correction : le schéma partagé le plus utilisé du dépôt ne
  // déclare que { success, error, code }. Le texte passe donc par `error`, et
  // `api.service.ts` lit `data.message || data.error` — d'où l'absence de
  // symptôme. Ce témoin fige le fait pour que l'ajout d'un lecteur de `message`
  // ne se découvre pas en production.
  it('sert `error` mais pas `message`', async () => {
    const body = await serve(errorResponseSchema, (reply) =>
      sendBadRequest(reply, 'Donnees invalides')
    );

    expect(body.error).toBe('Donnees invalides');
    expect(body.message).toBeUndefined();
  });
});
