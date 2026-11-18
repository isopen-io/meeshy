import type { PhoneReachabilityAnnouncement, PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';

import { translatePhoneReachability, type PhoneReachabilityCatalogKey } from '@/lib/i18n-phone-reachability-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { localSinceText, type ClockOptions } from '@/lib/view/local-since';

/**
 * **CE QUE LE TÉLÉPHONE INJOIGNABLE DIT** (#18737, TEL-01) — lois pures : l'heure « depuis » à l'horloge LOCALE du
 * lecteur (le jour en plus quand ce n'est pas aujourd'hui), la phrase de la pastille, le glyphe de l'avatar et le
 * détail de la fiche. La CAUSE est celle que le serveur a déduite : ce module ne rejuge rien, il NOMME. Il lit le
 * catalogue du téléphone injoignable, que l'appelant a chargé (`usePhoneReachabilityCatalog`).
 */

export type { ClockOptions };

/** « 14:10 » aujourd'hui ; « lundi 14:10 » dans la semaine ; « 3 novembre 14:10 » au-delà (`localSinceText`). */
export const phoneSinceText = localSinceText;

/**
 * La phrase d'une annonce de la pastille. `since` : l'instant du dernier signe de vie, porté par l'état servi avec
 * l'annonce ; à défaut, l'instant de l'annonce elle-même.
 */
export function phoneReachabilityAnnouncementText(
  language: InterfaceLanguage,
  {
    name,
    announcement,
    since,
    ...clock
  }: { readonly name: string | null; readonly announcement: PhoneReachabilityAnnouncement; readonly since: string | null } & ClockOptions,
): string {
  if (announcement.kind === 'reachable') {
    return name === null ? translatePhoneReachability(language, 'phone.announce.reachableSomeone') : translatePhoneReachability(language, 'phone.announce.reachable', { name });
  }
  const time = phoneSinceText(language, since ?? announcement.at, clock);
  return name === null
    ? translatePhoneReachability(language, 'phone.announce.unreachableSomeone', { time })
    : translatePhoneReachability(language, 'phone.announce.unreachable', { name, time });
}

export type PhoneUnreachableBadge = {
  /** Ce que le lecteur d'écran entend avec le nom de la personne. */
  readonly spoken: string;
};

export function phoneUnreachableBadgeOf(state: PhoneReachabilityState, language: InterfaceLanguage, clock: ClockOptions): PhoneUnreachableBadge {
  return { spoken: translatePhoneReachability(language, 'phone.a11y.unreachable', { time: phoneSinceText(language, state.unreachableSince, clock) }) };
}

const CAUSE = {
  battery: 'phone.cause.battery',
  network: 'phone.cause.network',
} as const satisfies Readonly<Record<Exclude<PhoneReachabilityState['cause'], 'unknown'>, PhoneReachabilityCatalogKey>>;

export type PhoneReachabilityDetail = {
  /** « Téléphone injoignable depuis 14:10 ». */
  readonly headline: string;
  /** La cause probable ; nulle quand le serveur en a servi une que ce client ne connaît pas. */
  readonly cause: string | null;
};

export function phoneReachabilityDetailOf(state: PhoneReachabilityState, language: InterfaceLanguage, clock: ClockOptions): PhoneReachabilityDetail {
  return {
    headline: translatePhoneReachability(language, 'phone.detail.since', { time: phoneSinceText(language, state.unreachableSince, clock) }),
    cause: state.cause === 'unknown' ? null : translatePhoneReachability(language, CAUSE[state.cause]),
  };
}
