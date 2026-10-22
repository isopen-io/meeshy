import type { PaintContext } from './compose';
import type { PaintSurface } from './glory/paint-glory-frame';

/**
 * LA SURFACE DE TRAVAIL DU PEINTRE (#10159, § 5.5) — là où la photo se découpe
 * par son masque (`destination-in`) avant de se poser dans la fenêtre du cadre.
 * Le peintre la demande en pixels de DESIGN (`window.w × window.h`) à chaque
 * peinture ; l'aperçu peint jusqu'à 30 fois par seconde pendant le direct.
 *
 * Un BASSIN tient UN canevas et le remet à chaque demande : redimensionné quand
 * la taille change, nettoyé sinon, remis en `source-over`, et son repère porte
 * l'ÉCHELLE de l'hôte — le canevas est en pixels d'AFFICHAGE, le peintre
 * dessine en pixels de design sans le savoir, et `drawImage(surface.image, …)`
 * l'étire dans la fenêtre à 1 : 1. L'image finale prend l'échelle 1.
 *
 * Un canevas sans contexte 2d (vieux moteur) n'est pas gardé : la demande rend
 * `null` (le peintre découpe alors au rectangle) et la suivante réessaie.
 */

export type Scratch = (width: number, height: number) => PaintSurface | null;

export type ScratchPool = {
  /** La surface de travail à cette échelle : `at(pixels d'affichage / pixels de design)` pour un aperçu, `at(1)` pour l'image finale. */
  readonly at: (scale: number) => Scratch;
};

type Held = { readonly canvas: HTMLCanvasElement; readonly ctx: CanvasRenderingContext2D };

const pixels = (value: number, scale: number): number => Math.max(1, Math.round(value * scale));

export function scratchPool(createCanvas: (width: number, height: number) => HTMLCanvasElement): ScratchPool {
  let held: Held | null = null;
  const take = (width: number, height: number): Held | null => {
    if (held !== null) return held;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    held = { canvas, ctx };
    return held;
  };
  const surface = (scale: number, width: number, height: number): PaintSurface | null => {
    const w = pixels(width, scale);
    const h = pixels(height, scale);
    const current = take(w, h);
    if (current === null) return null;
    if (current.canvas.width !== w || current.canvas.height !== h) {
      current.canvas.width = w;
      current.canvas.height = h;
    } else {
      current.ctx.setTransform(1, 0, 0, 1, 0, 0);
      current.ctx.clearRect(0, 0, w, h);
    }
    current.ctx.globalCompositeOperation = 'source-over';
    current.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return { ctx: current.ctx as unknown as PaintContext, image: current.canvas };
  };
  return { at: (scale) => (width, height) => surface(scale, width, height) };
}
