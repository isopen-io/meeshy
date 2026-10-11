/**
 * LA LECTURE D'UNE SAISON N ET D'UNE SEMAINE DE LIGUE (#9947) — ce qu'un lien
 * profond ouvre : une saison passée, en cours ou future, une semaine de ligue
 * passée ou en cours. Une table À PART de `GAME_ROUTES` : celle-là est comptée
 * clé à clé par les miroirs hors TypeScript.
 *
 * **Rien de la présence d'autrui.** Une saison sert son CALENDRIER (le même pour
 * tous) et MA progression ; une semaine sert MON résultat gravé — ni pseudonyme,
 * ni total, ni rang d'un autre. Les membres d'un groupe passé ne se relisent pas.
 *
 * Une semaine purgée (`LEAGUE_RETENTION_DAYS` après la fin de sa saison) le dit :
 * `retention: 'purged'`, jamais un vide qui passerait pour « pas joué ».
 */

import { z } from 'zod';
import { LEAGUE_KEYS } from '../utils/game/league.js';
import { SEASON_STEPS, SEASON_WEEKS } from '../utils/game/season.js';
import { GAME_ARCHIVE_RETENTIONS, GAME_ARCHIVE_STATUSES } from './game-archive-routes.js';

export {
  GAME_ARCHIVE_ERROR_CODES,
  GAME_ARCHIVE_RETENTIONS,
  GAME_ARCHIVE_ROUTE_METHODS,
  GAME_ARCHIVE_ROUTES,
  GAME_ARCHIVE_STATUSES,
  gameLeagueWeekArchivePath,
  gameSeasonArchivePath,
  type GameArchiveRetention,
  type GameArchiveStatus,
} from './game-archive-routes.js';

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().min(0);

export const gameSeasonProgressArchiveSchema = z
  .object({
    stars: count,
    steps: z.number().int().min(0).max(SEASON_STEPS),
    claimedSteps: z.array(z.number().int().min(1).max(SEASON_STEPS)),
    sealOwned: z.boolean(),
    /** Le parcours terminé : la coupe de saison et le badge daté. */
    completed: z.boolean(),
    settled: z.boolean(),
  })
  .strict();

export const gameSeasonArchiveSchema = z
  .object({
    number: z.number().int().min(1),
    status: z.enum(GAME_ARCHIVE_STATUSES),
    themeKey: z.string().min(1),
    startDay: dayKey,
    endDay: dayKey,
    weekKeys: z.array(dayKey).length(SEASON_WEEKS),
    /** `null` : je n'y ai pas joué (ou elle n'a pas commencé). */
    progress: gameSeasonProgressArchiveSchema.nullable(),
  })
  .strict();

export const gameLeagueWeekResultSchema = z
  .object({
    league: z.enum(LEAGUE_KEYS),
    finalRank: z.number().int().min(1).nullable(),
    finalPoints: count.nullable(),
    zone: z.enum(['promotion', 'safe', 'relegation']).nullable(),
    cup: z.enum(['gold', 'silver', 'bronze']).nullable(),
    settled: z.boolean(),
  })
  .strict();

export const gameLeagueWeekArchiveSchema = z
  .object({
    weekKey: dayKey,
    status: z.enum(GAME_ARCHIVE_STATUSES),
    /** La saison qui contient la semaine, `null` hors saison. */
    season: z.number().int().min(1).nullable(),
    retention: z.enum(GAME_ARCHIVE_RETENTIONS),
    /** `null` : pas de place cette semaine-là, ou plus de trace (purge). */
    result: gameLeagueWeekResultSchema.nullable(),
  })
  .strict();

export type GameSeasonProgressArchive = z.infer<typeof gameSeasonProgressArchiveSchema>;
export type GameSeasonArchive = z.infer<typeof gameSeasonArchiveSchema>;
export type GameLeagueWeekResult = z.infer<typeof gameLeagueWeekResultSchema>;
export type GameLeagueWeekArchive = z.infer<typeof gameLeagueWeekArchiveSchema>;
