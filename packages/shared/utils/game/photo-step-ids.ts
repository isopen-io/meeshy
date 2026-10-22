/**
 * LES IDENTITÉS D'ÉTAPE QUE LE REGISTRE ACCEPTE (#10162, revue adverse du L10a — chantier « Cadres de gloire »).
 *
 * `POST /me/game/photo-moments/presented` créait une ligne `GamePhotoMoment` par identité BIEN FORMÉE : un compte
 * pouvait remplir le registre sans borne d'identités inventées. Une identité n'est recevable que si elle appartient
 * à une famille connue, dans ses bornes — celles qu'écrivent `photo-catch-up.ts`, `photo-moments.ts`, les
 * constructeurs du web (`apps/web/src/lib/game-photo/moments.ts`) et d'iOS (`GamePhotoMoments.swift`) :
 *
 *   start · rank:<rang>:<V..I> · rank:mythe:0 · tier:<palier> (sauf le premier, où l'on commence)
 *   tier:<palier>:<1..Prestige max> — le même palier atteint de nouveau dans un cycle neuf (#10911)
 *   level-100:<0..Prestige max> · prestige:<1..Prestige max> · meesh:<1, puis chaque dixième, ≤ PHOTO_MEESH_MAX>
 *   treasury:<palier> · flame:<7|30|100|365> · achievement:<clé du catalogue>
 *   trophy:<clé du catalogue des trophées> · league-up:<lundi>:<ligue> · season:<n> · day:<AAAA-MM-JJ>
 *
 * Les familles DATÉES ont une borne de temps, lue sur le jour UTC du serveur :
 *  - `day:` de J-2 à J+1. Le jour est celui de l'utilisateur, dont le fuseau va de UTC-12 à UTC+14 : sa date
 *    locale est toujours J-1, J ou J+1. Un jour de plus en arrière laisse partir un accusé mis en file hors ligne
 *    la veille au soir. Au-delà, la réalisation du jour n'est plus à présenter.
 *  - une semaine de ligue (montée, coupe) : un lundi, de `LEAGUE_FIRST_WEEK` à la semaine qui contient demain —
 *    la fermeture du dimanche 20 h locale ouvre la semaine suivante, en UTC+14 dès le dimanche 6 h UTC. Pas de
 *    borne en arrière : une montée ancienne reste présentable, et il n'en existe qu'une par semaine écoulée.
 *  - une saison (fin, coupe) : de 1 à la saison qui contient demain ; aucune avant la première.
 *
 * Une coupe de ligue datée par son MOIS est la forme que reçoit un visiteur, jamais un moment du compte : refusée.
 *
 * Les clients filtrent avec la même fonction avant d'accuser : une identité refusée ferait tomber tout le lot.
 */

import { addDays, dayDiff, isDayKey } from './day-prng.js';
import { GLORY_DIVISIONS, GLORY_RANKS } from './glory.js';
import { LEAGUE_FIRST_WEEK, LEAGUE_KEYS, leagueWeekKey } from './league.js';
import { GAME_PRESTIGE_MAX, LEVEL_TIER_KEYS } from './levels.js';
import { PHOTO_FLAME_THRESHOLDS } from './photo-catch-up.js';
import { PHOTO_ACHIEVEMENT_KEYS } from './photo-moments.js';
import { seasonAt } from './season.js';
import { FLAME_TROPHY_DAYS, parseTrophyKey } from './trophies.js';
import { TREASURY_TIERS } from './treasury.js';

/** La fenêtre de `day:` autour du jour UTC du serveur, en jours. */
export const PHOTO_DAY_WINDOW = { before: 2, after: 1 } as const;

/**
 * La plus haute Meesh photographiable. La photo se propose à la première puis à chaque dixième ; le prix atteint son
 * plafond (`MEESH_PRICE_CAP`) à la 101e frappe, si bien que dix mille Meeshes coûtent plus de 160 millions de points
 * — l'édition prisme de chaque millième reste couverte jusque-là.
 */
export const PHOTO_MEESH_MAX = 10_000;

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);

