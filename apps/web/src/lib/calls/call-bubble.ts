/**
 * **LA BULLE D'APPEL** (#8046, D9) — la géométrie de `CallBubbleView.swift`
 * sans DOM : une bulle posée contre un bord (`bubbleEdge`) à une hauteur
 * relative (`bubbleVerticalFraction`), clipsée au bord le plus proche au
 * lâcher, jamais hors des marges sûres. La place survit à l'appel : elle est
 * retenue sur l'appareil, comme iOS la garde sur `CallManager`.
 *
 * #8145 — trois paliers de taille (`CallBubbleSizeTier` d'iOS, sans le
 * cercle), atteints au pincement, à Ctrl + molette et aux touches + / −. Le
 * palier est retenu avec la place, et un palier qui ne tient pas dans
 * l'écran descend jusqu'à celui qui tient.
 */

export type BubbleEdge = 'left' | 'right';

export type BubbleTier = 'small' | 'medium' | 'large';

export type BubblePlacement = { readonly edge: BubbleEdge; readonly fraction: number; readonly tier: BubbleTier };

export type Size = { readonly width: number; readonly height: number };

export type Insets = { readonly top: number; readonly bottom: number };

export type Point = { readonly x: number; readonly y: number };

export const BUBBLE_TIERS: readonly BubbleTier[] = ['small', 'medium', 'large'];

export const DEFAULT_BUBBLE: BubblePlacement = { edge: 'right', fraction: 0.15, tier: 'small' };

export const BUBBLE_KEY = 'meeshy.call.bubble.v1';

/** Au-delà, un glissement horizontal de la pastille la replie en bulle (iOS : swipe de `FloatingCallPillView`). */
export const PILL_COLLAPSE_DISTANCE = 64;

/**
 * Ce que fait un glissé horizontal de la capsule : plus court que `PILL_COLLAPSE_DISTANCE`, c'est un toucher ;
 * au-delà, il la replie en bulle — sauf pendant MON partage d'écran (P18.10), où la bulle n'offrirait pas
 * « Arrêter » : la capsule reste, et le glissé n'est pas non plus le toucher qui rouvrirait l'appel.
 */
export type PillSwipeOutcome = 'tap' | 'collapse' | 'stay';

export function pillSwipeOutcome({ travelled, sharing }: { readonly travelled: number; readonly sharing: boolean }): PillSwipeOutcome {
  if (Math.abs(travelled) < PILL_COLLAPSE_DISTANCE) return 'tap';
  return sharing ? 'stay' : 'collapse';
}

const MARGIN = 12;
const TAP_SLOP = 8;
const KEY_STEP = 0.1;
/** iOS : 25 % de zoom parcourt un palier (`magnificationSensitivity`). */
const PINCH_SENSITIVITY = 4;
/** Ctrl + molette : ce cumul de `deltaY` fait un palier (un pincement de pavé tactile en émet beaucoup de petits). */
export const WHEEL_STEP = 60;

const FRAME: Readonly<Record<BubbleTier, { readonly width: number; readonly video: number; readonly portrait: number }>> = {
  small: { width: 136, video: 180, portrait: 104 },
  medium: { width: 176, video: 232, portrait: 128 },
  large: { width: 216, video: 284, portrait: 152 },
};

