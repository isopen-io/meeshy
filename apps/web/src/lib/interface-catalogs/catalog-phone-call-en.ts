/**
 * « EN APPEL » (#18753, ACT-01), langue « en » — chargée à la demande (`i18n-phone-call-catalog.ts`), jamais au
 * démarrage.
 */
import type { PhoneCallCatalog } from '../i18n-phone-call-catalog';

const en = {
  'call.announce.started': '{name} is on a call',
  'call.announce.startedSomeone': 'Someone in your Blood is on a call',
  'call.announce.ended': '{name} hung up',
  'call.announce.endedSomeone': 'Someone in your Blood hung up',
  'call.detail.title': 'On a call',
  'call.detail.sinceTime': 'On a call since {time}',
  'call.detail.sinceMinutes': 'On a call for {count} min',
  'call.share.title': 'Show that I’m on a call',
  'call.share.explain': '{name} sees that you’re on a call, never with whom.',
  'call.share.globalOff': 'Turned off for everyone in your profile.',
  'call.global.short': 'Show my Blood when I’m on a call',
  'call.settings.failed': 'The setting couldn’t be saved.',
  'call.settings.offline': 'Offline: the setting wasn’t saved.',
} as const satisfies PhoneCallCatalog;

export default en;
