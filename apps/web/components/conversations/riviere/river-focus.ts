/**
 * `river-focus.ts` — hauteur de lecture → RANG FRACTIONNAIRE, ARITHMÉTIQUE
 * PURE (R-134, §7ter B).
 *
 * Miroir exact de `focusRankAt` dans la maquette normative
 * (`docs/design/2026-08-17-riviere-navigation.html`) : « le centre d'un rang
 * vaut son rang exact ; entre deux rangs, la valeur glisse continûment — c'est
 * ce qui rend le fondu solidaire du geste et non des paliers. »
 *
 * `RiverThread.tsx` appelle cette fonction avec les EXTENTS MESURÉS (jamais
 * une hauteur de rang supposée) et la MÊME bande de focus que le reste de la
 * Lentille (`FOCUS_BAND_OFFSET`, `packages/shared/utils/focus-curve.ts`) —
 * jamais une seconde loi de défilement. Le résultat alimente
 * `resolveRiverLaneHeaders({ geometry, focusRank })` — cette fonction-ci ne
 * connaît RIEN de la loi Rivière elle-même (aucun import de `river-lanes.ts`).
 */

export interface RiverRowExtent {
  readonly top: number;
  readonly bottom: number;
}

const HALF_RANK = 0.5;

/**
 * Rang fractionnaire correspondant à la hauteur `y` (mêmes coordonnées que
 * `rowTop`/`rowBottom`, typiquement le repère de défilement du conteneur).
 *
 * `ranksAscending` DOIT être trié croissant (l'appelant le tient déjà —
 * `geometry.bubbles` est en ordre chronologique strict). Un rang sans extent
 * mesuré est ignoré plutôt que de faire planter le calcul : la mesure peut
 * arriver par vagues (ResizeObserver) avant que toutes les bulles ne soient
 * peintes.
 */
export function riverFocusRankAt(
  y: number,
  ranksAscending: readonly number[],
  rowTop: ReadonlyMap<number, number>,
  rowBottom: ReadonlyMap<number, number>
): number {
  let rank = ranksAscending[0] ?? 0;

  for (const candidate of ranksAscending) {
    const top = rowTop.get(candidate);
    if (top !== undefined && top <= y) {
      rank = candidate;
    }
  }

  const top = rowTop.get(rank) ?? 0;
  const bottom = rowBottom.get(rank) ?? top;
  const span = Math.max(1, bottom - top);
  const fraction = Math.min(1, Math.max(0, (y - top) / span));

  return rank + fraction - HALF_RANK;
}

/** Borne `focusRank` à `[-0.5, rankCount - 0.5]` — les bords de la fenêtre. */
export function clampRiverFocusRank(focusRank: number, rankCount: number): number {
  const low = -HALF_RANK;
  const high = rankCount - HALF_RANK;
  return Math.min(high, Math.max(low, focusRank));
}
