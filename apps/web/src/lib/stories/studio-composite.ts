import { rgbaToThumbHash, thumbHashToBase64 } from '@/lib/media/thumbhash-image';

import { STUDIO_COMPOSITE_SIZE, type StudioCompositeDeps, type StudioCompositeOp } from './studio-composite-plan';

/** L'EXÉCUTION du plan (`studio-composite-plan.ts`) — chargée à la demande
 * par `use-studio-composite-hash.ts`, hors du chunk du studio. */
export { STUDIO_COMPOSITE_SIZE, studioCompositePlan } from './studio-composite-plan';

/** Le rendu réduit, encodé en thumbhash (base64) — `null` dès qu'une étape
 * manque (voir l'en-tête). */
export async function renderStudioComposite(plan: readonly StudioCompositeOp[], deps: StudioCompositeDeps): Promise<string | null> {
  const { width: w, height: h } = STUDIO_COMPOSITE_SIZE;
  const context = deps.createCanvas(w, h);
  if (context === null) return null;
  const sources = new Map<string, CanvasImageSource>();
  for (const op of plan) {
    if (op.kind !== 'image' || sources.has(op.src)) continue;
    const image = await deps.loadImage(op.src);
    if (image === null) return null;
    sources.set(op.src, image);
  }
  plan.forEach((op) => {
    if (op.kind === 'fill') {
      context.fillStyle = op.color;
      context.fillRect(0, 0, w, h);
      return;
    }
    const image = sources.get(op.src);
    if (image === undefined) return;
    context.save();
    context.translate(op.x * w, op.y * h);
    context.rotate((op.rotation * Math.PI) / 180);
    context.filter = op.blur ? 'blur(4px)' : 'none';
    context.drawImage(image, (-op.width * w) / 2, (-op.height * h) / 2, op.width * w, op.height * h);
    context.restore();
  });
  try {
    const pixels = context.getImageData(0, 0, w, h).data;
    return thumbHashToBase64(rgbaToThumbHash(w, h, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)));
  } catch {
    return null;
  }
}

/** Le navigateur réel — un canvas hors écran et une `Image` décodée. */
export const browserCompositeDeps: StudioCompositeDeps = {
  createCanvas: (width, height) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      return canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      return null;
    }
  },
  loadImage: async (src) => {
    if (typeof Image === 'undefined') return null;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    try {
      await image.decode();
      return image;
    } catch {
      return null;
    }
  },
};
