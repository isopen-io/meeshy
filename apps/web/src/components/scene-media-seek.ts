import { useEffect, useRef } from 'react';

import { watchMediaStall } from '@/lib/media/media-stall';
import { inMediaWindow, mediaDrift, mediaTimeAt, type MediaTimeAt, type MediaTimeline } from '@/lib/canvas/media-seek';

import type { SceneClockHandle } from './scene-clock';

/** Un seek POINTÉ (le doigt) se pose dès 50 ms d'écart : l'image doit suivre. */
const SEEK_TOLERANCE_SECONDS = 0.05;
/** En LECTURE, on ne recale qu'au-delà de 300 ms : un seek coûte un décodage,
 * et un média qui lit court sur sa propre horloge à quelques trames près. */
const PLAYBACK_DRIFT_SECONDS = 0.3;

/** Pose `currentTime` ; un élément qui refuse (aucune donnée seekable) garde
 * sa position, le prochain alignement la reposera. */
function setTime(el: HTMLMediaElement, target: number): void {
  try {
    el.currentTime = target;
  } catch {
    // Rien de seekable encore : `loadedmetadata` recalera.
  }
}

export type SceneMediaSyncParams = {
  readonly ref: { readonly current: HTMLMediaElement | null };
  /** L'horloge de la scène — `null` hors d'un moteur (le média joue librement). */
  readonly clock: SceneClockHandle | null;
  readonly timeline: MediaTimeline;
  /** La lecture demandée par l'hôte (pause, glissé, écran quitté ⇒ `false`). */
  readonly playing: boolean;
  /** Relance la lecture quand ils changent (un refus sonore rend la main muette). */
  readonly restartKeys: readonly unknown[];
  readonly onPlayRefused?: (error: unknown, el: HTMLMediaElement) => void;
  /** Quand l'horloge ne MÈNE pas la scène : comment lire librement. Par
   * défaut `play()` ; la piste de fond y garde son départ différé. Rend un
   * nettoyage éventuel. */
  readonly freePlay?: (el: HTMLMediaElement, start: () => void) => (() => void) | void;
  /** Entendu à chaque seek — la piste libre y recompte son départ différé. */
  readonly onSeeked?: (t: number) => void;
};

/**
 * UN `<video>`/`<audio>` DE SCÈNE SUIT LA TIMELINE DE SA SCÈNE (#7879, retour
 * porteur) — le SITE UNIQUE qui applique `mediaTimeAt` à un élément, pour le
 * fond, les médias posés, les sons posés et la piste de fond :
 *
 * - au SEEK (le doigt), l'élément est posé au temps dû, et lit ou attend
 *   selon sa fenêtre si la lecture court ;
 * - en LECTURE, quand l'horloge mène la scène, chaque trame vérifie la
 *   fenêtre (entrer ⇒ lire, sortir ⇒ pause) et recale une dérive de plus de
 *   300 ms — jamais un seek par trame ;
 * - à la REPRISE (`playing` repasse vrai, le relâcher d'un glissé), l'élément
 *   repart du temps de la scène : tout repart ensemble.
 *
 * Quand l'horloge ne mène pas (scène sans objet temporisé ni durée), le média
 * joue librement (`freePlay`) et ne se recale qu'aux seeks.
 *
 * - en BUFFER (#9277), l'élément le DIT à l'horloge (`setStalled`), qui cesse
 *   de compter ; les autres médias de la scène se mettent en pause avec elle
 *   et repartent, recalés, quand plus aucun n'attend — le gel en phase d'iOS.
 */
export function useSceneMediaSync(params: SceneMediaSyncParams): void {
  const { ref, clock, playing, restartKeys } = params;
  const latest = useRef(params);
  latest.current = params;

  const start = (el: HTMLMediaElement): void => {
    void el.play().catch((error: unknown) => latest.current.onPlayRefused?.(error, el));
  };

  /** Pose l'élément au temps `t` de la scène — `precise` au doigt, à la
   * dérive en lecture. `null` tant que ses métadonnées manquent. */
  const align = (el: HTMLMediaElement, t: number, precise: boolean): MediaTimeAt | null => {
    const { timeline } = latest.current;
    const at = mediaTimeAt({ t, timeline, mediaDuration: el.duration });
    if (at === null) return null;
    const drift = mediaDrift({ current: el.currentTime, target: at.time, timeline, mediaDuration: el.duration });
    if (drift >= (precise ? SEEK_TOLERANCE_SECONDS : PLAYBACK_DRIFT_SECONDS)) setTime(el, at.time);
    return at;
  };

  const follow = (el: HTMLMediaElement, at: MediaTimeAt): void => {
    if (at.plays && el.paused) start(el);
    if (!at.plays && !el.paused) el.pause();
  };

  // Lecture demandée / suspendue.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    if (clock !== null && clock.isDriving()) {
      const t = clock.now();
      const at = align(el, t, false);
      const plays = at !== null ? at.plays : inMediaWindow(t, latest.current.timeline);
      if (plays) start(el);
      else el.pause();
      return;
    }
    const free = latest.current.freePlay;
    return free !== undefined ? (free(el, () => start(el)) ?? undefined) : start(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, clock, ...restartKeys]);

  // Le buffer : l'élément tient l'horloge tant qu'il attend ses octets.
  const stallKey = useRef<object>({});
  useEffect(() => {
    const el = ref.current;
    if (el === null || clock === null) return;
    const key = stallKey.current;
    const stop = watchMediaStall(el, (stalled) => clock.setStalled(key, stalled));
    return () => {
      stop();
      clock.setStalled(key, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, ...restartKeys]);

  // Le gel en phase : un média qui A ses octets attend celui qui ne les a pas.
  const heldByStall = useRef(false);
  useEffect(() => {
    if (clock === null) return;
    return clock.subscribeStall((stalled) => {
      const el = ref.current;
      if (el === null || !clock.isDriving()) return;
      if (stalled) {
        if (el.paused || el.readyState < 3) return;
        heldByStall.current = true;
        el.pause();
        return;
      }
      if (!heldByStall.current) return;
      heldByStall.current = false;
      if (!latest.current.playing) return;
      const at = align(el, clock.now(), true);
      if (at !== null) follow(el, at);
      else start(el);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  // La trame (fenêtre + dérive) et le seek (le doigt).
  useEffect(() => {
    if (clock === null) return;
    const offTick = clock.subscribe((t) => {
      const el = ref.current;
      if (el === null || !latest.current.playing || !clock.isDriving() || el.seeking) return;
      const at = align(el, t, false);
      if (at !== null) follow(el, at);
    });
    const offSeek = clock.subscribeSeek((t) => {
      latest.current.onSeeked?.(t);
      const el = ref.current;
      if (el === null) return;
      const at = align(el, t, true);
      if (at !== null && latest.current.playing) follow(el, at);
    });
    return () => {
      offTick();
      offSeek();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  // Les métadonnées arrivent APRÈS le montage : c'est là que la durée — donc
  // le temps dû — devient connue.
  useEffect(() => {
    const el = ref.current;
    if (el === null || clock === null) return;
    const onMetadata = () => {
      if (!clock.isDriving()) return;
      const at = align(el, clock.now(), true);
      if (at !== null && latest.current.playing) follow(el, at);
    };
    el.addEventListener('loadedmetadata', onMetadata);
    return () => el.removeEventListener('loadedmetadata', onMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, ...restartKeys]);
}
