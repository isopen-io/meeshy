/**
 * LES ADRESSES ET LES VALEURS DE LA LECTURE D'UNE SAISON N ET D'UNE SEMAINE DE
 * LIGUE (#9947, #10018) — la partie SANS ZOD du contrat `game-archive.ts`, qui
 * la réexporte. Un client qui ne charge pas Zod (le paquet web) lit ses routes,
 * ses états et ses rétentions ici, comme il lit `game-routes.ts`.
 */

export const GAME_ARCHIVE_ROUTES = {
  /** Une saison par son numéro : calendrier, thème, état, et ma progression si j'y ai joué. GET. */
  season: '/me/game/seasons/:number',
  /** Une semaine de ligue par sa clé (le lundi) : mon résultat gravé, ou la purge. GET. */
  leagueWeek: '/me/game/league/weeks/:weekKey',
} as const;

export const GAME_ARCHIVE_ROUTE_METHODS = { season: 'GET', leagueWeek: 'GET' } as const satisfies Record<keyof typeof GAME_ARCHIVE_ROUTES, 'GET'>;

export const gameSeasonArchivePath = (number: number): string => GAME_ARCHIVE_ROUTES.season.replace(':number', String(number));
export const gameLeagueWeekArchivePath = (weekKey: string): string => GAME_ARCHIVE_ROUTES.leagueWeek.replace(':weekKey', weekKey);

/** Codes d'erreur des lectures : un paramètre qui n'est pas une saison ou une semaine est un 400. */
export const GAME_ARCHIVE_ERROR_CODES = {
  seasonInvalid: 'SEASON_INVALID',
  leagueWeekInvalid: 'LEAGUE_WEEK_INVALID',
  /** Le calendrier ne connaît pas (encore) cette saison. */
  seasonNotFound: 'SEASON_NOT_FOUND',
} as const;

/** Par rapport à MON moment (mon fuseau, la fermeture du dimanche 20 h comprise). */
export const GAME_ARCHIVE_STATUSES = ['past', 'current', 'upcoming'] as const;
export type GameArchiveStatus = (typeof GAME_ARCHIVE_STATUSES)[number];

/** Une semaine purgée le dit, jamais un vide qui passerait pour « pas joué ». */
export const GAME_ARCHIVE_RETENTIONS = ['kept', 'purged'] as const;
export type GameArchiveRetention = (typeof GAME_ARCHIVE_RETENTIONS)[number];
