import type { InactivityAlertState, InactivityAnnouncement, InactivityDelayHours } from '@meeshy/shared/types/inactivity-check';

import { translateInactivity } from '@/lib/i18n-inactivity-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { localSinceText, type ClockOptions } from '@/lib/view/local-since';

/**
 * **CE QUE LA VÉRIFICATION D'INACTIVITÉ DIT** (#18738, TEL-02) — lois pures : « Aucune activité depuis 8:00 » à
 * l'horloge LOCALE du lecteur, la dernière batterie et la dernière position SEULEMENT quand le serveur les a
 * servies (il a jugé ce que ce Sang reçoit déjà), la phrase de la pastille et le libellé d'un délai. Ce module lit
 * le catalogue de l'inactivité, que l'appelant a chargé (`useInactivityCatalog`). Jamais un message de conversation.
 */

export type InactivityPosition = { readonly latitude: number; readonly longitude: number; readonly label: string };

export type InactivityDetail = {
  /** « Aucune activité depuis 08:00 ». */
  readonly headline: string;
  /** « Dernière batterie : 9 % » ; nulle quand elle n'est pas servie. */
  readonly battery: string | null;
  /** De quoi ouvrir la carte ; nulle quand la position n'est pas servie. */
  readonly position: InactivityPosition | null;
};

export function inactivityHeadline(state: InactivityAlertState, language: InterfaceLanguage, clock: ClockOptions): string {
  return translateInactivity(language, 'inactivity.detail.since', { time: localSinceText(language, state.inactiveSince, clock) });
}

const percentOf = (language: InterfaceLanguage, level: number): string => new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(level / 100);

export function inactivityDetailOf(state: InactivityAlertState, language: InterfaceLanguage, clock: ClockOptions): InactivityDetail {
  const { lastBattery, lastPosition } = state;
  return {
    headline: inactivityHeadline(state, language, clock),
    battery: lastBattery === undefined ? null : translateInactivity(language, 'inactivity.detail.battery', { value: percentOf(language, lastBattery.level) }),
    position:
      lastPosition === undefined
        ? null
        : { latitude: lastPosition.latitude, longitude: lastPosition.longitude, label: translateInactivity(language, 'inactivity.detail.map') },
  };
}

/** La phrase d'une annonce de la pastille : l'alerte, ou le retour. */
export function inactivityAnnouncementText(language: InterfaceLanguage, { name, announcement }: { readonly name: string | null; readonly announcement: InactivityAnnouncement }): string {
  if (announcement.kind === 'responded') {
    return name === null ? translateInactivity(language, 'inactivity.announce.respondedSomeone') : translateInactivity(language, 'inactivity.announce.responded', { name });
  }
  return name === null ? translateInactivity(language, 'inactivity.announce.alertSomeone') : translateInactivity(language, 'inactivity.announce.alert', { name });
}

/** « 6 h », « 12 h », « 24 h » ou « Désactivée ». */
export function inactivityDelayLabel(language: InterfaceLanguage, delay: InactivityDelayHours | null): string {
  return delay === null ? translateInactivity(language, 'inactivity.global.off') : translateInactivity(language, 'inactivity.global.hours', { count: String(delay) });
}
