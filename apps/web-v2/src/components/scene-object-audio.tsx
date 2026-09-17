import { useEffect, useRef } from 'react';

import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';

import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

/**
 * Un AUDIO **non-fond** (`placement !== 'overlay'` sur le FOND — le fond est
 * déjà servi par `electBackgroundTrack`/l'hôte story, ce composant ne le
 * double JAMAIS : `isBackground` est filtré par l'appelant, `SceneCanvas`).
 * Suit `playing` et le muet du mode — même garde `NotAllowedError` que la
 * vidéo de fond (T-E11).
 */
export function SceneObjectAudio({
  object,
  carrier,
  playing,
  muted,
  clock,
  onPlaybackBlocked,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly clock: SceneClockHandle | null;
  readonly onPlaybackBlocked: (() => void) | undefined;
}) {
  const src = objectMediaSrc(object, carrier);
  const ref = useRef<HTMLAudioElement | null>(null);
  if (src === undefined) return null;
  const loop = object.payload.loop === true;

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    void el.play().catch((error: unknown) => {
      if (!el.muted && isAutoplayRefusal(error)) onPlaybackBlocked?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, muted, src]);

  return (
    <SceneObjectFrame object={object} kind="audio" clock={clock}>
      <audio ref={ref} src={src} muted={muted} loop={loop} preload="none" />
    </SceneObjectFrame>
  );
}
