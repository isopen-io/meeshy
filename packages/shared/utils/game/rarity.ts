/**
 * LA RARETÉ DES SUCCÈS (#9390) — mesurée chaque nuit, figée à l'obtention.
 * `docs/product/jeu-meeshy-conception.html` § II.9.
 *
 * | rareté      | part des comptes | liseré  | Gloire |
 * |-------------|------------------|---------|--------|
 * | commun      | plus de 40 %     | ardoise | 10     |
 * | rare        | 10 à 40 %        | bleu    | 25     |
 * | épique      | 2 à 10 %         | violet  | 60     |
 * | légendaire  | 0,2 à 2 %        | or      | 150    |
 * | mythique    | moins de 0,2 %   | prisme  | 400    |
 *
 * Les bornes se lisent « borne basse incluse, borne haute exclue » : 10 % pile est
 * rare, 2 % pile est épique, 0,2 % pile est légendaire. Le commun est la seule
 * borne stricte — il commence au-dessus de 40 % : 40 % pile est déjà rare. La
 * table de tests fige chaque frontière.
 *
 * Le calcul est en ENTIERS : la part est comparée au millième par produit en
 * croix (`détenteurs × 1000` contre `borne × population`), jamais par une
 * division flottante qui se tromperait d'un ulp pile à la frontière.
 *
 * ## La Gloire est FIGÉE à l'obtention
 *
 * La rareté d'un succès bouge au fil des nuits ; la Gloire d'un succès déjà
 * obtenu, jamais : le registre de Gloire (en ajout seul) garde la valeur du jour.
 * `achievementGloryAtEarning` la donne, avec la rareté MESURÉE ce jour-là.
 *
 * ## Population minimale
 *
 * Sur une base de quelques centaines de comptes, « un détenteur » pèse déjà plus
 * de 0,2 % : la part n'a pas de sens, et déclarer « mythique » un succès parce
 * qu'il n'a qu'un détenteur gonflerait la Gloire pour rien. En dessous de
 * `RARITY_MIN_POPULATION`, la rareté est NON MESURÉE (`null`) et le succès vaut
 * un commun. Le seuil est un réglage de produit — tunable ici, sans autre trace.
 *
 * ## Le Mythe
 *
 * Mythe n'est pas un seuil de Gloire : ce sont les 100 Légendes les plus
 * glorieuses. `mythicUserIds` le calcule pour la passerelle, qui sert le drapeau
 * aux clients (jamais calculé côté client, `gloryStanding({ mythic })`).
 */

import { GLORY_RANKS, gloryForAchievement, type AchievementRarity } from './glory.js';

export const RARITY_MIN_POPULATION = 1000;
/**
 * Sous ce nombre de TITULAIRES, un succès n'affiche pas son pourcentage : « rareté
 * en cours de mesure ». À moins de mille comptes, « mythique < 0,2 % » désigne une
 * ou deux personnes — croisé avec une vitrine ou une langue rare, cela réidentifie
 * (conformité G-2, RGPD art. 5(1)(c)). La Gloire, elle, reste figée à l'obtention.
 */
export const RARITY_MIN_DISPLAY_HOLDERS = 20;
export const MYTHE_SIZE = 100;

export const RARITY_BORDERS: Readonly<Record<AchievementRarity, 'slate' | 'blue' | 'violet' | 'gold' | 'prism'>> = {
  common: 'slate',
  rare: 'blue',
  epic: 'violet',
  legendary: 'gold',
  mythic: 'prism',
};

/** Les bornes basses, en millièmes de la population, de la plus rare à la plus commune. */
const FLOORS_PER_MILLE: readonly { readonly rarity: AchievementRarity; readonly floor: number; readonly inclusive: boolean }[] = [
  { rarity: 'common', floor: 400, inclusive: false },
  { rarity: 'rare', floor: 100, inclusive: true },
  { rarity: 'epic', floor: 20, inclusive: true },
  { rarity: 'legendary', floor: 2, inclusive: true },
];

/** La rareté d'une part : `holders` comptes sur `population`. */
export function rarityFromShare(params: { readonly holders: number; readonly population: number }): AchievementRarity {
  const scaled = params.holders * 1000;
  const bar = (floor: number): number => floor * params.population;
  const hit = FLOORS_PER_MILLE.find((band) => (band.inclusive ? scaled >= bar(band.floor) : scaled > bar(band.floor)));
  return hit?.rarity ?? 'mythic';
}

/** La rareté de la nuit, `null` quand elle n'est pas mesurable (population trop petite ou nombres illisibles). */
export function measureRarity(params: { readonly holders: number; readonly population: number }): AchievementRarity | null {
  const { holders, population } = params;
  if (!Number.isFinite(holders) || !Number.isFinite(population)) return null;
  if (holders < 0 || population < RARITY_MIN_POPULATION) return null;
  return rarityFromShare({ holders: Math.trunc(holders), population: Math.trunc(population) });
}

/** `true` quand le pourcentage de détenteurs peut s'afficher ; sinon le client dit « rareté en cours de mesure ». */
export const rarityShareDisplayable = (params: { readonly holders: number; readonly population: number }): boolean =>
  Number.isFinite(params.holders) && params.holders >= RARITY_MIN_DISPLAY_HOLDERS && params.population >= RARITY_MIN_POPULATION;

/** La Gloire d'un succès au moment où il est obtenu : celle de la rareté mesurée ce jour-là, commun sinon. */
export const achievementGloryAtEarning = (measured: AchievementRarity | null): number => gloryForAchievement(measured ?? 'common');

export type MythicCandidate = { readonly userId: string; readonly glory: number };

/**
 * Les 100 Légendes les plus glorieuses — classées par Gloire, puis par identifiant.
 * La passerelle n'en tire qu'un DRAPEAU par compte : aucune liste globale n'est
 * publiée (conformité A-13) — le statut Mythe se montre selon la visibilité du rang.
 */
export function mythicUserIds(candidates: readonly MythicCandidate[]): readonly string[] {
  const legendStart = GLORY_RANKS.at(-1)!.minGlory;
  return candidates
    .filter((c) => c.glory >= legendStart)
    .sort((a, b) => (b.glory !== a.glory ? b.glory - a.glory : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
    .slice(0, MYTHE_SIZE)
    .map((c) => c.userId);
}
