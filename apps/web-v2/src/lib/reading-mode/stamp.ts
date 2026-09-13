/**
 * LE TAMPON DE LA RANGÉE ÉLUE (#5648) — port de
 * `Main/Focal/Core/FocalFocusTimestamp.label` (`apps/ios/...`, :22-59) :
 * « Aujourd'hui 12:45 », « Hier 18:45 », « Avant-hier 12:45 », le nom du
 * jour jusqu'à `WEEKDAY_WINDOW_DAYS` (6) jours, puis la date abrégée
 * (« Ven. 14 août · 14:41 »), avec l'année si elle diffère de `now`.
 *
 * Loi PURE : `now` est INJECTÉ, jamais lu ici (`new Date()` n'apparaît pas
 * dans ce fichier). Les mots « Aujourd'hui »/« Hier »/« Avant-hier » sont
 * des PARAMÈTRES à défaut français, jamais recalculés depuis
 * `grouping.dayLabel` — la même règle que `FocalFocusTimestamp.label`
 * (« today »/« yesterday »/« dayBeforeYesterday » injectés par l'appelant,
 * §`test_localizedWords_areInjected_neverHardcodedByTheCaller`).
 *
 * `locale` est un PARAMÈTRE — jamais `'fr-FR'` en dur (D-21 condition 3
 * réserve ce nettoyage pour `grouping.ts`, non touché par ce lot) :
 * l'appelant passe `READER_LANGUAGES[0]`.
 */

/** `FocalFocusTimestamp.weekdayWindowDays`. */
export const WEEKDAY_WINDOW_DAYS = 6;

/**
 * Différence de JOURS CALENDAIRES en LOCAL — même convention que
 * `grouping.sameLocalDay`/`dayLabel` (comparaison des composants de date
 * locaux, pas une division d'epoch qui glisserait sur un changement
 * d'heure).
 */
const calendarDaysDiff = (sentAt: Date, now: Date): number =>
  Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(sentAt.getFullYear(), sentAt.getMonth(), sentAt.getDate()).getTime()) /
      86_400_000,
  );

const capitalize = (text: string, locale: string): string =>
  text.length === 0 ? text : text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

export function focusStampLabel({
  sentAt,
  now,
  timeString,
  locale,
  today = "Aujourd'hui",
  yesterday = 'Hier',
  dayBeforeYesterday = 'Avant-hier',
}: {
  readonly sentAt: Date;
  readonly now: Date;
  readonly timeString: string;
  readonly locale: string;
  readonly today?: string;
  readonly yesterday?: string;
  readonly dayBeforeYesterday?: string;
}): string {
  const daysDiff = calendarDaysDiff(sentAt, now);

  if (daysDiff <= 0) return `${today} ${timeString}`;
  if (daysDiff === 1) return `${yesterday} ${timeString}`;
  if (daysDiff === 2) return `${dayBeforeYesterday} ${timeString}`;
  if (daysDiff <= WEEKDAY_WINDOW_DAYS) {
    const weekday = capitalize(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(sentAt), locale);
    return `${weekday} ${timeString}`;
  }

  const sameYear = sentAt.getFullYear() === now.getFullYear();
  const date = capitalize(
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(sentAt),
    locale,
  );
  return `${date} · ${timeString}`;
}
