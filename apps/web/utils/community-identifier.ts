/**
 * Utilitaire pour générer des identifiants de communauté
 *
 * Format: titre-normalise-XXXXXX (6 caractères aléatoires)
 */

/**
 * Replie les diacritiques latins vers leur lettre ASCII de base
 * (`é` → `e`, `ç` → `c`, `ê` → `e`…) avant tout strip ASCII.
 *
 * Sans ce pliage, la classe `[^a-z0-9…]` **supprime** la lettre accentuée au lieu
 * de la conserver : `Café` → `caf`, `François` → `franois` — des slugs mutilés sur
 * un produit à français primaire. Même doctrine que `name-similarity.normalizeName`
 * (gateway) et le Prisme Linguistique : les noms accentués sont de première classe.
 *
 * Les scripts sans décomposition ASCII (cyrillique, CJK…) restent inchangés — leur
 * base finit vide et l'appelant applique son préfixe neutre.
 */
const foldDiacritics = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Génère un identifiant de communauté à partir du titre
 * Le format est: titre-normalise-XXXXXX où XXXXXX sont 6 caractères aléatoires
 * 
 * @param title Le titre de la communauté
 * @returns L'identifiant généré
 */
export function generateCommunityIdentifier(title: string): string {
  // Normaliser le titre
  const normalizedTitle = foldDiacritics(title.toLowerCase())
    .replace(/[^a-z0-9\s]/g, '') // Garder seulement lettres, chiffres et espaces (diacritiques déjà repliés)
    .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
    .replace(/-+/g, '-') // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, '') // Supprimer les tirets en début et fin
    .substring(0, 50); // Limiter la longueur

  // Générer 6 caractères aléatoires (a-z0-9)
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  // Combiner le titre normalisé avec le suffixe aléatoire
  if (normalizedTitle) {
    return `${normalizedTitle}-${randomSuffix}`;
  }
  
  // Si le titre est vide après normalisation, utiliser un préfixe par défaut
  return `community-${randomSuffix}`;
}

/**
 * Valide un identifiant de communauté
 * Autorise: lettres minuscules, chiffres, tirets, underscores et @
 * 
 * @param identifier L'identifiant à valider
 * @returns true si l'identifiant est valide, false sinon
 */
export function validateCommunityIdentifier(identifier: string): boolean {
  if (!identifier || identifier.length === 0) {
    return false;
  }
  
  // Vérifier que l'identifiant ne contient que des caractères autorisés
  const regex = /^[a-z0-9\-_@]+$/;
  return regex.test(identifier);
}

/**
 * Nettoie un identifiant de communauté en enlevant les caractères invalides
 * 
 * @param identifier L'identifiant à nettoyer
 * @returns L'identifiant nettoyé
 */
export function sanitizeCommunityIdentifier(identifier: string): string {
  return foldDiacritics(identifier.toLowerCase())
    .replace(/[^a-z0-9\-_@]/g, '') // Enlever les caractères invalides (diacritiques déjà repliés)
    .replace(/-+/g, '-') // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, ''); // Supprimer les tirets en début et fin
}

