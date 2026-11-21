import type { PhoneCallAnnouncement, PhoneCallState } from '@meeshy/shared/types/phone-call';

import { translatePhoneCall } from '@/lib/i18n-phone-call-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { localSinceText, type ClockOptions } from '@/lib/view/local-since';

/**
 * **CE QU'« EN APPEL » DIT** (#18753, ACT-01) — lois pures. Le début servi est déjà arrondi à 5 minutes par la
 * passerelle ; ce module ne fait que le NOMMER : « En appel depuis 12 min » tant que l'appel a moins d'une heure (la
 * durée se lit mieux qu'une heure proche), puis « En appel depuis 14:00 » à l'horloge LOCALE du lecteur
 * (`localSinceText`). Jamais d'interlocuteur : l'état n'en porte pas. Le catalogue est chargé par l'appelant
 * (`usePhoneCallCatalog`).
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function phoneCallHeadline(state: Pick<PhoneCallState, 'since'>, language: InterfaceLanguage, clock: ClockOptions): string {
  const elapsed = clock.now - Date.parse(state.since);
  if (elapsed < HOUR_MS) return translatePhoneCall(language, 'call.detail.sinceMinutes', { count: String(Math.max(1, Math.floor(elapsed / MINUTE_MS))) });
  return translatePhoneCall(language, 'call.detail.sinceTime', { time: localSinceText(language, state.since, clock) });
}

/** La phrase d'une annonce de la pastille : « Jacques est en appel », « Jacques a raccroché ». */
export function phoneCallAnnouncementText(language: InterfaceLanguage, { name, announcement }: { readonly name: string | null; readonly announcement: PhoneCallAnnouncement }): string {
  if (announcement.kind === 'ended') {
    return name === null ? translatePhoneCall(language, 'call.announce.endedSomeone') : translatePhoneCall(language, 'call.announce.ended', { name });
  }
  return name === null ? translatePhoneCall(language, 'call.announce.startedSomeone') : translatePhoneCall(language, 'call.announce.started', { name });
}
