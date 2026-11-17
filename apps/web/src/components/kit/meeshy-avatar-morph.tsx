import '@/styles/kit-avatar-morph.css';
import '@/styles/kit-motion.css';
import { memo, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

import {
  MEESHY_AVATAR_MORPH_MEASURE,
  meeshyAvatarMorphRecipe,
  meeshyAvatarMorphStyle,
  type MeeshyAvatarMorphPath,
} from './meeshy-avatar-morph-recipe';
import { prefersReducedMotion, ScopeContext, type TransitionHost } from './meeshy-avatar-morph-scope';

export * from './meeshy-avatar-morph-recipe';
export { MeeshyAvatarMorphScope, useMeeshyAvatarMorph, type MeeshyAvatarMorphApi } from './meeshy-avatar-morph-scope';

export type MeeshyAvatarMorphProps = {
  readonly id: string;
  readonly size: number;
  readonly children?: ReactNode;
  readonly ring?: ReactNode;
  readonly badge?: ReactNode;
  readonly path?: MeeshyAvatarMorphPath | undefined;
  readonly progress?: number | null | undefined;
  readonly ringTravels?: boolean | undefined;
  readonly badgeTravels?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly onArrive?: (() => void) | undefined;
  readonly className?: string | undefined;
};

/**
 * Un emplacement d'avatar : un cadre rond de la taille donnée, le contenu de l'hôte, deux
 * emplacements autour (`ring`, `badge`). Deux emplacements de même identité dans la même
 * portée sont le même avatar ; un doublon coupe le voyage. `progress` (0 à 1) pilote le
 * voyage par une valeur — le repli d'un en-tête au défilement — au lieu du temps.
 */
export const MeeshyAvatarMorph = memo(function MeeshyAvatarMorph({ id, size, children, ring, badge, path, progress, ringTravels, badgeTravels, isEnabled = true, onArrive, className }: MeeshyAvatarMorphProps) {
  const scope = useContext(ScopeContext);
  const element = useRef<HTMLDivElement | null>(null);
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const register = scope?.register;
  useLayoutEffect(() => {
    const node = element.current;
    if (register === undefined || node === null || !isEnabled) return undefined;
    const release = register(id, node);
    if (node.style.getPropertyValue('view-transition-name') !== '') arrive.current?.();
    return release;
  }, [register, id, isEnabled]);
  const recipe = meeshyAvatarMorphRecipe({ from: size, to: size, hasScope: scope !== null, canTravel: typeof document !== 'undefined' && typeof (document as unknown as TransitionHost).startViewTransition === 'function', path, progress, reduceMotion: prefersReducedMotion(), ringTravels, badgeTravels });
  return (
    <div
      ref={element}
      className={className === undefined ? 'kit-morph' : `kit-morph ${className}`}
      data-kit-avatar-morph=""
      data-morph-id={id}
      data-mode={recipe.mode}
      data-ring-travels={ringTravels === true ? '' : undefined}
      data-badge-travels={badgeTravels === true ? '' : undefined}
      style={{ ...meeshyAvatarMorphStyle(size, recipe.progress), '--kit-morph-badge-lead': `${MEESHY_AVATAR_MORPH_MEASURE.badgeLeadMs}ms`, '--kit-morph-badge-return': `${MEESHY_AVATAR_MORPH_MEASURE.badgeReturnMs}ms` } as never}
    >
      {ring === undefined ? null : <span className="kit-morph__ring" data-kit-morph-ring="">{ring}</span>}
      <span className="kit-morph__content">{children}</span>
      {badge === undefined ? null : <span className="kit-morph__badge" data-kit-morph-badge="">{badge}</span>}
    </div>
  );
});
