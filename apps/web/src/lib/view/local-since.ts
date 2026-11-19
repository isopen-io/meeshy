import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **« DEPUIS QUAND », À L'HORLOGE DU LECTEUR** (#18737, #18738) — l'heure d'un état d'appareil servi (téléphone
 * injoignable, aucune activité) : « 14:10 » aujourd'hui, « lundi 14:10 » dans la semaine, « 3 novembre 14:10 »
 * au-delà. UNE loi, que le téléphone injoignable et la vérification d'inactivité partagent.
 */

/** `timeZone` absent : le fuseau du lecteur. Un témoin l'épingle pour ne pas dépendre du poste. */
export type ClockOptions = { readonly now: number; readonly timeZone?: string };

const DAY_MS = 86_400_000;

const zoned = (timeZone: string | undefined) => (timeZone === undefined ? {} : { timeZone });

const dayOf = (language: InterfaceLanguage, at: number, timeZone: string | undefined): string =>
  new Intl.DateTimeFormat(language, { year: 'numeric', month: '2-digit', day: '2-digit', ...zoned(timeZone) }).format(at);

export function localSinceText(language: InterfaceLanguage, since: string, { now, timeZone }: ClockOptions): string {
  const at = Date.parse(since);
  const time = { hour: '2-digit', minute: '2-digit', ...zoned(timeZone) } as const;
  if (dayOf(language, at, timeZone) === dayOf(language, now, timeZone)) return new Intl.DateTimeFormat(language, time).format(at);
  const day = now - at < 6 * DAY_MS ? ({ weekday: 'long' } as const) : ({ day: 'numeric', month: 'long' } as const);
  return new Intl.DateTimeFormat(language, { ...day, ...time }).format(at);
}
