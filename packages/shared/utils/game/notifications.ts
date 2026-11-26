/**
 * LES NOTIFICATIONS DU JEU (#9490) — la LOI, partagée : quels types existent, combien
 * en part par jour, quelle phrase dit le résultat d'une semaine de ligue.
 * `docs/product/jeu-meeshy-conception.html` partie IX, révisée par le porteur le 2026-11-10 (#17368) :
 * deux notifications de jeu par jour au plus, hors exploit et action d'autrui ; interrupteur « Jeu » dans les
 * réglages ; jamais « X t'a dépassé » ; jamais
 * une heure d'activité ni l'identité d'un pseudonyme.
 *
 * Les textes vivent dans le catalogue de notifications (`notification-strings.ts`, huit
 * langues) ; la préférence est `notification.gameEnabled` (défaut activé, absent = reçu).
 */

import type { FlameStatus } from './flame.js';

export const GAME_NOTIFICATION_TYPES = [
  'game_duo_invited',
  'game_duo_accepted',
  'game_league_result',
  'game_season_step',
  /** La mission personnelle du jour, annoncée au début de sa plage horaire (#9539). */
  'game_mission_window',
  /** Des étapes franchies app fermée peuvent rejoindre le carnet — regroupées, dans le plafond (#10175, D9). */
  'game_photo_moment',
  /** Le rappel du soir : une Flamme de trois jours ou plus n'a reçu aucun geste aujourd'hui (#17368, #20612). */
  'game_flame_evening',
] as const;

export type GameNotificationType = (typeof GAME_NOTIFICATION_TYPES)[number];

export const isGameNotificationType = (value: unknown): value is GameNotificationType =>
  typeof value === 'string' && (GAME_NOTIFICATION_TYPES as readonly string[]).includes(value);

/**
 * Au plus DEUX notifications de jeu par jour et par destinataire — le jour de SON fuseau (décision porteur
 * 2026-11-10, #17368, qui remplace sur ce point « une par jour » du 2026-10-06, #9490).
 */
export const GAME_NOTIFICATION_DAILY_CAP = 2;

/**
 * Les types qui SORTENT du plafond : l'action d'un AUTRE (#9541, #17368) — une invitation ou une acceptation
 * de duo est un message d'un ami et n'attend pas le lendemain. Ils ne se comptent pas et ne prennent aucun
 * créneau. La mission du jour, elle, compte depuis #17368 : elle n'est ni un exploit ni l'action d'un autre.
 */
export const GAME_NOTIFICATIONS_OUTSIDE_DAILY_CAP = ['game_duo_invited', 'game_duo_accepted'] as const;

/** Un EXPLOIT sort aussi du plafond (#17368), quel que soit son type : c'est le CONTENU qui le dit, pas le type. */
export const countsAgainstGameDailyCap = (type: GameNotificationType, options: { readonly exploit?: boolean } = {}): boolean =>
  options.exploit !== true && !(GAME_NOTIFICATIONS_OUTSIDE_DAILY_CAP as readonly string[]).includes(type);

/** En ligue (la Joute), l'exploit est une coupe ou une montée ; le maintien et la descente n'en sont pas. */
export const isGameLeagueExploit = (params: {
  readonly zone: 'promotion' | 'safe' | 'relegation';
  readonly cup: 'gold' | 'silver' | 'bronze' | null;
}): boolean => params.cup !== null || params.zone === 'promotion';

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

/**
 * L'annonce de la mission du jour dit la Flamme (#17368, #20575) à partir de DEUX jours : une Flamme éteinte
 * (hauteur servie 0) ou d'un seul jour ne se dit pas — le catalogue n'a pas de forme au singulier.
 */
export const GAME_MISSION_FLAME_MIN_DAYS = 2;

export const missionWindowKey = (flameDays: number): 'game.missionWindow' | 'game.missionWindowFlame' =>
  Number.isFinite(flameDays) && flameDays >= GAME_MISSION_FLAME_MIN_DAYS ? 'game.missionWindowFlame' : 'game.missionWindow';

/**
 * LE RAPPEL DU SOIR (#17368, #20612) — décision du porteur du 2026-11-10 : « une fois, si la Flamme a 3 jours
 * ou plus et qu'aucun geste n'a été fait. Jamais après 21 h ». Aucun geste aujourd'hui, c'est une Flamme qui vit
 * encore sans avoir été entretenue : `at-risk` (dernier geste hier) ou `covered` (une Veilleuse couvre l'écart, et
 * en brûlera une de plus à minuit). La plage commence à 18 h et se ferme à 21 h, dans le fuseau du joueur.
 * « Une fois par jour » et le plafond de deux sont tenus par le notifieur, pas par cette loi.
 */
export const GAME_FLAME_EVENING_MIN_DAYS = 3;
export const GAME_FLAME_EVENING_FIRST_MINUTE = 18 * 60;
export const GAME_FLAME_EVENING_LAST_MINUTE = 21 * 60;

export const flameEveningReminderDue = (params: {
  readonly status: FlameStatus;
  /** La hauteur SERVIE de la Flamme (`servedFlameDays`) : 0 quand elle est éteinte. */
  readonly days: number;
  /** La minute du jour LOCAL du joueur, 0..1439. */
  readonly minuteOfDay: number;
}): boolean =>
  (params.status === 'at-risk' || params.status === 'covered') &&
  Number.isFinite(params.days) &&
  params.days >= GAME_FLAME_EVENING_MIN_DAYS &&
  params.minuteOfDay >= GAME_FLAME_EVENING_FIRST_MINUTE &&
  params.minuteOfDay < GAME_FLAME_EVENING_LAST_MINUTE;

/** Le texte du push photo (D13) : une étape au singulier, plusieurs en une phrase groupée qui dit leur nombre. */
export const photoMomentNotificationKey = (count: number): 'game.photoMoment' | 'game.photoMoments' =>
  count > 1 ? 'game.photoMoments' : 'game.photoMoment';
