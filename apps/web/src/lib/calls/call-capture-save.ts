import { currentGallerySaver, type GallerySaver } from '@/lib/gallery/gallery-saver';
import { saveToGallery } from '@/lib/gallery/save-to-gallery';
import type { FileDeliveryPortal } from '@/lib/media/deliver-file';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';

/**
 * **ENREGISTRER UNE CAPTURE D'APPEL** (#8552, #8625) — une photo (PNG) ou une
 * vidéo (MP4 ou WebM) part dans la PHOTOTHÈQUE là où l'hôte en a une (la
 * coque Android, album « Meeshy ») ; ailleurs par la porte de fichiers (le
 * téléchargement d'un navigateur, la feuille de partage de la coque iOS).
 * Rien ne quitte l'appareil : aucune image ne passe par le réseau.
 */

export type CaptureFile = { readonly blob: Blob; readonly fileName: string; readonly mimeType?: string };

export type SaveOutcome = { readonly saved: number; readonly failed: number; readonly cancelled: number };

/** `portal` se charge à la demande (`budgets.json` › `story_export`, `dynamic_only`) : la photothèque de la coque n'en a pas besoin. */
type SaveEnv = { readonly saver: GallerySaver | null; readonly portal: () => Promise<FileDeliveryPortal | null> };

export const browserSaveEnv = (): SaveEnv => ({
  saver: currentGallerySaver(),
  portal: () => import('@/lib/media/deliver-file').then((module) => module.fileDeliveryPortal(browserFileDeliveryHost())),
});

const PHOTO = 'image/png';

async function saveOne(file: CaptureFile, env: SaveEnv): Promise<'saved' | 'failed' | 'cancelled'> {
  const mimeType = file.mimeType ?? PHOTO;
  const notice = await saveToGallery({ blob: file.blob, fileName: file.fileName, mimeType, saver: env.saver });
  if (notice !== null) return notice === 'media.viewer.saved' ? 'saved' : 'failed';
  const portal = await env.portal().catch(() => null);
  if (portal === null) return 'failed';
  const outcome = await portal.deliver(file.blob, file.fileName, mimeType);
  if (outcome === 'delivered') return 'saved';
  return outcome === 'cancelled' ? 'cancelled' : 'failed';
}

/** Un fichier après l'autre : une feuille de partage n'en montre qu'une à la fois. */
export async function saveCaptures(files: readonly CaptureFile[], env: SaveEnv = browserSaveEnv()): Promise<SaveOutcome> {
  return files.reduce<Promise<SaveOutcome>>(async (previous, file) => {
    const tally = await previous;
    const outcome = await saveOne(file, env);
    return { ...tally, [outcome]: tally[outcome] + 1 };
  }, Promise.resolve({ saved: 0, failed: 0, cancelled: 0 }));
}

/** L'horodatage des noms de fichiers : `20260928-090503`. */
export function captureStamp(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
}
