import type { GameVisibility } from '@meeshy/shared/types/game';
import type { LeagueKey, LeagueZone } from '@meeshy/shared/utils/game/league';

import { formatGameNumber, translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * CE QUE LA VAGUE 2 DIT (#9481) — les noms des ligues et des zones, les trois
 * niveaux de visibilité, le compte à rebours de la fermeture. Même séparation
 * que `game-copy.ts` : la loi partagée rend des clés, ce fichier les habille
 * depuis le catalogue du jeu, dans la langue de l'interface lue à l'appel.
 */

type Language = InterfaceLanguage;

const MINUTE = 60_000;

export const leagueName = (league: LeagueKey, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.league.name.${league}`);

export const zoneLabel = (zone: LeagueZone, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.league.zone.${zone}`);

export const visibilityLabel = (level: GameVisibility['showcase'], language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.visibility.${level}`);

/**
 * Le temps qui reste avant la fermeture, CALME : des jours et des heures, puis
 * des heures, puis des minutes — jamais de secondes qui défilent. La fermeture
 * est le dimanche à 20 h, heure LOCALE de la personne (`closes`).
 */
export function remainingLabel(closes: { readonly dayKey: string; readonly minuteOfDay: number }, now: Date, language: Language = currentInterfaceLanguage()): string {
  const [year, month, day] = closes.dayKey.split('-').map(Number);
  const target = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, Math.floor(closes.minuteOfDay / 60), closes.minuteOfDay % 60);
  const minutes = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / MINUTE));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const count = (value: number): string => formatGameNumber(language, value);
  if (days >= 1) return translateGame(language, 'game.duration.days_hours', { days: count(days), hours: count(hours) });
  if (hours >= 1) return translateGame(language, 'game.duration.hours', { hours: count(Math.floor(minutes / 60)) });
  return translateGame(language, 'game.duration.minutes', { minutes: count(minutes) });
}

/** « Semaine du 2 novembre » : la semaine s'identifie par son lundi local. */
export function weekLabel(weekKey: string, language: Language = currentInterfaceLanguage()): string {
  const [year, month, day] = weekKey.split('-').map(Number);
  const monday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(monday);
  return translateGame(language, 'game.league.week', { date });
}
