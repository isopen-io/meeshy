import type { CanvasObject, CanvasScene } from './document';
import { visibilityWindow } from './pose';

/**
 * **LE FONDU ENTRE DEUX CLIPS D'UNE SLIDE** (#13880) — `scene.clipTransitions`
 * de CanvasV3 (`StoryClipTransition` iOS : `fromClipId`, `toClipId`, `kind`,
 * `duration` en secondes). Miroir de `ReaderTransitionResolver.opacity` :
 * chaque transition qui nomme l'objet multiplie son opacité par une rampe
 * LINÉAIRE — `1 − p` pour le clip sortant sur la fin de SA fenêtre, `p` pour
 * l'entrant sur son début. « dissolve » s'y joue comme « crossfade » : le
 * lecteur n'a pas de compositeur par pixel (`liveRenderableTransition`).
 */
export type ClipTransition = { readonly fromClipId: string; readonly toClipId: string; readonly duration: number };

const KINDS: readonly string[] = ['crossfade', 'dissolve'];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

function readOne(raw: unknown): ClipTransition | null {
  if (!isRecord(raw)) return null;
  const { fromClipId, toClipId, kind, duration } = raw;
  if (typeof fromClipId !== 'string' || typeof toClipId !== 'string' || typeof kind !== 'string' || !KINDS.includes(kind)) return null;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? { fromClipId, toClipId, duration } : null;
}

export const readClipTransitions = (scene: CanvasScene): readonly ClipTransition[] =>
  (scene.clipTransitions ?? []).map(readOne).filter((transition): transition is ClipTransition => transition !== null);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function factorOf(transition: ClipTransition, object: CanvasObject, t: number): number {
  const { start, end } = visibilityWindow(object);
  if (transition.fromClipId === object.id && Number.isFinite(end)) {
    const from = end - transition.duration;
    return t >= from && t <= end ? 1 - clamp01((t - from) / transition.duration) : 1;
  }
  if (transition.toClipId === object.id) return t >= start && t <= start + transition.duration ? clamp01((t - start) / transition.duration) : 1;
  return 1;
}

export const clipTransitionOpacity = (object: CanvasObject, transitions: readonly ClipTransition[], t: number): number =>
  clamp01(transitions.reduce((opacity, transition) => opacity * factorOf(transition, object, t), 1));
