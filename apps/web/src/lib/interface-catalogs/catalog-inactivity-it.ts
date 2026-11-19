/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), langue « it » — chargée à la demande
 * (`i18n-inactivity-catalog.ts`), jamais au démarrage.
 */
import type { InactivityCatalog } from '../i18n-inactivity-catalog';

const it = {
  'inactivity.announce.alert': '{name} non ha risposto a «Tutto bene?»',
  'inactivity.announce.alertSomeone': 'Qualcuno del tuo Sangue non ha risposto a «Tutto bene?»',
  'inactivity.announce.responded': '{name} sta bene',
  'inactivity.announce.respondedSomeone': 'Qualcuno del tuo Sangue sta bene',
  'inactivity.detail.title': 'Inattività',
  'inactivity.detail.since': 'Nessuna attività dalle {time}',
  'inactivity.detail.battery': 'Ultima batteria: {value}',
  'inactivity.detail.map': 'Ultima posizione',
  'inactivity.share.title': 'Avvisa se non rispondo',
  'inactivity.share.explain': 'Se il tuo telefono resta inattivo e non rispondi a «Tutto bene?», {name} viene avvisato.',
  'inactivity.global.title': 'Controllo di inattività',
  'inactivity.global.off': 'Disattivato',
  'inactivity.global.hours': '{count} h',
  'inactivity.settings.failed': 'Impossibile salvare l’impostazione.',
  'inactivity.settings.offline': 'Offline: l’impostazione non è stata salvata.',
} as const satisfies InactivityCatalog;

export default it;
