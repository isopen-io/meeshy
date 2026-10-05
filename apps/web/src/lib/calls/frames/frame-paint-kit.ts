import { scatter, type Rect, type Size } from '../call-montage-shapes';
import type { FrameSlotBox } from './frame-layout';

/**
 * **LES OUTILS COMMUNS DES PEINTRES DE CADRE** (#8741) — la surface, les
 * couleurs, le hasard déterministe, la densité et les zones libres où un
 * ornement de premier plan peut se poser sans couvrir un visage.
 */

export type Surface2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type Point = { readonly x: number; readonly y: number };

export const TAU = Math.PI * 2;

export const rectOf = (size: Size): Rect => ({ x: 0, y: 0, width: size.width, height: size.height });

export const unitOf = (size: Size): number => Math.min(size.width, size.height);

export const insetRect = (rect: Rect, by: number): Rect => ({ x: rect.x + by, y: rect.y + by, width: Math.max(0, rect.width - by * 2), height: Math.max(0, rect.height - by * 2) });

/** L'encombrement d'une case tournée — le rectangle droit qui la contient. */
export function footprint(box: Pick<FrameSlotBox, 'rect' | 'rotation'>): Rect {
  const radians = (Math.abs(box.rotation) * Math.PI) / 180;
  const width = box.rect.width * Math.cos(radians) + box.rect.height * Math.sin(radians);
  const height = box.rect.width * Math.sin(radians) + box.rect.height * Math.cos(radians);
  return { x: box.rect.x + (box.rect.width - width) / 2, y: box.rect.y + (box.rect.height - height) / 2, width, height };
}

/** Place le repère au centre de `box`, tourné de sa rotation : ce qui suit se dessine dans le repère de la case. */
export function enterSlot(context: Surface2D, box: Pick<FrameSlotBox, 'rect' | 'rotation'>): void {
  if (box.rotation === 0) return;
  const cx = box.rect.x + box.rect.width / 2;
  const cy = box.rect.y + box.rect.height / 2;
  context.translate(cx, cy);
  context.rotate((box.rotation * Math.PI) / 180);
  context.translate(-cx, -cy);
}

export const centerOf = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/** Le hasard d'un cadre : une graine par ornement, une valeur par tirage — le même aperçu à chaque image. */
export const rand = (seed: number, draw: number): number => scatter(seed * 97.13 + draw * 7.31 + 0.5);

/**
 * Une couleur en composantes 0…255 et alpha 0…1 : `#RGB`, `#RRGGBB`,
 * `#RRGGBBAA` (le catalogue) ou `rgb()`/`rgba()` (ce que `tint` et `mix`
 * rendent — un mélange se remélange). Une couleur illisible rend le noir opaque.
 */
export function parseColor(color: string): { readonly r: number; readonly g: number; readonly b: number; readonly a: number } {
  const functional = /^rgba?\(([^)]*)\)$/i.exec(color.trim());
  if (functional !== null) {
    const [r = 0, g = 0, b = 0, a = 1] = (functional[1] ?? '').split(/[\s,/]+/).filter((part) => part.length > 0).map(Number);
    const finite = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);
    return { r: finite(r, 0), g: finite(g, 0), b: finite(b, 0), a: finite(a, 1) };
  }
  const body = color.trim().replace('#', '');
  const full = body.length === 3 ? body.split('').map((digit) => digit + digit).join('') : body;
  const channel = (index: number): number => {
    const value = Number.parseInt(full.slice(index * 2, index * 2 + 2), 16);
    return Number.isFinite(value) ? value : 0;
  };
  return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) / 255 : 1 };
}

