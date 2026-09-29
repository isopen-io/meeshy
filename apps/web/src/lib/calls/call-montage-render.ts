import { containRect, coverCrop, type MontageCell, type MontageLayout, type Ornament, type Rect, type Size } from './call-montage';
import { isGlamourOrnament, paintGlamourOrnament } from './call-montage-glamour-render';

/**
 * **LE RENDU D'UN MONTAGE** (#8552) — la couche MINCE : elle trace ce que
 * `montageLayout` a calculé, sur un canevas de n'importe quelle taille. Le
 * même appel sert l'aperçu vivant des pastilles (quelques images par
 * seconde, petit), le grand aperçu, et la capture à pleine résolution.
 */

type Surface2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Une image à peindre — jamais en miroir : une capture montre ce que l'autre voit (#8696, `cameraMirrored`). */
export type Paintable = { readonly source: CanvasImageSource; readonly size: Size; readonly fit: 'cover' | 'contain' };

/** Les mots d'un montage : la bulle de la BD, la date, les trois accroches d'une couverture (#8580). */
export type MontageText = { readonly bubble: string; readonly date: string; readonly coverlines: readonly string[] };

const BACKDROP: ReadonlySet<Ornament['kind']> = new Set(['drapes', 'bokeh', 'flashes']);

/** Le cœur, dans sa boîte : deux lobes et une pointe. */
export function heartPath(context: Surface2D, box: Rect): void {
  const { x, y, width: w, height: h } = box;
  context.beginPath();
  context.moveTo(x + w / 2, y + h * 0.28);
  context.bezierCurveTo(x + w / 2, y + h * 0.06, x + w * 0.1, y - h * 0.02, x + w * 0.04, y + h * 0.3);
  context.bezierCurveTo(x - w * 0.02, y + h * 0.58, x + w * 0.3, y + h * 0.76, x + w / 2, y + h * 0.96);
  context.bezierCurveTo(x + w * 0.7, y + h * 0.76, x + w * 1.02, y + h * 0.58, x + w * 0.96, y + h * 0.3);
  context.bezierCurveTo(x + w * 0.9, y - h * 0.02, x + w / 2, y + h * 0.06, x + w / 2, y + h * 0.28);
  context.closePath();
}

const rounded = (context: Surface2D, rect: Rect, radius: number): void => {
  context.beginPath();
  if (radius > 0 && typeof context.roundRect === 'function') context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  else context.rect(rect.x, rect.y, rect.width, rect.height);
};

