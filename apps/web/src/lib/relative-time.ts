/**
 * L'HEURE RELATIVE COURTE DE LA LENTILLE — miroir de
 * `packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTime.swift`
 * (`RelativeTime.classify`) et de `RelativeTimeFormatter.shortString`
 * (`RelativeTimeFormatter.swift:47-63`).
 *
 * Loi PURE : `now` est TOUJOURS injecté par l'appelant (jamais `Date.now()`
 * lu ici) — même discipline que `conversation-sections.ts` et `lens/law.ts`.
 * Les libellés d'UNITÉ suivent la LANGUE D'INTERFACE (#10822, une seule
 * langue d'interface) avec les valeurs du catalogue iOS (`time.short.*`,
 * `apps/ios/Meeshy/Localizable.xcstrings`). La table vit ici, synchrone, parce
 * que ces libellés se composent dans des lois pures (Lentille, fil, citations)
 * appelées hors de tout écran ; la date ABSOLUE (au-delà de trois mois) suit
 * `Intl.DateTimeFormat`, le même levier que `Locale.current` côté Swift.
 */
import { resolveInterfaceLanguageCode } from './inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage, type InterfaceLanguage } from './interface-language';

type ShortUnits = {
  readonly now: string;
  readonly seconds: (n: number) => string;
  readonly minutes: (n: number) => string;
  readonly hours: (n: number) => string;
  readonly days: (n: number) => string;
  readonly weeks: (n: number) => string;
  readonly months: (n: number) => string;
};

const SHORT_UNITS: Readonly<Record<InterfaceLanguage, ShortUnits>> = {
  fr: { now: 'maintenant', seconds: (n) => `${n}s`, minutes: (n) => `${n} min`, hours: (n) => `${n}h`, days: (n) => `${n}j`, weeks: (n) => `${n}sem`, months: (n) => `${n} mois` },
  en: { now: 'now', seconds: (n) => `${n}s`, minutes: (n) => `${n} min`, hours: (n) => `${n}h`, days: (n) => `${n}d`, weeks: (n) => `${n}w`, months: (n) => `${n}mo` },
  es: { now: 'ahora', seconds: (n) => `${n}s`, minutes: (n) => `${n} min`, hours: (n) => `${n}h`, days: (n) => `${n}d`, weeks: (n) => `${n}sem`, months: (n) => `${n}m` },
  pt: { now: 'agora', seconds: (n) => `${n}s`, minutes: (n) => `${n} min`, hours: (n) => `${n}h`, days: (n) => `${n}d`, weeks: (n) => `${n}sem`, months: (n) => `${n}m` },
  de: { now: 'jetzt', seconds: (n) => `${n} Sek.`, minutes: (n) => `${n} Min.`, hours: (n) => `${n} Std.`, days: (n) => `${n} T.`, weeks: (n) => `${n} Wo.`, months: (n) => `${n} Mon.` },
  it: { now: 'adesso', seconds: (n) => `${n}s`, minutes: (n) => `${n} min`, hours: (n) => `${n}h`, days: (n) => `${n}g`, weeks: (n) => `${n}sett`, months: (n) => `${n} mesi` },
  ar: { now: 'الآن', seconds: (n) => `${n} ث`, minutes: (n) => `${n} د`, hours: (n) => `${n} س`, days: (n) => `${n} ي`, weeks: (n) => `${n} أ`, months: (n) => `${n} ش` },
};

/** `en-US` → `en`, `pt-BR` → `pt` ; une langue hors des sept → la langue par défaut. */
export function interfaceLanguageOf(locale: string): InterfaceLanguage {
  return resolveInterfaceLanguageCode(null, [locale]) as InterfaceLanguage;
}

