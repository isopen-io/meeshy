/**
 * Hook pour gérer un simple tap/click unifié
 * Résout le problème du double tap sur mobile avec les Tooltips
 *
 * Sur mobile avec Tooltip:
 * - Premier tap: active le hover du tooltip
 * - Second tap: déclenche le click
 *
 * Ce hook utilise touch events pour déclencher immédiatement l'action
 */

import { useCallback } from 'react';

export function useSingleTap<T extends HTMLElement = HTMLElement>(
  onTap: (event: React.TouchEvent<T> | React.MouseEvent<T>) => void
) {
  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<T>) => {
      event.preventDefault(); // Empêche le click émulé
      event.stopPropagation();
      onTap(event);
    },
    [onTap]
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<T>) => {
      // Pour desktop (souris)
      onTap(event);
    },
    [onTap]
  );

  return {
    onTouchEnd: handleTouchEnd,
    onClick: handleClick,
  };
}