/** Une image dans son rectangle : rognée pour le remplir (ou entière pour un écran). */
export function paintInto(context: Surface2D, tile: Paintable, rect: Rect, crop: Rect | null = null): void {
  if (tile.size.width <= 0 || tile.size.height <= 0 || rect.width <= 0 || rect.height <= 0) return;
  const target = tile.fit === 'contain' && crop === null ? containRect(tile.size, rect) : rect;
  const source = crop ?? (tile.fit === 'contain' ? { x: 0, y: 0, width: tile.size.width, height: tile.size.height } : coverCrop(tile.size, rect));
  context.drawImage(tile.source, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
}

function paintCell(context: Surface2D, cell: MontageCell, tile: Paintable): void {
  context.save();
  const cx = cell.card.x + cell.card.width / 2;
  const cy = cell.card.y + cell.card.height / 2;
  if (cell.rotation !== 0) {
    context.translate(cx, cy);
    context.rotate((cell.rotation * Math.PI) / 180);
    context.translate(-cx, -cy);
  }
  if (cell.glow !== null) {
    context.save();
    context.shadowColor = cell.glow;
    context.shadowBlur = Math.min(cell.card.width, cell.card.height) * 0.12;
    context.fillStyle = cell.glow;
    rounded(context, cell.photo, cell.radius);
    context.fill();
    context.restore();
  }
  if (cell.cardColor !== null) {
    context.shadowColor = 'rgba(0, 0, 0, 0.45)';
    context.shadowBlur = cell.card.width * 0.05;
    context.shadowOffsetY = cell.card.width * 0.015;
    context.fillStyle = cell.cardColor;
    rounded(context, cell.card, cell.radius);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }
  context.save();
  rounded(context, cell.photo, cell.cardColor === null ? cell.radius : 0);
  context.clip();
  context.fillStyle = '#000000';
  context.fillRect(cell.photo.x, cell.photo.y, cell.photo.width, cell.photo.height);
  if (cell.tone === 'mono') context.filter = 'grayscale(1) contrast(1.25) brightness(1.05)';
  paintInto(context, tile, cell.photo);
  context.restore();
  if (cell.stroke !== null) {
    context.lineWidth = cell.stroke.width;
    context.strokeStyle = cell.stroke.color;
    rounded(context, cell.photo, cell.radius);
    context.stroke();
  }
  context.restore();
}

function paintOrnament(context: Surface2D, ornament: Ornament, text: MontageText, size: Size): void {
  const unit = Math.min(size.width, size.height);
  if (isGlamourOrnament(ornament)) {
    paintGlamourOrnament(context, ornament, text.coverlines, size);
    return;
  }
  switch (ornament.kind) {
    case 'holes':
      context.fillStyle = '#f2efe6';
      ornament.rects.forEach((rect) => {
        rounded(context, rect, rect.width * 0.25);
        context.fill();
      });
      return;
    case 'masthead':
      context.save();
      context.fillStyle = '#ffffff';
      context.shadowColor = 'rgba(0, 0, 0, 0.5)';
      context.shadowBlur = unit * 0.02;
      context.font = `900 ${Math.round(ornament.rect.height * 0.9)}px Georgia, 'Times New Roman', serif`;
      context.textBaseline = 'top';
      context.textAlign = 'center';
      context.fillText(ornament.text, ornament.rect.x + ornament.rect.width / 2, ornament.rect.y, ornament.rect.width);
      context.restore();
      return;
    case 'dateline':
      context.save();
      context.fillStyle = '#ffd666';
      context.font = `700 ${Math.round(ornament.rect.height * 0.8)}px system-ui, sans-serif`;
      context.textBaseline = 'top';
      context.textAlign = 'center';
      context.fillText(text.date.toUpperCase(), ornament.rect.x + ornament.rect.width / 2, ornament.rect.y, ornament.rect.width);
      context.restore();
      return;
    case 'halftone': {
      context.save();
      context.beginPath();
      context.rect(ornament.rect.x, ornament.rect.y, ornament.rect.width, ornament.rect.height);
      context.clip();
      context.fillStyle = 'rgba(17, 17, 17, 0.14)';
      const step = Math.max(6, unit * 0.018);
      const dotsX = Math.ceil(ornament.rect.width / step / 3);
      const dotsY = Math.ceil(ornament.rect.height / step / 3);
      Array.from({ length: dotsX * dotsY }, (_, index) => index).forEach((index) => {
        const x = ornament.rect.x + ornament.rect.width - (index % dotsX) * step;
        const y = ornament.rect.y + ornament.rect.height - Math.floor(index / dotsX) * step;
        context.beginPath();
        context.arc(x, y, step * 0.28, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
      return;
    }
    case 'bubble': {
      const { rect, tail } = ornament;
      context.save();
      context.fillStyle = '#ffffff';
      context.strokeStyle = '#111111';
      context.lineWidth = unit * 0.008;
      const tailPath = (inset: number): void => {
        context.beginPath();
        context.moveTo(rect.x + rect.width * (0.45 + inset), rect.y + rect.height * (0.9 - inset * 2));
        context.lineTo(tail.x, tail.y - inset * rect.height);
        context.lineTo(rect.x + rect.width * (0.62 - inset), rect.y + rect.height * (0.88 - inset * 2));
        context.closePath();
      };
      tailPath(0);
      context.fill();
      context.stroke();
      context.beginPath();
      context.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      tailPath(0.03);
      context.fill();
      context.fillStyle = '#111111';
      context.font = `800 ${Math.round(rect.height * 0.3)}px 'Comic Sans MS', 'Chalkboard SE', system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text.bubble, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width * 0.8);
      context.restore();
      return;
    }
  }
}

function backgroundFill(context: Surface2D, layout: MontageLayout): string | CanvasGradient {
  const { background, size } = layout;
  if (background.kind === 'solid') return background.color;
  if (background.kind === 'vertical') {
    const gradient = context.createLinearGradient(0, 0, 0, size.height);
    gradient.addColorStop(0, background.from);
    gradient.addColorStop(1, background.to);
    return gradient;
  }
  const reach = Math.hypot(size.width, size.height) / 2;
  const gradient = context.createRadialGradient(size.width / 2, size.height * 0.4, 0, size.width / 2, size.height * 0.4, reach);
  gradient.addColorStop(0, background.inner);
  gradient.addColorStop(1, background.outer);
  return gradient;
}

export function drawMontage(context: Surface2D, layout: MontageLayout, tiles: readonly Paintable[], text: MontageText): void {
  const { size } = layout;
  context.save();
  context.fillStyle = backgroundFill(context, layout);
  context.fillRect(0, 0, size.width, size.height);
  layout.ornaments.filter((ornament) => BACKDROP.has(ornament.kind)).forEach((ornament) => paintOrnament(context, ornament, text, size));
  const halftones = layout.ornaments.filter((ornament) => ornament.kind === 'halftone');
  const overlays = layout.ornaments.filter((ornament) => ornament.kind !== 'halftone' && !BACKDROP.has(ornament.kind));
  if (layout.clip !== null) {
    const heart = layout.clip.box;
    context.save();
    heartPath(context, heart);
    context.clip();
    layout.cells.forEach((cell, index) => {
      const tile = tiles[index];
      if (tile !== undefined) paintCell(context, cell, tile);
    });
    context.restore();
    context.lineWidth = Math.min(size.width, size.height) * 0.012;
    context.strokeStyle = '#ffffff';
    heartPath(context, heart);
    context.stroke();
  } else {
    layout.cells.forEach((cell, index) => {
      const tile = tiles[index];
      if (tile !== undefined) paintCell(context, cell, tile);
    });
  }
  halftones.forEach((ornament) => paintOrnament(context, ornament, text, size));
  overlays.forEach((ornament) => paintOrnament(context, ornament, text, size));
  context.restore();
}
