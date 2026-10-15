/**
 * **« ALLER À… » DANS LE MENU D'ADMINISTRATION** (#10562) — la règle de filtrage, pure.
 *
 * Une section reste quand CHAQUE mot tapé se trouve dans son libellé ou celui de son groupe,
 * sans tenir compte de la casse ni des accents : « jour aud » trouve « Journal d’audit »,
 * « comptes » trouve « Comptes », « personnes » garde tout le groupe Personnes. Une recherche
 * vide garde tout.
 */
export const foldForSearch = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim();

export function matchesNavQuery(query: string, haystack: readonly string[]): boolean {
  const words = foldForSearch(query).split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return true;
  const text = foldForSearch(haystack.join(' '));
  return words.every((word) => text.includes(word));
}
