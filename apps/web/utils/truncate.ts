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

export function truncateFilename(filename: string, maxLength: number = 32): string {
  if (filename.length <= maxLength) return filename;

  const dot = filename.lastIndexOf('.');
  const head = (budget: number) => `${filename.slice(0, Math.max(1, budget))}...`;

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

  return `${filename.slice(0, nameBudget)}....${ext}`;
}

export function truncateText(
  text: string,
  maxLength: number
): { truncated: string; isTruncated: boolean } {
  if (text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }
  return { truncated: text.slice(0, maxLength).trim() + '...', isTruncated: true };
}
