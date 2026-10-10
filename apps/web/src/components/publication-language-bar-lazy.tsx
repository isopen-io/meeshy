import { lazy, Suspense } from 'react';

import type { PublicationLanguageBarProps } from '@/components/publication-language-bar';

/**
 * LE CHUNK À LA DEMANDE, EN UN SEUL POINT D'IMPORT (#7114, § 7 de la
 * spécification) — même motif que `publication-viewers-sheet-lazy.tsx` et
 * `publication-comments-sheet-lazy.tsx` (D-54) : la barre rapide des langues
 * n'existe qu'APRÈS un geste (le bouton « Traductions » du rail), et un
 * lecteur qui ne l'ouvre jamais ne la télécharge jamais. Mesuré : liée
 * STATIQUEMENT, elle portait `story_reader` à 13,7 Ko pour un plafond de 13
 * (`node scripts/measure-weight.mjs`, 2026-10-04) ; le plafond ne monte pas,
 * c'est la barre qui sort du chunk. Son nom reste hors du motif `story-`
 * (`budgets.json`, `story_reader.pattern`) : une story est une publication
 * (D-89).
 */
const LazyPublicationLanguageBar = lazy(() =>
  import('@/components/publication-language-bar').then((m) => ({ default: m.PublicationLanguageBar })),
);

export function PublicationLanguageBarLazy(props: PublicationLanguageBarProps) {
  return (
    <Suspense fallback={null}>
      <LazyPublicationLanguageBar {...props} />
    </Suspense>
  );
}
