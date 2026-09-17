import { hexColorCss } from './background';

/**
 * LE DESSIN D'UNE SCÈNE (#6901, D8) — `payload.strokes` (`StoryDrawingStroke`,
 * `StoryDrawingStroke.swift:10-77`, § 1.6/1.9 de la spécification) : des
 * traits en espace design 1080×1920, rendus en `<svg viewBox="0 0 1080
 * 1920">` plein cadre (parité point à point avec `StoryStrokeRasterizer`,
 * écart de rendu ASSUMÉ comme le legacy `CanvasV3Scene.tsx:794-796` — le
 * PNG legacy `data` n'est pas décodé, hors contrat).
 */

export type DrawingPoint = { readonly x: number; readonly y: number; readonly pressure?: number };
export type DrawingTool = 'pen' | 'marker' | 'eraser' | string;

export type Stroke = {
  readonly points: readonly DrawingPoint[];
  readonly colorHex?: string;
  readonly width: number;
  readonly tool: DrawingTool;
  readonly captureVersion?: number;
};

/** `MARKER_ALPHA` (miroir legacy `CanvasV3Scene.tsx:764-775`) — l'opacité du
 * trait FEUTRE, distincte du trait STYLO. */
export const MARKER_ALPHA = 0.45;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const numberOf = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function parsePoint(raw: unknown): DrawingPoint | null {
  if (!isRecord(raw)) return null;
  const x = raw.x;
  const y = raw.y;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const pressure = typeof raw.pressure === 'number' && Number.isFinite(raw.pressure) ? raw.pressure : undefined;
  return { x, y, ...(pressure !== undefined ? { pressure } : {}) };
}

function parseStroke(raw: unknown): Stroke | null {
  if (!isRecord(raw)) return null;
  const rawPoints = raw.points;
  const points = Array.isArray(rawPoints) ? rawPoints.map(parsePoint).filter((p): p is DrawingPoint => p !== null) : [];
  if (points.length === 0) return null;
  const width = numberOf(raw.width, 6);
  const tool = typeof raw.tool === 'string' ? raw.tool : 'pen';
  const colorHex = hexColorCss(raw.colorHex);
  const captureVersion = typeof raw.captureVersion === 'number' ? raw.captureVersion : undefined;
  return { points, width, tool, ...(colorHex !== undefined ? { colorHex } : {}), ...(captureVersion !== undefined ? { captureVersion } : {}) };
}

/** Les traits PEIGNABLES d'une charge `.drawing` — `eraser` et les traits
 * sans point sont ÉCARTÉS (T-D9). */
export function paintableStrokes(payload: Record<string, unknown>): readonly Stroke[] {
  const raw = payload.strokes;
  if (!Array.isArray(raw)) return [];
  return raw.map(parseStroke).filter((s): s is Stroke => s !== null && s.tool !== 'eraser');
}

/**
 * `strokeWidth` — miroir `StrokeWidthMapping` : le plancher passe AVANT le
 * plafond (`min(base, max(1, base × facteur))`), même ordre que
 * `MediaCropRule.clamped` (leçon mémoire : deux planchers qui ne tiennent pas
 * au même endroit rendraient deux bandes différentes pour un même geste).
 * `captureVersion >= 1` module par la PRESSION moyenne (0.7 pour une pression
 * médiane) ; `captureVersion` absent/0 rend le trait TEL QUEL.
 */
export function strokeWidth(stroke: Pick<Stroke, 'width' | 'tool' | 'captureVersion'>, pressure = 1): number {
  const base = stroke.tool === 'marker' ? stroke.width * 2 : stroke.width;
  if ((stroke.captureVersion ?? 0) < 1) return base;
  const factor = 0.4 + 0.6 * Math.min(Math.max(pressure, 0), 1);
  return Math.min(base, Math.max(1, base * factor));
}
