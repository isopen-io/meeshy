import { useEffect, type RefObject } from 'react';

/**
 * LA PROGRESSION D'UN MÉDIA ÉCRITE À CHAQUE IMAGE (#9702) — la jumelle, pour
 * un `<video>`/`<audio>` nu, de ce que `SceneScrubBar` fait déjà pour la
 * scène : la valeur se lit sur l'horloge du média à chaque image et s'écrit
 * DIRECTEMENT sur une couche composée (`transform: scaleX`), sans état ni
 * rendu. `timeupdate` (≈ 4 Hz) donnait une barre qui sautait.
 */
type MediaClock = { readonly currentTime: number; readonly duration: number };

export function mediaFraction(media: MediaClock): number {
  const { currentTime, duration } = media;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
}

export function startFrameProgress(params: {
  readonly media: MediaClock;
  readonly write: (fraction: number) => void;
  readonly schedule: (callback: (time: number) => void) => number;
  readonly cancel: (handle: number) => void;
}): () => void {
  const { media, write, schedule, cancel } = params;
  let last = Number.NaN;
  let handle = 0;
  const frame = (): void => {
    const fraction = mediaFraction(media);
    if (fraction !== last) write(fraction);
    last = fraction;
    handle = schedule(frame);
  };
  frame();
  return () => cancel(handle);
}

/**
 * Pendant la lecture, une image = une écriture ; à l'arrêt, une seule
 * écriture (une pause ou un `seek` à l'arrêt se voient aussitôt). La barre
 * porte `will-change: transform` le temps de la lecture seulement : une
 * couche promue en permanence coûterait sa mémoire GPU à chaque page montée.
 */
export function useFrameProgress(params: {
  readonly media: HTMLMediaElement | null;
  readonly playing: boolean;
  readonly bar: RefObject<HTMLElement | null>;
}): void {
  const { media, playing, bar } = params;
  useEffect(() => {
    const el = bar.current;
    if (media === null || el === null) return undefined;
    const write = (fraction: number): void => {
      el.style.transform = `scaleX(${fraction})`;
    };
    if (!playing || typeof requestAnimationFrame !== 'function') {
      write(mediaFraction(media));
      el.style.willChange = '';
      return undefined;
    }
    el.style.willChange = 'transform';
    const stop = startFrameProgress({ media, write, schedule: requestAnimationFrame, cancel: cancelAnimationFrame });
    return () => {
      stop();
      el.style.willChange = '';
    };
  }, [media, playing, bar]);
}
