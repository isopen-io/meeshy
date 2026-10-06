import type { GameBlock } from '@meeshy/shared/types/game';
import type { FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { GloryDivision, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import type { LeagueKey } from '@meeshy/shared/utils/game/league';
import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { formatGameNumber, translateGame, translateGameOrdinal, translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { boundedPercent, levelTierName, rankLabel } from './game-copy';
import { leagueName } from './game-copy-v2';

/**
 * LA BANNIÈRE DU JOUEUR (#9494, conception XIII.1) — ce que le bandeau du haut
 * montre quand aucun appel ni aucun audio ne l'occupe. Ordre FIXE, de gauche à
 * droite : anneau de niveau, jauge vers le niveau suivant, Meeshes, blason du
 * rang, gemme de ligue et place, Flamme.
 *
 * SEULEMENT CE QUI EXISTE : un élément sans donnée vaut `null` et ne se
 * dessine pas — jamais un zéro, un tiret ou une case vide. Un nouveau joueur
 * n'a que son anneau et sa jauge ; le trésor paraît à la première Meesh
 * gardée, le rang à la première Gloire, la ligue au consentement (avec un
 * groupe), la Flamme quand elle brûle.
 *
 * Le modèle ne calcule rien : il LIT le bloc `game` servi (le cache d'abord).
 */
export type PlayerBannerModel = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly progress: number;
  readonly prestige: number;
  readonly score: number;
  /** `null` au sommet (niveau 100) : plus rien ne manque. */
  readonly nextLevel: number | null;
  readonly pointsToNext: number | null;
  readonly meeshes: number | null;
  readonly rank: { readonly rank: GloryRankOrMythic; readonly division: GloryDivision | null } | null;
  readonly league: { readonly league: LeagueKey; readonly place: number } | null;
  readonly flame: { readonly form: FlameFormKey; readonly days: number } | null;
};

const BURNING: ReadonlySet<GameBlock['flame']['status']> = new Set(['lit', 'at-risk', 'covered']);

export function playerBannerModel(game: GameBlock): PlayerBannerModel {
  const { level, glory, treasury, flame, league } = game;
  const atTop = level.nextThreshold === null;
  return {
    level: level.level,
    tier: level.tier,
    progress: atTop ? 1 : level.progress,
    prestige: level.prestige,
    score: level.score,
    nextLevel: atTop ? null : level.level + 1,
    pointsToNext: atTop ? null : level.pointsToNext,
    meeshes: treasury.held > 0 ? treasury.held : null,
    rank: glory.glory > 0 ? { rank: glory.rank, division: glory.division } : null,
    league: league?.access === 'open' && league.current !== null ? { league: league.current.league, place: league.current.rank } : null,
    flame: BURNING.has(flame.status) && flame.form !== null && flame.days > 0 ? { form: flame.form, days: flame.days } : null,
  };
}

/** « 4e », « 4th », « 4. » — la place dans le groupe de ligue. */
export const leaguePlace = (place: number, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGameOrdinal(language, 'game.banner.place', place);

/**
 * Ce que lit un lecteur d'écran, en UNE phrase et dans l'ordre de la bannière :
 * « Niveau 34, Éclat, 78 % vers le 35, 12 Meeshes, Conteur III, ligue Jade 4e,
 * Flamme 23 jours ». Ce qui n'existe pas ne se dit pas.
 */
export function playerBannerLabel(model: PlayerBannerModel, language: InterfaceLanguage = currentInterfaceLanguage()): string {
  const count = (value: number): string => formatGameNumber(language, value);
  const parts: readonly (string | null)[] = [
    translateGame(language, 'game.banner.level', { level: count(model.level) }),
    levelTierName(model.tier, language),
    model.nextLevel === null
      ? translateGame(language, 'game.banner.top')
      : translateGame(language, 'game.banner.to_next', {
          percent: count(Math.floor(boundedPercent(model.progress * 100))),
          level: count(model.nextLevel),
        }),
    model.meeshes === null ? null : translateGamePlural(language, 'game.meeshes', model.meeshes),
    model.rank === null ? null : rankLabel(model.rank.rank, model.rank.division, language),
    model.league === null
      ? null
      : translateGame(language, 'game.banner.league', { league: leagueName(model.league.league, language), place: leaguePlace(model.league.place, language) }),
    model.flame === null ? null : translateGame(language, 'game.banner.flame', { days: translateGamePlural(language, 'game.days', model.flame.days) }),
  ];
  return parts.filter((part): part is string => part !== null).join(translateGame(language, 'game.banner.separator'));
}
