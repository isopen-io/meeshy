/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), langue « de » — chargée à la demande
 * (`i18n-inactivity-catalog.ts`), jamais au démarrage.
 */
import type { InactivityCatalog } from '../i18n-inactivity-catalog';

const de = {
  'inactivity.announce.alert': '{name} hat auf „Alles in Ordnung?“ nicht geantwortet',
  'inactivity.announce.alertSomeone': 'Jemand aus deinem Blut hat auf „Alles in Ordnung?“ nicht geantwortet',
  'inactivity.announce.responded': '{name} geht es gut',
  'inactivity.announce.respondedSomeone': 'Jemandem aus deinem Blut geht es gut',
  'inactivity.detail.title': 'Inaktivität',
  'inactivity.detail.since': 'Keine Aktivität seit {time}',
  'inactivity.detail.battery': 'Letzter Akkustand: {value}',
  'inactivity.detail.map': 'Letzter Standort',
  'inactivity.share.title': 'Benachrichtigen, wenn ich nicht antworte',
  'inactivity.share.explain': 'Bleibt dein Handy inaktiv und antwortest du nicht auf „Alles in Ordnung?“, wird {name} benachrichtigt.',
  'inactivity.global.title': 'Inaktivitätsprüfung',
  'inactivity.global.off': 'Aus',
  'inactivity.global.hours': '{count} Std.',
  'inactivity.settings.failed': 'Die Einstellung konnte nicht gespeichert werden.',
  'inactivity.settings.offline': 'Offline: Die Einstellung wurde nicht gespeichert.',
} as const satisfies InactivityCatalog;

export default de;
