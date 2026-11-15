import type { LevelStep } from '@meeshy/shared/utils/game/level-steps';

import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatCount, rankName } from '@/lib/view/game-copy';

/**
 * CE QUE DISENT LES ÉTAPES DES NIVEAUX (#9706) — leurs clés vivent dans la partie « concept » du catalogue du
 * jeu, que seules les routes de Progression chargent : ce module n'est lu que par elles (le héros, les
 * précisions), jamais par le profil ni le carnet des règles.
 */

type Language = InterfaceLanguage;

/** Ce qu'une étape des niveaux demande (#9706), en verbe : « frapper ta première Meesh », « atteindre le rang Écho ». */
export function levelStepWhat(step: Pick<LevelStep, 'kind' | 'target' | 'rank'>, language: Language = currentInterfaceLanguage()): string {
  const count = formatCount(step.target, language);
  switch (step.kind) {
    case 'mint':
      return step.target <= 1 ? translateGame(language, 'game.level.step.mint_one') : translateGame(language, 'game.level.step.mint_many', { count });
    case 'missions':
      return step.target <= 1 ? translateGame(language, 'game.level.step.missions_one') : translateGame(language, 'game.level.step.missions_many', { count });
    case 'flame':
      return translateGame(language, 'game.level.step.flame', { days: count });
    case 'rank':
      return translateGame(language, 'game.level.step.rank', { rank: rankName(step.rank ?? 'murmure', language) });
  }
}

/** « Étape du niveau 10 : frapper ta première Meesh ». */
export const levelStepLine = (step: LevelStep, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.level.step.line', { level: formatCount(step.level, language), what: levelStepWhat(step, language) });

/** Pourquoi un niveau attend (#9706) : les points sont là, l'étape non. */
export const levelHeldLine = (step: LevelStep, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.level.held', { what: levelStepWhat(step, language), level: formatCount(step.level, language) });

