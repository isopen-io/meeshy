import type { Size } from '../call-montage-shapes';
import { frameScene, paintBackdrop, paintFaces, paintOverlay, type FrameFace, type FramePaintable, type FrameScene } from './frame-paint';
import type { Surface2D } from './frame-paint-kit';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * **LE RENDU EN COUCHES** (#8741, spec § 5.5) — tout ce qui ne dépend pas
 * des visages (fond, motif, ornements, bordure, textes) se peint UNE fois par
 * (cadre, personnes, taille, textes) sur deux toiles hors écran ; chaque
 * image de l'aperçu ne repeint que les visages entre les deux. Un petit
 * cache LRU (24 entrées) garde les couches des cadres récemment vus : le
 * carrousel qui revient sur un cadre ne le recalcule pas.
 */

export type FrameCanvas = { readonly canvas: CanvasImageSource; readonly context: Surface2D };

/** Fabrique une toile hors écran — `OffscreenCanvas` si le moteur l'offre, sinon un `<canvas>` ; injectée dans les témoins. */
export type CanvasFactory = (size: Size) => FrameCanvas | null;

export const defaultCanvasFactory: CanvasFactory = (size) => {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    return context === null ? null : { canvas, context };
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  return context === null ? null : { canvas, context };
};

export type FrameLayers = { readonly scene: FrameScene; readonly backdrop: CanvasImageSource; readonly overlay: CanvasImageSource };

export function renderFrameLayers(frame: FramePaintable, people: readonly FramePerson[], size: Size, texts: FrameTexts, factory: CanvasFactory = defaultCanvasFactory): FrameLayers | null {
  const backdrop = factory(size);
  const overlay = factory(size);
  if (backdrop === null || overlay === null) return null;
  const scene = frameScene(frame, people, texts, size);
  paintBackdrop(backdrop.context, scene);
  paintOverlay(overlay.context, scene);
  return { scene, backdrop: backdrop.canvas, overlay: overlay.canvas };
}

/** Une image de l'aperçu : la couche du fond, les visages, la couche du dessus. */
export function composeFrame(context: Surface2D, layers: FrameLayers, faces: readonly (FrameFace | null)[]): void {
  const { width, height } = layers.scene.size;
  context.drawImage(layers.backdrop, 0, 0, width, height);
  paintFaces(context, layers.scene, faces);
  context.drawImage(layers.overlay, 0, 0, width, height);
}

export const FRAME_LAYER_CACHE_SIZE = 24;

/** La clé d'un jeu de couches : tout ce qui change leur peinture, et rien d'autre. */
export function frameLayersKey(frame: FramePaintable & { readonly id: string }, people: readonly FramePerson[], size: Size, texts: FrameTexts): string {
  const who = people.map((person) => `${person.id}\u0001${person.name}\u0001${person.handle ?? ''}`).join('\u0002');
  const accent = texts.accent === null ? '' : `${texts.accent.primary}/${texts.accent.secondary}`;
  return [frame.id, people.length, `${Math.round(size.width)}x${Math.round(size.height)}`, who, texts.isGroup ? 'g' : 'd', texts.groupName ?? '', texts.date, accent].join('\u0003');
}

/** Un cache LRU de couches, borné : l'entrée la moins récemment servie sort la première. */
export function frameLayerCache(factory: CanvasFactory = defaultCanvasFactory, capacity = FRAME_LAYER_CACHE_SIZE) {
  const entries = new Map<string, FrameLayers>();
  return {
    get(frame: FramePaintable & { readonly id: string }, people: readonly FramePerson[], size: Size, texts: FrameTexts): FrameLayers | null {
      const key = frameLayersKey(frame, people, size, texts);
      const hit = entries.get(key);
      if (hit !== undefined) {
        entries.delete(key);
        entries.set(key, hit);
        return hit;
      }
      const layers = renderFrameLayers(frame, people, size, texts, factory);
      if (layers === null) return null;
      entries.set(key, layers);
      const oldest = entries.size > capacity ? entries.keys().next().value : undefined;
      if (oldest !== undefined) entries.delete(oldest);
      return layers;
    },
    get size(): number {
      return entries.size;
    },
    clear(): void {
      entries.clear();
    },
  };
}
