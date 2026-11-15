import { classifyRelativeTime } from '@/lib/relative-time';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

import type { AdminMoment } from './types';

/**
 * LE TEMPS, DIT EN MOTS (#8876) — fonctions PURES : la langue et l'horloge
 * (`now`) sont toujours passées, jamais lues. Un horodatage illisible se dit
 * comme une absence (« — »), jamais « Invalid Date ».
 *
 * `timeZone` est une option de test et d'exactitude : les séries servies par
 * jour sont en jours UTC (`adminDayLabel`, `dayLabelsEndingToday` les lisent
 * toujours en UTC), alors qu'un instant s'affiche dans le fuseau du lecteur.
 *
 * L'absolu JOINT la date et l'heure lui-même : le joint que choisit
 * `dateStyle` + `timeStyle` dépend de la version d'ICU du moteur (« , » ou
 * « à » / « at »), et un même instant se lirait autrement d'un navigateur à
 * l'autre (#9133).
 */
export type AdminTimeOptions = { readonly timeZone?: string };

const NONE = '—';
const DAY_MS = 86_400_000;

const zoneOf = (options: AdminTimeOptions | undefined): { readonly timeZone?: string } =>
  options?.timeZone === undefined ? {} : { timeZone: options.timeZone };

function parse(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeText(target: Date, now: Date, language: AdminLanguage): string {
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const future = target.getTime() > now.getTime();
  const sign = future ? 1 : -1;
  const unit = future ? classifyRelativeTime(now, target) : classifyRelativeTime(target, now);

  switch (unit.kind) {
    case 'now':
      return formatter.format(0, 'second');
    case 'seconds':
      return formatter.format(sign * unit.value, 'second');
    case 'minutes':
      return formatter.format(sign * unit.value, 'minute');
    case 'hours':
      return formatter.format(sign * unit.value, 'hour');
    case 'days':
      return formatter.format(sign * unit.value, 'day');
    case 'weeks':
      return formatter.format(sign * unit.value, 'week');
    case 'months':
      return formatter.format(sign * unit.value, 'month');
    case 'date': {
      const days = Math.floor(Math.abs(target.getTime() - now.getTime()) / DAY_MS);
      return days < 365
        ? formatter.format(sign * Math.floor(days / 30), 'month')
        : formatter.format(sign * Math.floor(days / 365), 'year');
    }
  }
}

export function adminMomentOf(
  iso: string | null | undefined,
  now: Date,
  language: AdminLanguage,
  options?: AdminTimeOptions,
): AdminMoment | null {
  const date = parse(iso);
  if (date === null || iso === null || iso === undefined) return null;
  const zone = zoneOf(options);
  const day = new Intl.DateTimeFormat(language, { dateStyle: 'medium', ...zone }).format(date);
  const time = new Intl.DateTimeFormat(language, { timeStyle: 'short', ...zone }).format(date);
  return { iso, absolute: `${day}, ${time}`, relative: relativeText(date, now, language), date: day };
}

export function adminDate(iso: string | null | undefined, language: AdminLanguage, options?: AdminTimeOptions): string {
  const date = parse(iso);
  if (date === null) return NONE;
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', ...zoneOf(options) }).format(date);
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const dayFormatter = (language: AdminLanguage): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function adminDayLabel(day: string, language: AdminLanguage): string {
  const match = DAY_PATTERN.exec(day);
  if (match === null) return NONE;
  const [, year, month, date] = match;
  const instant = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));
  const roundTrips =
    instant.getUTCFullYear() === Number(year) && instant.getUTCMonth() === Number(month) - 1 && instant.getUTCDate() === Number(date);
  return roundTrips ? dayFormatter(language).format(instant) : NONE;
}

export function dayLabelsEndingToday(count: number, now: Date, language: AdminLanguage): readonly string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const formatter = dayFormatter(language);
  const length = Math.max(0, Math.floor(count));
  return Array.from({ length }, (_, index) => formatter.format(new Date(today - (length - 1 - index) * DAY_MS)));
}

export function hourLabel(hour: number, language: AdminLanguage): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return NONE;
  return new Intl.DateTimeFormat(language, { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour)));
}

/** 0 = dimanche, comme `Date.getDay()`. */
export function weekdayName(index: number, language: AdminLanguage): string {
  if (!Number.isInteger(index) || index < 0 || index > 6) return NONE;
  return new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + index)));
}

type DurationUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day';

function unitText(value: number, unit: DurationUnit, language: AdminLanguage, padded = false): string {
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 0,
    ...(padded ? { minimumIntegerDigits: 2 } : {}),
  }).format(value);
}

function secondsText(seconds: number, language: AdminLanguage): string {
  return new Intl.NumberFormat(language, { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 1 }).format(seconds);
}

const pair = (first: string, second: string, secondValue: number): string => (secondValue === 0 ? first : `${first} ${second}`);

export function formatDuration(value: number | null | undefined, unit: 'ms' | 's', language: AdminLanguage): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return NONE;
  const milliseconds = unit === 'ms' ? value : value * 1000;

  if (milliseconds < 1000) return unitText(Math.round(milliseconds), 'millisecond', language);
  if (milliseconds < 10_000) return secondsText(Math.round(milliseconds / 100) / 10, language);

  const total = Math.round(milliseconds / 1000);
  if (total < 60) return unitText(total, 'second', language);

  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return pair(unitText(minutes, 'minute', language), unitText(rest, 'second', language, true), rest);
  }

  if (total < 86_400) {
    const hours = Math.floor(total / 3600);
    const rest = Math.floor((total % 3600) / 60);
    return pair(unitText(hours, 'hour', language), unitText(rest, 'minute', language, true), rest);
  }

  const days = Math.floor(total / 86_400);
  const rest = Math.floor((total % 86_400) / 3600);
  return pair(unitText(days, 'day', language), unitText(rest, 'hour', language), rest);
}
