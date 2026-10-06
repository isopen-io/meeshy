import type { GameVisibility } from '@meeshy/shared/types/game';
import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';
import { GAME_PRESTIGE_MAX, type LevelTierKey } from '@meeshy/shared/utils/game/levels';
import type { LeagueKey, LeagueZone } from '@meeshy/shared/utils/game/league';
import { parseTrophyKey } from '@meeshy/shared/utils/game/trophies';

import type { TrophyKind } from '@/components/game/trophy';
import type { GameMaterial } from '@/lib/game/materials';

import { formatGameNumber, translateGame, translateGamePlural } from '@/lib/i18n-game-catalog';
import { levelRingLabel } from './game-copy';
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

/**
 * Le nom d'une langue, DANS la langue de l'interface (« Swahili », « Japonais »),
 * par `Intl.DisplayNames` — jamais un catalogue de deux cents noms écrit à la main.
 * Un code que le moteur ne sait pas nommer rend le code lui-même, en capitales.
 */
export function languageName(code: string, language: Language = currentInterfaceLanguage()): string {
  try {
    const name = new Intl.DisplayNames(language, { type: 'language' }).of(code);
    if (name === undefined || name === code) return code.toUpperCase();
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
}

/** Le thème d'une saison : aujourd'hui une langue (`language:sw`), demain une région — un thème inconnu ne se nomme pas. */
export function seasonThemeName(themeKey: string, language: Language = currentInterfaceLanguage()): string | null {
  const [kind, value] = themeKey.split(':');
  return kind === 'language' && value !== undefined && value.length > 0 ? languageName(value, language) : null;
}

/** Le numéro de semaine ISO d'un lundi (`AAAA-MM-JJ`) — l'étiquette courte « S44 » de la plaque d'une coupe de ligue. */
export function isoWeekNumber(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const dateOf = (dayKey: string, language: Language): string => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
};

export type TrophyView = {
  readonly kind: TrophyKind;
  /** La matière de la coupe de ligue ; absente des trois autres coupes. */
  readonly material?: GameMaterial;
  /** Ce que lit un lecteur d'écran : « Coupe d'or — ligue Jade, semaine du 26 octobre » (« …, octobre 2026 » chez un visiteur). */
  readonly title: string;
  /** Ce que la plaque grave : « JADE · S44 », en capitales. */
  readonly plate: string;
};

/** « oct. 2026 » — le mois d'une coupe vue par un VISITEUR, sur sa plaque (conformité D-3). */
const shortMonthOf = (monthKey: string, language: Language): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
};

/**
 * Ce qu'une CLÉ de trophée montre : sa coupe, son titre, sa plaque. Une clé que ce
 * client ne connaît pas (un trophée d'une version plus récente) rend `null` : on
 * ne nomme pas ce qu'on ne comprend pas, et la vitrine ne le montre pas.
 */
export function trophyView(key: string, language: Language = currentInterfaceLanguage()): TrophyView | null {
  const spec = parseTrophyKey(key);
  if (spec === null) return null;
  const count = (value: number): string => formatGameNumber(language, value);
  const upper = (text: string): string => text.toLocaleUpperCase(language);
  switch (spec.kind) {
    case 'league-cup': {
      const league = leagueName(spec.league, language);
      const cup = translateGame(language, `game.league.cup.${spec.cup}`);
      if ('monthKey' in spec) {
        return {
          kind: 'league',
          material: spec.cup,
          title: translateGame(language, 'game.trophy.league-cup-month', { cup, league, month: awardedMonthLabel(spec.monthKey, language) }),
          plate: translateGame(language, 'game.trophy.plate.league-month', { league: upper(league), month: upper(shortMonthOf(spec.monthKey, language)) }),
        };
      }
      return {
        kind: 'league',
        material: spec.cup,
        title: translateGame(language, 'game.trophy.league-cup', { cup, league, date: dateOf(spec.weekKey, language) }),
        plate: translateGame(language, 'game.trophy.plate.league', { league: upper(league), week: count(isoWeekNumber(spec.weekKey)) }),
      };
    }
    case 'season-cup':
      return {
        kind: 'season',
        title: translateGame(language, 'game.trophy.season-cup', { number: count(spec.season) }),
        plate: translateGame(language, 'game.trophy.plate.season', { number: count(spec.season) }),
      };
    case 'prestige':
      return {
        kind: 'prestige',
        title: translateGame(language, 'game.trophy.prestige', { number: count(spec.number) }),
        plate: translateGame(language, 'game.trophy.plate.prestige', { number: count(spec.number) }),
      };
    case 'flame':
      return {
        kind: 'flame',
        title: translateGame(language, 'game.trophy.flame', { days: translateGamePlural(language, 'game.days', spec.days) }),
        plate: translateGame(language, 'game.trophy.plate.flame', { days: count(spec.days) }),
      };
  }
}

/** « 26 octobre 2026 », dans la langue — la date d'un trophée vue PAR SON PROPRIÉTAIRE. */
export function awardedDate(iso: string, language: Language = currentInterfaceLanguage()): string {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

/** « octobre 2026 » — ce qu'un VISITEUR voit d'un trophée : le mois, jamais le jour (conformité D-3). */
export function awardedMonthLabel(month: string, language: Language = currentInterfaceLanguage()): string {
  const [year, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year ?? 1970, (m ?? 1) - 1, 1)));
}

/** « 2 août 2026 », dans la langue — une date locale `AAAA-MM-JJ` (un tampon, un jour de saison), lue en UTC pour ne jamais glisser d'un jour. */
export function dayLabel(dayKey: string, language: Language = currentInterfaceLanguage()): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

export const rarityName = (rarity: AchievementRarity, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.rarity.${rarity}`);

/**
 * Ce que lit un lecteur d'écran sur l'anneau de niveau : « Niveau 34, palier Éclat,
 * quatrième palier », et, quand des étoiles de Prestige sont posées, « Étoiles : 2
 * sur 5 » — le dessin les porte, le texte doit les dire aussi.
 */
export function levelRingLabelWithPrestige(level: number, tier: LevelTierKey, prestige: number, language: Language = currentInterfaceLanguage()): string {
  const base = levelRingLabel(level, tier, language);
  if (prestige <= 0) return base;
  const stars = translateGame(language, 'game.prestige.stars', { stars: formatGameNumber(language, Math.min(prestige, GAME_PRESTIGE_MAX)), max: formatGameNumber(language, GAME_PRESTIGE_MAX) });
  return `${base}, ${stars}`;
}
