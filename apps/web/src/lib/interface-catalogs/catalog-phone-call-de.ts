/**
 * « EN APPEL » (#18753, ACT-01), langue « de » — chargée à la demande (`i18n-phone-call-catalog.ts`), jamais au
 * démarrage.
 */
import type { PhoneCallCatalog } from '../i18n-phone-call-catalog';

const de = {
  'call.announce.started': '{name} telefoniert',
  'call.announce.startedSomeone': 'Jemand aus deinem Blut telefoniert',
  'call.announce.ended': '{name} hat aufgelegt',
  'call.announce.endedSomeone': 'Jemand aus deinem Blut hat aufgelegt',
  'call.detail.title': 'Im Gespräch',
  'call.detail.sinceTime': 'Im Gespräch seit {time}',
  'call.detail.sinceMinutes': 'Im Gespräch seit {count} Min.',
  'call.share.title': 'Zeigen, dass ich telefoniere',
  'call.share.explain': '{name} sieht, dass du telefonierst, nie mit wem.',
  'call.share.globalOff': 'In deinem Profil für alle ausgeschaltet.',
  'call.global.short': 'Meinem Blut zeigen, dass ich telefoniere',
  'call.settings.failed': 'Die Einstellung konnte nicht gespeichert werden.',
  'call.settings.offline': 'Offline: Die Einstellung wurde nicht gespeichert.',
} as const satisfies PhoneCallCatalog;

export default de;
