import { resolveCssVars } from './css-vars';
import { containFit, coverFit, type PhotoLayout, type Rect } from './layout';
import type { PhotoMoment } from './moments';

/**
 * LA COMPOSITION DE L'IMAGE (#9382) — conception, partie VI : « cadre du moment
 * en surimpression (emblème en haut, titre et date, Mee et Meo en bas) ».
 *
 * `paintPhoto` est une SUITE d'appels sur un contexte 2D — pas de DOM, pas de
 * `canvas` : un faux contexte les enregistre, l'ordre des couches se prouve
 * sans navigateur. La mise en page est celle de l'aperçu en direct
 * (`layout.ts`), les dessins sont ceux de l'écran (`prepareSvgMarkup` sérialise
 * les SVG du document, jetons résolus) : le cadre qu'on voit au moment de
 * déclencher est celui qu'on obtient.
 *
 * Un selfie est retourné, comme dans l'aperçu (le miroir qu'on attend d'une
 * caméra avant) ; le retournement est borné par `save`/`restore` et ne touche
 * pas les couches suivantes — le texte ne s'écrit jamais à l'envers. Une photo
 * de la galerie n'est pas retournée. Sans photo : une carte aux couleurs de la
 * marque, même mise en page.
 */

/** Le sous-ensemble du contexte 2D que la composition utilise. */
export type PaintContext = {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(image: CanvasImageSource, ...args: number[]): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(offset: number, color: string): void };
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowColor: string;
  shadowBlur: number;
};

export type PhotoArt = {
  readonly emblem: CanvasImageSource;
  readonly mee: CanvasImageSource;
  readonly meo: CanvasImageSource;
  readonly signature: CanvasImageSource;
};

export type PhotoPalette = {
  /** Le fond de la carte seule, du haut vers le bas. */
  readonly top: string;
  readonly bottom: string;
  readonly ink: string;
  readonly inkSoft: string;
  /** Le voile qui garde le texte lisible sur une photo. */
  readonly scrim: string;
};

export type PhotoSource = {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  /** `true` pour un selfie : l'image est retournée comme dans l'aperçu. */
  readonly mirror: boolean;
  /**
   * Rend la mémoire de l'image décodée : un `ImageBitmap` la tient jusqu'à
   * `close()` — le ramasse-miettes ne la rend pas (#9382). Absent pour une
   * image que le navigateur gère seul (le canvas d'une prise de vue).
   */
  readonly release?: () => void;
};

export type PaintInput = {
  readonly layout: PhotoLayout;
  readonly moment: PhotoMoment;
  readonly dateLabel: string;
  readonly photo: PhotoSource | null;
  readonly art: PhotoArt;
  readonly palette: PhotoPalette;
  readonly fontFamily: string;
};

/**
 * Une couleur à une opacité donnée. `#rrggbb` devient `#rrggbbaa` ; toute autre
 * forme (un jeton résolu en `oklch(…)`, `rgb(…)`) passe par `color-mix` —
 * jamais rendue telle quelle : un voile « à 0 % » qui resterait opaque
 * recouvrirait la photo entière.
 */
