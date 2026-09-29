import type { CallControlSet } from './call-controls';
import type { CallLayout } from './call-view';

/**
 * **OÙ VIVENT LES COMMANDES DE MA CAMÉRA** (#8626), en loi pure — Retourner,
 * Couper la caméra, Effets, Partager l'écran :
 *
 * - `tile` : DANS ma vignette en coin, une rangée compacte en bas ;
 * - `top` : mon image remplit l'écran (échange) — la même rangée, en haut au
 *   centre ;
 * - `menu` : je n'ai pas de vignette où les poser (caméra coupée, appel
 *   vocal, groupe, écran partagé par le pair) — la rangée « Mon image » du
 *   `(…)`, qui permet de rallumer la caméra.
 *
 * Un seul endroit à la fois : la rangée du `(…)` ne double jamais celle de ma
 * vignette (`mineInMenu`).
 */

export type SelfControlsPlace = 'tile' | 'top' | 'menu';

type PlaceInput = { readonly layout: CallLayout; readonly selfFull: boolean; readonly selfTileShown: boolean };

export function selfControlsPlace({ layout, selfFull, selfTileShown }: PlaceInput): SelfControlsPlace {
  if (layout !== 'video-duo') return 'menu';
  if (selfFull) return 'top';
  return selfTileShown ? 'tile' : 'menu';
}

export const mineInMenu = (set: CallControlSet, place: SelfControlsPlace): CallControlSet => (place === 'menu' ? set : { ...set, mine: [] });
