import '@/styles/story-fonts.css';

import { layoutMessageCard, type CardLayout, type CardOp, type CardRegion, type MessageCardInput } from './message-card-layout';
import { MEESHY_PNG_METADATA, withPngMetadata } from './png-metadata';
import { canvasFont, templateFonts, templateOf, type CardPalette, type MessageCardTemplate } from './message-card-templates';

/**
 * **LA PEINTURE D'UNE CARTE D'EXPORT** — la moitié impure de
 * `message-card-layout.ts` : elle ATTEND les polices du template (une carte
 * peinte avant l'arrivée du WOFF2 figerait la police système dans l'image),
 * mesure avec le vrai contexte, peint, et rend un PNG signé Meeshy dans ses
 * métadonnées (`png-metadata.ts`).
 *
 * UN SEUL MOTEUR pour l'image exportée, les vignettes de la galerie et les
 * images d'un export animé (`message-card-motion.ts`) : ce que la miniature
 * montre est ce que l'image portera.
 *
 * Chargée à la demande, au premier « Imager » : ni le fil ni le menu ne paient
 * ce module, ni les `@font-face` qu'il importe.
 */

export type Paintable = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
  | 'beginPath'
  | 'arc'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'setLineDash'
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'roundRect'
  | 'closePath'
  | 'clip'
  | 'drawImage'
> & { direction: CanvasDirection; lineCap: CanvasLineCap };

/** Une source de pixels : une image décodée, ou la vidéo elle-même (sa frame COURANTE). */
export type CardSource = CanvasImageSource & {
  readonly width?: number | SVGAnimatedLength;
  readonly height?: number | SVGAnimatedLength;
  readonly videoWidth?: number;
  readonly videoHeight?: number;
};

/**
 * CE QUE LE PEINTRE REÇOIT EN PLUS DE LA MISE EN PAGE :
 *  - `sources` : les pixels des médias, par rang (`null` : pas encore là, ou
 *    refusé — un cadre neutre prend sa place, jamais un trou) ;
 *  - `progress` : l'avancement d'un export animé, de 0 à 1 — l'onde d'un audio
 *    se colore jusque-là ;
 *  - `strokeFloor` : l'épaisseur MINIMALE d'un trait, en pixels de la carte.
 *    Une vignette réduit la carte au cinquième : l'orbite (3 px, pointillé de
 *    2) y tombait sous le pixel, et le séparateur DISPARAISSAIT de la
 *    miniature. La vignette relève donc ses traits à un pixel et demi d'écran —
 *    le même dessin, lisible à sa taille.
 */
export type PaintOptions = {
  readonly sources?: readonly (CardSource | null)[];
  readonly progress?: number | null;
  readonly strokeFloor?: number;
};

type ResolvedOptions = { readonly sources: readonly (CardSource | null)[]; readonly progress: number | null; readonly strokeFloor: number };

/** L'épaisseur minimale d'un trait pour qu'il reste visible à l'échelle `scale` : un pixel et demi d'écran. */
export const strokeFloorAt = (scale: number): number => (scale >= 1 ? 0 : 1.5 / scale);

/** Le fichier de chaque police du template — attendu, jamais espéré ; une police absente laisse la pile native. */
export async function loadCardFonts(template: MessageCardTemplate, fonts: Pick<FontFaceSet, 'load'> | undefined): Promise<void> {
  if (fonts === undefined) return;
  await Promise.all(templateFonts(template).map((font) => fonts.load(canvasFont(font, 40)).catch(() => undefined)));
}

