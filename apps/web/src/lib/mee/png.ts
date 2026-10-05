import { renderMeeSticker } from './render';
import type { MeeSlots, MeeSticker } from './types';

/**
 * L'IMAGE DE REPLI d'un sticker Mee (#9034) — le PNG joint au message, pour
 * les lecteurs qui ne redessinent pas le sticker (iOS, Android, un vieux
 * client). L'image est l'état FIXE de la scène, dessinée par un canvas.
 */

export type RasterizeSvg = (svg: string, size: number) => Promise<Blob>;

export const rasterizeSvg: RasterizeSvg = (svg, size) =>
  new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (context === null) {
        reject(new Error('canvas-unavailable'));
        return;
      }
      context.drawImage(image, 0, 0, size, size);
      canvas.toBlob((blob) => (blob === null ? reject(new Error('png-encode-failed')) : resolve(blob)), 'image/png');
    };
    image.onerror = () => reject(new Error('svg-decode-failed'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

export async function meeStickerFile(sticker: MeeSticker, slots: MeeSlots, rasterize: RasterizeSvg = rasterizeSvg): Promise<File> {
  const svg = renderMeeSticker(sticker, { uid: `png${sticker.id}`, slots, animated: false, size: 512 });
  const blob = await rasterize(svg, 512);
  return new File([blob], `${sticker.id}.png`, { type: 'image/png' });
}
