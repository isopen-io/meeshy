import { drawContained, paintReferralBanner, type PaintContext, type PhotoArt, type PhotoBanner, type PhotoPalette, type PhotoSource } from '../compose';
import { gloryTextFace, textScript } from '../glory-fonts';
import { AUTHOR_PLATE_RATIO, bannerWithin, coverFit, photoLayout, type Rect } from '../layout';
import { paintGloryText, type GloryTextDeps } from './paint-glory-text';
import { authorMessageOf } from '../author-message';
import { anchorsOf, birdLayoutOf, boxArgs, plateVariantOf, rectOf, type GloryFrameBirdAnchor, type GloryFrameFormat, type GloryRecipe, type GloryTexts } from './frame-spec';

/**
 * **LE PEINTRE D'UN CADRE DE GLOIRE** (#10159, L7, § 5.5) — une SUITE d'appels
 * sur un contexte 2D, dans l'ordre que le contrat déclare (`stack`) : le
 * peintre ne devine rien. Il ne reçoit que des images DÉCODÉES (`ImageBitmap`,
 * jamais un `<img>` sans CORS qui teinterait le canevas) et la recette de la
 * photo ; un faux contexte enregistre ses appels, l'ordre des couches se prouve
 * sans navigateur. Le MÊME peintre sert l'aperçu (canvas à la taille
 * d'affichage, image vidéo courante) et l'image finale (still développé).
 *
 *  - `photo` : la photo couvre la BOÎTE de la fenêtre, décalée et zoomée par le
 *    recadrage, découpée par son masque sur une surface de travail puis posée
 *    sous un `clip` borné par `save`/`restore` ; sans photo, `windowFill` et
 *    l'emblème du moment en grand ;
 *  - `grade:n` : sur la photo, avec son mode de fusion, borné à la passe ;
 *  - `crest` : l'emblème du moment (le blason, la pièce…) dans son ancre — la
 *    frappe de la chorégraphie s'y rejoue ;
 *  - `birds` : Mee et Meo à leurs ancres (rotation, miroir, opacité) ;
 *  - `plate` : la variante que la recette demande (message ou non) ;
 *  - `text` : les emplacements vivants remplis par le moment, les autres avec
 *    leur texte d'exemple ; réduit puis ellipsé ; l'arabe de droite à gauche ;
 *    puis la plaque d'auteur (#10816) si le cadre affiché en a une — le contrat
 *    ne lui déclare pas d'emplacement, elle se pose au-dessus du bloc de texte ;
 *  - `banner` : le bandeau de parrainage dans la boîte déclarée, retirable.
 */

export type GloryLayerImages = {
  readonly mask: CanvasImageSource | null;
  readonly decor: CanvasImageSource;
  readonly windowFill: CanvasImageSource;
  readonly grade: readonly CanvasImageSource[];
  readonly front: { readonly 'under-birds'?: CanvasImageSource; readonly 'over-birds'?: CanvasImageSource };
  readonly plate: { readonly plain?: CanvasImageSource; readonly message?: CanvasImageSource };
};

/** Les stickers des oiseaux par identifiant ; un sticker absent prend le dessin de Mee ou de Meo du cadre simple. */
export type GloryBirdImages = Readonly<Record<string, CanvasImageSource>>;

/** Une surface de travail hors écran : sa taille, son contexte, et l'image qu'on en tire. */
export type PaintSurface = { readonly ctx: PaintContext; readonly image: CanvasImageSource };

export type GloryPaintInput = {
  readonly format: GloryFrameFormat;
  readonly layers: GloryLayerImages;
  readonly birds: GloryBirdImages;
  readonly recipe: GloryRecipe;
  readonly texts: GloryTexts;
  readonly photo: PhotoSource | null;
  readonly art: PhotoArt;
  readonly palette: PhotoPalette;
  readonly fontFamily: string;
  /** Le bandeau de parrainage déjà localisé ; absent : la carte part sans lui, quelle que soit la recette. */
  readonly banner?: PhotoBanner;
  readonly rtl: boolean;
  readonly language: string;
  /** `null` : pas de surface hors écran (vieux moteur) — la photo se découpe au rectangle de la fenêtre. */
  readonly scratch: (width: number, height: number) => PaintSurface | null;
};

const degrees = (value: number): number => (value * Math.PI) / 180;

