import type { BackgroundTrack } from './background-sound';
import type { CanvasObject } from './document';
import { visibilityWindow } from './pose';

/**
 * LA LOI UNIQUE DU TEMPS D'UN MÉDIA DE SCÈNE (#7879, retour porteur : « toutes
 * les vidéos et audios de la scène sont synchronisés sur la timeline de la
 * scène »). Le temps de la scène (`scene-clock.ts`) est la SEULE horloge ; le
 * temps d'un `<video>`/`<audio>` en est une FONCTION :
 *
 *   temps média = f(temps scène, fenêtre, coupe, boucle, durée)
 *
 * Miroir d'iOS : `StoryMediaLayer.trimmedSeekTarget` (`min(start + max(0, t −
 * startTime), end)`) pour un média posé, `StoryBackgroundLayer.loopedScrubTarget`
 * (t modulo la durée) pour un fond qui boucle. Lue en lecture (recalage à la
 * dérive, `scene-media-seek.ts`) ET au seek du parcours au doigt, pour le
 * fond, les vidéos posées, les sons posés et la piste de fond. Aucun élément
 * ici.
 */

/** La place d'un média sur la timeline de sa scène, en SECONDES. */
export type MediaTimeline = {
  /** Le temps de scène où il entre (`timing.start`, `startTime`, `startOffsetMs`). */
  readonly windowStart: number;
  /** Le temps de scène où il sort — `Infinity` s'il reste. */
  readonly windowEnd: number;
  /** La COUPE dans le fichier (`sourceStart`/`sourceEnd`) — `undefined` : le fichier entier. */
  readonly trimStart: number | undefined;
  readonly trimEnd: number | undefined;
  readonly loop: boolean;
};

/** Où le média doit être, et s'il doit LIRE (dans sa fenêtre, avant sa fin). */
export type MediaTimeAt = { readonly time: number; readonly plays: boolean };

type Span = { readonly start: number; readonly end: number };

/** La portion du fichier que la scène joue — `null` tant que la durée est inconnue. */
function playedSpan(timeline: MediaTimeline, mediaDuration: number): Span | null {
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return null;
  const start = Math.min(Math.max(0, timeline.trimStart ?? 0), mediaDuration);
  const end = Math.min(timeline.trimEnd ?? mediaDuration, mediaDuration);
  return end > start ? { start, end } : { start: 0, end: mediaDuration };
}

/**
 * Le temps LOCAL du média pour le temps de scène `t`. Avant sa fenêtre : en
 * attente à l'origine de sa coupe. Après sa sortie : figé où la sortie l'a
 * laissé. Sans boucle : figé sur sa dernière image une fois sa coupe jouée.
 * `null` tant que la durée est inconnue — un `currentTime` posé avant les
 * métadonnées ne tient pas ; `loadedmetadata` recale.
 */
export function mediaTimeAt(params: { readonly t: number; readonly timeline: MediaTimeline; readonly mediaDuration: number }): MediaTimeAt | null {
  const { t, timeline, mediaDuration } = params;
  const span = playedSpan(timeline, mediaDuration);
  if (span === null) return null;
  const at = Number.isFinite(t) ? t : 0;
  if (at < timeline.windowStart) return { time: span.start, plays: false };
  const inWindow = at < timeline.windowEnd;
  const elapsed = Math.min(at, timeline.windowEnd) - timeline.windowStart;
  const length = span.end - span.start;
  if (timeline.loop) return { time: span.start + (elapsed % length), plays: inWindow };
  const local = span.start + elapsed;
  return local < span.end ? { time: local, plays: inWindow } : { time: span.end, plays: false };
}

/** L'écart entre la position lue et la position due — REPLIÉ sur la coupe
 * d'un média qui boucle : 3,95 s contre 0,05 s d'un tour de 4 s est un écart
 * de 0,1 s, pas de 3,9 s (sans quoi chaque tour provoquerait un seek). */
export function mediaDrift(params: {
  readonly current: number;
  readonly target: number;
  readonly timeline: MediaTimeline;
  readonly mediaDuration: number;
}): number {
  const { current, target, timeline, mediaDuration } = params;
  const gap = Math.abs(current - target);
  const span = timeline.loop ? playedSpan(timeline, mediaDuration) : null;
  if (span === null || current < span.start || current > span.end) return gap;
  const length = span.end - span.start;
  return Math.min(gap, length - gap);
}

/** Le média est-il DANS sa fenêtre au temps `t` ? Lisible avant sa durée :
 * c'est ce qui décide de lire ou d'attendre tant que les métadonnées manquent. */
export function inMediaWindow(t: number, timeline: MediaTimeline): boolean {
  return t >= timeline.windowStart && t < timeline.windowEnd;
}

const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

function trimOf(payload: CanvasObject['payload']): Pick<MediaTimeline, 'trimStart' | 'trimEnd'> {
  const start = finite(payload.sourceStart);
  const end = finite(payload.sourceEnd);
  if (end !== undefined && start !== undefined && end <= start) return { trimStart: undefined, trimEnd: undefined };
  return { trimStart: start, trimEnd: end };
}

/** Un média ou un son POSÉ : sa fenêtre (`visibilityWindow`, la même que sa
 * pose ; `payload.startTime` quand il n'a pas de `timing`), sa coupe, sa boucle. */
export function objectMediaTimeline(object: CanvasObject): MediaTimeline {
  const window = visibilityWindow(object);
  const windowStart = object.timing?.start ?? finite(object.payload.startTime) ?? window.start;
  return { windowStart, windowEnd: window.end, ...trimOf(object.payload), loop: object.payload.loop === true };
}

/** Le FOND : présent toute la scène, et il boucle (`<video loop>` depuis #6899). */
export function backgroundMediaTimeline(object: CanvasObject): MediaTimeline {
  return { windowStart: 0, windowEnd: Infinity, ...trimOf(object.payload), loop: true };
}

/** La PISTE de fond (`electBackgroundTrack`) : départ différé, fenêtre source, boucle. */
export function trackMediaTimeline(track: Pick<BackgroundTrack, 'startOffsetMs' | 'loop' | 'bounds'>): MediaTimeline {
  return {
    windowStart: track.startOffsetMs / 1000,
    windowEnd: Infinity,
    trimStart: track.bounds !== undefined ? track.bounds.startMs / 1000 : undefined,
    trimEnd: track.bounds !== undefined ? track.bounds.endMs / 1000 : undefined,
    loop: track.loop,
  };
}

/** Le pas des flèches sur la barre d'une scène — un dixième de sa durée,
 * jamais moins d'une seconde (les dix secondes de `SEEK_STEP_SECONDS`
 * traverseraient une story entière d'un coup). */
export function sceneSeekStep(durationSeconds: number): number {
  return Math.max(1, durationSeconds / 10);
}
