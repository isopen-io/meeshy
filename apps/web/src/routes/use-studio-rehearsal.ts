import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { rehearsalTimeline, SCENE_TRANSITION_MS, sceneTransitionKeyframes } from '@/lib/canvas/scene-transition';
import type { StudioTransitions } from '@/lib/stories/studio-scene-columns';

/**
 * **LA RÉPÉTITION DES TRANSITIONS** (#8794, jumelle de
 * `StoryCanvasUIView.rehearseSlideTransitions`, #8792 — « lors du choix la
 * scène doit être mise à jour en direct en recommençant l'ouverture
 * sélectionnée ainsi que la fermeture ! ») : la carte joue l'ouverture, une
 * courte pause sur la scène entière, puis la fermeture, et revient à l'état
 * neutre de l'édition. Les formes sont celles du lecteur iOS
 * (`sceneTransitionKeyframes`), animées par le compositeur (Web Animations).
 *
 * Un nouveau choix interrompt la répétition en cours ; quitter le studio
 * l'annule. Sous `prefers-reduced-motion`, rien ne bouge : le choix reste
 * visible dans le carrousel et, pour un effet visuel, sur la scène elle-même.
 */
export function useStudioRehearsal(stageRef: RefObject<HTMLElement | null>): (plan: StudioTransitions) => void {
  const animations = useRef<Animation[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);

  useEffect(() => stop, [stop]);

  return useCallback(
    (plan: StudioTransitions) => {
      stop();
      const stage = stageRef.current;
      if (stage === null || typeof stage.animate !== 'function' || prefersReducedMotion()) return;
      const { closingStartMs, totalMs } = rehearsalTimeline(plan);
      if (plan.opening !== null) {
        animations.current.push(stage.animate([...sceneTransitionKeyframes(plan.opening, 'opening')], { duration: SCENE_TRANSITION_MS, easing: 'ease-out' }));
      }
      const closing = plan.closing;
      if (closing !== null) {
        timers.current.push(
          setTimeout(() => {
            animations.current.push(stage.animate([...sceneTransitionKeyframes(closing, 'closing')], { duration: SCENE_TRANSITION_MS, easing: 'ease-in', fill: 'forwards' }));
          }, closingStartMs),
        );
      }
      timers.current.push(setTimeout(stop, totalMs));
    },
    [stageRef, stop],
  );
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
