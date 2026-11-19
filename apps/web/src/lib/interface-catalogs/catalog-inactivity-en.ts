/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), langue « en » — chargée à la demande
 * (`i18n-inactivity-catalog.ts`), jamais au démarrage.
 */
import type { InactivityCatalog } from '../i18n-inactivity-catalog';

const en = {
  'inactivity.announce.alert': '{name} didn’t answer “Are you OK?”',
  'inactivity.announce.alertSomeone': 'Someone in your Blood didn’t answer “Are you OK?”',
  'inactivity.announce.responded': '{name} is OK',
  'inactivity.announce.respondedSomeone': 'Someone in your Blood is OK',
  'inactivity.detail.title': 'Inactivity',
  'inactivity.detail.since': 'No activity since {time}',
  'inactivity.detail.battery': 'Last battery: {value}',
  'inactivity.detail.map': 'Last location',
  'inactivity.share.title': 'Alert if I don’t answer',
  'inactivity.share.explain': 'If your phone stays inactive and you don’t answer “Are you OK?”, {name} is alerted.',
  'inactivity.global.title': 'Inactivity check',
  'inactivity.global.off': 'Off',
  'inactivity.global.hours': '{count} h',
  'inactivity.settings.failed': 'The setting couldn’t be saved.',
  'inactivity.settings.offline': 'Offline: the setting wasn’t saved.',
} as const satisfies InactivityCatalog;

export default en;
