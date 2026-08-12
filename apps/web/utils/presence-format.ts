import { calendarDayDiff } from '@meeshy/shared/utils/calendar-date';
import { getUserPresenceStatus, presenceTone } from '@meeshy/shared/utils/user-presence';
import { PRESENCE_TEXT_CLASS } from '@/lib/user-status';

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

  // Le libellé « En ligne » suit la règle canonique (source de vérité partagée),
  // pas un seuil local : ainsi il s'accorde toujours avec `presenceColorClass`.
  // `isOnline === true` est autoritatif dans la fenêtre away (backend gardé contre
  // les données périmées), sinon online = activité < 60 s.
  if (getUserPresenceStatus({ isOnline: o.isOnline, lastActiveAt: o.lastActiveAt }, nowMs) === 'online') {
    return o.t('status.online');
  }

  const minutesAgo = (nowMs - lastMs) / 60_000;
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

export type FormatLastSeenLabelOptions = {
  lastActiveAt?: Date | string | number | null;
  isOnline?: boolean | null;
  t: Translate;
  locale?: string;
  now?: number;
};

/**
 * Variante tolérante de `formatPresenceLabel` pour les surfaces liste (contacts)
 * où `lastActiveAt` peut être absent ou illisible.
 *
 * - `lastActiveAt` absent (`null`/`undefined`) → `status.online` si la règle de
 *   présence canonique classe l'utilisateur en ligne (backend `isOnline`
 *   autoritatif), sinon `status.neverSeen`.
 * - `lastActiveAt` illisible (`NaN`) → `status.offline`.
 * - sinon → délègue à `formatPresenceLabel` (règle 1/3/5 partagée, math de jour
 *   calendaire, heure exacte) — donc le libellé s'accorde toujours avec la
 *   pastille de présence (`getUserPresenceStatus`).
 *
 * Remplace les copies locales divergentes qui testaient le `isOnline` brut et
 * calculaient les jours en fenêtres de 24 h écoulées (off-by-one, DST-unsafe,
 * heure perdue au-delà de 24 h).
 */
export function formatLastSeenLabel(o: FormatLastSeenLabelOptions): string {
  if (o.lastActiveAt === null || o.lastActiveAt === undefined) {
    const online =
      getUserPresenceStatus({ isOnline: o.isOnline }, o.now ?? Date.now()) === 'online';
    return o.t(online ? 'status.online' : 'status.neverSeen');
  }

  if (Number.isNaN(new Date(o.lastActiveAt).getTime())) {
    return o.t('status.offline');
  }

  return formatPresenceLabel({
    lastActiveAt: o.lastActiveAt,
    isOnline: o.isOnline,
    t: o.t,
    locale: o.locale,
    now: o.now,
  });
}

/**
 * Couleur du libellé selon la règle de présence canonique 1/3/5 : vert online,
 * orange en absence courte (away), gris inactif (idle) et hors ligne. Délègue
 * le calcul d'état à `getUserPresenceStatus` (source de vérité partagée) et
 * le mapping couleur à `PRESENCE_TEXT_CLASS` (mapping central web).
 */
export function presenceColorClass(
  lastActiveAt: Date | string | number,
  isOnline?: boolean | null,
  now?: number,
): string {
  const status = getUserPresenceStatus({ isOnline, lastActiveAt }, now ?? Date.now());
  return PRESENCE_TEXT_CLASS[presenceTone(status)];
}
