import type { GloryFramePaint, GloryFrameTextEffect, GloryFrameTextSlot } from '@meeshy/shared/types/glory-frame-format';

import { fitText, type MeasureText } from '@/lib/canvas/text-fit';

import type { PaintContext } from '../compose';
import type { GloryTextFace, TextScript } from '../glory-fonts';
import { LIVE_TEXT_SLOTS, type GloryTexts, type LiveTextSlot } from './frame-spec';

/**
 * **LE TEXTE D'UN CADRE DE GLOIRE** (#10159, § 5.5–5.6) — chaque emplacement
 * du contrat, à sa ligne de base et son ancre, dans sa police (une famille de
 * la liste fermée pour le latin, la pile système sinon, D10), son remplissage
 * uni ou dégradé (arrêts en fractions de la boîte du texte), son contour, ses
 * effets (copies décalées, dessous puis dessus) et son opacité.
 *
 *  - un emplacement VIVANT prend le texte du moment ; il passe en capitales
 *    quand l'exemple de l'export l'était, jamais en arabe ;
 *  - un texte trop long rétrécit puis s'ellipse (`fitText`) dans la place que
 *    son ancre lui laisse ; un emplacement décoratif garde la boîte de son
 *    exemple ;
 *  - l'arabe s'écrit de droite à gauche dans son emplacement, le canevas
 *    restant en sens LTR ;
 *  - un emplacement sur CHEMIN (légendes courbes) n'est pas peint par ce lot :
 *    le texte courbe est un suivi nommé, jamais un texte droit posé de travers.
 */

export type GloryTextDeps = {
  readonly width: number;
  readonly language: string;
  readonly face: (slot: GloryFrameTextSlot['font'], text: string, px: number) => GloryTextFace;
  readonly script: (text: string) => TextScript;
};

const isLive = (key: string): key is LiveTextSlot => (LIVE_TEXT_SLOTS as readonly string[]).includes(key);

/** La marge qu'un texte vivant garde au bord de l'image. */
const EDGE = 0.06;

/** La place d'un texte vivant : symétrique autour de l'ancre `middle`, jusqu'au bord sinon ; un décor garde sa boîte d'exemple. */
function maxWidthOf(slot: GloryFrameTextSlot, live: boolean, width: number): number {
  if (!live) return slot.bbox[2] * 1.02;
  const edge = width * EDGE;
  if (slot.anchor === 'middle') return Math.max(slot.bbox[2], Math.min(slot.x - edge, width - slot.x - edge) * 2);
  return Math.max(slot.bbox[2], slot.anchor === 'start' ? width - slot.x - edge : slot.x - edge);
}

const ALIGN: Readonly<Record<GloryFrameTextSlot['anchor'], CanvasTextAlign>> = { start: 'left', middle: 'center', end: 'right' };

const paintOf = (ctx: PaintContext, paint: GloryFramePaint, bbox: GloryFrameTextSlot['bbox']): string | CanvasGradient => {
  if ('solid' in paint) return paint.solid;
  const [x, y, w, h] = bbox;
  const { x1, y1, x2, y2, stops } = paint.linear;
  const gradient = ctx.createLinearGradient(x + x1 * w, y + y1 * h, x + x2 * w, y + y2 * h);
  stops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  return gradient as CanvasGradient;
};

function strokeIf(ctx: PaintContext, stroke: GloryFrameTextSlot['stroke'], bbox: GloryFrameTextSlot['bbox'], text: string, x: number, y: number): void {
  if (stroke === null || stroke.width <= 0 || ctx.strokeText === undefined) return;
  ctx.strokeStyle = paintOf(ctx, stroke.paint, bbox);
  ctx.lineWidth = stroke.width;
  ctx.strokeText(text, x, y);
}

function paintEffect(ctx: PaintContext, effect: GloryFrameTextEffect, slot: GloryFrameTextSlot, text: string, baseAlpha: number): void {
  ctx.save();
  if (ctx.globalAlpha !== undefined) ctx.globalAlpha = baseAlpha * effect.opacity;
  ctx.fillStyle = paintOf(ctx, effect.fill, slot.bbox);
  ctx.fillText(text, slot.x + effect.dx, slot.baseline + effect.dy);
  strokeIf(ctx, effect.stroke, slot.bbox, text, slot.x + effect.dx, slot.baseline + effect.dy);
  ctx.restore();
}

const measureWith = (ctx: PaintContext, slot: GloryFrameTextSlot, face: (px: number) => GloryTextFace): MeasureText => (text, px) => {
  const measure = ctx.measureText;
  if (measure === undefined) return Array.from(text).length * px * 0.56 + Math.max(0, Array.from(text).length - 1) * slot.font.tracking;
  ctx.font = face(px).font;
  return measure.call(ctx, text).width;
};

/** Le texte en capitales quand l'exemple de l'export l'était (une DONNÉE du contrat, jamais une règle écrite ici), sauf en arabe. */
const casedLike = (sample: string, text: string, uppercase: boolean, language: string): string =>
  uppercase && sample === sample.toLocaleUpperCase(language) && sample !== sample.toLocaleLowerCase(language) ? text.toLocaleUpperCase(language) : text;

function paintSlot(ctx: PaintContext, slot: GloryFrameTextSlot, raw: string, live: boolean, deps: GloryTextDeps): void {
  const face = (px: number): GloryTextFace => deps.face(slot.font, raw, px);
  const text = casedLike(slot.sample, raw, face(slot.font.size).uppercase, deps.language);
  const fitted = fitText(measureWith(ctx, slot, (px) => deps.face(slot.font, text, px)), text, maxWidthOf(slot, live, deps.width), slot.font.size);
  if (fitted.text.length === 0) return;
  const shape = deps.face(slot.font, fitted.text, fitted.px);
  ctx.save();
  if (slot.matrix !== undefined && ctx.transform !== undefined) ctx.transform(...slot.matrix);
  ctx.font = shape.font;
  ctx.textAlign = ALIGN[slot.anchor];
  ctx.textBaseline = 'alphabetic';
  ctx.shadowBlur = 0;
  if (ctx.direction !== undefined) ctx.direction = deps.script(fitted.text) === 'arabic' ? 'rtl' : 'ltr';
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${shape.tracking}px`;
  slot.effects.filter((effect) => effect.under).forEach((effect) => paintEffect(ctx, effect, slot, fitted.text, slot.opacity));
  if (ctx.globalAlpha !== undefined) ctx.globalAlpha = slot.opacity;
  ctx.fillStyle = paintOf(ctx, slot.fill, slot.bbox);
  ctx.fillText(fitted.text, slot.x, slot.baseline);
  strokeIf(ctx, slot.stroke, slot.bbox, fitted.text, slot.x, slot.baseline);
  slot.effects.filter((effect) => !effect.under).forEach((effect) => paintEffect(ctx, effect, slot, fitted.text, slot.opacity));
  ctx.restore();
}

export function paintGloryText(ctx: PaintContext, slots: Readonly<Record<string, GloryFrameTextSlot>>, texts: GloryTexts, deps: GloryTextDeps): void {
  Object.entries(slots).forEach(([key, slot]) => {
    if (slot.path !== null) return;
    const live = isLive(key);
    const raw = live ? texts[key] : slot.sample;
    if (raw === null || raw.length === 0) return;
    paintSlot(ctx, slot, raw, live, deps);
  });
}
