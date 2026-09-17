import { useEffect, useRef } from 'react';

import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';

import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

/**
 * Un AUDIO **non-fond**. Le son de FOND (`payload.isBackground === true`) est
 * servi par l'hôte, qui l'élit avec `electBackgroundTrack`
 * (`lib/canvas/background-sound.ts`, consommé par `story-scene-layer.tsx` et
 * `story-compose.tsx`) : ce composant ne le double JAMAIS, et c'est
 * `SceneCanvas` (`scene-player.tsx`) qui l'écarte de la liste des couches —
 * filtre POSÉ à la revue-correction #6901, où ce commentaire l'affirmait déjà
 * sans qu'il existe (T-E12 : la même piste partait deux fois, en écho).
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
  const loop = object.payload.loop === true;

  // TOUS LES HOOKS AVANT LE RETOUR ANTICIPÉ (revue-correction #6901) : `src`
  // dépend du PORTEUR (`carrier.media`), qui change quand le fil se
  // rafraîchit — un `useEffect` posé APRÈS le `return null` change le NOMBRE
  // de hooks d'un rendu à l'autre. Sous React (`bun run build:react`) c'est
  // une exception (« Rendered fewer hooks than expected »), sous Preact un
  // effet qui ne se rejoue ni ne se nettoie plus. Aucun lint ne le garde ici :
  // web-v2 n'a pas de configuration eslint.
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

  if (src === undefined) return null;

  return (
    <SceneObjectFrame object={object} kind="audio" clock={clock}>
      <audio ref={ref} src={src} muted={muted} loop={loop} preload="none" />
    </SceneObjectFrame>
  );
}
