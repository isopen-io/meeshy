import type { GuideActionV2, GuideMomentV2 } from '@meeshy/shared/utils/game/guide-v2';

import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { formatCount, pointsLabel } from './game-copy';
import { languageName, leagueName, seasonThemeName, trophyView } from './game-copy-v2';
import { actionLabel, type GuideCopy } from './game-guide-copy';

/**
 * CE QUE DISENT MEE ET MEO, VAGUE 2 (#9481) — les huit moments de la loi
 * (`guide-v2.ts`) : première ligue, montée, descente, début et fin de saison,
 * trophée, Prestige, tampon de l'Atlas. Même structure que `game-guide-copy.ts` :
 * ce qui vient d'arriver → ce que ça veut dire → l'étape d'après → un bouton, avec
 * une version COURTE pour les fois suivantes. La loi choisit le moment et rend ses
 * chiffres ; elle ne prononce rien.
 */
type Language = InterfaceLanguage;

type ActionKey =
  | 'game.guide.action.see_league'
  | 'game.guide.action.see_season'
  | 'game.guide.action.see_trophies'
  | 'game.guide.action.see_atlas';

const ACTION_KEYS: Readonly<Record<GuideActionV2, ActionKey>> = {
  'see-league': 'game.guide.action.see_league',
  'see-season': 'game.guide.action.see_season',
  'see-trophies': 'game.guide.action.see_trophies',
  'see-atlas': 'game.guide.action.see_atlas',
};

export const actionLabelV2 = (action: GuideMomentV2['action'], language: Language = currentInterfaceLanguage()): string =>
  action === 'see-level' ? actionLabel(action, language) : translateGame(language, ACTION_KEYS[action]);

export function momentCopyV2(moment: GuideMomentV2, language: Language = currentInterfaceLanguage()): GuideCopy {
  const number = (count: number): string => formatCount(count, language);
  const copy = (parts: Omit<GuideCopy, 'action'>): GuideCopy => ({ ...parts, action: actionLabelV2(moment.action, language) });
  switch (moment.key) {
    case 'league-first': {
      const league = leagueName(moment.data.league, language);
      const points = moment.data.pointsToPromotion;
      return copy({
        what: translateGame(language, 'game.guide.moment.league_first.what', { league }),
        means: translateGame(language, 'game.guide.moment.league_first.means'),
        next:
          points === null
            ? translateGame(language, 'game.guide.moment.league_first.next_top')
            : translateGame(language, 'game.guide.moment.league_first.next', { points: pointsLabel(points, language) }),
        short:
          points === null
            ? translateGame(language, 'game.league.at_top')
            : translateGame(language, 'game.guide.moment.league_first.short', { league, points: pointsLabel(points, language) }),
      });
    }
    case 'league-promoted': {
      const { from, to, rank } = moment.data;
      return copy({
        what: translateGame(language, 'game.guide.moment.league_promoted.what', { league: leagueName(to, language) }),
        means: translateGame(language, 'game.guide.moment.league_promoted.means', { rank: number(rank), from: leagueName(from, language) }),
        next: translateGame(language, 'game.guide.moment.league_promoted.next'),
        short: translateGame(language, 'game.guide.moment.league_promoted.short', { league: leagueName(to, language) }),
      });
    }
    case 'league-relegated': {
      const league = leagueName(moment.data.to, language);
      const points = moment.data.pointsToPromotion;
      return copy({
        what: translateGame(language, 'game.guide.moment.league_relegated.what', { league }),
        means: translateGame(language, 'game.guide.moment.league_relegated.means'),
        next:
          points === null || points <= 0
            ? translateGame(language, 'game.guide.moment.league_relegated.next_far')
            : translateGame(language, 'game.guide.moment.league_relegated.next', { points: pointsLabel(points, language) }),
        short: translateGame(language, 'game.guide.moment.league_relegated.short', { league }),
      });
    }
    case 'season-start': {
      const theme = seasonThemeName(moment.data.themeKey, language);
      return copy({
        what: translateGame(language, 'game.guide.moment.season_start.what', { season: number(moment.data.season) }),
        means: theme === null ? translateGame(language, 'game.guide.moment.season_start.means_plain') : translateGame(language, 'game.guide.moment.season_start.means', { theme }),
        next: translateGame(language, 'game.guide.moment.season_start.next', { steps: number(moment.data.steps) }),
        short: translateGame(language, 'game.guide.moment.season_start.short', { season: number(moment.data.season) }),
      });
    }
    case 'season-end': {
      const { season, stepsReached, completed, gloryGained } = moment.data;
      return copy({
        what: translateGame(language, completed ? 'game.guide.moment.season_end.what_done' : 'game.guide.moment.season_end.what', { season: number(season) }),
        means: completed
          ? translateGame(language, 'game.guide.moment.season_end.means_done', { glory: number(gloryGained) })
          : translateGame(language, 'game.guide.moment.season_end.means', { steps: number(stepsReached) }),
        next: translateGame(language, 'game.guide.moment.season_end.next'),
        short: translateGame(language, 'game.guide.moment.season_end.short', { season: number(season) }),
      });
    }
    case 'trophy': {
      const title = trophyView(moment.data.trophyKey, language)?.title ?? translateGame(language, 'game.guide.moment.trophy.what');
      return copy({
        what: translateGame(language, 'game.guide.moment.trophy.what'),
        means: translateGame(language, 'game.guide.moment.trophy.means', { title }),
        next: translateGame(language, 'game.guide.moment.trophy.next'),
        short: translateGame(language, 'game.guide.moment.trophy.short', { title }),
      });
    }
    case 'prestige':
      return copy({
        what: translateGame(language, 'game.guide.moment.prestige.what', { number: number(moment.data.prestige) }),
        means: translateGame(language, 'game.guide.moment.prestige.means', { glory: number(moment.data.gloryGained) }),
        next: translateGame(language, 'game.guide.moment.prestige.next'),
        short: translateGame(language, 'game.guide.moment.prestige.short', { number: number(moment.data.prestige) }),
      });
    case 'atlas-stamp': {
      const name = languageName(moment.data.language, language);
      return copy({
        what: translateGame(language, 'game.guide.moment.atlas_stamp.what', { language: name }),
        means: translateGame(language, 'game.guide.moment.atlas_stamp.means'),
        next: translateGame(language, 'game.guide.moment.atlas_stamp.next', { stamped: number(moment.data.stamped), total: number(moment.data.total) }),
        short: translateGame(language, 'game.guide.moment.atlas_stamp.short', { language: name }),
      });
    }
  }
}
