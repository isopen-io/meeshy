import { useMemo, type ReactNode } from 'react';

import { AuthorRingsContext, ringsByAuthor } from '@/lib/profile-decor/author-ring';
import { AuthorMoodsContext, useAuthorMoods } from '@/lib/view/use-author-moods';

/**
 * Ce que le fil sait de SES auteurs, posé d'un seul geste : leur humeur
 * (#9065) et leur contour équipé (#10713, servi avec les participants).
 */
export function AuthorContexts({ viewer, participants, children }: { readonly viewer: { readonly isAnonymous: boolean }; readonly participants: readonly unknown[] | undefined; readonly children: ReactNode }) {
  const moodOf = useAuthorMoods(viewer);
  const rings = useMemo(() => ringsByAuthor(participants), [participants]);
  return (
    <AuthorRingsContext.Provider value={rings}>
      <AuthorMoodsContext.Provider value={moodOf}>{children}</AuthorMoodsContext.Provider>
    </AuthorRingsContext.Provider>
  );
}