/** La couleur avec son alpha multiplié par `alpha` — pour les dégradés qui s'éteignent. */
export function tint(hex: string, alpha = 1): string {
  const { r, g, b, a } = parseColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.max(0, Math.min(1, a * alpha)) * 1000) / 1000})`;
}

/** Mélange deux couleurs (0 = la première) — alpha compris. */
export function mix(from: string, to: string, share: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  const at = (x: number, y: number): number => Math.round(x + (y - x) * share);
  return `rgba(${at(a.r, b.r)}, ${at(a.g, b.g)}, ${at(a.b, b.b)}, ${Math.round((a.a + (b.a - a.a) * share) * 1000) / 1000})`;
}

/** La luminance perçue (0 noir, 1 blanc) : pour choisir une encre lisible sur un fond. */
export function luminance(hex: string): number {
  const { r, g, b } = parseColor(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const DENSITY = { low: 0.5, mid: 1, high: 1.8 } as const;

export const countFor = (base: number, density: keyof typeof DENSITY): number => Math.max(1, Math.round(base * DENSITY[density]));

/** Un rectangle arrondi tracé à la main (`arcTo`), le même sur tous les moteurs. */
export function roundedRectPath(context: Surface2D, rect: Rect, radius: number): void {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const { x, y, width: w, height: h } = rect;
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Un point tiré dans l'union de `zones`, pondérée par leur aire ; `null` si aucune zone n'a d'aire. */
export function pointIn(zones: readonly Rect[], seed: number, draw: number): Point | null {
  const areas = zones.map((zone) => zone.width * zone.height);
  const total = areas.reduce((sum, area) => sum + area, 0);
  if (total <= 0) return null;
  const pick = rand(seed, draw * 3) * total;
  const index = areas.reduce<{ readonly index: number; readonly left: number }>((state, area, at) => (state.left < 0 ? state : { index: at, left: state.left - area }), { index: 0, left: pick }).index;
  const zone = zones[index] ?? zones[0];
  if (zone === undefined) return null;
  return { x: zone.x + rand(seed, draw * 3 + 1) * zone.width, y: zone.y + rand(seed, draw * 3 + 2) * zone.height };
}

/**
 * Les SCÈNES d'un ornement : `back` la toile entière ; `front` les marges et
 * les réserves de texte seulement (§ 4.4) — un ornement de premier plan ne
 * se pose jamais sur un visage. `avoid` porte l'encombrement des cases.
 */
export type OrnamentStage = {
  readonly size: Size;
  readonly unit: number;
  readonly zones: readonly Rect[];
  readonly avoid: readonly Rect[];
  readonly top: Rect;
  readonly bottom: Rect;
  readonly inner: Rect;
  readonly slots: readonly FrameSlotBox[];
  readonly front: boolean;
  /** L'encombrement des textes des réserves : aucun ornement semé ne s'y pose, au fond comme devant. */
  readonly text: readonly Rect[];
  /** Le titre (ou, à défaut, le sous-titre) — ce que le ruban habille. */
  readonly headline: Rect | null;
};

/** `count` positions tirées dans les zones de la scène, chacune gardant `radius(i)` de jeu avec les cases au premier plan. */
export function spots(stage: OrnamentStage, seed: number, count: number, radius: (draw: number) => number): readonly (Point & { readonly r: number; readonly draw: number })[] {
  return Array.from({ length: count }, (_, draw) => {
    const r = radius(draw);
    const tries = Array.from({ length: 6 }, (__, attempt) => pointIn(stage.zones, seed, draw * 7 + attempt));
    const clear = (point: Point): boolean => {
      const around = { x: point.x - r, y: point.y - r, width: r * 2, height: r * 2 };
      return !stage.text.some((box) => intersects(box, around)) && (!stage.front || !stage.avoid.some((box) => intersects(box, around)));
    };
    const found = tries.find((point) => point !== null && clear(point));
    return found === undefined || found === null ? null : { ...found, r, draw };
  }).filter((spot): spot is Point & { readonly r: number; readonly draw: number } => spot !== null);
}

/** Restreint la peinture aux zones de la scène (premier plan) — rien ne déborde sur un visage. */
export function clipToStage(context: Surface2D, stage: OrnamentStage): void {
  if (!stage.front) return;
  context.beginPath();
  stage.zones.forEach((zone) => context.rect(zone.x, zone.y, zone.width, zone.height));
  context.clip();
}

/** Le rectangle de la PHOTO d'une case posée sur une carte : `pad` sur trois côtés, `pad + foot` en bas (fractions du petit côté). */
export function photoRect(rect: Rect, card: { readonly pad: number; readonly foot: number } | undefined): Rect {
  if (card === undefined) return rect;
  const side = Math.min(rect.width, rect.height);
  const pad = card.pad * side;
  const foot = card.foot * side;
  return { x: rect.x + pad, y: rect.y + pad, width: Math.max(0, rect.width - pad * 2), height: Math.max(0, rect.height - pad * 2 - foot) };
}