/** Toutes les étapes qui ne dépendent pas du calendrier : leur nombre est la base du plafond par compte. */
export const PHOTO_STATIC_STEP_IDS: readonly string[] = [
  'start',
  ...GLORY_RANKS.flatMap((rank) => GLORY_DIVISIONS.map((division) => `rank:${rank.key}:${division}`)),
  'rank:mythe:0',
  ...LEVEL_TIER_KEYS.slice(1).map((tier) => `tier:${tier}`),
  ...LEVEL_TIER_KEYS.slice(1).flatMap((tier) => range(1, GAME_PRESTIGE_MAX).map((prestige) => `tier:${tier}:${prestige}`)),
  ...range(0, GAME_PRESTIGE_MAX).map((prestige) => `level-100:${prestige}`),
  ...range(1, GAME_PRESTIGE_MAX).map((number) => `prestige:${number}`),
  ...[1, ...range(1, PHOTO_MEESH_MAX / 10).map((tenth) => tenth * 10)].map((number) => `meesh:${number}`),
  ...TREASURY_TIERS.map((tier) => `treasury:${tier.key}`),
  ...PHOTO_FLAME_THRESHOLDS.map((days) => `flame:${days}`),
  ...PHOTO_ACHIEVEMENT_KEYS.map((key) => `achievement:${key}`),
  ...range(1, GAME_PRESTIGE_MAX).map((number) => `trophy:trophy.prestige.${number}`),
  ...FLAME_TROPHY_DAYS.map((days) => `trophy:trophy.flame.${days}`),
];

const STATIC = new Set(PHOTO_STATIC_STEP_IDS);

/**
 * Ce qu'une année de jeu peut ajouter au plus : une réalisation par jour (366), une montée et une coupe de ligue
 * par semaine (53 lundis au plus), une fin et une coupe par saison de huit semaines (7 débuts au plus).
 */
export const PHOTO_STEPS_PER_YEAR = 366 + 53 * 2 + 7 * 2;

/** L'horizon que le plafond couvre : dix ans de jeu quotidien sans un jour manqué. */
export const PHOTO_MOMENTS_HORIZON_YEARS = 10;

/**
 * Le plafond DUR de lignes `GamePhotoMoment` par compte : toutes les étapes fixes, plus dix ans d'étapes datées.
 * Au-delà, un accusé ne crée plus de ligne neuve ; les étapes déjà gardées restent accusables.
 */
export const PHOTO_MOMENTS_ACCOUNT_MAX = PHOTO_STATIC_STEP_IDS.length + PHOTO_MOMENTS_HORIZON_YEARS * PHOTO_STEPS_PER_YEAR;

const POSITIVE_INT = /^[1-9]\d*$/;
const LEAGUE_UP = /^league-up:(\d{4}-\d{2}-\d{2}):([a-z]+)$/;

const serverDay = (now: Date): string => now.toISOString().slice(0, 10);

const isOpenWeek = (weekKey: string, today: string): boolean =>
  isDayKey(weekKey) &&
  leagueWeekKey(weekKey) === weekKey &&
  dayDiff(LEAGUE_FIRST_WEEK, weekKey) >= 0 &&
  dayDiff(weekKey, leagueWeekKey(addDays(today, 1))) >= 0;

const isOpenSeason = (raw: string, today: string): boolean => {
  if (!POSITIVE_INT.test(raw)) return false;
  const current = seasonAt(addDays(today, 1));
  return current !== null && Number(raw) <= current;
};

const isKnownDay = (dayKey: string, today: string): boolean => {
  if (!isDayKey(dayKey)) return false;
  const offset = dayDiff(today, dayKey);
  return offset >= -PHOTO_DAY_WINDOW.before && offset <= PHOTO_DAY_WINDOW.after;
};

const isKnownTrophy = (key: string, today: string): boolean => {
  const spec = parseTrophyKey(key);
  if (spec === null) return false;
  switch (spec.kind) {
    case 'league-cup':
      return 'weekKey' in spec && isOpenWeek(spec.weekKey, today);
    case 'season-cup':
      return isOpenSeason(String(spec.season), today);
    case 'prestige':
    case 'flame':
      return STATIC.has(`trophy:${key}`);
  }
};

const isKnownLeagueUp = (stepId: string, today: string): boolean => {
  const match = LEAGUE_UP.exec(stepId);
  if (match === null) return false;
  const [, weekKey, league] = match;
  return weekKey !== undefined && LEAGUE_KEYS.some((key) => key === league) && isOpenWeek(weekKey, today);
};

/** `true` pour une identité d'étape que le registre accepte à cet instant ; `now` est l'horloge de l'appelant. */
export function isKnownPhotoStepId(stepId: string, now: Date): boolean {
  if (STATIC.has(stepId)) return true;
  const today = serverDay(now);
  if (stepId.startsWith('day:')) return isKnownDay(stepId.slice(4), today);
  if (stepId.startsWith('season:')) return isOpenSeason(stepId.slice(7), today);
  if (stepId.startsWith('league-up:')) return isKnownLeagueUp(stepId, today);
  if (stepId.startsWith('trophy:')) return isKnownTrophy(stepId.slice(7), today);
  return false;
}
