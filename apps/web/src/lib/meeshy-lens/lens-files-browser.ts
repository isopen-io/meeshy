import type { LensFileDeps } from './lens-files';

/**
 * **LE DÉCODAGE DES FICHIERS D'UNE LENS, DANS LE NAVIGATEUR** (#11994) —
 * `createImageBitmap` pour chaque fichier ; la bande d'une LUT sans conversion
 * de couleur ni prémultiplication (ses pixels SONT la table), puis ses pixels
 * lus sur un canevas hors écran, et la bande relâchée. `read` vient de qui sert le pack.
 */
export function browserLensFileDeps(read: LensFileDeps<ImageBitmap>['read']): LensFileDeps<ImageBitmap> {
  return {
    read,
    decode: (blob, kind) => createImageBitmap(blob, kind === 'lut' ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : {}),
    stripOf: (bitmap) => {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
      if (context === null) return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
      context.drawImage(bitmap, 0, 0);
      const strip = context.getImageData(0, 0, bitmap.width, bitmap.height);
      /* La bande ne sert qu'à bâtir le cube : sa mémoire est rendue aussitôt lue. */
      bitmap.close();
      return strip;
    },
  };
}
