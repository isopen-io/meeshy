import type { CallLayout } from './call-view';

/**
 * **OÙ VIT LE ZOOM DE MA CAMÉRA** (#8626, #17327), en loi pure — miroir de
 * `CallCameraControlsPlacement` d'iOS :
 *
 * - `tile` : ma vignette en coin porte le cran « 1× · 2× · … » (#8441) ;
 * - `top` : mon image remplit l'écran (échange) — la capsule `+ 1× −` et le
 *   pincement ;
 * - `menu` : je n'ai pas de vignette où poser un zoom (caméra coupée, appel
 *   vocal, groupe, écran partagé par le pair) — pas de zoom, rien à regarder
 *   zoomer.
 *
 * Ma vignette ne porte AUCUNE commande (#17327) : Caméra, Retourner (ou le
 * choix de la caméra), Effets et Écran sont la famille « Mon image », en rail
 * à gauche d'un duo ou en rangée d'un groupe (`call-controls-disposition.ts`),
 * et cela, que ma vignette soit là ou non.
 */

export type SelfZoomPlace = 'tile' | 'top' | 'menu';

type PlaceInput = { readonly layout: CallLayout; readonly selfFull: boolean; readonly selfTileShown: boolean };

export function selfZoomPlace({ layout, selfFull, selfTileShown }: PlaceInput): SelfZoomPlace {
  if (layout !== 'video-duo') return 'menu';
  if (selfFull) return 'top';
  return selfTileShown ? 'tile' : 'menu';
}

/**
 * Le zoom de ma caméra (#8441) suit sa place : un CRAN dans ma vignette, la
 * capsule `+ 1× −` et le pincement quand mon image remplit l'écran. Sans
 * vignette, pas de zoom.
 */
export type ZoomControl = 'step' | 'capsule';

export const zoomControlIn = (place: SelfZoomPlace): ZoomControl | null => (place === 'tile' ? 'step' : place === 'top' ? 'capsule' : null);
