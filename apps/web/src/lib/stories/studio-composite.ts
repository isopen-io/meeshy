import { rgbaToThumbHash, thumbHashToBase64 } from '@/lib/media/thumbhash-image';

import { STUDIO_COMPOSITE_SIZE, loadPlanSources, paintCompositePlan, type StudioCompositeDeps, type StudioCompositeOp } from './studio-composite-plan';

/** L'EXÉCUTION du plan (`studio-composite-plan.ts`) — chargée à la demande
 * par `use-studio-composite-hash.ts`, hors du chunk du studio. */
export { STUDIO_COMPOSITE_SIZE, studioCompositePlan } from './studio-composite-plan';

/** Le rendu réduit, encodé en thumbhash (base64) — `null` dès qu'une étape
 * manque (voir l'en-tête). */
export async function renderStudioComposite(plan: readonly StudioCompositeOp[], deps: StudioCompositeDeps): Promise<string | null> {
  const { width: w, height: h } = STUDIO_COMPOSITE_SIZE;
  const context = deps.createCanvas(w, h);
  if (context === null) return null;
  const sources = await loadPlanSources(plan, deps.loadImage);
  if (sources === null) return null;
  paintCompositePlan(context, plan, sources, { width: w, height: h });
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
