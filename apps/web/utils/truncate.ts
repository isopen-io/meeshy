/**
 * Source unique des utilitaires de **troncature** de texte.
 *
 * `truncateFilename` — tronque un nom de fichier en **préservant l'extension**
 * (« rapport-annuel-2026.pdf » → « rapport-an….pdf »). Avant iter 62, réimplémenté
 * à l'identique dans `markdown/MarkdownViewer.tsx` et `pdf/PDFViewerWrapper.tsx`.
 *
 * `truncateText` — tronque un texte et **signale** s'il a été tronqué (pour rendre
 * un bouton « voir plus », etc.). Avant iter 62, réimplémenté à l'identique dans
 * `v2/MediaAudioCard.tsx` et `v2/MediaVideoCard.tsx`.
 *
 * Purs et déterministes (aucune dépendance externe).
 */

/**
 * Prend au plus `max` **unités UTF-16** depuis le début de `value`, sans JAMAIS
 * couper une paire de substitution (emoji hors BMP, CJK étendu…). Un caractère
 * astral qui déborderait la limite est écarté en entier — jamais réduit à sa
 * demi-paire haute isolée (`\uD83C`), qui rendrait un glyphe cassé `�`.
 *
 * Même doctrine « découper par point de code, jamais par unité UTF-16 » que
 * {@link ../utils/initials.ts} (getInitials). Garantit `result.length <= max`.
 */
function sliceCodePoints(value: string, max: number): string {
  if (max <= 0) return '';
  let out = '';
  for (const cp of value) {
    if (out.length + cp.length > max) break;
    out += cp;
  }
  return out;
}

export function truncateFilename(filename: string, maxLength: number = 32): string {
  if (filename.length <= maxLength) return filename;

  // An ellipsis form ("x...") needs at least 1 content char + "..." = 4 chars.
  // Below that budget any ellipsis output can only overrun maxLength, so degrade
  // to a bare slice — honoring the documented "never exceeds maxLength" invariant.
  if (maxLength <= 3) return sliceCodePoints(filename, Math.max(0, maxLength));

  const dot = filename.lastIndexOf('.');
  const head = (budget: number) => `${sliceCodePoints(filename, Math.max(1, budget))}...`;

  // No usable extension (no dot, or a leading-dot dotfile like ".gitignore"):
  // a plain head + ellipsis truncation, clamped so the result never exceeds
  // maxLength — the previous code emitted "....{wholeName}" here (longer than
  // the input).
  if (dot <= 0) return head(maxLength - 3);

  const ext = filename.slice(dot + 1);
  const nameBudget = maxLength - ext.length - 4; // 4 = "..." ellipsis + "." separator
  // The extension alone fills (or overruns) the budget: drop it rather than
  // emit a string longer than maxLength (the previous code overflowed here too).
  if (nameBudget < 1) return head(maxLength - 3);

  return `${sliceCodePoints(filename, nameBudget)}....${ext}`;
}

/**
 * Tronque `text` en signalant s'il a été tronqué (pour rendre un « voir plus »).
 *
 * CONTRAT — distinct de {@link truncateFilename} :
 * - `maxLength` est un budget de **contenu**, PAS une longueur totale. L'ellipse
 *   `...` est ajoutée EN SUS, donc `truncated` peut atteindre `maxLength + 3`.
 *   (`truncateFilename`, à l'inverse, garantit de ne JAMAIS dépasser `maxLength`.)
 * - L'espace de fin est trimé avant l'ellipse (« hello » et non « hello  … »).
 * - `isTruncated` vaut `true` dès que le texte dépasse `maxLength` **caractères**
 *   (points de code) — un emoji hors BMP compte pour 1, et l'ellipse n'est jamais
 *   collée à une demi-paire de substitution isolée (glyphe cassé `�`).
 *
 * @example truncateText('hello world foo', 6) → { truncated: 'hello...', isTruncated: true }  // 8 > 6
 */
export function truncateText(
  text: string,
  maxLength: number
): { truncated: string; isTruncated: boolean } {
  const chars = [...text];
  if (chars.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }
  return { truncated: chars.slice(0, maxLength).join('').trim() + '...', isTruncated: true };
}
