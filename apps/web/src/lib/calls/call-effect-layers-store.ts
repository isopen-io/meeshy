import { createStore } from 'zustand/vanilla';

import type { EffectStack } from './call-effect-layers';

/**
 * **LA PILE D'EFFETS DE L'APPEL** (#17903) — UNE pour l'appel : le mode Effets et le mode Montage la lisent et
 * l'écrivent (l'un et l'autre en gardent les couches qu'ils ne possèdent pas), si bien qu'un cadre choisi au
 * Montage se liste en Effets et inversement. Légère : aucun traitement d'image, la loi vit dans
 * `call-effect-layers.ts`. Elle suit les effets réellement appliqués (`videoEffectsStore`, le cadre du Montage)
 * et n'est jamais une seconde source de leur valeur.
 */
export const effectLayersStore = createStore<{ readonly stack: EffectStack }>(() => ({ stack: [] }));

export const setEffectLayers = (stack: EffectStack): void => effectLayersStore.setState({ stack });
