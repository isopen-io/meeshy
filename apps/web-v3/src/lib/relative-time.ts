/**
 * L'HEURE RELATIVE COURTE DE LA LENTILLE — miroir de
 * `packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTime.swift`
 * (`RelativeTime.classify`) et de `RelativeTimeFormatter.shortString`
 * (`RelativeTimeFormatter.swift:47-63`).
 *
 * Loi PURE : `now` est TOUJOURS injecté par l'appelant (jamais `Date.now()`
 * lu ici) — même discipline que `conversation-sections.ts` et `lens/law.ts`.
 * Les libellés d'UNITÉ (`s`, `min`, `h`, `j`, `sem`, `mois`, `maintenant`)
 * sont la prose FRANÇAISE fixe du dépôt (D-13) — iOS les tire d'un catalogue
 * dont le `defaultValue` français est CE texte ; la v3.1 n'a pas encore de
 * catalogue de traduction pour son chrome (`docs/product` § i18n), donc rien
 * ne serait gagné à réinventer une clé qu'aucun catalogue ne résout encore.
 * Seule la date ABSOLUE (au-delà de trois mois) suit la locale du lecteur,
 * via `Intl.DateTimeFormat` — le même levier que `Locale.current` côté Swift.
 */

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
 * « 5 min » / « 2h » / « 3j » / « 2sem » / « 2 mois » / date absolue.
 * `locale` ne pilote QUE la date absolue (miroir `Locale.current`) — les
 * libellés d'unité restent la prose française fixe du dépôt.
 */
export function shortRelativeTime(target: Date, now: Date, locale = 'fr-FR'): string {
  const unit = classifyRelativeTime(target, now);
  switch (unit.kind) {
    case 'now':
      return 'maintenant';
    case 'seconds':
      return `${unit.value}s`;
    case 'minutes':
      return `${unit.value} min`;
    case 'hours':
      return `${unit.value}h`;
    case 'days':
      return `${unit.value}j`;
    case 'weeks':
      return `${unit.value}sem`;
    case 'months':
      return `${unit.value} mois`;
    case 'date':
      return absoluteDate(unit.value, now, locale);
  }
}
