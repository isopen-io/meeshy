/**
 * Comparaison d'identités (prénom + nom) pour la récupération de compte.
 *
 * Quand un numéro de téléphone appartient déjà à un compte dormant, on compare
 * l'identité déclarée à l'inscription avec celle du compte existant pour
 * décider s'il faut proposer la récupération plutôt qu'un simple transfert.
 */

export type NameSimilarity = 'exact' | 'similar' | 'different';

export interface FullName {
  firstName: string;
  lastName: string;
}

const SIMILARITY_THRESHOLD = 0.62;

/**
 * `NFD` + strip des marques diacritiques (`\p{M}`) replie les accents latins
 * (`José` → `jose`), puis on ne conserve que lettres/chiffres Unicode
 * (`\p{L}\p{N}`) — jamais uniquement l'ASCII : l'inscription autorise tout
 * `\p{L}` (validation `register`), donc un nom cyrillique/arabe/CJK doit
 * survivre à la normalisation au lieu d'être réduit à une chaîne vide.
 */
function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSortedFullName(name: FullName): string {
  const tokens = normalizeName(`${name.firstName} ${name.lastName}`)
    .split(' ')
    .filter(Boolean)
    .sort();
  return tokens.join(' ');
}

function bigrams(value: string): Map<string, number> {
  const grams = new Map<string, number>();
  const padded = ` ${value} `;
  Array.from({ length: padded.length - 1 }, (_, i) => padded.slice(i, i + 2))
    .forEach((gram) => grams.set(gram, (grams.get(gram) ?? 0) + 1));
  return grams;
}

/**
 * Coefficient de Sørensen–Dice sur bigrammes — robuste aux petites fautes de
 * frappe et aux noms composés partiellement identiques.
 */
function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  const totalA = Array.from(gramsA.values()).reduce((sum, n) => sum + n, 0);
  const totalB = Array.from(gramsB.values()).reduce((sum, n) => sum + n, 0);
  const overlap = Array.from(gramsA.entries()).reduce(
    (sum, [gram, count]) => sum + Math.min(count, gramsB.get(gram) ?? 0),
    0
  );
  return (2 * overlap) / (totalA + totalB);
}

export function compareFullNames(a: FullName, b: FullName): NameSimilarity {
  const sortedA = tokenSortedFullName(a);
  const sortedB = tokenSortedFullName(b);

  if (!sortedA || !sortedB) return 'different';
  if (sortedA === sortedB) return 'exact';

  return diceCoefficient(sortedA, sortedB) >= SIMILARITY_THRESHOLD
    ? 'similar'
    : 'different';
}
