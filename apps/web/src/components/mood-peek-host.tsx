import { lazy, Suspense, useLayoutEffect } from 'react';

import { useCloseOnNavigation } from '@/lib/router';
import { closeMoodPeek, registerMoodPeekHost, useMoodPeek } from '@/lib/view/mood-peek';

/**
 * **L'HÔTE DE LA FEUILLE D'HUMEUR** (#10528) — monté par la coquille, donc
 * présent sur toutes les routes, comme `StatusBubbleOverlayModifier` l'est à
 * la racine d'iOS. Même patron que `ProfilePeekHost` : la feuille se charge au
 * premier toucher et se referme quand l'adresse change.
 */
const LazyMoodPeekSheet = lazy(() => import('@/components/mood-peek-sheet').then((m) => ({ default: m.MoodPeekSheet })));

export function MoodPeekHost() {
  const peek = useMoodPeek();

  useLayoutEffect(() => registerMoodPeekHost(), []);
  useCloseOnNavigation(closeMoodPeek);

  return peek === null ? null : (
    <Suspense fallback={null}>
      <LazyMoodPeekSheet key={peek.authorId} peek={peek} onClose={closeMoodPeek} />
    </Suspense>
  );
}
