/**
 * Source unique de validation d'ObjectId MongoDB (24 caractères hexadécimaux).
 *
 * Toute vérification de format ObjectId côté web doit passer par ce module —
 * ne pas réimplémenter la regex `/^[0-9a-fA-F]{24}$/` en ligne.
 */

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Vérifie qu'une valeur est un ObjectId MongoDB valide.
 * Retourne `false` pour toute valeur non-chaîne (null, undefined, etc.).
 */
export function isValidObjectId(id: string): boolean {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}
