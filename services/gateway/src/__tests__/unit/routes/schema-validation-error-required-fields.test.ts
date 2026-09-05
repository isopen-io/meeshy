/**
 * Le SEUL cas de la famille « required déclaré, non posé » que #4863 nomme
 * explicitement — et la raison pour laquelle il ne peut PAS être couvert par
 * le balayage générique (`response-required-field-sweep.ts`) : le producteur
 * n'est pas un `sendSuccess(reply, …)` de route, c'est
 * `schemaValidationErrorResponse`, appelé depuis le gestionnaire d'erreur
 * GLOBAL (`server.ts`), jamais depuis un handler de route.
 *
 * `validationErrorResponseSchema` déclare désormais `required: ['success']`
 * (#4863) — l'invariant que #4688 a rendu vrai : TOUT producteur de ce schéma
 * pose `success`. Ce témoin appelle le VRAI producteur, jamais une copie, et
 * vérifie que sa sortie porte chaque champ que le schéma exige.
 *
 * Preuve par mutation (#4863 critère 3, la mutation exacte de #4688) :
 * retirer `success: false,` de `schemaValidationErrorResponse` fait tomber ce
 * témoin — mesuré, puis production restaurée.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { validationErrorResponseSchema } from '@meeshy/shared/types';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';

describe('schemaValidationErrorResponse × validationErrorResponseSchema.required (#4863)', () => {
  it('pose tous les champs que le schéma déclare `required`', () => {
    const response = schemaValidationErrorResponse({
      validation: [{ instancePath: '/password', message: 'must NOT have fewer than 6 characters' }],
      message: 'body/password must NOT have fewer than 6 characters',
    });

    expect(response).not.toBeNull();
    for (const field of validationErrorResponseSchema.required) {
      expect(response).toHaveProperty(field);
    }
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
