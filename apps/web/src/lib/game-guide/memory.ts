import { LEAGUE_KEYS, type LeagueKey } from '@meeshy/shared/utils/game/league';

import type { SafeStorage } from '@/lib/storage';

import type { GuideSnapshot } from './events-v2';

/**
 * LA MÉMOIRE DU GUIDE (#9481) — l'instantané des quatre choses que le guide
 * raconte quand elles changent PENDANT une absence (la ligue tenue, la saison,
 * les trophées, les tampons, le Prestige). Une montée de ligue tombe le
 * dimanche soir : c'est à l'ouverture SUIVANTE, en comparant à ce que l'appareil
 * a gardé, qu'on peut la dire.
 *
 * Une COMMODITÉ PAR APPAREIL (§ stockage navigateur) : elle ne porte aucun état
 * de jeu qui doive survivre ni être partagé. Tout se lit et s'écrit sous
 * `try/catch`, et une valeur illisible vaut « aucune mémoire » — le guide se
 * tait, il n'invente rien. Elle est CLÉE PAR COMPTE : un autre compte sur le
 * même appareil ne lit pas la mémoire du premier.
 */
const KEY_PREFIX = 'meeshy.game.guide-memory.';

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;

const isInt = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min;
const isStrings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.length <= 1000 && value.every((item) => typeof item === 'string');
const isLeague = (value: unknown): value is LeagueKey => typeof value === 'string' && (LEAGUE_KEYS as readonly string[]).includes(value);

function readLeague(value: unknown): GuideSnapshot['league'] {
  const raw = record(value);
  if (raw === null || typeof raw['weekKey'] !== 'string') return undefined;
  const current = raw['current'];
  if (current === null) return { weekKey: raw['weekKey'], current: null };
  const held = record(current);
  if (held === null || !isLeague(held['league']) || !isInt(held['rank'], 1)) return undefined;
  const toPromotion = held['pointsToPromotion'];
  if (toPromotion !== null && !isInt(toPromotion)) return undefined;
  return { weekKey: raw['weekKey'], current: { league: held['league'], rank: held['rank'], pointsToPromotion: toPromotion } };
}

function readSeason(value: unknown): GuideSnapshot['season'] | undefined {
  if (value === null) return null;
  const raw = record(value);
  if (raw === null || !isInt(raw['number'], 1) || typeof raw['themeKey'] !== 'string' || !isInt(raw['steps']) || typeof raw['completed'] !== 'boolean') return undefined;
  return { number: raw['number'], themeKey: raw['themeKey'], steps: raw['steps'], completed: raw['completed'] };
}

function readAtlas(value: unknown): GuideSnapshot['atlas'] {
  const raw = record(value);
  return raw !== null && isInt(raw['total'], 1) && isStrings(raw['languages']) ? { total: raw['total'], languages: raw['languages'] } : undefined;
}

export function recallSnapshot(storage: SafeStorage, userId: string): GuideSnapshot | null {
  try {
    const stored = storage.getItem(`${KEY_PREFIX}${userId}`);
    if (stored === null) return null;
    const raw = record(JSON.parse(stored));
    if (raw === null || !isInt(raw['prestige'])) return null;
    const league = readLeague(raw['league']);
    const season = readSeason(raw['season']);
    const atlas = readAtlas(raw['atlas']);
    return {
      prestige: raw['prestige'],
      ...(league === undefined ? {} : { league }),
      ...(season === undefined ? {} : { season }),
      ...(isStrings(raw['trophies']) ? { trophies: raw['trophies'] } : {}),
      ...(atlas === undefined ? {} : { atlas }),
    };
  } catch {
    return null;
  }
}

export function rememberSnapshot(storage: SafeStorage, userId: string, snapshot: GuideSnapshot): void {
  try {
    storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(snapshot));
  } catch {
    /* Stockage refusé : on ne racontera simplement pas ce qui s'est passé pendant l'absence. */
  }
}

export function forgetSnapshot(storage: SafeStorage, userId: string): void {
  try {
    storage.removeItem(`${KEY_PREFIX}${userId}`);
  } catch {
    /* Rien à oublier. */
  }
}
