/**
 * LA DÉRIVE D'INSERTION, ET CE QUI LA DISTINGUE D'UNE ABSENCE DE MESURE (#7110).
 *
 * `check-thread-virtualization.mjs` tire des pages d'historique et mesure, à
 * chaque couture, de combien a bougé une rangée qu'il avait repérée. Quand cette
 * rangée disparaît du document, le tirage rend `drift: null` — il n'y a pas de
 * mesure, et il n'y en a pas non plus de « zéro ».
 *
 * L'agrégat naïf confondait les deux :
 *
 *     let insertionJump = 0;
 *     if (pull.drift === null) lostAnchor += 1;
 *     else insertionJump = Math.max(insertionJump, pull.drift);
 *
 * `insertionJump` restait à son initialisation, et le gate imprimait
 * « saut à l'insertion 0 px » **au moment précis où il n'avait pas pu mesurer**.
 * Mesuré par test de mutation le 2026-09-19 : ancrage retiré, la ligne chiffrée
 * disait toujours `0 px`, et seules des assertions voisines faisaient rougir.
 *
 * LE TYPE SOMME EST LE CONTRAT, comme pour `paintedAt` (#7048) : une sentinelle
 * numérique (`-1`, `NaN`) se compare — donc se compare MAL, et `NaN <= 2` rend
 * un verdict silencieux. Le type somme force l'appelant à traiter la branche
 * « pas de mesure », ce qui est tout l'objet de l'issue.
 */

/** En deçà de deux insertions, il n'y a pas de quoi conclure à une dérive. */
const INSERTIONS_MINIMALES = 2;

/**
 * Agrège les tirages de pages en un verdict de dérive.
 *
 * @param {ReadonlyArray<{ drift: number | null }>} pulls
 * @returns {{ genre: 'mesurée', max: number, pages: number }
 *          | { genre: 'non-mesurable', perdues: number, pages: number }
 *          | { genre: 'aucune-page', pages: number }}
 */
export function insertionDrift(pulls) {
  const pages = pulls.length;
  if (pages < INSERTIONS_MINIMALES) return { genre: 'aucune-page', pages };

  const perdues = pulls.filter((p) => p.drift === null).length;
  /* UNE seule ancre perdue suffit. Le maximum des tirages RESTANTS répondrait à
     une autre question — « parmi ce qu'on a pu voir, quel est le pire ? » — et
     c'est précisément la question qui rassure à tort. */
  if (perdues > 0) return { genre: 'non-mesurable', perdues, pages };

  const max = pulls.reduce((haut, p) => Math.max(haut, p.drift ?? 0), 0);
  return { genre: 'mesurée', max, pages };
}

/**
 * La ligne imprimée pour ce verdict — un chiffre SEULEMENT sur une mesure.
 *
 * @param {ReturnType<typeof insertionDrift>} verdict
 * @returns {string}
 */
export function driftLine(verdict) {
  if (verdict.genre === 'mesurée') return `${Math.round(verdict.max)} px`;
  if (verdict.genre === 'non-mesurable') {
    return `non mesurable — ancre perdue ${verdict.perdues} fois sur ${verdict.pages} insertions`;
  }
  return `non mesurable — ${verdict.pages} insertion(s), il en faut ${INSERTIONS_MINIMALES}`;
}
