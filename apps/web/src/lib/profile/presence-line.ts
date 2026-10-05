import { getUserPresenceStatus, type UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import type { ServedPresence } from '@/lib/api/public-profile';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PRÉSENCE SUR LA FICHE D'UN AMI** (#9063) — l'état de la pastille et la
 * ligne qui la date, miroir de `RelativeTimeFormatter.lastSeenString`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTimeFormatter.swift`) :
 * moins d'une minute ⇒ « En ligne », moins d'une heure ou le même jour ⇒
 * « Vu il y a X », puis hier, avant-hier, et la date — chacun avec l'heure.
 *
 * Elle ne décide pas QUI voit la présence : la passerelle l'a déjà tranché
 * (`resolvePresenceVisibility`). `null` servi ⇒ `null` rendu, et une personne
 * hors ligne dont la date est masquée (`showLastSeen` coupé) ne rend rien
 * non plus — un « hors ligne » sans date n'apprend rien que l'absence de
 * pastille ne dise déjà.
 *
 * Loi PURE : `now` est injecté par l'appelant.
 */
export type ProfilePresenceLine = {
  readonly status: UserPresenceStatus;
  readonly label: string | null;
};

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to) - startOfDay(from)) / (24 * ONE_HOUR_MS));

function lastSeenLabel(seen: Date, now: Date, language: InterfaceLanguage): string {
  const elapsed = now.getTime() - seen.getTime();
  if (elapsed < ONE_MINUTE_MS) return translate(language, 'userProfile.presence.online');
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
  if (elapsed < ONE_HOUR_MS) {
    return translate(language, 'userProfile.presence.seen', {
      ago: relative.format(-Math.floor(elapsed / ONE_MINUTE_MS), 'minute'),
    });
  }
  const days = calendarDaysBetween(seen, now);
  if (days <= 0) {
    return translate(language, 'userProfile.presence.seen', {
      ago: relative.format(-Math.floor(elapsed / ONE_HOUR_MS), 'hour'),
    });
  }
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(seen);
  if (days === 1) return translate(language, 'userProfile.presence.yesterdayAt', { time });
  if (days === 2) return translate(language, 'userProfile.presence.beforeYesterdayAt', { time });
  const date = new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    ...(seen.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
  }).format(seen);
  return translate(language, 'userProfile.presence.dateAt', { date, time });
}

export function profilePresenceLine(
  presence: ServedPresence | null,
  now: Date,
  language: InterfaceLanguage,
): ProfilePresenceLine | null {
  if (presence === null) return null;
  const status = getUserPresenceStatus(presence, now.getTime());
  if (status === 'online') return { status, label: translate(language, 'userProfile.presence.online') };
  if (presence.lastActiveAt === null) return null;
  return { status, label: lastSeenLabel(new Date(presence.lastActiveAt), now, language) };
}
