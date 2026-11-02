import { canonicalMediaMimeType } from '@meeshy/shared/utils/media-mime-type';

/**
 * **UNE PHOTO HEIC CHOISIE SUR ANDROID OU CHROME** (W9, #11315) — le
 * navigateur ne la décode pas (seul Safari le fait), et la passerelle l'accepte
 * désormais : elle la sert en JPEG (`fileUrl`) et garde l'original
 * (`renditions[codec = 'heic']`, S8 #11263). Le HEIC est déjà un format
 * efficace : il part tel quel, une seule génération (#11247), jamais ré-encodé
 * par le client.
 *
 * Ce module dit si un fichier EN EST (type déclaré, ou extension quand Chrome
 * n'en déclare aucun), le rend sous son vrai type, et tente le décodage local
 * (`createImageBitmap`) — qui décide seulement de l'APERÇU : décodable, il se
 * montre ; sinon l'aperçu attend la vignette servie.
 */
/** Un HEIC que la passerelle n'a pas su convertir (serveur d'avant S8, #11263) : la cause est le FORMAT. */
export const UPLOAD_FORMAT_REFUSED = 'UPLOAD_FORMAT_REFUSED';

const HEIF_TYPES: ReadonlySet<string> = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

const canonicalType = (file: { readonly type: string; readonly name: string }): string =>
  (canonicalMediaMimeType({ mimeType: file.type, fileName: file.name }).split(';')[0] ?? '').trim().toLowerCase();

export const isHeifFamily = (file: { readonly type: string; readonly name: string }): boolean => HEIF_TYPES.has(canonicalType(file));

/** Le même fichier, sous le type que la passerelle reconnaît ; rendu tel quel s'il le porte déjà. */
export function servableHeif(file: File): File {
  const type = canonicalType(file);
  return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

export type BitmapDecoder = (blob: Blob) => Promise<{ readonly close: () => void }>;

const browserDecoder: BitmapDecoder | null = typeof createImageBitmap === 'function' ? (blob) => createImageBitmap(blob) : null;

/** `null` : le navigateur n'a pas `createImageBitmap`. */
export async function decodesInBrowser(blob: Blob, decode: BitmapDecoder | null = browserDecoder): Promise<boolean> {
  if (decode === null) return false;
  try {
    const bitmap = await decode(blob);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Un aperçu LOCAL serait une image cassée : le fichier est un HEIC que ce
 * navigateur ne décode pas. L'écran montre alors ce qu'il montrait, puis la
 * vignette servie (le JPEG de la passerelle) une fois l'envoi accusé.
 */
export async function needsServedPreview(file: File, decode: BitmapDecoder | null = browserDecoder): Promise<boolean> {
  if (!isHeifFamily(file)) return false;
  return !(await decodesInBrowser(file, decode));
}