/** Vidéo : un cadre portrait ; audio : un carré pour l'avatar. #19696 — aucune barre de commandes : la personne et la durée seules. */
export function bubbleSize(kind: 'video' | 'portrait', tier: BubbleTier = 'small'): Size {
  const frame = FRAME[tier];
  return { width: frame.width, height: frame[kind] };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const room = (viewport: Size, insets: Insets): Size => ({ width: viewport.width - 2 * MARGIN, height: viewport.height - insets.top - insets.bottom - 2 * MARGIN });

/** Le palier demandé s'il tient dans l'écran, sinon le plus grand qui tient — jamais une bulle hors de l'écran. */
export function fittingTier(tier: BubbleTier, viewport: Size, insets: Insets, sizeOf: (tier: BubbleTier) => Size): BubbleTier {
  const space = room(viewport, insets);
  const fits = (candidate: BubbleTier) => {
    const size = sizeOf(candidate);
    return size.width <= space.width && size.height <= space.height;
  };
  return BUBBLE_TIERS.slice(0, BUBBLE_TIERS.indexOf(tier) + 1).reverse().find(fits) ?? 'small';
}

const travel = (viewport: Size, insets: Insets, size: Size): number => Math.max(0, room(viewport, insets).height - size.height);

export function bubbleOrigin(placement: Pick<BubblePlacement, 'edge' | 'fraction'>, viewport: Size, insets: Insets, size: Size): { readonly left: number; readonly top: number } {
  const left = placement.edge === 'left' ? MARGIN : viewport.width - MARGIN - size.width;
  return { left, top: insets.top + MARGIN + clamp01(placement.fraction) * travel(viewport, insets, size) };
}

/**
 * La bulle est ancrée en haut à gauche de l'écran et POSÉE par `translate` : se
 * déplacer ne change plus aucune géométrie (#11314). La zone sûre haute
 * s'ajoute en CSS, le doigt s'ajoute à l'origine pendant le glissé.
 */
export function bubbleTranslate({ origin, drag }: { readonly origin: { readonly left: number; readonly top: number }; readonly drag: Point | null }): string {
  return `${origin.left + (drag?.x ?? 0)}px calc(${origin.top + (drag?.y ?? 0)}px + env(safe-area-inset-top))`;
}

/** L'aimantation au bord ne joue que `translate` (#11314) ; le glissé et le pincement n'en ont pas. #19701 — assez longue et
    freinée en fin de course pour qu'on VOIE la vignette glisser jusqu'à son bord, comme le ressort d'iOS
    (`CallBubbleGestureResolver.glideResponse`). « Réduire les animations » la coupe (règle générale d'`app.css`). */
export const BUBBLE_SETTLE_TRANSITION = 'translate 420ms cubic-bezier(0.22, 1, 0.36, 1)';

/** #19701 — l'élan : la vitesse des derniers instants du doigt (px/ms) se projette sur cette durée. */
export const GLIDE_PROJECTION_MS = 180;
/** Le plus long chemin que l'élan ajoute au geste, par axe (`CallBubbleGestureResolver.maxGlide` d'iOS). */
export const MAX_GLIDE = 320;
/** Les échantillons plus vieux que ceci ne disent plus la vitesse du lâcher. */
const VELOCITY_WINDOW_MS = 100;

export type PointerSample = Point & { readonly t: number };

/** La vitesse du doigt au lâcher (px/ms), lue sur les échantillons des derniers instants ; immobile ou trop ancien ⇒ nulle. */
export function releaseVelocity(samples: readonly PointerSample[]): Point {
  const last = samples.at(-1);
  if (last === undefined) return { x: 0, y: 0 };
  const recent = samples.filter((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  if (first === undefined || last.t <= first.t) return { x: 0, y: 0 };
  const elapsed = last.t - first.t;
  return { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed };
}

/** Au lâcher, la vignette poursuit sa course selon l'élan, borné : c'est ce point qu'on aimante ensuite au bord le plus proche. */
export function glideBubble(moved: Point, velocity: Point): Point {
  const glide = (speed: number): number => Math.max(-MAX_GLIDE, Math.min(MAX_GLIDE, speed * GLIDE_PROJECTION_MS));
  return { x: moved.x + glide(velocity.x), y: moved.y + glide(velocity.y) };
}

/** Le centre au lâcher → le bord le plus proche et la hauteur gardée. */
export function snapBubble(center: Point, viewport: Size, insets: Insets, size: Size): Pick<BubblePlacement, 'edge' | 'fraction'> {
  const range = travel(viewport, insets, size);
  const top = center.y - size.height / 2 - insets.top - MARGIN;
  return { edge: center.x < viewport.width / 2 ? 'left' : 'right', fraction: range === 0 ? 0 : clamp01(top / range) };
}

/** Un palier de plus (`+1`) ou de moins (`-1`), borné. */
export function stepTier(tier: BubbleTier, step: number): BubbleTier {
  const index = Math.min(BUBBLE_TIERS.length - 1, Math.max(0, BUBBLE_TIERS.indexOf(tier) + Math.sign(step)));
  return BUBBLE_TIERS[index] ?? tier;
}

/** Le palier au relâcher d'un pincement : l'échelle des doigts, ancrée sur le palier de départ (`CallBubbleGestureResolver.progress`). */
export function pinchTier(start: BubbleTier, scale: number): BubbleTier {
  const progress = BUBBLE_TIERS.indexOf(start) + (scale - 1) * PINCH_SENSITIVITY;
  return BUBBLE_TIERS[Math.min(BUBBLE_TIERS.length - 1, Math.max(0, Math.round(progress)))] ?? start;
}

/** Ctrl + molette : le cumul avance ; un palier passe quand il franchit `WHEEL_STEP` (molette vers le haut = plus grand). */
export function wheelTier(tier: BubbleTier, accumulated: number, deltaY: number): { readonly tier: BubbleTier; readonly accumulated: number } {
  const total = accumulated + deltaY;
  if (Math.abs(total) < WHEEL_STEP) return { tier, accumulated: total };
  return { tier: stepTier(tier, -total), accumulated: 0 };
}

export function nudgeBubble(placement: BubblePlacement, key: string): BubblePlacement | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...placement, edge: 'left' };
    case 'ArrowRight':
      return { ...placement, edge: 'right' };
    case 'ArrowUp':
      return { ...placement, fraction: clamp01(Math.round((placement.fraction - KEY_STEP) * 100) / 100) };
    case 'ArrowDown':
      return { ...placement, fraction: clamp01(Math.round((placement.fraction + KEY_STEP) * 100) / 100) };
    case '+':
    case '=':
      return { ...placement, tier: stepTier(placement.tier, 1) };
    case '-':
    case '_':
      return { ...placement, tier: stepTier(placement.tier, -1) };
    default:
      return null;
  }
}

export function isBubbleTap(moved: Point): boolean {
  return Math.hypot(moved.x, moved.y) < TAP_SLOP;
}

const isTier = (value: unknown): value is BubbleTier => BUBBLE_TIERS.some((tier) => tier === value);

export function readBubblePlacement(storage: Pick<Storage, 'getItem'> | null): BubblePlacement {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(BUBBLE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BUBBLE;
    const { edge, fraction, tier } = parsed as Record<string, unknown>;
    const valid = (edge === 'left' || edge === 'right') && typeof fraction === 'number' && fraction >= 0 && fraction <= 1;
    return valid ? { edge, fraction, tier: isTier(tier) ? tier : DEFAULT_BUBBLE.tier } : DEFAULT_BUBBLE;
  } catch {
    return DEFAULT_BUBBLE;
  }
}

export function writeBubblePlacement(storage: Pick<Storage, 'setItem'> | null, placement: BubblePlacement): void {
  try {
    storage?.setItem(BUBBLE_KEY, JSON.stringify(placement));
  } catch {
    /* Stockage bloqué : la place vaut pour cet appel. */
  }
}

