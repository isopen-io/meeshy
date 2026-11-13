import { afterEach, describe, expect, test } from 'bun:test';

import { effectLayersStore, setEffectLayers } from './call-effect-layers-store';

/** La pile est UNE pour l'appel : Effets et Montage la lisent et l'écrivent ; elle part avec l'appel. */
describe('la pile d’effets partagée', () => {
  afterEach(() => setEffectLayers([]));

  test('vide au départ ; ce qu’un mode y écrit, l’autre le lit', () => {
    expect(effectLayersStore.getState().stack).toEqual([]);
    setEffectLayers([{ genre: 'frame', choice: 'neon' }]);
    expect(effectLayersStore.getState().stack).toEqual([{ genre: 'frame', choice: 'neon' }]);
  });
});
