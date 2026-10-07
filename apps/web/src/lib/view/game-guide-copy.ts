import type { GuideAction, GuideMoment, OnboardingStep } from '@meeshy/shared/utils/game/guide';

import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import {
  actionsLabel,
  daysLabel,
  formatCount,
  levelTierName,
  levelsLabel,
  meeshCount,
  pointsLabel,
  rankLabel,
  treasuryName,
} from './game-copy';

/**
 * CE QUE DISENT MEE ET MEO (#9379) — conception, partie III. Chaque
 * intervention suit la même structure :
 *
 *   Ce qui vient d'arriver → Ce que ça veut dire → L'étape d'après → Un bouton
 *
 * La loi partagée (`@meeshy/shared/utils/game/guide`) choisit le MOMENT et
 * rend ses chiffres ; elle ne prononce rien. Ce fichier l'habille depuis le
 * catalogue du jeu (`i18n-game-catalog.ts`, sept langues — les mêmes phrases
 * que l'app iOS), comme `mascot-copy.ts` pour l'ancienne mascotte : au
 * tutoiement (ce sont des compagnons), sans bulle, avec une version COURTE pour
 * les fois suivantes. Les clés de moments et d'actions sont stables ; l'accord
 * passe par `Intl.PluralRules` de la langue (`game-copy.ts`).
 */

type Language = InterfaceLanguage;

export type GuideCopy = {
  /** Ce qui vient d'arriver — la ligne forte. */
  readonly what: string;
  /** Ce que ça veut dire — la règle. */
  readonly means: string;
  /** L'étape d'après. */
  readonly next: string;
  /** La version d'UNE ligne, pour les fois suivantes. */
  readonly short: string;
  /** Le libellé du bouton qui y mène. */
  readonly action: string;
};

type ActionKey =
  | 'game.guide.action.start_game'
  | 'game.guide.action.earn_first_points'
  | 'game.guide.action.see_level'
  | 'game.guide.action.see_missions'
  | 'game.guide.action.see_flame'
  | 'game.guide.action.see_meeshes'
  | 'game.guide.action.see_rank'
  | 'game.guide.action.take_start_photo'
  | 'game.guide.action.see_progress'
  | 'game.guide.action.see_next_tier'
  | 'game.guide.action.open_first_mission'
  | 'game.guide.action.mint_or_climb'
  | 'game.guide.action.regain_levels'
  | 'game.guide.action.relight_badge'
  | 'game.guide.action.see_mint_preview'
  | 'game.guide.action.take_photo'
  | 'game.guide.action.keep_or_spend'
  | 'game.guide.action.do_easy_mission_or_freeze'
  | 'game.guide.action.relight_flame'
  | 'game.guide.action.do_easiest_mission'
  | 'game.guide.action.prestige_or_stay';

const ACTION_KEYS: Readonly<Record<GuideAction, ActionKey>> = {
  'start-game': 'game.guide.action.start_game',
  'earn-first-points': 'game.guide.action.earn_first_points',
  'see-level': 'game.guide.action.see_level',
  'see-missions': 'game.guide.action.see_missions',
  'see-flame': 'game.guide.action.see_flame',
  'see-meeshes': 'game.guide.action.see_meeshes',
  'see-rank': 'game.guide.action.see_rank',
  'take-start-photo': 'game.guide.action.take_start_photo',
  'see-progress': 'game.guide.action.see_progress',
  'see-next-tier': 'game.guide.action.see_next_tier',
  'open-first-mission': 'game.guide.action.open_first_mission',
  'mint-or-climb': 'game.guide.action.mint_or_climb',
  'regain-levels': 'game.guide.action.regain_levels',
  'relight-badge': 'game.guide.action.relight_badge',
  'see-mint-preview': 'game.guide.action.see_mint_preview',
  'take-photo': 'game.guide.action.take_photo',
  'keep-or-spend': 'game.guide.action.keep_or_spend',
  'do-easy-mission-or-freeze': 'game.guide.action.do_easy_mission_or_freeze',
  'relight-flame': 'game.guide.action.relight_flame',
  'do-easiest-mission': 'game.guide.action.do_easiest_mission',
  'prestige-or-stay': 'game.guide.action.prestige_or_stay',
};

/** Le libellé du bouton qui mène à une action de la loi. */
export const actionLabel = (action: GuideAction, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, ACTION_KEYS[action]);

const copy = (action: GuideAction, language: Language, parts: Omit<GuideCopy, 'action'>): GuideCopy => ({
  ...parts,
  action: actionLabel(action, language),
});

