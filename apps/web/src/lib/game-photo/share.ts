/**
 * LE PARTAGE DE LA PHOTO (#9382) — `navigator.share` avec fichiers quand le
 * système sait les partager (coque Android, Safari, Chrome mobile), sinon un
 * téléchargement. L'image NE PART PAS vers un serveur de Meeshy : elle sort
 * par la feuille de partage du système, à un geste de l'utilisateur, ou par un
 * fichier qu'il enregistre.
 *
 * Fermer la feuille (`AbortError`) est une ANNULATION, pas une erreur — on ne
 * lui répond pas par un téléchargement qu'il n'a pas demandé. Tout autre échec
 * du partage retombe sur le téléchargement.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

type ShareNavigator = {
  readonly canShare?: (data: ShareData) => boolean;
  readonly share?: (data: ShareData) => Promise<void>;
};

export async function shareImage(params: {
  readonly file: File;
  readonly title: string;
  readonly nav: ShareNavigator;
  readonly download: (file: File) => void;
}): Promise<ShareOutcome> {
  const { file, title, nav, download } = params;
  const data: ShareData = { files: [file], title };

  const canShareFiles = typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare(data);
  if (canShareFiles) {
    try {
      await nav.share?.(data);
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    download(file);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** Le téléchargement du navigateur : un lien éphémère vers un `Blob`. */
export function downloadFile(file: File, doc: Document): void {
  const url = URL.createObjectURL(file);
  const link = doc.createElement('a');
  link.href = url;
  link.download = file.name;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
