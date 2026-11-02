/**
 * **L'OUVERTURE ET LA FERMETURE D'UNE SCÈNE** (#8794, jumelle web de
 * `StoryTransitionEffect` et de `StoryRenderer.applyOpening` / `applyClosing`,
 * iOS) — `scene.opening` / `scene.closing` de CanvasV3 portent `{ type }`, la
 * forme qu'écrit `CanvasV3Migration.swift`. Les formes sont celles du lecteur
 * iOS : même durée (1,2 s), même zoom (1,08), même course (8 % de la largeur),
 * même cercle (il couvre les coins de la carte).
 */
export const SCENE_TRANSITIONS = ['fade', 'zoom', 'slide', 'reveal'] as const;

export type SceneTransition = (typeof SCENE_TRANSITIONS)[number];

/** `StoryRenderer.slideTransitionDuration`. */
export const SCENE_TRANSITION_MS = 1200;

/** `StoryRenderer.zoomTransitionScale`. */
export const SCENE_ZOOM_SCALE = 1.08;

/** `StoryRenderer.slideTransitionTravelFraction` — fraction de la largeur. */
export const SCENE_SLIDE_TRAVEL = 0.08;

/** `StoryTransitionRehearsal.hold` — la scène entière, entre les deux. */
export const REHEARSAL_HOLD_MS = 600;

export const isSceneTransition = (value: unknown): value is SceneTransition =>
  typeof value === 'string' && (SCENE_TRANSITIONS as readonly string[]).includes(value);

export function readSceneTransition(raw: unknown): SceneTransition | null {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) return null;
  return isSceneTransition(raw.type) ? raw.type : null;
}

export const sceneTransitionWire = (transition: SceneTransition): { readonly type: SceneTransition } => ({ type: transition });

type Frame = { readonly opacity: number } | { readonly transform: string } | { readonly clipPath: string };

/** Le rayon qui couvre les coins : `hypot(w, h) / 2`, soit `√2 / 2` de la
 * référence d'un pourcentage de `circle()`. */
const COVERING = 'circle(70.72% at 50% 50%)';
const CLOSED = 'circle(0% at 50% 50%)';

const OPENING: Readonly<Record<SceneTransition, readonly [Frame, Frame]>> = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  zoom: [{ transform: `scale(${SCENE_ZOOM_SCALE})` }, { transform: 'scale(1)' }],
  slide: [{ transform: `translateX(${SCENE_SLIDE_TRAVEL * 100}%)` }, { transform: 'translateX(0)' }],
  reveal: [{ clipPath: CLOSED }, { clipPath: COVERING }],
};

const CLOSING: Readonly<Record<SceneTransition, readonly [Frame, Frame]>> = {
  fade: [{ opacity: 1 }, { opacity: 0 }],
  zoom: [{ transform: 'scale(1)' }, { transform: `scale(${SCENE_ZOOM_SCALE})` }],
  slide: [{ transform: 'translateX(0)' }, { transform: `translateX(-${SCENE_SLIDE_TRAVEL * 100}%)` }],
  reveal: [{ clipPath: COVERING }, { clipPath: CLOSED }],
};

export function sceneTransitionKeyframes(transition: SceneTransition, phase: 'opening' | 'closing'): readonly Frame[] {
  return (phase === 'opening' ? OPENING : CLOSING)[transition];
}

/** L'horloge d'une répétition : ouverture, pause, fermeture. */
export function rehearsalTimeline(plan: {
  readonly opening: SceneTransition | null;
  readonly closing: SceneTransition | null;
}): { readonly closingStartMs: number; readonly totalMs: number } {
  const closingStartMs = (plan.opening === null ? 0 : SCENE_TRANSITION_MS) + REHEARSAL_HOLD_MS;
  return { closingStartMs, totalMs: closingStartMs + (plan.closing === null ? 0 : SCENE_TRANSITION_MS) };
}

/**
 * **LA SCÈNE À L'INSTANT D'UNE TRANSITION** (#13880) — ce que l'export peint
 * image par image, comme `StoryAVCompositor` d'iOS pose
 * `openingSublayerTransform` et `closingProgress` : une rampe LINÉAIRE de
 * `SCENE_TRANSITION_MS` au début (ouverture) et à la fin (fermeture) de la
 * slide. `reveal` est le rayon du cercle en fraction de celui qui couvre les
 * coins (`null` : aucun masque). Sur une slide plus courte que deux
 * transitions, la fermeture prend la main sur la propriété qu'elle anime —
 * l'opacité, la transformation (zoom et glissement la partagent) ou le masque
 * — et l'ouverture garde les autres (`clearOpeningFill`).
 */
export type SceneTransitionPose = {
  readonly opacity: number;
  readonly scale: number;
  /** Fraction de la largeur ; positive vers la fin de la ligne. */
  readonly translateX: number;
  readonly reveal: number | null;
};

export const SCENE_TRANSITION_IDENTITY: SceneTransitionPose = { opacity: 1, scale: 1, translateX: 0, reveal: null };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

type Property = 'opacity' | 'transform' | 'mask';

const PROPERTY: Readonly<Record<SceneTransition, Property>> = { fade: 'opacity', zoom: 'transform', slide: 'transform', reveal: 'mask' };

/** `shown` ∈ [0, 1] : 0 = la scène absente, 1 = la scène entière. */
function posed(pose: SceneTransitionPose, transition: SceneTransition, shown: number, exit: boolean): SceneTransitionPose {
  const hidden = 1 - shown;
  switch (transition) {
    case 'fade':
      return { ...pose, opacity: shown };
    case 'zoom':
      return { ...pose, scale: 1 + (SCENE_ZOOM_SCALE - 1) * hidden, translateX: 0 };
    case 'slide':
      return { ...pose, scale: 1, translateX: (exit ? -1 : 1) * SCENE_SLIDE_TRAVEL * hidden };
    case 'reveal':
      return { ...pose, reveal: shown };
  }
}

export function sceneTransitionPose(params: {
  readonly opening: SceneTransition | null;
  readonly closing: SceneTransition | null;
  readonly elapsedMs: number;
  readonly durationMs: number;
}): SceneTransitionPose {
  const { opening, closing, elapsedMs, durationMs } = params;
  const entering = opening !== null && elapsedMs < SCENE_TRANSITION_MS ? posed(SCENE_TRANSITION_IDENTITY, opening, clamp01(elapsedMs / SCENE_TRANSITION_MS), false) : SCENE_TRANSITION_IDENTITY;
  const closingStart = durationMs - SCENE_TRANSITION_MS;
  if (closing === null || !Number.isFinite(durationMs) || elapsedMs <= closingStart) return entering;
  const progress = clamp01((elapsedMs - closingStart) / SCENE_TRANSITION_MS);
  const base = opening !== null && PROPERTY[opening] === PROPERTY[closing] ? SCENE_TRANSITION_IDENTITY : entering;
  return posed(base, closing, 1 - progress, true);
}
