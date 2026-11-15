import type { MascotLine } from '@meeshy/shared/utils/mascot';

import { formatGameNumber, translateGame, translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { achievementCopy } from './progression';

/**
 * CE QUE DIT LA MASCOTTE (#8907) — une phrase par ligne de la loi partagée
 * (`@meeshy/shared/utils/mascot`), au tutoiement : la mascotte est une
 * compagne, pas l'institution.
 *
 * Dans la langue d'interface (#10827), au catalogue du jeu
 * (`game.mascot.*`, partie `concept` : seule Progression la monte), avec les
 * mots d'iOS là où ils existent (`game.mint.tchak`, `game.mint.chip.level`,
 * `reveal.badge.unlocked`). L'accord passe par `translateGamePlural`, jamais
 * par un `=== 1`.
 */
export function mascotSay(line: MascotLine, language: InterfaceLanguage = currentInterfaceLanguage()): string {
  const number = (value: number): string => formatGameNumber(language, value);
  switch (line.kind) {
    case 'meesh-minted':
      return translateGame(language, 'game.mascot.minted', { balance: number(line.balance) });
    case 'level-up':
      return translateGame(language, 'game.mascot.level_up', { level: number(line.level) });
    case 'achievement':
      return translateGame(language, 'game.mascot.achievement', { title: achievementCopy(line.key, language).title });
    case 'can-mint':
      return translateGamePlural(language, 'game.mascot.can_mint', line.mintCost);
    case 'first-step':
      return translateGame(language, 'game.mascot.first_step');
    case 'streak':
      return translateGamePlural(language, 'game.mascot.streak', line.days);
    case 'meesh-missing':
      return translateGamePlural(language, 'game.mascot.meesh_missing', line.missing);
    case 'level-missing':
      return translateGamePlural(language, 'game.mascot.level_missing', line.missing, { level: number(line.nextLevel) });
    case 'top-level':
      return translateGame(language, 'game.mascot.top_level');
  }
}
