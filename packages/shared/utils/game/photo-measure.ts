/**
 * LA CLÉ DE MESURE D'UNE ÉTAPE (D15, #10185 — lot L20 #10176), à côté des identités de `photo-moments.ts` dont elle
 * relit la grammaire. Fichier à part : seule la passerelle la lit (`services/gateway/src/services/game/
 * photoMomentsMeasure.ts`), et les clients qui importent `photo-moments.ts` ne doivent pas en porter le poids.
 */

import { isDayKey } from './day-prng.js';
import { GLORY_DIVISIONS, GLORY_RANKS } from './glory.js';
import { LEAGUE_KEYS, leagueWeekKey } from './league.js';
import { GAME_PRESTIGE_MAX, LEVEL_TIER_KEYS } from './levels.js';
import { PHOTO_FLAME_THRESHOLDS } from './photo-catch-up.js';
import { photoAchievementKeyOfMomentId } from './photo-moments.js';
import { parseTrophyKey } from './trophies.js';
import { TREASURY_TIERS } from './treasury.js';

/**
 * LA CLÉ DE MESURE D'UNE ÉTAPE (D15, #10185 — lot L20 #10176). La mesure de l'immortalisation groupe les étapes par
 * FAMILLE et par une CLÉ AGRÉGÉE qui garde QUEL moment (le rang, le palier, le seuil de Flamme, le palier de trésor,
 * le haut fait, la sorte de trophée, la ligue) et jamais ce qui individualise une ligne : ni la division d'un rang, ni
 * le numéro d'une Meesh ou d'un Prestige, ni le palier d'un haut fait composé, ni le cycle d'un palier, ni la date,
 * la semaine ou la saison — la date de l'événement est l'axe du jour, elle ne se répète pas dans la clé.
 *
 * Une identité hors de la grammaire du registre rend `null` : elle ne se compte pas.
 */
export const PHOTO_MEASURE_FAMILIES = [
  'start',
  'rank',
  'tier',
  'summit',
  'meesh',
  'treasury',
  'flame',
  'achievement',
  'trophy',
  'league',
  'season',
  'day',
] as const;
export type PhotoMeasureFamily = (typeof PHOTO_MEASURE_FAMILIES)[number];
export type PhotoMeasureKey = { readonly family: PhotoMeasureFamily; readonly key: string };

const MEASURE_POSITIVE_INT = /^[1-9]\d*$/;
const MEASURE_RANK_KEYS: ReadonlySet<string> = new Set(GLORY_RANKS.map((rank) => rank.key));
const MEASURE_DIVISIONS: ReadonlySet<string> = new Set(GLORY_DIVISIONS.map(String));
const MEASURE_TIER_KEYS: ReadonlySet<string> = new Set(LEVEL_TIER_KEYS.slice(1));
const MEASURE_TREASURY_KEYS: ReadonlySet<string> = new Set(TREASURY_TIERS.map((tier) => tier.key));
const MEASURE_FLAME_DAYS: ReadonlySet<string> = new Set(PHOTO_FLAME_THRESHOLDS.map(String));
const MEASURE_LEAGUE_KEYS: ReadonlySet<string> = new Set(LEAGUE_KEYS);

const prestigeIn = (raw: string | undefined, min: 0 | 1): boolean =>
  raw !== undefined && /^\d+$/.test(raw) && Number(raw) >= min && Number(raw) <= GAME_PRESTIGE_MAX && String(Number(raw)) === raw;

const measured = (family: PhotoMeasureFamily, key: string): PhotoMeasureKey => ({ family, key });

const rankMeasure = (rank: string | undefined, division: string | undefined, extra: number): PhotoMeasureKey | null => {
  if (extra > 0 || rank === undefined) return null;
  if (rank === 'mythe') return division === '0' ? measured('rank', 'rank:mythe') : null;
  return MEASURE_RANK_KEYS.has(rank) && division !== undefined && MEASURE_DIVISIONS.has(division) ? measured('rank', `rank:${rank}`) : null;
};

const tierMeasure = (tier: string | undefined, cycle: string | undefined, extra: number): PhotoMeasureKey | null =>
  extra === 0 && tier !== undefined && MEASURE_TIER_KEYS.has(tier) && (cycle === undefined || prestigeIn(cycle, 1))
    ? measured('tier', `tier:${tier}`)
    : null;

const leagueUpMeasure = (weekKey: string | undefined, league: string | undefined, extra: number): PhotoMeasureKey | null =>
  extra === 0 && weekKey !== undefined && isDayKey(weekKey) && leagueWeekKey(weekKey) === weekKey && league !== undefined && MEASURE_LEAGUE_KEYS.has(league)
    ? measured('league', `league-up:${league}`)
    : null;

const achievementMeasure = (stepId: string): PhotoMeasureKey | null => {
  const key = photoAchievementKeyOfMomentId(stepId);
  return key === null ? null : measured('achievement', `achievement:${key.replace(/:\d+$/, '')}`);
};

const trophyMeasure = (stepId: string): PhotoMeasureKey | null => {
  const spec = parseTrophyKey(stepId.slice('trophy:'.length));
  return spec === null ? null : measured('trophy', `trophy:${spec.kind}`);
};

/** La famille et la clé agrégée d'une identité d'étape, `null` hors de la grammaire du registre. */
export function photoMeasureKeyOf(stepId: string): PhotoMeasureKey | null {
  const [prefix, first, second, ...rest] = stepId.split(':');
  const single = second === undefined && rest.length === 0;
  switch (prefix) {
    case 'start':
      return first === undefined ? measured('start', 'start') : null;
    case 'rank':
      return rankMeasure(first, second, rest.length);
    case 'tier':
      return tierMeasure(first, second, rest.length);
    case 'level-100':
      return single && prestigeIn(first, 0) ? measured('summit', 'level-100') : null;
    case 'prestige':
      return single && prestigeIn(first, 1) ? measured('summit', 'prestige') : null;
    case 'meesh':
      return single && first !== undefined && MEASURE_POSITIVE_INT.test(first) ? measured('meesh', 'meesh') : null;
    case 'treasury':
      return single && first !== undefined && MEASURE_TREASURY_KEYS.has(first) ? measured('treasury', `treasury:${first}`) : null;
    case 'flame':
      return single && first !== undefined && MEASURE_FLAME_DAYS.has(first) ? measured('flame', `flame:${first}`) : null;
    case 'achievement':
      return achievementMeasure(stepId);
    case 'trophy':
      return trophyMeasure(stepId);
    case 'league-up':
      return leagueUpMeasure(first, second, rest.length);
    case 'season':
      return single && first !== undefined && MEASURE_POSITIVE_INT.test(first) ? measured('season', 'season') : null;
    case 'day':
      return single && first !== undefined && isDayKey(first) ? measured('day', 'day') : null;
    default:
      return null;
  }
}
