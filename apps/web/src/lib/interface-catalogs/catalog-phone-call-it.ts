/**
 * « EN APPEL » (#18753, ACT-01), langue « it » — chargée à la demande (`i18n-phone-call-catalog.ts`), jamais au
 * démarrage.
 */
import type { PhoneCallCatalog } from '../i18n-phone-call-catalog';

const it = {
  'call.announce.started': '{name} è al telefono',
  'call.announce.startedSomeone': 'Qualcuno del tuo Sangue è al telefono',
  'call.announce.ended': '{name} ha riattaccato',
  'call.announce.endedSomeone': 'Qualcuno del tuo Sangue ha riattaccato',
  'call.detail.title': 'Al telefono',
  'call.detail.sinceTime': 'Al telefono dalle {time}',
  'call.detail.sinceMinutes': 'Al telefono da {count} min',
  'call.share.title': 'Mostra che sono al telefono',
  'call.share.explain': '{name} vede che sei al telefono, mai con chi.',
  'call.share.globalOff': 'Disattivato per tutti nel tuo profilo.',
  'call.global.short': 'Mostra al mio Sangue che sono al telefono',
  'call.settings.failed': 'Non è stato possibile salvare l’impostazione.',
  'call.settings.offline': 'Offline: l’impostazione non è stata salvata.',
} as const satisfies PhoneCallCatalog;

export default it;
