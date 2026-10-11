/**
 * LES LIENS DU JEU (#9947) — une saison ou une semaine de ligue, passée, en
 * cours ou future, a UNE adresse canonique :
 *
 *   https://meeshy.me/me/progression/saison/{n}        meeshy://me/progression/saison/{n}
 *   https://meeshy.me/me/progression/ligue/{weekKey}   meeshy://me/progression/ligue/{weekKey}
 *
 * La forme sans paramètre reste la saison ou la semaine EN COURS. `weekKey` est
 * le lundi local qui ouvre la semaine (`leagueWeekKey`). Le web (routes
 * `/me/progression/saison|ligue`), iOS (`DeepLinkParser`), l'AASA et les
 * événements in-app d'andp (`store.app_events`) lisent et écrivent ces chemins.
 * Un paramètre invalide ne nomme ni saison ni semaine : la lecture le refuse
 * (400), et les clients ouvrent alors la page EN COURS — jamais Safari ni un vide.
 */

import { isDayKey } from './day-prng.js';
import { leagueWeekKey } from './league.js';

export const GAME_LINK_PATHS = {
  season: '/me/progression/saison',
  league: '/me/progression/ligue',
} as const;

/** Le plus grand numéro de saison qu'un lien porte : au-delà, ce n'est pas un calendrier, c'est un bruit. */
export const GAME_LINK_MAX_SEASON = 9999;

export type GameLinkTarget =
  | { readonly kind: 'season'; readonly number: number | null }
  | { readonly kind: 'league'; readonly weekKey: string | null };

const SEASON_PARAM = /^[1-9]\d{0,3}$/;

/** Le numéro de saison d'un segment d'adresse, `null` s'il n'en est pas un (zéro, signe, décimale, zéro de tête). */
export function parseSeasonNumberParam(raw: string): number | null {
  if (!SEASON_PARAM.test(raw)) return null;
  const number = Number(raw);
  return number <= GAME_LINK_MAX_SEASON ? number : null;
}

/** `true` pour un jour réel (`AAAA-MM-JJ`) qui est un lundi : la clé d'une semaine de ligue. */
export function isLeagueWeekKeyParam(raw: string): boolean {
  return isDayKey(raw) && leagueWeekKey(raw) === raw;
}

export const seasonLinkPath = (number: number | null): string =>
  number === null ? GAME_LINK_PATHS.season : `${GAME_LINK_PATHS.season}/${number}`;

export const leagueWeekLinkPath = (weekKey: string | null): string =>
  weekKey === null ? GAME_LINK_PATHS.league : `${GAME_LINK_PATHS.league}/${weekKey}`;

export const gameLinkPath = (target: GameLinkTarget): string =>
  target.kind === 'season' ? seasonLinkPath(target.number) : leagueWeekLinkPath(target.weekKey);

/** L'adresse complète : `https://meeshy.me` ou `meeshy:/` (le schéma de l'app) en tête. */
export const gameLinkUrl = (origin: string, target: GameLinkTarget): string => `${origin.replace(/\/+$/, '')}${gameLinkPath(target)}`
  .replace(/^meeshy:\/(?!\/)/, 'meeshy://');

const segmentsOf = (path: string): readonly string[] => path.split('?')[0]!.split('/').filter((segment) => segment.length > 0);

/** La destination du Jeu d'un chemin d'adresse, `null` si ce n'en est pas une. */
export function parseGameLinkPath(path: string): GameLinkTarget | null {
  const [me, progression, page, param, ...rest] = segmentsOf(path);
  if (me !== 'me' || progression !== 'progression' || rest.length > 0) return null;
  if (page === 'saison') {
    if (param === undefined) return { kind: 'season', number: null };
    const number = parseSeasonNumberParam(param);
    return number === null ? null : { kind: 'season', number };
  }
  if (page === 'ligue') {
    if (param === undefined) return { kind: 'league', weekKey: null };
    return isLeagueWeekKeyParam(param) ? { kind: 'league', weekKey: param } : null;
  }
  return null;
}
