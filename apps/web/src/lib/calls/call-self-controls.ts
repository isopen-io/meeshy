import type { CallControlSet, MineAction } from './call-controls';
import type { CallLayout } from './call-view';

/**
 * **OÙ VIVENT LES COMMANDES DE MA CAMÉRA** (#8626), en loi pure — Retourner,
 * Couper la caméra, Effets, Partager l'écran :
 *
 * - `tile` : AUTOUR de ma vignette en coin (#8747) — Effets · Écran au-dessus,
 *   Retourner · Couper en dessous (`selfRowsLayout`) ;
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

/**
 * Le zoom de ma caméra (#8441) suit ses commandes : un CRAN « 1× · 2× · … »
 * dans ma vignette, la capsule `+ 1× −` et le pincement quand mon image
 * remplit l'écran. Sans vignette, pas de zoom : rien à regarder zoomer.
 */
export type ZoomControl = 'step' | 'capsule';

export const zoomControlIn = (place: SelfControlsPlace): ZoomControl | null => (place === 'tile' ? 'step' : place === 'top' ? 'capsule' : null);

/**
 * **AUTOUR DE MA VIGNETTE, JAMAIS DEDANS** (#8747, miroir de
 * `CallSelfTileControlsPlacement` sur iOS) — ce qui part AVEC mon image
 * (Effets, Écran) au-dessus de la vignette, ce qui agit sur la caméra
 * (Retourner, Couper, et le cran du zoom) en dessous.
 */
export type SelfControlGroup = 'effects' | 'camera';

export const SELF_CONTROL_GROUPS: Readonly<Record<SelfControlGroup, readonly MineAction[]>> = {
  effects: ['effects', 'screen'],
  camera: ['flip', 'camera'],
};

export const inSelfGroup = (group: SelfControlGroup | undefined, action: MineAction): boolean => group === undefined || SELF_CONTROL_GROUPS[group].includes(action);

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type SelfRowSide = 'above' | 'below';

export type SelfRow = Box & { readonly side: SelfRowSide };

export type SelfRowsLayout = { readonly effects: SelfRow | null; readonly camera: SelfRow | null };

/** La rangée : des boutons de 44 px, 2 px entre eux, dans 2 px de verre. */
export const SELF_ROW_HEIGHT = 48;

export const SELF_ROW_EDGE_GAP = 8;

export const SELF_ROW_GAP = 8;

export const selfRowWidth = (count: number): number => (count <= 0 ? 0 : count * 44 + (count - 1) * 2 + 4);

const clamp = (value: number, low: number, high: number): number => (low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high));

const distance = (depth: number): number => SELF_ROW_EDGE_GAP + depth * (SELF_ROW_HEIGHT + SELF_ROW_GAP);

const topOf = (side: SelfRowSide, depth: number, tile: Box): number => (side === 'above' ? tile.y - distance(depth) - SELF_ROW_HEIGHT : tile.y + tile.height + distance(depth));

const fits = (side: SelfRowSide, depth: number, tile: Box, bounds: Box): boolean => {
  const y = topOf(side, depth, tile);
  return y >= bounds.y && y + SELF_ROW_HEIGHT <= bounds.y + bounds.height;
};

type RowInput = { readonly width: number; readonly home: SelfRowSide; readonly atHome: boolean; readonly depthAway: number; readonly tile: Box; readonly bounds: Box };

function placeRow({ width, home, atHome, depthAway, tile, bounds }: RowInput): SelfRow {
  const x = clamp(tile.x + tile.width / 2 - width / 2, bounds.x, bounds.x + bounds.width - width);
  const row = (y: number, side: SelfRowSide): SelfRow => ({ x, y, width, height: SELF_ROW_HEIGHT, side });
  if (atHome) return row(topOf(home, 0, tile), home);
  const away: SelfRowSide = home === 'above' ? 'below' : 'above';
  if (fits(away, depthAway, tile, bounds)) return row(topOf(away, depthAway, tile), away);
  return row(clamp(topOf(home, 0, tile), bounds.y, bounds.y + bounds.height - SELF_ROW_HEIGHT), home);
}

type LayoutInput = { readonly tile: Box; readonly bounds: Box; readonly effectsWidth: number; readonly cameraWidth: number };

/**
 * `bounds` est la zone où une rangée a le droit de vivre : l'écran moins
 * l'en-tête, la pilule et les bords. Chaque rangée est centrée sur la
 * vignette, à 8 px de son bord, bornée à `bounds` en largeur ; en hauteur :
 * 1. à SON côté ;
 * 2. sinon de l'AUTRE côté, au-delà de la rangée qui y vit déjà ;
 * 3. sinon à son côté, ramenée dans `bounds` — elle chevauche le bord de la
 *    vignette du strict nécessaire.
 */
export function selfRowsLayout({ tile, bounds, effectsWidth, cameraWidth }: LayoutInput): SelfRowsLayout {
  const effectsAtHome = effectsWidth > 0 && fits('above', 0, tile, bounds);
  const cameraAtHome = cameraWidth > 0 && fits('below', 0, tile, bounds);
  return {
    effects: effectsWidth > 0 ? placeRow({ width: effectsWidth, home: 'above', atHome: effectsAtHome, depthAway: cameraAtHome ? 1 : 0, tile, bounds }) : null,
    camera: cameraWidth > 0 ? placeRow({ width: cameraWidth, home: 'below', atHome: cameraAtHome, depthAway: effectsAtHome ? 1 : 0, tile, bounds }) : null,
  };
}

/** L'en-tête tient 3,5 rem sous la zone sûre, la pilule 6,5 rem au-dessus d'elle ; 8 px de bord. */
export const selfRowBounds = (viewport: { readonly width: number; readonly height: number }): Box => ({
  x: 8,
  y: 56,
  width: Math.max(0, viewport.width - 16),
  height: Math.max(0, viewport.height - 56 - 104),
});
