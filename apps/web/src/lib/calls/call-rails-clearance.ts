import type { RailSide } from './call-controls-disposition';
import type { SelfTileCorner, TileFootprint, TileSize } from './call-self-tile';

/**
 * **UN RAIL NE MASQUE JAMAIS MA VIGNETTE** (#17327, #17429) — la planche P2
 * pose ma vignette en haut à droite, AU-DESSUS du rail « l'appel ». Le rail du
 * côté de ma vignette se DÉCALE, l'autre ne bouge pas :
 *
 * 1. SOUS ma vignette en coin haut, AU-DESSUS d'elle en coin bas, tant que la
 *    bande qui reste en vaut la peine ({@link RAIL_MIN_BAND}) — le rail y
 *    reste centré et, s'il est plus long qu'elle, y défile au doigt ;
 * 2. sinon (paysage, écran court) À CÔTÉ d'elle, vers l'intérieur, sur toute la
 *    hauteur mais au-dessus de la pilule, qui ne tient plus entre deux rails.
 *
 * Les mesures sont celles de la zone des rails (`call-rails.tsx`) : 3,5 rem
 * sous la zone sûre ({@link RAILS_TOP}), 6,5 rem au-dessus d'elle pour la
 * pilule ({@link RAILS_PILL_CLEARANCE}), jusqu'au pied de l'écran dès 35 rem de
 * large ({@link RAILS_BESIDE_PILL_WIDTH}).
 *
 * Elle n'importe rien à l'exécution : elle vit dans le chunk des rails
 * (`budgets.json` › `call_rails`), à qui l'écran d'appel REMET ma vignette
 * (`selfTileFootprint`, `call-self-tile.ts`) et l'écran.
 */

export const RAILS_TOP = 56;

export const RAILS_PILL_CLEARANCE = 104;

export const RAILS_BESIDE_PILL_WIDTH = 560;

export const RAIL_TILE_GAP = 8;

/** Un rail : des boutons de 44, 8 entre eux, 8 de verre autour (`CallActionRail`). */
export const railLength = (count: number): number => (count <= 0 ? 0 : count * 44 + (count - 1) * 8 + 16);

/** La plus petite bande où un rail reste un rail : deux boutons entiers. */
export const RAIL_MIN_BAND = railLength(2);

/** Ce que le rail d'un bord laisse à ma vignette : en haut, en bas, et vers l'intérieur depuis son bord. */
export type RailClearance = { readonly top: number; readonly bottom: number; readonly inline: number };

export type RailsClearance = Readonly<Record<RailSide, RailClearance>>;

export const NO_RAIL_CLEARANCE: RailClearance = { top: 0, bottom: 0, inline: 0 };

const sideOf = (corner: SelfTileCorner, rtl: boolean): RailSide => (corner.endsWith('right') !== rtl ? 'trailing' : 'leading');

function clearanceFor(tile: TileFootprint, viewport: TileSize, inset: number, length: number): RailClearance {
  const besidePill = viewport.width >= RAILS_BESIDE_PILL_WIDTH;
  const areaBottom = viewport.height - (besidePill ? 0 : RAILS_PILL_CLEARANCE);
  const onTop = tile.corner.startsWith('top');
  const clear = Math.max(0, onTop ? tile.y + tile.height + RAIL_TILE_GAP - RAILS_TOP : areaBottom - tile.y + RAIL_TILE_GAP);
  const band = areaBottom - RAILS_TOP - clear;
  if (band >= Math.min(length, RAIL_MIN_BAND)) return onTop ? { top: clear, bottom: 0, inline: 0 } : { top: 0, bottom: clear, inline: 0 };
  const fromEdge = tile.corner.endsWith('right') ? viewport.width - inset - tile.x : tile.x + tile.width;
  return { top: 0, bottom: besidePill ? RAILS_PILL_CLEARANCE : 0, inline: fromEdge + RAIL_TILE_GAP };
}

type ClearanceInput = {
  readonly tile: TileFootprint | null;
  readonly viewport: TileSize;
  /** Ce que la colonne du journal retire à la scène (W1) : ma vignette s'y mesure (`selfTileFootprint`), et le rail de fin s'arrête déjà à elle. */
  readonly inset?: number;
  readonly rtl: boolean;
  /** La longueur de chaque rail ({@link railLength}). */
  readonly lengths: Readonly<Record<RailSide, number>>;
};

export function railsClearance({ tile, viewport, inset = 0, rtl, lengths }: ClearanceInput): RailsClearance {
  const none: RailsClearance = { leading: NO_RAIL_CLEARANCE, trailing: NO_RAIL_CLEARANCE };
  if (tile === null) return none;
  const side = sideOf(tile.corner, rtl);
  return { ...none, [side]: clearanceFor(tile, viewport, inset, lengths[side]) };
}