export type RelativeTimeUnit =
  | { readonly kind: 'now' }
  | { readonly kind: 'seconds'; readonly value: number }
  | { readonly kind: 'minutes'; readonly value: number }
  | { readonly kind: 'hours'; readonly value: number }
  | { readonly kind: 'days'; readonly value: number }
  | { readonly kind: 'weeks'; readonly value: number }
  | { readonly kind: 'months'; readonly value: number }
  | { readonly kind: 'date'; readonly value: Date };

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `RelativeTime.classify` (`RelativeTime.swift:27-35`) : l'échelle vit ICI,
 * jamais recopiée dans `shortRelativeTime` — un futur style `.long` (miroir
 * `RelativeTimeFormatter.longString`) la réutiliserait telle quelle.
 *
 * Un écart NÉGATIF (horloge en avance, message dont l'estampille est dans le
 * futur) tombe dans `.now` — jamais un compte négatif absurde (§ Swift
 * `RelativeTime.swift:26`).
 */
export function classifyRelativeTime(target: Date, now: Date): RelativeTimeUnit {
  const seconds = Math.floor((now.getTime() - target.getTime()) / 1000);
  if (seconds < 30) return { kind: 'now' };
  if (seconds < MINUTE) return { kind: 'seconds', value: seconds };
  if (seconds < HOUR) return { kind: 'minutes', value: Math.floor(seconds / MINUTE) };
  if (seconds < DAY) return { kind: 'hours', value: Math.floor(seconds / HOUR) };
  const days = Math.floor(seconds / DAY);
  if (days < 7) return { kind: 'days', value: days };
  if (days < 30) return { kind: 'weeks', value: Math.floor(days / 7) };
  if (days < 90) return { kind: 'months', value: Math.floor(days / 30) };
  return { kind: 'date', value: target };
}

/**
 * `relativeTimeTicks` — LE LIBELLÉ PEUT-IL ENCORE CHANGER À LA MINUTE ?
 *
 * Miroir du portillon `liveTickWindow` de `LentilleRowTimestamp`
 * (`LentilleConversationRow.swift:861-869` : au-delà d'une heure, iOS rend un
 * `Text` STATIQUE au lieu d'un `TimelineView(.periodic(by: 60))`). La réponse
 * se DÉDUIT de l'échelle ci-dessus plutôt que de reposer un seuil de 3 600 s
 * à côté d'elle : seuls les trois premiers barreaux changent d'une minute à
 * l'autre. Une jumelle numérique de la borne dériverait le jour où l'échelle
 * bouge, sans qu'aucun témoin ne rougisse.
 */
export function relativeTimeTicks(target: Date, now: Date): boolean {
  const { kind } = classifyRelativeTime(target, now);
  return kind === 'now' || kind === 'seconds' || kind === 'minutes';
}

/**
 * La date ABSOLUE, passé le seuil de trois mois — `d MMM` (même année) ou
 * `d MMM yyyy` (année différente), localisée par `Intl.DateTimeFormat`, le
 * même levier que `Locale.current` côté `AbsoluteDateFormatterBox.swift`.
 */
function absoluteDate(target: Date, now: Date, locale: string): string {
  const sameYear = target.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  }).format(target);
}

/**
 * `shortRelativeTime` — dense, pour la Lentille : « maintenant » / « 45s » /
 * « 5 min » / « 2h » / « 3j » / « 2sem » / « 2 mois » / date absolue (en
 * français ; « now » / « 3d » / « 2w » / « 2mo » en anglais…). `locale` est
 * la langue d'INTERFACE : elle pilote les unités ET la date absolue.
 */
export function shortRelativeTime(target: Date, now: Date, locale: string = currentInterfaceLanguage()): string {
  const unit = classifyRelativeTime(target, now);
  const units = SHORT_UNITS[interfaceLanguageOf(locale)];
  switch (unit.kind) {
    case 'now':
      return units.now;
    case 'seconds':
      return units.seconds(unit.value);
    case 'minutes':
      return units.minutes(unit.value);
    case 'hours':
      return units.hours(unit.value);
    case 'days':
      return units.days(unit.value);
    case 'weeks':
      return units.weeks(unit.value);
    case 'months':
      return units.months(unit.value);
    case 'date':
      return absoluteDate(unit.value, now, locale);
  }
}
