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
const MIN_INSERTIONS = 2;

/**
 * Agrège les tirages de pages en un verdict de dérive.
 *
 * @param {ReadonlyArray<{ drift: number | null }>} pulls
 * @returns {{ kind: 'measured', max: number, pages: number }
 *          | { kind: 'unmeasurable', lost: number, pages: number }
 *          | { kind: 'no-pages', pages: number }}
 */
export function insertionDrift(pulls) {
  const pages = pulls.length;
  if (pages < MIN_INSERTIONS) return { kind: 'no-pages', pages };

  const lost = pulls.filter((p) => p.drift === null).length;
  /* UNE seule ancre perdue suffit. Le maximum des tirages RESTANTS répondrait à
     une autre question — « parmi ce qu'on a pu voir, quel est le pire ? » — et
     c'est précisément la question qui rassure à tort. */
  if (lost > 0) return { kind: 'unmeasurable', lost, pages };

  const max = pulls.reduce((highest, p) => Math.max(highest, p.drift ?? 0), 0);
  return { kind: 'measured', max, pages };
}

/**
 * La ligne imprimée pour ce verdict — un chiffre SEULEMENT sur une mesure.
 *
 * @param {ReturnType<typeof insertionDrift>} verdict
 * @returns {string}
 */
export function driftLine(verdict) {
  if (verdict.kind === 'measured') return `${Math.round(verdict.max)} px`;
  if (verdict.kind === 'unmeasurable') {
    return `non mesurable — ancre perdue ${verdict.lost} fois sur ${verdict.pages} insertions`;
  }
  return `non mesurable — ${verdict.pages} insertion(s), il en faut ${MIN_INSERTIONS}`;
}