function paintBackground(ctx: Paintable, layout: CardLayout, palette: CardPalette): void {
  const gradient = ctx.createLinearGradient(0, 0, layout.width * 0.35, layout.height);
  for (const [offset, color] of palette.background) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (palette.glow !== null) {
    const glow = ctx.createRadialGradient(layout.width * 0.85, layout.height * 0.12, 0, layout.width * 0.85, layout.height * 0.12, layout.width * 0.9);
    glow.addColorStop(0, palette.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
}

/** Le filigrane : « Meeshy @pseudo », en diagonale, répété sur toute la carte. */
function paintWatermark(ctx: Paintable, layout: CardLayout, palette: CardPalette): void {
  ctx.save();
  ctx.globalAlpha = palette.watermarkAlpha;
  ctx.fillStyle = palette.watermarkInk;
  ctx.font = canvasFont({ family: null, weight: 700, style: 'normal' }, 34);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.translate(layout.width / 2, layout.height / 2);
  ctx.rotate(-Math.PI / 7);
  const step = ctx.measureText(`${layout.watermark}    `).width;
  const span = Math.hypot(layout.width, layout.height);
  for (let row = -span / 2; row < span / 2; row += 150) {
    const shift = ((row / 150) % 2) * (step / 2);
    for (let x = -span / 2 - step + shift; x < span / 2; x += step) ctx.fillText(layout.watermark, x, row);
  }
  ctx.restore();
}

/** Les dimensions intrinsèques d'une source — la vidéo par `videoWidth`, le reste par `width`. */
function sizeOf(source: CardSource): { readonly width: number; readonly height: number } {
  const numeric = (value: number | SVGAnimatedLength | undefined): number => (typeof value === 'number' ? value : 0);
  const width = source.videoWidth !== undefined && source.videoWidth > 0 ? source.videoWidth : numeric(source.width);
  const height = source.videoHeight !== undefined && source.videoHeight > 0 ? source.videoHeight : numeric(source.height);
  return { width, height };
}

/** Pose une source en « cover » dans son cadre arrondi : elle le remplit, centrée, sans jamais se déformer. */
function paintMedia(ctx: Paintable, op: Extract<CardOp, { kind: 'media' }>, source: CardSource | null): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(op.x, op.y, op.width, op.height, op.radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(127, 127, 127, 0.28)';
  ctx.fillRect(op.x, op.y, op.width, op.height);
  const size = source === null ? null : sizeOf(source);
  if (source !== null && size !== null && size.width > 0 && size.height > 0) {
    const scale = Math.max(op.width / size.width, op.height / size.height);
    const width = size.width * scale;
    const height = size.height * scale;
    ctx.drawImage(source, op.x + (op.width - width) / 2, op.y + (op.height - height) / 2, width, height);
  }
  ctx.restore();
}

function paintWave(ctx: Paintable, op: Extract<CardOp, { kind: 'wave' }>, progress: number | null): void {
  const count = op.peaks.length;
  if (count === 0) return;
  const pitch = op.width / count;
  const bar = Math.max(2, pitch * 0.55);
  const middle = op.y + op.height / 2;
  op.peaks.forEach((peak, i) => {
    const h = Math.max(bar, peak * op.height);
    const x = op.x + i * pitch + (pitch - bar) / 2;
    ctx.fillStyle = progress === null || (i + 0.5) / count <= progress ? op.color : op.dim;
    ctx.beginPath();
    ctx.roundRect(x, op.mirror ? middle - h / 2 : op.y + op.height - h, bar, h, bar / 2);
    ctx.fill();
  });
}

function paintText(ctx: Paintable, op: Extract<CardOp, { kind: 'text' }>): void {
  ctx.font = op.font;
  ctx.fillStyle = op.color;
  ctx.textAlign = op.align;
  ctx.direction = op.direction;
  if (op.rotate === undefined) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(op.text, op.x, op.y);
    return;
  }
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.translate(op.x, op.y);
  ctx.rotate(op.rotate);
  ctx.fillText(op.text, 0, 0);
  ctx.restore();
}

function paintSeparator(ctx: Paintable, op: Extract<CardOp, { kind: 'separator' }>, strokeFloor: number): void {
  const middle = (op.x1 + op.x2) / 2;
  const lineWidth = Math.max(op.lineWidth, strokeFloor);
  const grow = lineWidth / op.lineWidth;
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.setLineDash(op.dash.map((length) => length * grow));
  ctx.beginPath();
  if (op.radius === 0) {
    ctx.moveTo(op.x1, op.y);
    ctx.lineTo(op.x2, op.y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const radius = Math.max(op.radius, 2 * lineWidth);
  ctx.moveTo(op.x1, op.y);
  ctx.lineTo(middle - radius - 18, op.y);
  ctx.moveTo(middle + radius + 18, op.y);
  ctx.lineTo(op.x2, op.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(middle, op.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function paintOp(ctx: Paintable, op: CardOp, options: ResolvedOptions): void {
  if (options.progress !== null && (op.kind === 'dot' || op.kind === 'play') && op.still === true) return;
  switch (op.kind) {
    case 'text':
      paintText(ctx, op);
      return;
    case 'media':
      paintMedia(ctx, op, options.sources[op.index] ?? null);
      return;
    case 'wave':
      paintWave(ctx, op, options.progress);
      return;
    case 'play': {
      const half = op.size / 2;
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.moveTo(op.x - half * 0.8, op.y - half);
      ctx.lineTo(op.x + half, op.y);
      ctx.lineTo(op.x - half * 0.8, op.y + half);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'bar': {
      const width = Math.max(op.width, options.strokeFloor);
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.roundRect(op.x - (width - op.width) / 2, op.y, width, op.height, width / 2);
      ctx.fill();
      return;
    }
    case 'panel':
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.roundRect(op.x, op.y, op.width, op.height, op.radius);
      ctx.fill();
      return;
    case 'dot':
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.arc(op.x, op.y, Math.max(op.radius, options.strokeFloor), 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'separator':
      paintSeparator(ctx, op, options.strokeFloor);
      return;
  }
}

export function paintMessageCard(ctx: Paintable, layout: CardLayout, template: MessageCardTemplate, options: PaintOptions = {}): void {
  paintBackground(ctx, layout, template.palette);
  paintWatermark(ctx, layout, template.palette);
  const resolved: ResolvedOptions = { sources: options.sources ?? [], progress: options.progress ?? null, strokeFloor: options.strokeFloor ?? 0 };
  if (layout.tilt === 0) {
    for (const op of layout.ops) paintOp(ctx, op, resolved);
    return;
  }
  ctx.save();
  ctx.translate(layout.width / 2, layout.height / 2);
  ctx.rotate(layout.tilt);
  ctx.translate(-layout.width / 2, -layout.height / 2);
  for (const op of layout.ops) paintOp(ctx, op, resolved);
  ctx.restore();
}

export type RenderedMessageCard = {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly truncated: boolean;
  /** Les zones touchables de l'aperçu, en pixels de la carte. */
  readonly regions: readonly CardRegion[];
};

type Painted = { readonly layout: CardLayout; readonly blob: Blob };

/**
 * Mesure et peint la carte — `null` si le navigateur refuse le canvas
 * (mémoire, contexte perdu). `width` : la largeur voulue de l'image, `null`
 * pour la pleine taille. L'échelle se lit sur la MISE EN PAGE : un paysage fait
 * 1920 de large, une story 1080.
 */
async function paintCard(input: MessageCardInput, doc: Document, width: number | null, sources: readonly (CardSource | null)[]): Promise<Painted | null> {
  const template = templateOf(input.template);
  await loadCardFonts(template, doc.fonts);
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  const layout = layoutMessageCard(input, (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  });
  const scale = width === null ? 1 : width / layout.width;
  canvas.width = Math.max(1, Math.round(layout.width * scale));
  canvas.height = Math.max(1, Math.round(layout.height * scale));
  if (scale !== 1) ctx.scale(scale, scale);
  paintMessageCard(ctx, layout, template, { sources, strokeFloor: strokeFloorAt(scale) });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob === null ? null : { layout, blob };
}

/** Rend la carte en PNG — `null` si le navigateur refuse le canvas (mémoire, contexte perdu). */
export async function renderMessageCard(
  input: MessageCardInput,
  doc: Document = document,
  sources: readonly (CardSource | null)[] = [],
): Promise<RenderedMessageCard | null> {
  const painted = await paintCard(input, doc, null, sources);
  if (painted === null) return null;
  const stamped = withPngMetadata(new Uint8Array(await painted.blob.arrayBuffer()), MEESHY_PNG_METADATA);
  const blob = new Blob([stamped], { type: 'image/png' });
  const { layout } = painted;
  return { blob, width: layout.width, height: layout.height, truncated: layout.truncated, regions: layout.regions };
}

/**
 * La VIGNETTE d'une carte, pour la galerie : la même peinture, réduite à
 * `width` pixels de large, ses traits relevés au pixel d'écran. Elle ne quitte
 * jamais l'appareil — ni métadonnées, ni compteur d'usage.
 */
export async function renderMessageCardThumbnail(
  input: MessageCardInput,
  width: number,
  doc: Document = document,
  sources: readonly (CardSource | null)[] = [],
): Promise<Blob | null> {
  const painted = await paintCard(input, doc, width, sources);
  return painted?.blob ?? null;
}
