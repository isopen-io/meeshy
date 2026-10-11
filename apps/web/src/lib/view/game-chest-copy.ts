import type { GameChest, GameChestContent, GameChestReward } from '@meeshy/shared/types/game';

import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';

/**
 * CE QUE LE COFFRE DIT (#10011) — ses points, sa Gloire, sa prime en points au cours de la Meesh et son fragment
 * d'étoile, avant et après l'ouverture. Miroir de `GameChestLines` et des `GameCopy.chest…` d'iOS
 * (`ChestStage.swift`).
 */

/** « 3 fragments d'étoile » — le total collecté ; l'accord par `Intl.PluralRules` de la langue, jamais un `=== 1`. */
export const starFragmentsLabel = (count: number, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.star_fragments', count);

const gloryLine = (glory: number): string => gameText('game.mission.glory', { glory: formatCount(glory) });

const chance = (fraction: number): string => gameText('game.chest.chance', { odds: formatCount(Math.round(1 / fraction)) });

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

/** « Ce coffre : 2 083 points · +208 Gloire » — le contenu certain, avant l'ouverture. */
export const chestTodayLine = (today: GameChestContent): string =>
  gameText('game.chest.today', { points: pointsLabel(today.points), glory: gloryLine(today.glory) });

/**
 * « Prime : 1 chance sur 20 de 1 221 points, sinon 1 chance sur 6 de 244 points » — avant l'ouverture, au cours
 * de la prochaine Meesh du compte. `null` devant un serveur qui ne sert pas la prime.
 */
export const chestBonusOddsLine = (today: GameChestContent, odds: GameChest['odds']): string | null => {
  const { bonusWhole, bonusFifth } = today;
  if (bonusWhole === undefined || bonusFifth === undefined || bonusWhole <= 0) return null;
  if (odds.bonusWhole === undefined || odds.bonusFifth === undefined) return null;
  return gameText('game.chest.bonus_odds', {
    whole_chance: chance(odds.bonusWhole),
    whole: pointsLabel(bonusWhole),
    fifth_chance: chance(odds.bonusFifth),
    fifth: pointsLabel(bonusFifth),
  });
};
