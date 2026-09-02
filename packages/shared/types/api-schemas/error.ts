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
 *
 * ## Cette liste est FERMÉE côté gestionnaire global (#4689)
 *
 * `fast-json-stringify` ne supprime que là où un schéma EXISTE. Le gestionnaire
 * d'erreurs global posait donc, sur toutes ses branches, des champs que ce
 * superset ne déclare pas — `timestamp` et `statusCode` sur les deux branches
 * typées, `details` sur les deux 413 de taille, `stack` sur le repli. La MÊME
 * erreur typée sortait alors en deux corps différents :
 *
 *   429 **déclaré** `...errorResponseSchema` → `{success, error, message, code, retryAfter}`
 *   429 **non déclaré**                      → `… + statusCode + timestamp`
 *
 * > **Le geste vertueux — déclarer son schéma — était celui qui faisait perdre
 * > des champs**, sur 595 déclarations de statut 4xx/5xx dans 112 modules de
 * > routes. Chaque déclaration ajoutée au dépôt était une régression muette.
 *
 * Le remède retenu n'est PAS d'ajouter les deux champs ici — ce serait graver
 * dans 595 déclarations deux champs qu'aucun client ne lit, et laisser le
 * MÉCANISME intact pour le champ suivant. Mesuré sur les trois clients avant
 * de trancher : aucun ne lit `statusCode` ni `timestamp` dans un corps
 * d'erreur (web : 6 occurrences, toutes doc-comment ou fixture ; iOS : aucun
 * modèle `Decodable` ne les porte, `MeeshyError.server(statusCode:)` est
 * construit depuis `HTTPURLResponse` ; Android : 11 occurrences, toutes
 * paramètre de la couche HTTP dans `LinkPreviewFetcher`). Le gestionnaire a
 * donc CESSÉ de les poser, et le statut HTTP continue de porter l'information
 * de `statusCode` — pour tout le monde, y compris pour qui ne décode pas le
 * corps.
 *
 * Ce qu'un étalement du gestionnaire apporte ENCORE en plus de ce superset est
 * un inventaire de QUATRE champs, gelé et justifié un par un dans la garde :
 * `details` (déclaré par `validationErrorResponseSchema`), `retryAfter`
 * (déclaré par les routes sur leur 429), `errors` et `lockedUntil` (déclarés
 * NULLE PART — la protection de #4138 ne tient que parce qu'aucune route ne
 * déclare son 423).
 *
 * La relation « ce que le gestionnaire POSE ⊆ ce que ce schéma DÉCLARE » n'est
 * pas une intention : elle est mesurée à chaque exécution des tests par
 * `services/gateway/src/__tests__/security/global-error-handler-field-closure-guard.test.ts`.
 * Elle se satisfait des DEUX côtés — retirer le champ du gestionnaire, ou le
 * déclarer ici — ce qui est exactement ce qu'on veut d'une garde : elle
 * interdit la DIVERGENCE, pas un choix de remède.
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