/** Le rectangle source qu'un recadrage retient : la couverture de la fenêtre, resserrée par le zoom, décalée en fractions. */
function croppedSource(photo: PhotoSource, frame: Rect, crop: GloryRecipe['crop']) {
  const cover = coverFit({ width: photo.width, height: photo.height }, { width: frame.w, height: frame.h });
  const zoom = Math.max(1, crop.zoom);
  const sw = cover.sw / zoom;
  const sh = cover.sh / zoom;
  const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
  const sx = clamp(cover.sx + (cover.sw - sw) / 2 + crop.dx * sw, 0, photo.width - sw);
  const sy = clamp(cover.sy + (cover.sh - sh) / 2 + crop.dy * sh, 0, photo.height - sh);
  return { sx, sy, sw, sh };
}

function drawPhotoInto(ctx: PaintContext, photo: PhotoSource, frame: Rect, crop: GloryRecipe['crop'], at: Rect): void {
  const { sx, sy, sw, sh } = croppedSource(photo, frame, crop);
  ctx.save();
  if (photo.mirror) {
    ctx.translate(at.x * 2 + at.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(photo.image, sx, sy, sw, sh, at.x, at.y, at.w, at.h);
  ctx.restore();
}

function paintWindow(ctx: PaintContext, input: GloryPaintInput): void {
  const { format, photo, layers, recipe } = input;
  const window = rectOf(format.window.box);
  if (photo === null) {
    ctx.drawImage(layers.windowFill, ...boxArgs(format.layers.windowFill.box));
    const inset = Math.min(window.w, window.h) * 0.22;
    drawContained(ctx, input.art.emblem, { x: window.x + inset, y: window.y + inset, w: window.w - inset * 2, h: window.h - inset * 2 });
    return;
  }
  const surface = layers.mask === null ? null : input.scratch(window.w, window.h);
  ctx.save();
  if (ctx.rect !== undefined && ctx.clip !== undefined && ctx.beginPath !== undefined) {
    ctx.beginPath();
    ctx.rect(window.x, window.y, window.w, window.h);
    ctx.clip();
  }
  if (surface === null || layers.mask === null) {
    drawPhotoInto(ctx, photo, window, recipe.crop, window);
  } else {
    const local: Rect = { x: 0, y: 0, w: window.w, h: window.h };
    drawPhotoInto(surface.ctx, photo, window, recipe.crop, local);
    surface.ctx.globalCompositeOperation = 'destination-in';
    surface.ctx.drawImage(layers.mask, 0, 0, window.w, window.h);
    surface.ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(surface.image, window.x, window.y, window.w, window.h);
  }
  ctx.restore();
}

function paintGrade(ctx: PaintContext, input: GloryPaintInput, index: number): void {
  const layer = input.format.layers.grade[index];
  const image = input.layers.grade[index];
  if (layer === undefined || image === undefined) return;
  ctx.save();
  if (ctx.globalCompositeOperation !== undefined) ctx.globalCompositeOperation = layer.blend === 'normal' ? 'source-over' : layer.blend;
  ctx.drawImage(image, ...boxArgs(layer.box));
  if (ctx.globalCompositeOperation !== undefined) ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Le dessin du cadre simple qui remplace un sticker inconnu : Mee pour `mee-…`, Meo pour `meo-…`, les deux côte à côte pour `duo-…`. */
function fallbackBird(ctx: PaintContext, art: PhotoArt, anchor: GloryFrameBirdAnchor, local: Rect): void {
  if (anchor.sticker.startsWith('duo-')) {
    const half = { ...local, w: local.w / 2 };
    drawContained(ctx, art.mee, half);
    drawContained(ctx, art.meo, { ...half, x: local.x + local.w / 2 });
    return;
  }
  drawContained(ctx, anchor.sticker.startsWith('meo-') ? art.meo : art.mee, local);
}

function paintBird(ctx: PaintContext, input: GloryPaintInput, anchor: GloryFrameBirdAnchor): void {
  const box = rectOf(anchor.box);
  const image = input.birds[anchor.sticker];
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  if (anchor.rotate !== 0 && ctx.rotate !== undefined) ctx.rotate(degrees(anchor.rotate));
  if (anchor.flip) ctx.scale(-1, 1);
  if (anchor.opacity < 1 && ctx.globalAlpha !== undefined) ctx.globalAlpha = anchor.opacity;
  const local: Rect = { x: -box.w / 2, y: -box.h / 2, w: box.w, h: box.h };
  if (image === undefined) fallbackBird(ctx, input.art, anchor, local);
  else ctx.drawImage(image, local.x, local.y, local.w, local.h);
  ctx.restore();
}

function paintBirds(ctx: PaintContext, input: GloryPaintInput): void {
  const layout = birdLayoutOf(input.format.birds, input.recipe.pose);
  if (layout === undefined) return;
  anchorsOf(layout).forEach((anchor) => paintBird(ctx, input, anchor));
}

function paintPlate(ctx: PaintContext, input: GloryPaintInput): void {
  const variant = plateVariantOf(input.format, authorMessageOf(input.recipe.message));
  if (variant === null) return;
  const layer = input.format.layers.plate[variant];
  const image = input.layers.plate[variant];
  if (layer === undefined || image === undefined) return;
  ctx.drawImage(image, ...boxArgs(layer.box));
}

function paintFront(ctx: PaintContext, input: GloryPaintInput, rank: 'under-birds' | 'over-birds'): void {
  const layer = input.format.layers.front[rank];
  const image = input.layers.front[rank];
  if (layer === undefined || image === undefined) return;
  ctx.drawImage(image, ...boxArgs(layer.box));
}

function paintBanner(ctx: PaintContext, input: GloryPaintInput): void {
  const { format, banner, recipe } = input;
  if (banner === undefined || !recipe.showLink || format.banner === null) return;
  const layout = bannerWithin(rectOf(format.banner.box), format.size[0], input.rtl);
  const text: PhotoBanner = recipe.showFlame ? banner : { ...banner, flameLabel: null };
  paintReferralBanner(ctx, layout, input, text);
}

/** La plaque d'auteur : 40 % de la largeur, posée à un cinquantième de la largeur au-dessus du bloc de texte vivant, centrée sur lui. */
const AUTHOR_WIDTH = 0.4;
const AUTHOR_GAP = 0.02;

/** Où la plaque d'auteur se pose sur un cadre décoré ; un cadre sans aucun emplacement de texte la prend à la place de la carte simple. */
export function authorRectOf(format: GloryFrameFormat): Rect {
  const boxes = Object.values(format.text).map((slot) => slot.bbox);
  if (boxes.length === 0) return photoLayout('story').author;
  const width = format.size[0];
  const top = Math.min(...boxes.map((box) => box[1]));
  const left = Math.min(...boxes.map((box) => box[0]));
  const right = Math.max(...boxes.map((box) => box[0] + box[2]));
  const w = width * AUTHOR_WIDTH;
  const h = w / AUTHOR_PLATE_RATIO;
  return { x: (left + right) / 2 - w / 2, y: top - width * AUTHOR_GAP - h, w, h };
}

function paintAuthor(ctx: PaintContext, input: GloryPaintInput): void {
  if (input.art.author === undefined) return;
  drawContained(ctx, input.art.author, authorRectOf(input.format));
}

const textDeps = (input: GloryPaintInput): GloryTextDeps => ({
  width: input.format.size[0],
  language: input.language,
  face: gloryTextFace,
  script: textScript,
});

export function paintGloryFrame(ctx: PaintContext, input: GloryPaintInput): void {
  const { format } = input;
  /* Le message de l'auteur (#10165) : borné et nettoyé par la loi, quelle que soit sa provenance (champ, recette du
     carnet) ; la plaque suit le message tel qu'il sera écrit, jamais le texte brut. Le peintre de texte l'isole. */
  const texts: GloryTexts = { ...input.texts, message: authorMessageOf(input.recipe.message) };
  format.stack.forEach((token) => {
    if (token === 'photo') return paintWindow(ctx, input);
    if (token === 'decor') return ctx.drawImage(input.layers.decor, ...boxArgs(format.layers.decor.box));
    if (token === 'crest') return format.crest === null ? undefined : drawContained(ctx, input.art.emblem, rectOf(format.crest.box));
    if (token === 'birds') return paintBirds(ctx, input);
    if (token === 'plate') return paintPlate(ctx, input);
    if (token === 'text') {
      paintGloryText(ctx, format.text, texts, textDeps(input));
      return paintAuthor(ctx, input);
    }
    if (token === 'banner') return paintBanner(ctx, input);
    if (token.startsWith('grade:')) return paintGrade(ctx, input, Number(token.slice(6)));
    if (token === 'front:under-birds' || token === 'front:over-birds') return paintFront(ctx, input, token.slice(6) as 'under-birds' | 'over-birds');
    return undefined;
  });
}
