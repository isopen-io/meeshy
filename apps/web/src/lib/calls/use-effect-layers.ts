import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { syncLayers, type EffectGenre, type EffectStack } from './call-effect-layers';
import { effectLayersStore, setEffectLayers } from './call-effect-layers-store';

/**
 * **LA PILE, TELLE QU'UN MODE LA VOIT** (#17903) — la pile partagée, réconciliée avec ce que le mode sait
 * être appliqué (`actual`, sur les genres qu'il possède) : lue à chaque rendu sans attendre, puis réécrite
 * dans la pile partagée pour que l'autre mode la lise.
 */
export function useEffectLayers(actual: EffectStack, owned: readonly EffectGenre[]): EffectStack {
  const stored = useStore(effectLayersStore, (state) => state.stack);
  const stack = syncLayers(stored, actual, owned);
  useEffect(() => {
    if (stack !== stored) setEffectLayers(stack);
  });
  return stack;
}
