/**
 * Prisme linguistique des vues : dans QUELLE langue un contenu a été consommé.
 *
 * Meeshy affiche le même message dans autant de langues qu'il y a de lecteurs.
 * « Qui a lu » sans « dans quelle langue » perd la moitié de l'information :
 * l'auteur ignore si son texte a été compris tel qu'il l'a écrit ou à travers
 * une traduction, et laquelle. La résolution était jusqu'ici calculée à la volée
 * côté client puis perdue.
 *
 * Un lecteur peut basculer de version en cours de route — l'original puis la
 * traduction, ou l'inverse. On garde donc un ENSEMBLE, pas une dernière valeur :
 * les deux versions ont réellement été consultées.
 *
 * Réutilise `normalizeLanguageCode` de `@meeshy/shared`, seule autorité du repo
 * sur la forme d'un code de langue — les codes 3-lettres supportés (`bas`,
 * `ewo`…) ne doivent jamais être tronqués à deux lettres.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 * @see packages/shared/utils/language-normalize.ts
 */

import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

/**
 * Plafond du nombre de langues retenues par lecteur et par contenu.
 *
 * Purement défensif : personne ne consulte sérieusement un même message dans
 * douze langues. Au-delà, les PREMIÈRES apparues sont conservées — la première
 * est celle résolue d'emblée, donc la plus informative.
 */
export const MAX_VIEWED_LANGUAGES = 12;

function toCodes(input: unknown): string[] {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];

  const codes: string[] = [];
  for (const candidate of raw) {
    if (typeof candidate !== 'string') continue;
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) codes.push(normalized);
  }
  return codes;
}

/**
 * Union de l'ensemble connu et des langues d'un nouveau rapport.
 *
 * L'ordre d'APPARITION est préservé : la première entrée est la version
 * initialement servie au lecteur, les suivantes ses bascules. L'existant est
 * re-normalisé au passage — une valeur écrite par une version antérieure, ou une
 * locale complète arrivée telle quelle, ne doit pas créer un doublon (`fr-FR` et
 * `fr` désignent la même version).
 */
export function mergeViewedLanguages(
  existing: unknown,
  incoming: unknown
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const code of [...toCodes(existing), ...toCodes(incoming)]) {
    if (seen.has(code)) continue;
    seen.add(code);
    merged.push(code);
    if (merged.length >= MAX_VIEWED_LANGUAGES) break;
  }

  return merged;
}

/**
 * Répartition des lecteurs par langue consultée — ce que l'auteur veut voir.
 *
 * Un lecteur qui a basculé compte dans CHACUNE des langues qu'il a consultées :
 * il a bien vu les deux versions. La somme des compteurs peut donc dépasser le
 * nombre de lecteurs, et c'est exact.
 *
 * Classement par nombre décroissant, puis par code pour que deux exécutions
 * rendent toujours le même ordre.
 */
export function languageBreakdown(
  entries: ReadonlyArray<{ viewedLanguages?: readonly string[] | null }>
): Array<{ language: string; count: number }> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    // Un même lecteur ne compte qu'une fois par langue, même si sa liste
    // contenait un doublon.
    for (const code of new Set(toCodes(entry?.viewedLanguages))) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language));
}
