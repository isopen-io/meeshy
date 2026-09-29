import '@/styles/story-fonts.css';

import { CARD_WIDTH, layoutMessageCard, type CardLayout, type CardOp, type CardRegion, type MessageCardInput } from './message-card-layout';
import { MEESHY_PNG_METADATA, withPngMetadata } from './png-metadata';
import { canvasFont, templateFonts, templateOf, type CardPalette, type MessageCardTemplate } from './message-card-templates';

/**
 * **LA PEINTURE D'UNE CARTE D'EXPORT** — la moitié impure de
 * `message-card-layout.ts` : elle ATTEND les polices du template (une carte
 * peinte avant l'arrivée du WOFF2 figerait la police système dans l'image),
 * mesure avec le vrai contexte, peint, et rend un PNG signé Meeshy dans ses
 * métadonnées (`png-metadata.ts`).
 *
 * Chargée à la demande, au premier « Exporter en image » : ni le fil ni le
 * menu ne paient ce module, ni les `@font-face` qu'il importe.
 */

type Paintable = Pick<
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
> & { direction: CanvasDirection; lineCap: CanvasLineCap };

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

function paintOp(ctx: Paintable, op: CardOp): void {
  if (op.kind === 'text') {
    ctx.font = op.font;
    ctx.fillStyle = op.color;
    ctx.textAlign = op.align;
    ctx.textBaseline = 'alphabetic';
    ctx.direction = op.direction;
    ctx.fillText(op.text, op.x, op.y);
    return;
  }
  if (op.kind === 'bar' || op.kind === 'panel') {
    ctx.fillStyle = op.color;
    ctx.beginPath();
    ctx.roundRect(op.x, op.y, op.width, op.height, op.kind === 'panel' ? op.radius : op.width / 2);
    ctx.fill();
    return;
  }
  if (op.kind === 'dot') {
    ctx.fillStyle = op.color;
    ctx.beginPath();
    ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const middle = (op.x1 + op.x2) / 2;
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.lineWidth;
  ctx.lineCap = 'round';
  ctx.setLineDash([...op.dash]);
  ctx.beginPath();
  if (op.radius === 0) {
    ctx.moveTo(op.x1, op.y);
    ctx.lineTo(op.x2, op.y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.moveTo(op.x1, op.y);
  ctx.lineTo(middle - op.radius - 18, op.y);
  ctx.moveTo(middle + op.radius + 18, op.y);
  ctx.lineTo(op.x2, op.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(middle, op.y, op.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function paintMessageCard(ctx: Paintable, layout: CardLayout, template: MessageCardTemplate): void {
  paintBackground(ctx, layout, template.palette);
  paintWatermark(ctx, layout, template.palette);
  for (const op of layout.ops) paintOp(ctx, op);
}

export type RenderedMessageCard = {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly truncated: boolean;
  /** Les zones touchables de l'aperçu, en pixels de la carte (1080 de large). */
  readonly regions: readonly CardRegion[];
};

type Painted = { readonly layout: CardLayout; readonly blob: Blob };

/** Mesure et peint la carte à l'échelle voulue — `null` si le navigateur refuse le canvas (mémoire, contexte perdu). */
async function paintCard(input: MessageCardInput, doc: Document, scale: number): Promise<Painted | null> {
  const template = templateOf(input.template);
  await loadCardFonts(template, doc.fonts);
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  const layout = layoutMessageCard(input, (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  });
  canvas.width = Math.max(1, Math.round(layout.width * scale));
  canvas.height = Math.max(1, Math.round(layout.height * scale));
  if (scale !== 1) ctx.scale(scale, scale);
  paintMessageCard(ctx, layout, template);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob === null ? null : { layout, blob };
}

/** Rend la carte en PNG — `null` si le navigateur refuse le canvas (mémoire, contexte perdu). */
export async function renderMessageCard(input: MessageCardInput, doc: Document = document): Promise<RenderedMessageCard | null> {
  const painted = await paintCard(input, doc, 1);
  if (painted === null) return null;
  const stamped = withPngMetadata(new Uint8Array(await painted.blob.arrayBuffer()), MEESHY_PNG_METADATA);
  const blob = new Blob([stamped], { type: 'image/png' });
  const { layout } = painted;
  return { blob, width: layout.width, height: layout.height, truncated: layout.truncated, regions: layout.regions };
}

/**
 * La VIGNETTE d'une carte, pour la galerie : la même peinture, réduite à
 * `width` pixels de large. Elle ne quitte jamais l'appareil — ni métadonnées,
 * ni compteur d'usage.
 */
export async function renderMessageCardThumbnail(input: MessageCardInput, width: number, doc: Document = document): Promise<Blob | null> {
  const painted = await paintCard(input, doc, width / CARD_WIDTH);
  return painted?.blob ?? null;
}
