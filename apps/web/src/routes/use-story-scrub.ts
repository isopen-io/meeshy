import { useCallback, useRef, useState } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';

export type StoryScrub = {
  /** Un glissé est EN COURS sur la diapositive courante — l'avance
   * automatique et la scène sont suspendues. */
  readonly scrubbing: boolean;
  /** Reçoit l'horloge du moteur de la diapositive (`ScenePlayer.onClock`). */
  readonly onClock: (clock: SceneClockHandle) => void;
  readonly onScrubStart: () => void;
  readonly onScrub: (seconds: number) => void;
  readonly onScrubEnd: (seconds: number) => void;
};

/**
 * LE SEGMENT ACTIF SE PARCOURT AU DOIGT (#7879) — la loi d'hôte du lecteur de
 * story, extraite de `story.tsx` (§ budget). Le minuteur de la diapositive
 * (`elapsedRef` + `startTsRef`) repart DEPUIS le temps pointé ; la scène v3
 * est redessinée par l'horloge de son moteur ; une story sans scène (image,
 * texte) ne règle que sa progression, donc le temps qui lui reste.
 *
 * **Le glissé et l'horloge portent l'IDENTITÉ de leur story**, jamais une
 * remise à zéro « à chaque story » : les effets d'un enfant passent avant
 * ceux du parent, et la couche de scène de la story qu'on vient d'ouvrir
 * remet son horloge AVANT qu'un effet parent ait pu effacer l'ancienne —
 * c'est la course que `readyStoryId` évite déjà dans `story.tsx`.
 */
export function useStoryScrub(params: {
  readonly storyId: string | undefined;
  readonly elapsedRef: { current: number };
  readonly startTsRef: { current: number };
}): StoryScrub {
  const { storyId, elapsedRef, startTsRef } = params;
  const [scrubbingStoryId, setScrubbingStoryId] = useState<string | null>(null);
  const clockRef = useRef<{ readonly storyId: string | undefined; readonly clock: SceneClockHandle } | null>(null);
  const storyIdRef = useRef(storyId);
  storyIdRef.current = storyId;

  const onClock = useCallback((clock: SceneClockHandle) => {
    clockRef.current = { storyId: storyIdRef.current, clock };
  }, []);

  const onScrub = useCallback(
    (seconds: number) => {
      elapsedRef.current = seconds * 1000;
      startTsRef.current = performance.now();
      const held = clockRef.current;
      if (held !== null && held.storyId === storyIdRef.current) held.clock.seek(seconds);
    },
    [elapsedRef, startTsRef],
  );

  const onScrubStart = useCallback(() => setScrubbingStoryId(storyIdRef.current ?? null), []);

  const onScrubEnd = useCallback(
    (seconds: number) => {
      onScrub(seconds);
      setScrubbingStoryId(null);
    },
    [onScrub],
  );

  return {
    scrubbing: storyId !== undefined && scrubbingStoryId === storyId,
    onClock,
    onScrubStart,
    onScrub,
    onScrubEnd,
  };
}
