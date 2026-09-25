import { STICKER_LIMITS, stickerFitWithin } from '@meeshy/shared/types/sticker-definition';

/**
 * **UNE IMAGE VENUE D'AILLEURS DEVIENT UN STICKER** (#7938) — ce que le client
 * fait AVANT d'envoyer : trouver l'image (un fichier choisi, un collage), puis
 * la réduire au carré du sticker quand ça économise du réseau.
 *
 * La passerelle normalise de toute façon (`services/stickers/stickerImage.ts` :
 * reniflage, ré-encodage, 512 px) — elle ne fait confiance à rien de ce qui
 * sort d'ici. Réduire côté client n'est donc PAS une garde : c'est ce qui fait
 * qu'une capture d'écran de 4 Mo collée sur un réseau lent part en quelques
 * dizaines de Ko (dimension 2).
 */

/** Ce que le navigateur sait décoder et que la passerelle ne garderait pas tel
 * quel (AVIF, BMP, HEIC selon le navigateur…) part ré-encodé ; un GIF part
 * INTACT, parce qu'un canvas n'en garderait qu'une image — l'animation est
 * justement ce qu'on vient chercher en collant un GIF. */
export function mustReencode(image: {
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly size: number;
}): boolean {
  if (image.mimeType === 'image/gif') return false;
  const kept = image.mimeType === 'image/png' || image.mimeType === 'image/webp';
  const fits = Math.max(image.width, image.height) <= STICKER_LIMITS.maxEdge;
  return !(kept && fits && image.size <= STICKER_LIMITS.maxBytes);
}

/** Les images d'un collage ou d'un dépôt — fichiers d'abord (une copie depuis
 * un explorateur, une capture), puis les éléments du presse-papier. */
export function imageFilesOf(transfer: Pick<DataTransfer, 'files' | 'items'> | null): readonly File[] {
  if (transfer === null) return [];
  const files = Array.from(transfer.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (files.length > 0) return files;
  return Array.from(transfer.items ?? []).flatMap((item) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) return [];
    const file = item.getAsFile();
    return file === null ? [] : [file];
  });
}

/**
 * LE BOUTON « COLLER » — l'API asynchrone du presse-papier, là où le
 * navigateur la sert (Chromium, la WebView Android de la coque, Safari 13.1+).
 * Un refus de permission ou une API absente rend `[]` : l'écran dit alors
 * « rien à coller », jamais une erreur technique.
 */
export async function readClipboardImages(clipboard: Pick<Clipboard, 'read'> | undefined): Promise<readonly Blob[]> {
  if (clipboard?.read === undefined) return [];
  try {
    const items = await clipboard.read();
    const blobs = await Promise.all(
      items.flatMap((item) => {
        const type = item.types.find((t) => t.startsWith('image/'));
        return type === undefined ? [] : [item.getType(type)];
      }),
    );
    return blobs;
  } catch {
    return [];
  }
}

export type ImageDecoder = (source: Blob) => Promise<{
  readonly width: number;
  readonly height: number;
  readonly encode: (width: number, height: number) => Promise<Blob | null>;
}>;

/** Le décodeur du navigateur — `createImageBitmap` + un canvas. Le canvas
 * garde la TRANSPARENCE (aucun fond peint) ; WebP si le navigateur sait
 * l'encoder, PNG sinon (Safari), les deux admis par la passerelle. */
export const browserImageDecoder: ImageDecoder = async (source) => {
  const bitmap = await createImageBitmap(source);
  return {
    width: bitmap.width,
    height: bitmap.height,
    encode: async (width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (webp !== null && webp.type === 'image/webp') return webp;
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    },
  };
};

/**
 * Prépare l'image SOURCE d'un sticker. Un décodage qui échoue rend la source
 * telle quelle : la passerelle, elle, saura dire si c'est une image — le
 * client ne refuse jamais à sa place.
 */
export async function prepareStickerSource(source: Blob, decode: ImageDecoder = browserImageDecoder): Promise<Blob> {
  if (source.type === 'image/gif') return source;
  try {
    const decoded = await decode(source);
    if (!mustReencode({ mimeType: source.type, width: decoded.width, height: decoded.height, size: source.size })) {
      return source;
    }
    const fit = stickerFitWithin({ width: decoded.width, height: decoded.height });
    return (await decoded.encode(fit.width, fit.height)) ?? source;
  } catch {
    return source;
  }
}
