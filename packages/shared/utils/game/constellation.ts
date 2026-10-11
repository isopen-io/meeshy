/** LA CONSTELLATION (#10053) — squelette, la loi suit. */
export const CONSTELLATION_FRAGMENTS_PER_STAR = 10;
export const CONSTELLATION_COSMETIC_KINDS = [] as readonly string[];
export type ConstellationCosmetic = { readonly star: number; readonly kind: string; readonly cosmeticKey: string };
export type Constellation = {
  readonly collected: number;
  readonly stars: number;
  readonly inStar: number;
  readonly toNextStar: number;
  readonly cosmetics: readonly ConstellationCosmetic[];
};
export const constellationStarCosmetic = (_star: number): ConstellationCosmetic | null => null;
export const isConstellationCosmeticKey = (_key: string): boolean => false;
export const constellationOf = (_collected: number): Constellation => ({ collected: 0, stars: 0, inStar: 0, toNextStar: 0, cosmetics: [] });
