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

import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import { saveToGallery } from '@/lib/gallery/save-to-gallery';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

type ShareNavigator = {
  readonly canShare?: (data: ShareData) => boolean;
  readonly share?: (data: ShareData) => Promise<void>;
};

/** Le texte qui accompagne l'image (le lien de parrainage) ; un texte vide n'est pas un texte. */
const withText = (text: string | undefined): { readonly text?: string } => (text === undefined || text === '' ? {} : { text });

export async function shareImage(params: {
  readonly file: File;
  readonly title: string;
  readonly text?: string | undefined;
  readonly nav: ShareNavigator;
  readonly download: (file: File) => void;
}): Promise<ShareOutcome> {
  const { file, title, nav, download } = params;
  const data: ShareData = { files: [file], title, ...withText(params.text) };

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

/**
 * LES PORTES DE L'HÔTE (revue #9382) — un navigateur partage par
 * `navigator.share` ou télécharge par une ancre ; la WebView d'une coque n'a NI
 * l'un NI l'autre, mais le pont `MeeshyShare.shareFile` (la feuille du système)
 * et, sur Android, la galerie (`@capacitor-community/media`). Sans elles,
 * « Partager » et « Enregistrer » tombaient sur un téléchargement qui ne
 * faisait rien, et l'écran annonçait « Image enregistrée ».
 *
 * `host` est `browserFileDeliveryHost()` : il ne porte l'ancre que dans un
 * navigateur, et le pont de partage que dans une coque qui le déclare.
 */
export type PhotoDoors = {
  readonly nav: ShareNavigator;
  readonly host: FileDeliveryHost;
  readonly saver: GallerySaver | null;
};

const anchorDownload = (host: FileDeliveryHost): ((file: File) => void) | null => {
  const { document: doc, createObjectURL, revokeObjectURL } = host;
  if (doc === undefined || createObjectURL === undefined || revokeObjectURL === undefined) return null;
  return (file) => {
    const url = createObjectURL(file);
    const link = doc.createElement('a');
    link.href = url;
    link.download = file.name;
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    setTimeout(() => revokeObjectURL(url), 1000);
  };
};

const bridgeShare = async (file: File, host: FileDeliveryHost, text?: string): Promise<ShareOutcome | null> => {
  const { canShareFiles, shareFiles } = host;
  const data = { files: [file], ...withText(text) };
  if (canShareFiles === undefined || shareFiles === undefined || !canShareFiles(data)) return null;
  try {
    await shareFiles(data);
    return 'shared';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : null;
  }
};

const navigatorShares = (nav: ShareNavigator, data: ShareData): boolean =>
  typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare(data);

/**
 * Partager : la feuille du navigateur (avec le titre et le texte), sinon celle
 * de la coque, sinon un téléchargement — sinon l'échec, dit. `text` est le lien
 * de parrainage (#7742) : l'image porte déjà son bandeau, le texte le redit.
 * Le pont de la coque (`MeeshyShare.shareFile`) porte le texte avec les octets
 * (#9492) ; une coque construite avant l'ignore et ne partage que l'image.
 */
export async function sharePhoto(file: File, title: string, doors: PhotoDoors, text?: string): Promise<ShareOutcome> {
  const download = anchorDownload(doors.host);
  if (navigatorShares(doors.nav, { files: [file], title, ...withText(text) })) {
    return shareImage({
      file,
      title,
      text,
      nav: doors.nav,
      download: (f) => {
        if (download === null) throw new Error('Aucun téléchargement');
        download(f);
      },
    });
  }
  const bridged = await bridgeShare(file, doors.host, text);
  if (bridged !== null) return bridged;
  if (download === null) return 'failed';
  try {
    download(file);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** Enregistrer : la galerie de la coque Android, sinon un téléchargement, sinon la feuille du système (qui sait enregistrer l'image). */
export async function savePhoto(file: File, doors: PhotoDoors): Promise<ShareOutcome> {
  const mimeType = file.type === '' ? 'image/png' : file.type;
  const notice = await saveToGallery({ blob: file, fileName: file.name, mimeType, saver: doors.saver }).catch(() => 'media.viewer.save_failed' as const);
  if (notice !== null) return notice === 'media.viewer.saved' ? 'downloaded' : 'failed';
  const download = anchorDownload(doors.host);
  if (download !== null) {
    try {
      download(file);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }
  return (await bridgeShare(file, doors.host)) ?? 'failed';
}
