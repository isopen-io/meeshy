import { useMemo, useRef } from 'react';

import type { SocialEventV2Input, StoryAction } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';

/**
 * **LES GESTES DU LECTEUR DE STORY** (#10506) — tap avant et arrière (ou
 * balayage), et la sortie AVANT la fin du groupe (`exit_before_end`), avec la
 * slide où l'on était, le nombre de slides et le temps passé dans la slide.
 * L'avance automatique n'est pas un geste : elle ne part pas d'ici.
 */
export type StoryPlace = {
  readonly storyId: string | undefined;
  readonly slideIndex: number | undefined;
  readonly slideCount: number | undefined;
  readonly elapsedMs: () => number;
};

export function storyEventOf(action: StoryAction, place: { readonly storyId: string; readonly slideIndex: number; readonly slideCount: number; readonly elapsedMs: number }): SocialEventV2Input {
  return {
    type: 'story',
    action,
    target: { kind: 'story', id: place.storyId },
    surface: 'story',
    slideIndex: place.slideIndex,
    slideCount: place.slideCount,
    elapsedMs: Math.max(0, Math.round(place.elapsedMs)),
  };
}

export function useStoryTelemetry(place: StoryPlace): { readonly noteTap: (direction: 'previous' | 'next') => void; readonly noteExit: () => void } {
  const latest = useRef(place);
  latest.current = place;
  return useMemo(() => {
    const emit = (action: StoryAction, when: (index: number, count: number) => boolean = () => true) => {
      const { storyId, slideIndex, slideCount, elapsedMs } = latest.current;
      if (storyId === undefined || slideIndex === undefined || slideCount === undefined || !when(slideIndex, slideCount)) return;
      readingTelemetry.recordV2(storyEventOf(action, { storyId, slideIndex, slideCount, elapsedMs: elapsedMs() }));
    };
    return {
      noteTap: (direction) => emit(direction === 'next' ? 'tap_forward' : 'tap_back'),
      noteExit: () => emit('exit_before_end', (index, count) => index < count - 1),
    };
  }, []);
}
