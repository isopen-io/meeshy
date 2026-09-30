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

/** `StoryTransitionRehearsal.hold` — la scène entière, entre les deux. */
export const REHEARSAL_HOLD_MS = 600;

const isSceneTransition = (value: unknown): value is SceneTransition =>
  typeof value === 'string' && (SCENE_TRANSITIONS as readonly string[]).includes(value);

export function readSceneTransition(raw: Readonly<Record<string, unknown>> | undefined): SceneTransition | null {
  return raw !== undefined && isSceneTransition(raw.type) ? raw.type : null;
}

export const sceneTransitionWire = (transition: SceneTransition): { readonly type: SceneTransition } => ({ type: transition });

type Frame = Readonly<Record<'opacity', number> | Record<'transform' | 'clipPath', string>>;

/** Le rayon qui couvre les coins : `hypot(w, h) / 2`, soit `√2 / 2` de la
 * référence d'un pourcentage de `circle()`. */
const COVERING = 'circle(70.72% at 50% 50%)';
const CLOSED = 'circle(0% at 50% 50%)';

const OPENING: Readonly<Record<SceneTransition, readonly [Frame, Frame]>> = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  zoom: [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
  slide: [{ transform: 'translateX(8%)' }, { transform: 'translateX(0)' }],
  reveal: [{ clipPath: CLOSED }, { clipPath: COVERING }],
};

const CLOSING: Readonly<Record<SceneTransition, readonly [Frame, Frame]>> = {
  fade: [{ opacity: 1 }, { opacity: 0 }],
  zoom: [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }],
  slide: [{ transform: 'translateX(0)' }, { transform: 'translateX(-8%)' }],
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
