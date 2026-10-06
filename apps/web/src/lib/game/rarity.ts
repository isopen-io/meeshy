import type { CSSProperties } from 'react';

import type { GameAchievementRarities, GameAchievementRarityEntry } from '@meeshy/shared/types/game';
import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';
import { RARITY_BORDERS, rarityShareDisplayable } from '@meeshy/shared/utils/game/rarity';

/**
 * LA RARETÉ D'UN SUCCÈS (#9390, conception II.9) — cinq niveaux, un liseré
 * chacun : commun (ardoise), rare (bleu), épique (violet), légendaire (or),
 * mythique (prisme irisé). La Gloire d'un succès est FIGÉE à l'obtention par la
 * passerelle ; ce fichier ne la touche pas.
 *
 * LA RÈGLE DE VIE PRIVÉE (conformité G-2, RGPD art. 5(1)(c)) : une rareté n'est
 * AFFICHÉE qu'avec assez de titulaires (20) ET de comptes (1 000)
 * (`rarityShareDisplayable`, la loi partagée). Sous ces seuils « mythique » désigne
 * une ou deux personnes, que le croisement avec une vitrine ou une langue rare
 * réidentifierait. Le client est FAIL-CLOSED : une entrée sans comptes, ou sans
 * rareté mesurée, ne montre rien — il ne devine jamais.
 *
 * Le web ne COMPTE rien : il lit la carte `achievementRarities`, extension
 * DÉCLARÉE du contrat (`game-v2.ts` de `@meeshy/shared`), que la passerelle mesure
 * chaque nuit. Absente (ancien serveur), l'écran des succès reste celui d'avant ;
 * un succès absent de la carte dit « rareté en cours de mesure ».
 */
export type RarityEntry = GameAchievementRarityEntry;

export type AchievementRarityMap = GameAchievementRarities;

export const rarityToken = (rarity: AchievementRarity): 'slate' | 'blue' | 'violet' | 'gold' | 'prism' => RARITY_BORDERS[rarity];

/** Le liseré : une bordure de début de ligne (RTL-correcte), dégradé irisé pour le prisme. */
export function rarityRim(rarity: AchievementRarity): CSSProperties {
  const token = rarityToken(rarity);
  if (token === 'prism') {
    return {
      borderInlineStart: '3px solid transparent',
      borderImage: 'linear-gradient(to bottom, var(--game-prism-0), var(--game-prism-1), var(--game-prism-2), var(--game-prism-3), var(--game-prism-4)) 1',
    };
  }
  return { borderInlineStart: `3px solid var(--game-rarity-${token})` };
}

/** La rareté qu'on a le DROIT de montrer, ou `null` : pas assez de titulaires ou de comptes, ou rien de mesuré. */
export function visibleRarity(entry: RarityEntry | undefined): AchievementRarity | null {
  if (entry === undefined) return null;
  return rarityShareDisplayable({ holders: entry.holders, population: entry.population }) ? entry.rarity : null;
}

/** La part des comptes, en entiers sous 10 %, à une décimale sous 1 % ; jamais sous 0,1 %. */
export function rarityPercent(entry: RarityEntry, language = 'fr'): string {
  const share = (entry.holders / Math.max(1, entry.population)) * 100;
  const format = (value: number, digits: number): string => new Intl.NumberFormat(language, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  if (share < 0.1) return `< ${format(0.1, 1)} %`;
  return share < 1 ? `${format(share, 1)} %` : `${format(Math.round(share), 0)} %`;
}
