/**
 * LES NOTIFICATIONS DU JEU (#9490) — la LOI, partagée : quels types existent, combien
 * en part par jour, quelle phrase dit le résultat d'une semaine de ligue.
 * `docs/product/jeu-meeshy-conception.html` partie IX : « une notification de jeu par jour
 * au plus, interrupteur « Jeu » dans les réglages » ; jamais « X t'a dépassé » ; jamais
 * une heure d'activité ni l'identité d'un pseudonyme.
 *
 * Les textes vivent dans le catalogue de notifications (`notification-strings.ts`, huit
 * langues) ; la préférence est `notification.gameEnabled` (défaut activé, absent = reçu).
 */

export const GAME_NOTIFICATION_TYPES = ['game_duo_invited', 'game_duo_accepted', 'game_league_result', 'game_season_step'] as const;

export type GameNotificationType = (typeof GAME_NOTIFICATION_TYPES)[number];

export const isGameNotificationType = (value: unknown): value is GameNotificationType =>
  typeof value === 'string' && (GAME_NOTIFICATION_TYPES as readonly string[]).includes(value);

/** Au plus UNE notification de jeu par jour et par destinataire — le jour de SON fuseau. */
export const GAME_NOTIFICATION_DAILY_CAP = 1;

export type LeagueResultKey =
  | 'game.leagueCupGold'
  | 'game.leagueCupSilver'
  | 'game.leagueCupBronze'
  | 'game.leaguePromoted'
  | 'game.leagueStayed'
  | 'game.leagueRelegated';

const CUP_KEYS = {
  gold: 'game.leagueCupGold',
  silver: 'game.leagueCupSilver',
  bronze: 'game.leagueCupBronze',
} as const satisfies Record<'gold' | 'silver' | 'bronze', LeagueResultKey>;

/** La phrase du résultat d'une semaine de ligue : une coupe prime sur la zone, la zone sur le maintien. */
export function gameLeagueResultKey(params: {
  readonly zone: 'promotion' | 'safe' | 'relegation';
  readonly cup: 'gold' | 'silver' | 'bronze' | null;
}): LeagueResultKey {
  if (params.cup !== null) return CUP_KEYS[params.cup];
  if (params.zone === 'promotion') return 'game.leaguePromoted';
  return params.zone === 'relegation' ? 'game.leagueRelegated' : 'game.leagueStayed';
}
