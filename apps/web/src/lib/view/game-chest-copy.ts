import type { GameChestContent, GameChestReward, GameMeeshFragments } from '@meeshy/shared/types/game';

import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';

/**
 * CE QUE LE COFFRE DIT (#10011) — ses points, sa Gloire et ses fragments de Meesh, avant et après l'ouverture.
 * Miroir de `GameChestLines` et des `GameCopy.chest…` d'iOS (`ChestStage.swift`).
 */

/** « 3 fragments de Meesh » — l'accord par `Intl.PluralRules` de la langue, jamais un `=== 1`. */
export const meeshFragmentsLabel = (count: number, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.meesh_fragments', count);

const gloryLine = (glory: number): string => gameText('game.mission.glory', { glory: formatCount(glory) });

/**
 * Une ligne par récompense, dans l'ordre où elles montent : les points, la Gloire, les fragments, le gel. Un
 * coffre ouvert avant #10011 (ou servi par une passerelle antérieure) n'a ni Gloire ni fragments comptés : il
 * garde sa ligne d'hier quand son fragment est sorti.
 */
export function chestRewardLines(reward: GameChestReward): readonly string[] {
  const glory = reward.glory ?? 0;
  const fragments = reward.meeshFragments ?? 0;
  return [
    gameText('game.fmt.signed', { value: pointsLabel(reward.points) }),
    glory > 0 ? gloryLine(glory) : null,
    fragments > 0 ? meeshFragmentsLabel(fragments) : reward.fragment ? gameText('game.chest.reward.fragment') : null,
    reward.freeze ? gameText('game.chest.reward.freeze') : null,
  ].filter((line): line is string => line !== null);
}

/** « Ce coffre : 1 750 points · +175 Gloire · 1 fragment de Meesh » — le contenu certain, avant l'ouverture. */
export const chestTodayLine = (today: GameChestContent): string =>
  gameText('game.chest.today', {
    points: pointsLabel(today.points),
    glory: gloryLine(today.glory),
    fragments: meeshFragmentsLabel(today.meeshFragments),
  });

/** « 3 / 5 fragments pour une frappe gratuite ». */
export const meeshFragmentsProgressLine = (fragments: GameMeeshFragments): string =>
  gameText('game.chest.fragments_progress', { held: formatCount(fragments.held), total: formatCount(fragments.perMeesh) });
