/**
 * Le SEUL cas de la famille « required déclaré, non posé » que #4863 nomme
 * explicitement — et la raison pour laquelle il ne peut PAS être couvert par
 * le balayage générique (`response-required-field-sweep.ts`) : le producteur
 * n'est pas un `sendSuccess(reply, …)` de route, c'est
 * `schemaValidationErrorResponse`, appelé depuis le gestionnaire d'erreur
 * GLOBAL (`server.ts`), jamais depuis un handler de route.
 *
 * `validationErrorResponseSchema` ne déclare PAS `required: ['success']` —
 * mesuré en CI (#4863, PR #5205) : ce schéma sert aussi de réponse `400` à des
 * routes montées SANS le gestionnaire d'erreur global (patron de test courant
 * du dépôt), où un refus Ajv de `body` est rendu par le comportement PAR
 * DÉFAUT de Fastify, sans `success`. Un `required` sur ce schéma aurait fait
 * ÉCHOUER la sérialisation de cette réponse-là (`fast-json-stringify` refuse
 * de sérialiser un `required` absent), transformant son 400 en 500. `success`
 * est donc un invariant du SEUL producteur `schemaValidationErrorResponse`,
 * jamais du schéma partagé par tous les producteurs d'un 400 — ce témoin
 * l'affirme directement, sans passer par une déclaration `required` qui
 * mentirait sur les autres.
 *
 * Preuve par mutation (#4863 critère 3, la mutation exacte de #4688) :
 * retirer `success: false,` de `schemaValidationErrorResponse` fait tomber ce
 * témoin — mesuré, puis production restaurée.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';

describe('schemaValidationErrorResponse pose `success` (#4863)', () => {
  it('pose `success`, `error`, `message`, `code` et `details`', () => {
    const response = schemaValidationErrorResponse({
      validation: [{ instancePath: '/password', message: 'must NOT have fewer than 6 characters' }],
      message: 'body/password must NOT have fewer than 6 characters',
    });

    expect(response).not.toBeNull();
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('error');
    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('code');
    expect(response).toHaveProperty('details');
  });

  it('spécifiquement : `success` vaut `false`, jamais `undefined`', () => {
    // `if (body.success === false)` — la forme qu'un contrat typé encourage —
    // ne reconnaissait pas un refus dont `success` était absent (#4688). Ce
    // témoin nomme le champ, `toHaveProperty` seul ne distinguerait pas
    // `{ success: undefined }` d'une clé manquante selon le matcher utilisé.
    const response = schemaValidationErrorResponse({
      validation: [{ params: { missingProperty: 'email' }, message: "must have required property 'email'" }],
    });

    expect(response?.success).toBe(false);
  });
});
