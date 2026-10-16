import type { GameBlock } from '@meeshy/shared/types/game';
import type { FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { LeagueKey } from '@meeshy/shared/utils/game/league';
import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { formatGameNumber, translateGame, translateGameOrdinal, translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';


import { boundedPercent, levelTierName, pointsLabel, standingLabel, shownRank, type ShownRank } from './game-copy';
import { leagueName } from './game-copy-v2';
import { capOpener, shownLevelOf, sparksReading } from '@/lib/game/ladder';

/**
 * LA BANNIÈRE DU JOUEUR (#9494, conception XIII.1) — ce que le bandeau du haut
 * montre quand aucun appel ni aucun audio ne l'occupe. Ordre FIXE, de gauche à
 * droite : anneau de niveau, jauge vers le niveau suivant, Meeshes, blason du
 * rang, gemme de ligue et place, Flamme.
 *
 * SEULEMENT CE QUI A DU SENS : un élément sans donnée vaut `null` et ne se
 * dessine pas — jamais un zéro, un tiret ou une case vide ; sans AUCUNE donnée,
 * pas de bandeau du tout (`playerBannerModel` rend `null`). Un joueur au niveau
 * 1 n'a que ses points ; l'anneau et la jauge paraissent au niveau 2, le
 * trésor à la première Meesh gardée, le rang à la première Gloire, la ligue au
 * consentement (avec un groupe), la Flamme quand elle brûle.
 *
 * Le modèle ne calcule rien : il LIT le bloc `game` servi (le cache d'abord).
 */
export type PlayerBannerLevel = {
  readonly level: number;
  readonly progress: number;
  readonly prestige: number;
  /** `null` au plafond que le rang ouvre (ou devant un ancien serveur, au niveau 100) : plus rien ne manque. */
  readonly nextLevel: number | null;
  readonly pointsToNext: number | null;
  /** Le rang qui lève le plafond atteint (#9688) — `null` quand rien ne bloque. */
  readonly opener: 'ambassadeur' | 'oracle' | null;
};

export type PlayerBannerModel = {
  /** La couleur du palier : la teinte du fond et du filigrane, même sans détail de niveau. */
  readonly tier: LevelTierKey;
  /** `null` au niveau 1 : il n'y a encore rien à détailler (ni anneau, ni jauge). */
  readonly level: PlayerBannerLevel | null;
  /** Les ÉTINCELLES en poche (porteur, 2026-10-16) ; `null` quand le joueur n'en a aucune. */
  readonly points: number | null;
  readonly meeshes: number | null;
  /** Le rang servi : la division V..I (ou héritée), la place du Mythe. */
  readonly rank: ShownRank | null;
  readonly league: { readonly league: LeagueKey; readonly place: number } | null;
  readonly flame: { readonly form: FlameFormKey; readonly days: number } | null;
  /** Les trophées gagnés (porteur, 2026-10-16) ; `null` quand il n'y en a aucun. */
  readonly trophies: number | null;
  /** Les missions du jour, quand elles sont ouvertes et tirées : faites sur total. */
  readonly missions: { readonly done: number; readonly total: number } | null;
  /** Les étoiles de la saison ouverte ; `null` hors saison. */
  readonly season: { readonly stars: number } | null;
};

const BURNING: ReadonlySet<GameBlock['flame']['status']> = new Set(['lit', 'at-risk', 'covered']);

/**
 * LA LOI DU BANDEAU (#9536, directive porteur 2026-10-06) — une seule fonction
 * décide ce qui a du sens, un témoin par règle :
 *
 *   · toutes les données à zéro ⇒ `null` : AUCUN bandeau ;
 *   · pas de points ⇒ pas de total ; niveau 1 ⇒ pas de détail de niveau (le
 *     Prestige redonne un niveau 1 qui a un passé : son anneau reste) ;
 *   · pas de Meeshes ⇒ pas de Meeshes ; pas de Gloire ⇒ pas de blason ; pas de
 *     ligue ⇒ pas de ligue ; pas de Flamme ⇒ pas de Flamme.
 */
export function playerBannerModel(game: GameBlock): PlayerBannerModel | null {
  const { glory, treasury, flame, league } = game;
  const level = shownLevelOf(game.level);
  const atTop = level.nextThreshold === null;
  const detailed = level.level > 1 || level.prestige > 0;
  const model: PlayerBannerModel = {
    tier: level.tier,
    level: detailed
      ? {
          level: level.level,
          progress: atTop ? 1 : level.progress,
          prestige: level.prestige,
          nextLevel: atTop ? null : level.level + 1,
          pointsToNext: atTop ? null : level.pointsToNext,
          opener: capOpener(level),
        }
      : null,
    // La POCHE d'étincelles (pas la base du niveau, qui est le cycle) ; l'ancien score devant un serveur antérieur.
    points: sparksReading(game.level).pocket > 0 ? sparksReading(game.level).pocket : null,
    meeshes: treasury.held > 0 ? treasury.held : null,
    rank: glory.glory > 0 ? shownRank(glory) : null,
    league: league?.access === 'open' && league.current !== null ? { league: league.current.league, place: league.current.rank } : null,
    flame: BURNING.has(flame.status) && flame.form !== null && flame.days > 0 ? { form: flame.form, days: flame.days } : null,
    trophies: (game.trophies?.items.length ?? 0) > 0 ? (game.trophies?.items.length ?? 0) : null,
    missions: game.missions.unlocked && game.missions.items.length > 0 ? { done: game.missions.items.filter((m) => m.completedAt !== null).length, total: game.missions.items.length } : null,
    season: game.season === null || game.season === undefined ? null : { stars: game.season.stars },
  };
  return hasAnything(model) ? model : null;
}

const hasAnything = (model: PlayerBannerModel): boolean =>
  model.level !== null || model.points !== null || model.meeshes !== null || model.rank !== null || model.league !== null || model.flame !== null || model.trophies !== null || model.missions !== null || model.season !== null;

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
  const { level } = model;
  const parts: readonly (string | null)[] = [
    level === null ? null : translateGame(language, 'game.banner.level', { level: count(level.level) }),
    level === null ? null : levelTierName(model.tier, language),
    level === null
      ? null
      : level.nextLevel === null
        ? level.opener === null
          ? translateGame(language, 'game.banner.top')
          : translateGame(language, 'game.banner.capped', { rank: translateGame(language, `game.rank.${level.opener}`) })
        : translateGame(language, 'game.banner.to_next', {
            percent: count(Math.floor(boundedPercent(level.progress * 100))),
            level: count(level.nextLevel),
          }),
    level !== null || model.points === null ? null : pointsLabel(model.points, language),
    model.meeshes === null ? null : translateGamePlural(language, 'game.meeshes', model.meeshes),
    model.rank === null ? null : standingLabel(model.rank, language),
    model.league === null
      ? null
      : translateGame(language, 'game.banner.league', { league: leagueName(model.league.league, language), place: leaguePlace(model.league.place, language) }),
    model.flame === null ? null : translateGame(language, 'game.banner.flame', { days: translateGamePlural(language, 'game.days', model.flame.days) }),
    model.trophies === null ? null : translateGame(language, 'game.banner.link.trophies', { count: count(model.trophies) }),
    model.missions === null ? null : translateGame(language, 'game.banner.link.missions', { done: count(model.missions.done), total: count(model.missions.total) }),
    model.season === null ? null : translateGame(language, 'game.banner.link.season', { stars: count(model.season.stars) }),
  ];
  return parts.filter((part): part is string => part !== null).join(translateGame(language, 'game.banner.separator'));
}

/**
 * LES NOMS ACCESSIBLES, PIÈCE PAR PIÈCE (porteur, 2026-10-16) : le bandeau n'est plus UN lien vers le Niveau mais une rangée
 * de liens, chacun vers sa fiche — le lecteur d'écran entend donc un nom par pièce. Une pièce absente n'a pas de nom.
 */
export type PlayerBannerPieceLabels = {
  readonly level: string | null;
  /** Les étincelles et la marche vers le niveau suivant (ou le sommet). */
  readonly sparks: string | null;
  readonly meesh: string | null;
  readonly rank: string | null;
  readonly league: string | null;
  readonly flame: string | null;
  readonly trophies: string | null;
  readonly missions: string | null;
  readonly season: string | null;
};

export function playerBannerPieceLabels(model: PlayerBannerModel, language: InterfaceLanguage = currentInterfaceLanguage()): PlayerBannerPieceLabels {
  const count = (value: number): string => formatGameNumber(language, value);
  const { level } = model;
  const separator = translateGame(language, 'game.banner.separator');
  const join = (parts: readonly (string | null)[]): string | null => {
    const kept = parts.filter((part): part is string => part !== null);
    return kept.length === 0 ? null : kept.join(separator);
  };
  const march =
    level === null
      ? null
      : level.nextLevel === null
        ? level.opener === null
          ? translateGame(language, 'game.banner.top')
          : translateGame(language, 'game.banner.capped', { rank: translateGame(language, `game.rank.${level.opener}`) })
        : translateGame(language, 'game.banner.to_next', {
            percent: count(Math.floor(boundedPercent(level.progress * 100))),
            level: count(level.nextLevel),
          });
  return {
    level: level === null ? null : join([translateGame(language, 'game.banner.level', { level: count(level.level) }), levelTierName(model.tier, language)]),
    sparks: join([model.points === null ? null : translateGame(language, 'game.banner.link.sparks', { points: count(model.points) }), march]),
    meesh: model.meeshes === null ? null : translateGame(language, 'game.banner.link.meesh', { count: count(model.meeshes) }),
    rank: model.rank === null ? null : standingLabel(model.rank, language),
    league:
      model.league === null
        ? null
        : translateGame(language, 'game.banner.league', { league: leagueName(model.league.league, language), place: leaguePlace(model.league.place, language) }),
    flame: model.flame === null ? null : translateGame(language, 'game.banner.flame', { days: translateGamePlural(language, 'game.days', model.flame.days) }),
    trophies: model.trophies === null ? null : translateGame(language, 'game.banner.link.trophies', { count: count(model.trophies) }),
    missions: model.missions === null ? null : translateGame(language, 'game.banner.link.missions', { done: count(model.missions.done), total: count(model.missions.total) }),
    season: model.season === null ? null : translateGame(language, 'game.banner.link.season', { stars: count(model.season.stars) }),
  };
}

/** Le texte ordinaire du navigateur, en pixels : la taille de la racine qu'on compare. */
const ORDINARY_TEXT_PX = 16;
/** Entre XXL (21/17 ≈ 1,24) et xxxLarge (23/17 ≈ 1,35) de Dynamic Type : « au-delà de XXL ». */
const LARGE_TEXT_SCALE = 1.3;

/**
 * Le texte est-il très grand ? (#9494) — vrai quand la racine dépasse XXL :
 * la jauge passe alors sous l'anneau au lieu de s'écraser à côté. Le web lit
 * la taille de la racine (`getComputedStyle(document.documentElement)`), que
 * le réglage de texte du navigateur, de l'OS et de la coque Android font
 * varier ; une valeur illisible est la disposition ordinaire.
 */
export const isLargeText = (rootFontPx: number): boolean =>
  Number.isFinite(rootFontPx) && rootFontPx / ORDINARY_TEXT_PX >= LARGE_TEXT_SCALE;
