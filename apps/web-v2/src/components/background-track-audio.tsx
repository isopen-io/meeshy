import { useEffect, useRef } from 'react';

import type { BackgroundTrack } from '@/lib/canvas/background-sound';

/**
 * `BackgroundTrackAudio` (#6899, extrait en site UNIQUE pour #6903) — LE SON
 * DE FOND D'UNE SCÈNE, miroir de `ReaderAudioMixer+Background.swift` : une
 * piste, qui part `startOffsetMs` après le début de la diapositive (horloge
 * de LECTURE : la pause l'arrête), jouée dans sa fenêtre source (`bounds`,
 * rebouclée dans la fenêtre si `loop`), à son `volume`, sous le muet viewer.
 * Fondus hors lot (question 9.3 de la spécification `stories-lecteur`).
 *
 * DÉPLACÉ tel quel depuis `routes/story-scene-layer.tsx` (§ 5.3 de la
 * spécification `reels-scene`, #6903) : le studio a déjà sa JUMELLE
 * simplifiée (`story-compose.tsx:705`, dette CONSIGNÉE — D-86) et le lecteur
 * des Réels en aurait été la TROISIÈME. Un SITE UNIQUE, consommé par le
 * lecteur de story ET le réel — la clé `key` de l'appelant REMONTE
 * l'élément pour repartir de `startOffsetMs` (un tour de boucle, #6903).
 */
export type BackgroundTrackAudioProps = {
  readonly track: BackgroundTrack;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly onDurationKnown: (durationMs: number) => void;
  readonly onPlaybackBlocked: () => void;
};

/** `NotAllowedError` — le refus de la politique de lecture automatique. */
export const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

export function BackgroundTrackAudio({ track, playing, muted, onDurationKnown, onPlaybackBlocked }: BackgroundTrackAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedMsRef = useRef(0);
  const callbacks = useRef({ onDurationKnown, onPlaybackBlocked });
  callbacks.current = { onDurationKnown, onPlaybackBlocked };
  const { bounds } = track;

  useEffect(() => {
    const el = audioRef.current;
    if (el !== null) el.volume = track.volume;
  }, [track.volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    const startedAt = performance.now();
    const start = () => {
      void el.play().catch((error: unknown) => {
        if (!el.muted && isAutoplayRefusal(error)) callbacks.current.onPlaybackBlocked();
      });
    };
    const remaining = Math.max(0, track.startOffsetMs - playedMsRef.current);
    const timer = remaining > 0 ? window.setTimeout(start, remaining) : null;
    if (timer === null) start();
    return () => {
      playedMsRef.current += performance.now() - startedAt;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [playing, muted, track.startOffsetMs]);

  // Le DÉMONTAGE (un hôte qui REMONTE la piste à chaque tour de boucle,
  // #6903 — `key` changée — ou qui quitte l'écran) arrête le son : effet
  // dédié, à dépendances VIDES, pour ne pauser qu'à la disparition réelle de
  // l'élément — jamais à chaque changement de `playing`/`muted`, déjà
  // couvert par l'effet ci-dessus.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      el?.pause();
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      data-scene-sound-track
      src={track.src}
      preload="auto"
      muted={muted}
      loop={bounds === undefined && track.loop}
      onLoadedMetadata={(event) => {
        const el = event.currentTarget;
        if (bounds !== undefined) el.currentTime = bounds.startMs / 1000;
        const windowMs = bounds !== undefined ? bounds.endMs - bounds.startMs : el.duration * 1000;
        callbacks.current.onDurationKnown(track.startOffsetMs + windowMs);
      }}
      onTimeUpdate={(event) => {
        if (bounds === undefined) return;
        const el = event.currentTarget;
        if (el.currentTime * 1000 < bounds.endMs) return;
        if (track.loop) el.currentTime = bounds.startMs / 1000;
        else el.pause();
      }}
    />
  );
}
