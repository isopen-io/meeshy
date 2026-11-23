import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **L'HEURE DE LA DERNIÈRE POSITION CONNUE** (#20242, iso `ProfileWhereStamp.swift`) — « à l'instant » sous la minute,
 * « il y a N min » sous l'heure, puis « à HH:mm » (avec la date un autre jour). Une horloge en avance se lit « à
 * l'instant » ; un instant illisible ne se dit pas. Le catalogue des cercles est chargé par l'appelant.
 */
export type WhereStamp = { readonly kind: 'just-now' } | { readonly kind: 'minutes'; readonly minutes: number } | { readonly kind: 'at'; readonly at: number };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function whereStampOf(instant: string, now: number): WhereStamp | null {
  const at = Date.parse(instant);
  if (!Number.isFinite(at)) return null;
  const elapsed = now - at;
  if (elapsed < MINUTE_MS) return { kind: 'just-now' };
  if (elapsed < HOUR_MS) return { kind: 'minutes', minutes: Math.floor(elapsed / MINUTE_MS) };
  return { kind: 'at', at };
}

const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();

const clockText = (language: InterfaceLanguage, at: number, now: number): string =>
  new Intl.DateTimeFormat(language, sameDay(at, now) ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at);

export function whereStampText(language: InterfaceLanguage, stamp: WhereStamp, now: number): string {
  if (stamp.kind === 'just-now') return translateCircles(language, 'positions.where.justNow');
  if (stamp.kind === 'minutes') return translateCircles(language, 'positions.where.minutes', { n: String(stamp.minutes) });
  return translateCircles(language, 'positions.where.at', { time: clockText(language, stamp.at, now) });
}

/** « Dernière position · il y a 7 min » ; sans instant, le seul libellé. */
export function whereCaption(language: InterfaceLanguage, stamp: WhereStamp | null, now: number): string {
  const lead = translateCircles(language, 'positions.where.lastKnown');
  return stamp === null ? lead : `${lead} · ${whereStampText(language, stamp, now)}`;
}
