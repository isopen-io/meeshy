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
  const dotIndex = filename.lastIndexOf('.');
  const hasExtension = dotIndex > 0;
  const ext = hasExtension ? filename.slice(dotIndex + 1) : '';
  const nameWithoutExt = hasExtension ? filename.slice(0, dotIndex) : filename;
  const reserved = 3 + (hasExtension ? ext.length + 1 : 0);
  const keep = Math.max(1, maxLength - reserved);
  const truncatedName = nameWithoutExt.slice(0, keep) + '...';
  return hasExtension ? `${truncatedName}.${ext}` : truncatedName;
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
