/**
 * L'abrégé d'un compteur — miroir `CompactCountLabel` (iOS), qui l'a sorti de
 * sept copies pour la raison qui vaut ici : `1.3K` n'est pas un nombre en
 * français, qui écrit `1,3 k`. CLDR décide du séparateur ET de l'abréviation,
 * et de la précision : une décimale sous 10 (« 1,2 k », « 2,5 M »), aucune
 * au-delà (« 12 k ») — la forme que rend Foundation côté iOS (#9044).
 */
export function compactCount(count: number, language: string): string {
  return new Intl.NumberFormat(language, { notation: 'compact' }).format(count);
}
