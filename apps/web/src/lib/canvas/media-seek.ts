import type { BackgroundTrack } from './background-sound';

/**
 * LE PARCOURS AU DOIGT (#7879) — la loi PURE qui recale les médias d'une
 * scène sur le temps pointé. Les `<video>`/`<audio>` courent sur leur propre
 * horloge : l'horloge de scène (`scene-clock.ts`) ne les pilote pas pendant
 * la lecture, seulement à chaque `seek` (`subscribeSeek`). Aucun élément ici —
 * la mécanique vit dans `components/scene-media-seek.ts`.
 */

/**
 * Le temps LOCAL d'un média pour un temps de scène `t` : replié sur sa durée
 * s'il boucle, figé sur sa dernière image sinon. `null` tant que la durée est
 * inconnue — poser un `currentTime` avant les métadonnées ne tient pas.
 */
export function mediaSeekTarget(params: { readonly t: number; readonly mediaDuration: number; readonly loop: boolean }): number | null {
  const { t, mediaDuration, loop } = params;
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return null;
  const at = Math.max(0, t);
  if (at < mediaDuration) return at;
  return loop ? at % mediaDuration : mediaDuration;
}

export type TrackSeekPlan = {
  /** Le temps de lecture DÉJÀ consommé — le départ différé
   * (`startOffsetMs`) se compte depuis lui. */
  readonly playedMs: number;
  /** La position dans le FICHIER, en secondes ; `null` tant que le départ
   * différé n'est pas atteint (la piste attend au début de sa fenêtre). */
  readonly position: number | null;
};

/**
 * La piste de fond (`BackgroundTrackAudio`) au temps pointé : elle part
 * `startOffsetMs` après la scène, joue dans sa fenêtre `bounds` (ou le
 * fichier entier) et s'y replie si elle boucle.
 */
export function trackSeekPlan(params: {
  readonly t: number;
  readonly track: Pick<BackgroundTrack, 'startOffsetMs' | 'loop' | 'bounds'>;
  readonly mediaDuration: number;
}): TrackSeekPlan {
  const { t, track, mediaDuration } = params;
  const playedMs = Math.max(0, t) * 1000;
  const windowStart = track.bounds !== undefined ? track.bounds.startMs / 1000 : 0;
  const sinceStart = (playedMs - track.startOffsetMs) / 1000;
  if (sinceStart < 0) return { playedMs, position: null };
  const windowLength = track.bounds !== undefined ? (track.bounds.endMs - track.bounds.startMs) / 1000 : mediaDuration;
  const local = mediaSeekTarget({ t: sinceStart, mediaDuration: windowLength, loop: track.loop });
  return { playedMs, position: windowStart + (local ?? sinceStart) };
}

/** Le pas des flèches sur la barre d'une scène — un dixième de sa durée,
 * jamais moins d'une seconde (les dix secondes de `SEEK_STEP_SECONDS`
 * traverseraient une story entière d'un coup). */
export function sceneSeekStep(durationSeconds: number): number {
  return Math.max(1, durationSeconds / 10);
}
