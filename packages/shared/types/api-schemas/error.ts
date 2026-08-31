/**
 * Schémas d’API — réponses d’erreur.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/error
 */

// =============================================================================
// ERROR SCHEMAS
// =============================================================================

/**
 * Standard error response schema.
 *
 * Déclare EXACTEMENT ce que `utils/response.ts:sendError` produit — le
 * producteur unique de toutes les erreurs de la passerelle :
 *
 *   { ...details, success: false, error, message, code, violations? }
 *
 * `message` a manqué à cette liste jusqu'au cycle 92, alors que l'enveloppe le
 * pose TOUJOURS (`message: options?.message || error`). Trois cent cinquante-quatre déclarations
 * étalent cette constante : tous servaient une erreur amputée de sa phrase
 * lisible — celle que le client web lit EN PREMIER
 * (`api.service.ts:239`, `data.message || data.error`). Cent trente-huit appels
 * d'erreur passent aujourd'hui un `message` distinct de l'`error` ; c'est ce
 * texte-là qui se perdait.
 *
 * `details` n'est pas déclaré, et ne peut pas l'être : ce n'est pas une clé
 * mais un ÉTALEMENT à la racine, dont les clés sont propres à chaque route.
 * Une route qui en pose (`retryAfter`, `suggestedNickname`) les déclare EN PLUS
 * de ce superset, sans quoi le sérialiseur les supprime.
 */
export const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', description: 'Error message' },
    message: { type: 'string', description: 'Human-readable error message' },
    code: { type: 'string', description: 'Error code (optional)' },
    violations: {
      type: 'array',
      description: 'Per-field violations, when the route supplies them',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Field path that failed' },
          message: { type: 'string', description: 'Violation message' }
        }
      }
    }
  }
} as const;

/**
 * Validation error response schema
 */
export const validationErrorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', description: 'Validation error message' },
    message: { type: 'string', description: 'Human-readable validation error message' },
    code: { type: 'string', description: 'Machine-readable error code (e.g. VALIDATION_ERROR)' },
    violations: {
      type: 'array',
      description: 'Per-field validation violations (path + message)',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Field path that failed validation' },
          message: { type: 'string', description: 'Validation error message' }
        }
      }
    },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'Field that failed validation' },
          message: { type: 'string', description: 'Validation error message' }
        }
      }
    }
  }
} as const;
