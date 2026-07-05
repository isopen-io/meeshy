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

  const ELLIPSIS = '...';
  if (maxLength <= ELLIPSIS.length) return filename.slice(0, Math.max(0, maxLength));

  // Une extension n'existe que sur un point **interne** (`lastIndexOf > 0`) :
  // un point de tête (`.gitignore`) ou de queue (`fichier.`) n'en est pas une.
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1) : '';
  const nameBudget = maxLength - ext.length - ELLIPSIS.length - 1;

  // On préserve l'extension seulement s'il reste de la place pour au moins un
  // caractère de nom ; sinon on tronque tout le nom, borné par `maxLength`
  // (sans quoi un nom sans extension ou une extension trop longue produisait
  // une sortie plus longue que l'entrée).
  if (ext && nameBudget >= 1) {
    return `${filename.slice(0, nameBudget)}${ELLIPSIS}.${ext}`;
  }

  return `${filename.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
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
