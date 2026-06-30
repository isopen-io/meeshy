import { calendarDayDiff } from '@meeshy/shared/utils/calendar-date';

type Translate = (key: string, params?: Record<string, unknown>) => string;

export type FormatPresenceLabelOptions = {
  lastActiveAt: Date | string | number;
  isOnline?: boolean | null;
  t: Translate;
  locale?: string;
  now?: number;
};

/**
 * Libellé de présence affiché après le pseudo (« En ligne » / « Vu il y a X » /
 * « Vu hier à HH:mm » …). Heure exacte sur les formats absolus (>24 h).
 * Contrat partagé avec iOS (RelativeTimeFormatter.lastSeenString).
 *
 * @see docs/superpowers/specs/2026-06-30-profile-last-seen-visibility-design.md
 */
export function formatPresenceLabel(o: FormatPresenceLabelOptions): string {
  const lastMs = new Date(o.lastActiveAt).getTime();
  const nowMs = o.now ?? Date.now();
  const minutesAgo = (nowMs - lastMs) / 60_000;

  if (minutesAgo < 1) return o.t('status.online');
  if (minutesAgo < 60) return o.t('status.lastSeenMinutes', { count: Math.floor(minutesAgo) });

  const hoursAgo = minutesAgo / 60;
  if (hoursAgo < 24) return o.t('status.lastSeenHours', { count: Math.floor(hoursAgo) });

  const time = new Date(lastMs).toLocaleTimeString(o.locale, { hour: '2-digit', minute: '2-digit' });
  const dayDiff = calendarDayDiff(lastMs, nowMs);
  if (dayDiff === 1) return o.t('status.lastSeenYesterday', { time });
  if (dayDiff === 2) return o.t('status.lastSeenBeforeYesterday', { time });

  const date = new Date(lastMs).toLocaleDateString(o.locale);
  return o.t('status.lastSeenDateTime', { date, time });
}

const PRESENCE_COLORS = {
  fresh: 'text-green-600 dark:text-green-400',
  recent: 'text-orange-500 dark:text-orange-400',
  stale: 'text-gray-500 dark:text-gray-400',
} as const;

/**
 * Couleur du libellé selon l'ancienneté : vert < 5 min, orange < 30 min, gris sinon.
 */
export function presenceColorClass(
  lastActiveAt: Date | string | number,
  _isOnline?: boolean | null,
  now?: number,
): string {
  const minutesAgo = ((now ?? Date.now()) - new Date(lastActiveAt).getTime()) / 60_000;
  if (minutesAgo < 5) return PRESENCE_COLORS.fresh;
  if (minutesAgo < 30) return PRESENCE_COLORS.recent;
  return PRESENCE_COLORS.stale;
}