export function momentCopy(moment: GuideMoment, language: Language = currentInterfaceLanguage()): GuideCopy {
  const points = (count: number): string => pointsLabel(count, language);
  const number = (count: number): string => formatCount(count, language);
  switch (moment.key) {
    case 'first-level': {
      const { level, pointsToNext } = moment.data;
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.first_level.what'),
        means: translateGame(language, 'game.guide.moment.first_level.means'),
        next: translateGame(language, 'game.guide.moment.first_level.next', { points: points(pointsToNext), level: number(level + 1) }),
        short: translateGame(language, 'game.guide.moment.first_level.short', { level: number(level), points: points(pointsToNext) }),
      });
    }
    case 'new-tier': {
      const { tier, nextTierLevel } = moment.data;
      const name = levelTierName(tier, language);
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.new_tier.what', { tier: name }),
        means: translateGame(language, 'game.guide.moment.new_tier.means'),
        next:
          nextTierLevel === null
            ? translateGame(language, 'game.guide.moment.new_tier.next_last')
            : translateGame(language, 'game.guide.moment.new_tier.next', { level: number(nextTierLevel) }),
        short: translateGame(language, 'game.guide.moment.new_tier.short', { tier: name }),
      });
    }
    case 'missions-unlocked':
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.missions_unlocked.what'),
        means: translateGame(language, 'game.guide.moment.missions_unlocked.means'),
        next: translateGame(language, 'game.guide.moment.missions_unlocked.next'),
        short: translateGame(language, 'game.guide.moment.missions_unlocked.short'),
      });
    case 'first-mint-possible': {
      const { price, levelsLost, gloryGain } = moment.data;
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.first_mint_possible.what'),
        means:
          levelsLost === 0
            ? translateGame(language, 'game.guide.moment.first_mint_possible.means_free', { price: points(price), glory: number(gloryGain) })
            : translateGame(language, 'game.guide.moment.first_mint_possible.means', {
                price: points(price),
                levels: levelsLabel(levelsLost, language),
                glory: number(gloryGain),
              }),
        next: translateGame(language, 'game.guide.moment.first_mint_possible.next'),
        short: translateGame(language, 'game.guide.moment.first_mint_possible.short', { price: points(price) }),
      });
    }
    case 'first-mint': {
      const { levelBefore, levelAfter, tailwindUntilLevel } = moment.data;
      const flow = { from: number(levelBefore), to: number(levelAfter) };
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.first_mint.what'),
        means: translateGame(language, 'game.guide.moment.first_mint.means', flow),
        next: translateGame(language, 'game.guide.moment.first_mint.next', { level: number(tailwindUntilLevel) }),
        short: translateGame(language, 'game.guide.moment.first_mint.short', { ...flow, level: number(tailwindUntilLevel) }),
      });
    }
    case 'badge-extinguished': {
      const { missingActions } = moment.data;
      const actions = actionsLabel(missingActions, language);
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.badge_extinguished.what'),
        means: translateGame(language, 'game.guide.moment.badge_extinguished.means'),
        next: translateGame(language, 'game.guide.moment.badge_extinguished.next', { actions }),
        short: translateGame(language, 'game.guide.moment.badge_extinguished.short', { actions }),
      });
    }
    case 'price-rises': {
      const price = points(moment.data.nextPrice);
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.price_rises.what'),
        means: translateGame(language, 'game.guide.moment.price_rises.means'),
        next: translateGame(language, 'game.guide.moment.price_rises.next', { price }),
        short: translateGame(language, 'game.guide.moment.price_rises.short', { price }),
      });
    }
    case 'new-rank': {
      const { rank, division, gloryMissing } = moment.data;
      const name = rankLabel(rank, division, language);
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.new_rank.what', { rank: name }),
        means: translateGame(language, 'game.guide.moment.new_rank.means'),
        next:
          gloryMissing === null
            ? translateGame(language, 'game.guide.moment.new_rank.next_top')
            : translateGame(language, 'game.guide.moment.new_rank.next', { glory: number(gloryMissing) }),
        short: translateGame(language, 'game.guide.moment.new_rank.short', { rank: name }),
      });
    }
    case 'treasury-tier': {
      const { tier, nextTierMissing } = moment.data;
      const name = treasuryName(tier, language);
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.treasury_tier.what', { tier: name }),
        means: translateGame(language, 'game.guide.moment.treasury_tier.means'),
        next:
          nextTierMissing === null
            ? translateGame(language, 'game.guide.moment.treasury_tier.next_top')
            : translateGame(language, 'game.guide.moment.treasury_tier.next', { meeshes: meeshCount(nextTierMissing, language) }),
        short: translateGame(language, 'game.guide.moment.treasury_tier.short', { tier: name }),
      });
    }
    case 'flame-at-risk':
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.flame_at_risk.what'),
        means: translateGame(language, 'game.guide.moment.flame_at_risk.means', { days: daysLabel(moment.data.days, language) }),
        next: translateGame(language, 'game.guide.moment.flame_at_risk.next'),
        short: translateGame(language, 'game.guide.moment.flame_at_risk.short'),
      });
    case 'flame-out': {
      const { relightPrice, canRelight } = moment.data;
      const price = meeshCount(relightPrice, language);
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.flame_out.what'),
        means: translateGame(language, 'game.guide.moment.flame_out.means'),
        next: canRelight
          ? translateGame(language, 'game.guide.moment.flame_out.next', { price })
          : translateGame(language, 'game.guide.moment.flame_out.next_new'),
        short: canRelight
          ? translateGame(language, 'game.guide.moment.flame_out.short', { price })
          : translateGame(language, 'game.guide.moment.flame_out.short_new'),
      });
    }
    case 'return-after-absence':
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.return_after_absence.what'),
        means: translateGame(language, 'game.guide.moment.return_after_absence.means', { days: daysLabel(moment.data.daysAway, language) }),
        next: translateGame(language, 'game.guide.moment.return_after_absence.next'),
        short: translateGame(language, 'game.guide.moment.return_after_absence.short'),
      });
    case 'level-100':
      return copy(moment.action, language, {
        what: translateGame(language, 'game.guide.moment.level_100.what'),
        means: translateGame(language, 'game.guide.moment.level_100.means'),
        next: moment.data.canPrestige
          ? translateGame(language, 'game.guide.moment.level_100.next')
          : translateGame(language, 'game.guide.moment.level_100.next_stay'),
        short: translateGame(language, 'game.guide.moment.level_100.short'),
      });
  }
}

