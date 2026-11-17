import '@/styles/kit-skeleton.css';
import { memo, useState } from 'react';

import { meeshySkeletonClockOffset, meeshySkeletonRecipe, meeshySkeletonStyle, type MeeshySkeletonShape } from './meeshy-skeleton-recipe';

export * from './meeshy-skeleton-recipe';

export type MeeshySkeletonProps = {
  readonly shape: MeeshySkeletonShape;
  readonly className?: string | undefined;
};

/**
 * Un squelette : un aplat de la forme exacte de ce qu'il remplace, caché à la voix (l'hôte
 * dit « chargement » à sa place, une fois). Le reflet est une transformation ; le décalage
 * vient d'une horloge commune lue au montage, donc tous les squelettes passent ensemble.
 */
export const MeeshySkeleton = memo(function MeeshySkeleton({ shape, className }: MeeshySkeletonProps) {
  const [offset] = useState(() => meeshySkeletonClockOffset(Date.now()));
  const recipe = meeshySkeletonRecipe(shape);
  return (
    <span
      className={className === undefined ? 'kit-skeleton' : `kit-skeleton ${className}`}
      aria-hidden="true"
      data-kit-skeleton=""
      data-shape={recipe.kind}
      style={meeshySkeletonStyle(recipe, offset)}
    />
  );
});
