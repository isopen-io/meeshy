import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import type { GameMaterial } from './materials';

/**
 * LE CARNET DES RÈGLES, ILLUSTRÉ (#9538, conception I, II et IV) — ce que
 * dessine la planche des éléments du jeu, et dans quel ordre. Le modèle ne
 * dessine rien : les composants du jeu le font (anneau, pièce, blason, Flamme,
 * gemme, médaille, coupe, liseré), les mêmes que partout dans l'app, de sorte
 * qu'une brique retouchée change ici en même temps que là où on la gagne.
 *
 * Miroir de `GameRulesAtlas` (iOS).
 */

/** Les neuf familles : ce que le joueur monte, ce qu'il garde, ce qui le distingue, ce qu'il montre. */
export const ATLAS_FAMILIES = ['levels', 'coin', 'treasury', 'ranks', 'flames', 'leagues', 'medals', 'trophies', 'rarities'] as const;
export type AtlasFamily = (typeof ATLAS_FAMILIES)[number];

export type AtlasSpeaker = 'mee' | 'meo';

/** Mee montre le geste, Meo explique la règle : ils se relaient d'une famille à l'autre. */
export const atlasSpeaker = (family: AtlasFamily): AtlasSpeaker =>
  family === 'levels' || family === 'treasury' || family === 'flames' || family === 'medals' || family === 'rarities' ? 'mee' : 'meo';

/** Le premier niveau que couvre un palier (ordinal de 1 à 10) : 1, 10, 20 … 90. */
export const firstLevelOfTier = (ordinal: number): number => (ordinal <= 1 ? 1 : (ordinal - 1) * 10);

export type AtlasCoinPlate = {
  readonly key: 'obverse' | 'reverse' | 'gold' | 'prism';
  readonly side: 'obverse' | 'reverse';
  readonly edition: MeeshEdition;
  /** Le numéro gravé au revers : 13 pour l'argent, 100 pour l'or, 1 000 pour le prisme. */
  readonly number: number;
};

/** Les quatre faces de la planche IV.2 : l'avers, le revers numéroté, l'édition or (chaque centième), l'édition prisme (chaque millième). */
export const ATLAS_COIN_PLATES: readonly AtlasCoinPlate[] = [
  { key: 'obverse', side: 'obverse', edition: 'silver', number: 13 },
  { key: 'reverse', side: 'reverse', edition: 'silver', number: 13 },
  { key: 'gold', side: 'reverse', edition: 'gold', number: 100 },
  { key: 'prism', side: 'reverse', edition: 'prism', number: 1000 },
];

/** Combien de pièces la pile d'un palier du trésor dessine (ordinal de 1 à 6) : une de plus à chaque palier. */
export const treasuryPile = (ordinal: number): number => Math.max(1, ordinal);

export type AtlasMedalMaterial = { readonly material: GameMaterial; readonly threshold: number };

/** Les sept matières des médailles, du cuivre au prisme, avec leur seuil d'actions. */
export const ATLAS_MEDAL_MATERIALS: readonly AtlasMedalMaterial[] = [
  { material: 'copper', threshold: 1 },
  { material: 'bronze', threshold: 10 },
  { material: 'silver', threshold: 50 },
  { material: 'gold', threshold: 100 },
  { material: 'platinum', threshold: 500 },
  { material: 'obsidian', threshold: 1000 },
  { material: 'prism', threshold: 5000 },
];

export type AtlasTrophyPlate = {
  readonly key: 'leagueGold' | 'leagueSilver' | 'leagueBronze' | 'season' | 'prestige' | 'flame';
  readonly kind: 'league' | 'season' | 'prestige' | 'flame';
  /** La matière de la coupe de ligue ; les autres trophées portent la leur. */
  readonly material?: GameMaterial;
};

/** Les trophées : la coupe de ligue (or, argent, bronze), la coupe de saison, le trophée de Prestige, celui de la Flamme. */
export const ATLAS_TROPHY_PLATES: readonly AtlasTrophyPlate[] = [
  { key: 'leagueGold', kind: 'league', material: 'gold' },
  { key: 'leagueSilver', kind: 'league', material: 'silver' },
  { key: 'leagueBronze', kind: 'league', material: 'bronze' },
  { key: 'season', kind: 'season' },
  { key: 'prestige', kind: 'prestige' },
  { key: 'flame', kind: 'flame' },
];
