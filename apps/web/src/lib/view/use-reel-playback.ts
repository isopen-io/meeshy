import { useEffect, useRef } from 'react';

import { playbackIntentOf } from '@/lib/reels/thread';

import type { MediaCoordinator } from './media-coordinator';
import { useMediaPlayback, type MediaPlayback } from './use-media-playback';

/**
 * LA LECTURE D'UN RÉEL (#6457) — `useMediaPlayback` tel quel (le MÊME
 * coordinateur que les vocaux et les vidéos du fil : jouer un réel arrête tout
 * autre média de l'application), piloté par la VISIBILITÉ plutôt que par un tap.
 * Miroir de `ReelMediaAutostart.shouldStart(isActive:…)` et du moteur unique
 * `SharedAVPlayerManager` d'iOS : seul le réel visible joue.
 *
 * - le réel qui DEVIENT visible joue, celui qui SORT du champ se met en pause ;
 *   un réel voisin démonté relâche le coordinateur et coupe son élément
 *   (`bind(null)`, `use-media-playback.ts`) — aucun son orphelin ;
 * - la décision ne se prend qu'au CHANGEMENT de visibilité : une pause voulue
 *   par le lecteur (tap) n'est jamais annulée au rendu suivant ;
 * - le son suit la préférence de l'écran, posée AVANT le premier `play()` (un
 *   navigateur refuse une lecture sonore sans activation préalable, jamais une
 *   lecture muette) ;
 * - l'onglet masqué suspend la lecture et la rend à son retour, sauf si le
 *   lecteur l'avait lui-même mise en pause (motif `routes/story.tsx`).
 */
export function useReelPlayback(params: {
  readonly mediaId: string;
  readonly active: boolean;
  readonly soundOn: boolean;
  readonly coordinator?: MediaCoordinator;
}): MediaPlayback {
  const { mediaId, active, soundOn, coordinator } = params;
  const playback = useMediaPlayback({ attachmentId: mediaId, ...(coordinator !== undefined ? { coordinator } : {}) });
  const { status, toggle, setMuted } = playback;

  useEffect(() => {
    setMuted(!soundOn);
  }, [soundOn, setMuted]);

  const settledActive = useRef<boolean | null>(null);
  useEffect(() => {
    if (settledActive.current === active) return;
    settledActive.current = active;
    if (playbackIntentOf({ active, status }) !== null) toggle();
  }, [active, status, toggle]);

  const pausedByHiddenTab = useRef(false);
  useEffect(() => {
    if (!active) return undefined;
    const onVisibility = () => {
      if (document.hidden) {
        pausedByHiddenTab.current = status === 'playing';
        if (pausedByHiddenTab.current) toggle();
        return;
      }
      if (!pausedByHiddenTab.current) return;
      pausedByHiddenTab.current = false;
      toggle();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active, status, toggle]);

  return playback;
}
