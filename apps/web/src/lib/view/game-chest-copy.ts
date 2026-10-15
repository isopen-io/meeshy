import type { GameChestReward } from '@meeshy/shared/types/game';

import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';

/**
 * CE QUE LE COFFRE DIT (#10011) — ses points, sa Gloire, sa prime en points au cours de la Meesh et son fragment
 * d'étoile, UNE FOIS OUVERT : fermé, il ne dit rien de son contenu (#10567). Miroir de `GameChestLines` et des
 * `GameCopy.chest…` d'iOS (`ChestStage.swift`).
 */

/** « 3 fragments d'étoile » — le total collecté ; l'accord par `Intl.PluralRules` de la langue, jamais un `=== 1`. */
export const starFragmentsLabel = (count: number, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.star_fragments', count);

const gloryLine = (glory: number): string => gameText('game.mission.glory', { glory: formatCount(glory) });

/** « Prime : +1 221 points, le prix d'une Meesh » — la prime tombée ; `null` sans prime. */
export const chestBonusLine = (reward: GameChestReward): string | null => {
  const amount = reward.bonusPoints ?? 0;
  if (amount <= 0 || (reward.bonus !== 'whole' && reward.bonus !== 'fifth')) return null;
  return gameText(`game.chest.reward.bonus_${reward.bonus}`, { points: pointsLabel(amount) });
};

/**
 * Une ligne par récompense, dans l'ordre où elles montent : les points de l'effort, la Gloire, la prime, le
 * fragment d'étoile, le gel. `points` est le total crédité : la ligne des points dit ce qui revient à l'effort, la
 * prime a la sienne. Un coffre ouvert avant #10011 n'a ni Gloire ni prime ; son `fragment` est un fragment d'étoile.
 */
export function chestRewardLines(reward: GameChestReward): readonly string[] {
  const glory = reward.glory ?? 0;
  const base = Math.max(0, reward.points - (reward.bonusPoints ?? 0));
  return [
    gameText('game.fmt.signed', { value: pointsLabel(base) }),
    glory > 0 ? gloryLine(glory) : null,
    chestBonusLine(reward),
    reward.fragment ? gameText('game.chest.reward.fragment') : null,
    reward.freeze ? gameText('game.chest.reward.freeze') : null,
  ].filter((line): line is string => line !== null);
}
