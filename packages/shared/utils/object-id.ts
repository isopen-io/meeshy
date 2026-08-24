/**
 * SSOT du prédicat « chaîne = ObjectId MongoDB » pour le package shared.
 *
 * Un ObjectId MongoDB est exactement 24 caractères hexadécimaux (casse
 * indifférente). Cette règle vivait recopiée sur QUATRE sites du package —
 * deux prédicats inline (`isValidMongoId` dans `conversation-helpers.ts`,
 * `isValidObjectId` dans `types/migration-utils.ts`) et deux schémas Zod
 * (`CommonSchemas.mongoId` dans `utils/validation.ts`, `mongoIdSchema` dans
 * `types/validation.ts`) — ces derniers portant même DEUX formes syntaxiques
 * de la même regex (`/^[a-f\d]{24}$/i` vs `/^[0-9a-fA-F]{24}$/`). Deux copies
 * d'une règle tenues par la vigilance dérivent : la première qui change casse
 * la sémantique sans qu'aucune autre ne le sache.
 *
 * Miroir des SSOT sœurs, un par package : `apps/web/utils/object-id.ts`
 * (`OBJECT_ID_REGEX` / `isValidObjectId`) et `services/gateway/src/utils/object-id.ts`.
 * Les trois portent le même nom de constante et de fonction pour rester
 * repérables d'un package à l'autre.
 *
 * Module feuille (aucun import) : consommable depuis `utils/` comme depuis
 * `types/` sans risque de cycle, à l'image de `client-message-id.ts`.
 */
export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Type guard : `true` uniquement pour une chaîne de 24 caractères hexadécimaux.
 * Rejette d'emblée les entrées non-string (`null`, `undefined`, nombre, objet).
 */
export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}