export const withAlpha = (color: string, alpha: number): string =>
  /^#[0-9a-f]{6}$/i.test(color)
    ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
    : `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

function paintBackground(ctx: PaintContext, input: PaintInput): void {
  const { layout, photo, palette } = input;
  const { width, height } = layout;
  if (photo === null) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(1, palette.bottom);
    ctx.fillStyle = gradient as unknown as CanvasGradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const fit = coverFit({ width: photo.width, height: photo.height }, { width, height });
  ctx.save();
  if (photo.mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(photo.image, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, width, height);
  ctx.restore();

  const top = ctx.createLinearGradient(0, 0, 0, height * 0.4);
  top.addColorStop(0, withAlpha(palette.scrim, 0.55));
  top.addColorStop(1, withAlpha(palette.scrim, 0));
  ctx.fillStyle = top as unknown as CanvasGradient;
  ctx.fillRect(0, 0, width, height * 0.4);

  const bottom = ctx.createLinearGradient(0, height * 0.35, 0, height);
  bottom.addColorStop(0, withAlpha(palette.scrim, 0));
  bottom.addColorStop(1, withAlpha(palette.scrim, 0.7));
  ctx.fillStyle = bottom as unknown as CanvasGradient;
  ctx.fillRect(0, height * 0.35, width, height * 0.65);
}

function paintText(ctx: PaintContext, input: PaintInput): void {
  const { layout, moment, dateLabel, palette, fontFamily } = input;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = withAlpha(palette.scrim, 0.6);
  ctx.shadowBlur = layout.width * 0.012;

  ctx.fillStyle = palette.inkSoft;
  ctx.font = `600 ${layout.kicker.size}px ${fontFamily}`;
  ctx.fillText(moment.kicker.toLocaleUpperCase('fr'), layout.kicker.x, layout.kicker.y);

  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${layout.title.size}px ${fontFamily}`;
  ctx.fillText(moment.title, layout.title.x, layout.title.y);

  ctx.fillStyle = palette.inkSoft;
  ctx.font = `500 ${layout.date.size}px ${fontFamily}`;
  ctx.fillText(dateLabel, layout.date.x, layout.date.y);

  ctx.shadowBlur = 0;
}

/** La taille propre d'une image décodée, quand elle en porte une ; sinon le cadre la remplit. */
const naturalSize = (image: CanvasImageSource): { width: number; height: number } => {
  const { width, height } = image as { width?: unknown; height?: unknown };
  return typeof width === 'number' && typeof height === 'number' ? { width, height } : { width: 0, height: 0 };
};

/** Un dessin garde SA proportion dans son cadre : l'emblème de rang n'est pas carré (200 × 184). */
function drawContained(ctx: PaintContext, image: CanvasImageSource, frame: Rect): void {
  const rect = containFit(naturalSize(image), frame);
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
}

export function paintPhoto(ctx: PaintContext, input: PaintInput): void {
  const { layout, art } = input;
  paintBackground(ctx, input);
  drawContained(ctx, art.emblem, layout.emblem);
  paintText(ctx, input);
  drawContained(ctx, art.mee, layout.mee);
  drawContained(ctx, art.meo, layout.meo);
  drawContained(ctx, art.signature, layout.signature);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROOT_TAG = /<svg\b[^>]*>/;

/**
 * Un SVG du document → une image autonome : jetons CSS résolus, espace de noms
 * posé, taille imposée. Une image SVG chargée dans un `<img>` ne voit rien de
 * la page, ni ses variables ni ses polices.
 */
export function prepareSvgMarkup(
  markup: string,
  options: { readonly size: number; readonly read: (name: string) => string },
): { readonly markup: string; readonly unresolved: readonly string[] } {
  const { markup: resolved, unresolved } = resolveCssVars(markup, options.read);
  const root = ROOT_TAG.exec(resolved)?.[0];
  if (root === undefined) return { markup: resolved, unresolved };
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(root);
  const ratio = box === null || Number(box[1]) <= 0 ? 1 : Number(box[2]) / Number(box[1]);
  const height = Math.round(options.size * ratio);
  const sized = root
    .replace(/\s(?:width|height)="[^"]*"/g, '')
    .replace(/^<svg\b/, `<svg width="${options.size}" height="${height}"${root.includes('xmlns=') ? '' : ` xmlns="${SVG_NS}"`}`);
  return { markup: resolved.replace(root, sized), unresolved };
}

export type RasterEnv = {
  readonly createImage: () => HTMLImageElement;
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
};

/** Un SVG autonome → une image décodée, ou `null` : un dessin illisible ne fait pas échouer la photo entière. */
export async function rasterizeSvg(markup: string, env: RasterEnv): Promise<HTMLImageElement | null> {
  const url = env.createObjectUrl(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const image = env.createImage();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } finally {
    env.revokeObjectUrl(url);
  }
}