type StepTexts = { readonly what: string; readonly means: string; readonly next: string };

/** Les sept étapes de l'intégration : les trois lignes de chacune, dans la langue. */
const stepTexts = (key: OnboardingStep['key'], language: Language): StepTexts => {
  switch (key) {
    case 'welcome':
      return {
        what: translateGame(language, 'game.guide.step.welcome.what'),
        means: translateGame(language, 'game.guide.step.welcome.means'),
        next: translateGame(language, 'game.guide.step.welcome.next'),
      };
    case 'first-points':
      return {
        what: translateGame(language, 'game.guide.step.first_points.what'),
        means: translateGame(language, 'game.guide.step.first_points.means'),
        next: translateGame(language, 'game.guide.step.first_points.next'),
      };
    case 'levels':
      return {
        what: translateGame(language, 'game.guide.step.levels.what'),
        means: translateGame(language, 'game.guide.step.levels.means'),
        next: translateGame(language, 'game.guide.step.levels.next'),
      };
    case 'missions':
      return {
        what: translateGame(language, 'game.guide.step.missions.what'),
        means: translateGame(language, 'game.guide.step.missions.means'),
        next: translateGame(language, 'game.guide.step.missions.next'),
      };
    case 'flame':
      return {
        what: translateGame(language, 'game.guide.step.flame.what'),
        means: translateGame(language, 'game.guide.step.flame.means'),
        next: translateGame(language, 'game.guide.step.flame.next'),
      };
    case 'mint':
      return {
        what: translateGame(language, 'game.guide.step.mint.what'),
        means: translateGame(language, 'game.guide.step.mint.means'),
        next: translateGame(language, 'game.guide.step.mint.next'),
      };
    case 'rank':
      return {
        what: translateGame(language, 'game.guide.step.rank.what'),
        means: translateGame(language, 'game.guide.step.rank.means'),
        next: translateGame(language, 'game.guide.step.rank.next'),
      };
  }
};

/** Ce que dit l'étape qui ATTEND son geste : elle nomme le geste, pas la rubrique suivante. */
const awaitingNext = (key: OnboardingStep['key'], language: Language): string | null => {
  switch (key) {
    case 'missions':
      return translateGame(language, 'game.guide.awaiting.missions');
    case 'flame':
      return translateGame(language, 'game.guide.awaiting.flame');
    default:
      return null;
  }
};

export function stepCopy(
  step: OnboardingStep,
  options: { readonly awaiting?: boolean; readonly action?: GuideAction; readonly language?: Language } = {},
): GuideCopy {
  const language = options.language ?? currentInterfaceLanguage();
  const parts = stepTexts(step.key, language);
  const next = options.awaiting === true ? (awaitingNext(step.key, language) ?? parts.next) : parts.next;
  return { ...parts, next, short: parts.what, action: actionLabel(options.action ?? step.action, language) };
}
