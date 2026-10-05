import type { Ornament, Rect, Size } from './call-montage-shapes';

/**
 * **LE RENDU DES ORNEMENTS GLAMOUR** (#8580) — ce que `call-montage-glamour.ts`
 * a posé, tracé : les accroches et le code-barres d'une couverture, le velours
 * et les flashs du tapis rouge, le bokeh et le cadre d'or, les numéros d'une
 * pellicule, le grain et le vignettage d'un studio noir et blanc.
 */

type Surface2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type GlamourOrnament = Extract<Ornament, { readonly kind: 'coverline' | 'barcode' | 'flashes' | 'drapes' | 'bokeh' | 'frame' | 'frameNumbers' | 'grain' | 'vignette' }>;

export const isGlamourOrnament = (ornament: Ornament): ornament is GlamourOrnament =>
  ornament.kind === 'coverline' ||
  ornament.kind === 'barcode' ||
  ornament.kind === 'flashes' ||
  ornament.kind === 'drapes' ||
  ornament.kind === 'bokeh' ||
  ornament.kind === 'frame' ||
  ornament.kind === 'frameNumbers' ||
  ornament.kind === 'grain' ||
  ornament.kind === 'vignette';

const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

function star(context: Surface2D, x: number, y: number, r: number): void {
  const glow = context.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 244, 214, 0.55)');
  glow.addColorStop(1, 'rgba(255, 244, 214, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, r, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  context.lineWidth = Math.max(1, r * 0.06);
  context.beginPath();
  context.moveTo(x - r * 1.4, y);
  context.lineTo(x + r * 1.4, y);
  context.moveTo(x, y - r * 1.4);
  context.lineTo(x, y + r * 1.4);
  context.stroke();
}

export function paintGlamourOrnament(context: Surface2D, ornament: GlamourOrnament, coverlines: readonly string[], size: Size): void {
  const unit = Math.min(size.width, size.height);
  context.save();
  switch (ornament.kind) {
    case 'coverline': {
      const text = (coverlines[ornament.index] ?? '').toUpperCase();
      context.fillStyle = ornament.accent ? '#ffd666' : '#ffffff';
      context.shadowColor = 'rgba(0, 0, 0, 0.6)';
      context.shadowBlur = unit * 0.012;
      context.font = `${ornament.accent ? 900 : 700} ${Math.round(ornament.rect.height * 0.8)}px system-ui, sans-serif`;
      context.textBaseline = 'top';
      context.textAlign = 'left';
      context.fillText(text, ornament.rect.x, ornament.rect.y, ornament.rect.width);
      break;
    }
    case 'barcode':
      context.fillStyle = '#ffffff';
      context.fillRect(ornament.rect.x - unit * 0.01, ornament.rect.y - unit * 0.01, ornament.rect.width + unit * 0.02, ornament.rect.height + unit * 0.02);
      context.fillStyle = '#111111';
      ornament.bars.forEach((bar) => context.fillRect(bar.x, bar.y, bar.width, bar.height));
      break;
    case 'flashes':
      ornament.points.forEach((point) => star(context, point.x, point.y, point.r));
      break;
    case 'drapes':
      ornament.folds.forEach((fold) => {
        const shade = context.createLinearGradient(fold.x, 0, fold.x + fold.width, 0);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
        shade.addColorStop(0.5, 'rgba(255, 90, 110, 0.12)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        context.fillStyle = shade;
        context.fillRect(fold.x, fold.y, fold.width, fold.height);
      });
      break;
    case 'bokeh':
      ornament.circles.forEach((circle, index) => {
        const glow = context.createRadialGradient(circle.x, circle.y, 0, circle.x, circle.y, circle.r);
        glow.addColorStop(0, index % 3 === 0 ? 'rgba(255, 214, 120, 0.55)' : 'rgba(255, 176, 80, 0.35)');
        glow.addColorStop(1, 'rgba(255, 176, 80, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
        context.fill();
      });
      break;
    case 'frame': {
      const { rect, width } = ornament;
      const metal = context.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
      metal.addColorStop(0, '#b8862b');
      metal.addColorStop(0.3, '#f7e08a');
      metal.addColorStop(0.55, '#c9962e');
      metal.addColorStop(0.8, '#fff1b0');
      metal.addColorStop(1, '#a8741c');
      context.strokeStyle = metal;
      context.shadowColor = 'rgba(255, 207, 107, 0.6)';
      context.shadowBlur = width * 1.5;
      context.lineWidth = width;
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.shadowBlur = 0;
      context.lineWidth = width * 0.3;
      context.strokeRect(rect.x + width * 1.4, rect.y + width * 1.4, rect.width - width * 2.8, rect.height - width * 2.8);
      break;
    }
    case 'frameNumbers':
      context.fillStyle = '#f59e0b';
      context.textBaseline = 'top';
      context.textAlign = 'left';
      ornament.items.forEach((item) => {
        context.font = `700 ${Math.round(item.size)}px ui-monospace, monospace`;
        context.fillText(item.text, item.x, item.y);
      });
      break;
    case 'grain':
      context.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ornament.dots.forEach((dot) => {
        context.beginPath();
        context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        context.fill();
      });
      break;
    case 'vignette': {
      const { x, y } = center(ornament.rect);
      const reach = Math.hypot(ornament.rect.width, ornament.rect.height) / 2;
      const shade = context.createRadialGradient(x, y, reach * 0.45, x, y, reach);
      shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      context.fillStyle = shade;
      context.fillRect(ornament.rect.x, ornament.rect.y, ornament.rect.width, ornament.rect.height);
      break;
    }
  }
  context.restore();
}
