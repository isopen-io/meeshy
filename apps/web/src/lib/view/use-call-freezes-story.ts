import { useEffect, useRef } from 'react';
import { useStore } from 'zustand/react';

import { callStore, isCallLive } from '@/lib/calls/call-store';

/**
 * **UN APPEL GÈLE LA STORY** (#8727, jumelle de `PlaybackInterruption` iOS,
 * #8725) — tant qu'un appel vit, la minuterie de la story s'arrête (réduire
 * l'appel ne la relance pas : on revient à une story qu'on n'a pas vue défiler),
 * et elle reprend EN PLACE quand l'appel se termine. On ne reprend qu'une
 * pause qu'on a soi-même posée : une pause voulue par l'utilisateur survit à
 * l'appel. Même forme que `useStoryHiddenTabPause`.
 */
export function useCallFreezesStory(params: { readonly paused: boolean; readonly pause: () => void; readonly resume: () => void }): void {
  const { paused, pause, resume } = params;
  const live = useStore(callStore, (state) => isCallLive(state.call));
  const frozeRef = useRef(false);
  useEffect(() => {
    if (live) {
      if (paused || frozeRef.current) return;
      frozeRef.current = true;
      pause();
      return;
    }
    if (!frozeRef.current) return;
    frozeRef.current = false;
    resume();
  }, [live, paused, pause, resume]);
}
