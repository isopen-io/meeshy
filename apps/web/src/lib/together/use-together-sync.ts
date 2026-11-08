import { useEffect, useRef } from 'react';

import type { TogetherPlayback } from '@meeshy/shared/types/together';

import { localGestureEffect, playbackCorrection, servedPositionMs, type LocalGesture } from './together-sync';

/**
 * **LE LECTEUR SUIT LA SÉANCE, ET LA SÉANCE SUIT SES GESTES** (#17055).
 *
 * - Chaque état servi (`rev`) s'applique : position à l'horloge du serveur, lecture
 *   ou pause. En lecture, la dérive se rattrape chaque seconde (vitesse, puis saut).
 * - Un geste fait sur CE lecteur part chez l'autre s'il change l'état partagé
 *   (`localGestureEffect`) ; sinon il réaligne seulement ce lecteur.
 * - Ce que l'application provoque elle-même (saut, lecture, pause) n'est jamais
 *   relu comme un geste : une fenêtre courte le tient à l'écart.
 */

const SELF_INFLICTED_MS = 400;
const DRIFT_CHECK_MS = 1_000;

export function useTogetherSync({
  element,
  playback,
  clockOffsetMs,
  now,
  onSync,
}: {
  readonly element: HTMLMediaElement | null;
  readonly playback: TogetherPlayback;
  readonly clockOffsetMs: number;
  readonly now: () => number;
  readonly onSync: (state: { readonly playing: boolean; readonly positionMs: number }) => void;
}): void {
  const latest = useRef({ playback, clockOffsetMs, now, onSync });
  latest.current = { playback, clockOffsetMs, now, onSync };
  const quietUntil = useRef(0);

  const targetMs = (): number => {
    const current = latest.current;
    return servedPositionMs(current.playback, current.now() + current.clockOffsetMs);
  };

  const align = (media: HTMLMediaElement, { seekOnly }: { readonly seekOnly: boolean }): void => {
    const shared = latest.current.playback;
    const correction = playbackCorrection({ localMs: media.currentTime * 1000, targetMs: targetMs(), playing: shared.playing });
    quietUntil.current = latest.current.now() + SELF_INFLICTED_MS;
    if (correction.kind === 'seek') media.currentTime = correction.toMs / 1000;
    media.playbackRate = correction.kind === 'rate' ? correction.rate : 1;
    if (seekOnly) return;
    if (shared.playing && media.paused) void media.play().catch(() => undefined);
    if (!shared.playing && !media.paused) media.pause();
  };

  useEffect(() => {
    if (element !== null) align(element, { seekOnly: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, playback.rev, playback.playing, playback.positionMs, playback.at]);

  useEffect(() => {
    if (element === null || !playback.playing) return undefined;
    const timer = setInterval(() => {
      if (!element.paused) align(element, { seekOnly: true });
    }, DRIFT_CHECK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, playback.playing, playback.rev]);

  useEffect(() => {
    if (element === null) return undefined;
    const onGesture = (gesture: LocalGesture) => (): void => {
      if (latest.current.now() < quietUntil.current) return;
      const effect = localGestureEffect({ gesture, localMs: element.currentTime * 1000, targetMs: targetMs(), sharedPlaying: latest.current.playback.playing });
      if (effect === 'send') latest.current.onSync({ playing: !element.paused, positionMs: element.currentTime * 1000 });
      else align(element, { seekOnly: false });
    };
    const onPlay = onGesture('play');
    const onPause = onGesture('pause');
    const onSeeked = onGesture('seek');
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element.addEventListener('seeked', onSeeked);
    return () => {
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
      element.removeEventListener('seeked', onSeeked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);
}
