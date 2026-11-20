/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), langue « de » — chargée à la demande (`i18n-fall-catalog.ts`), jamais au
 * démarrage.
 */
import type { FallCatalog } from '../i18n-fall-catalog';

const de = {
  'fall.announce.detected': 'Auf der Uhr von {name} wurde ein Sturz erkannt',
  'fall.announce.detectedSomeone': 'Auf der Uhr eines Blut-Kontakts wurde ein Sturz erkannt',
  'fall.announce.responded': '{name} geht es gut',
  'fall.announce.respondedSomeone': 'Einem Blut-Kontakt geht es gut',
  'fall.detail.title': 'Sturz erkannt',
  'fall.detail.at': 'Sturz erkannt um {time}',
  'fall.detail.battery': 'Letzter Akkustand: {value}',
  'fall.detail.map': 'Letzter Standort',
  'fall.share.title': 'Benachrichtigen, wenn meine Uhr einen Sturz erkennt',
  'fall.share.explain': 'Erkennt deine Apple Watch einen Sturz, wird {name} sofort benachrichtigt.',
  'fall.me.title': 'Sturzerkennung',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': 'Woher kommt die Erkennung?',
  'fall.me.explain': 'Sie kommt von einer Apple Watch: Die Einwilligung erfolgt in der iPhone-App, nie hier. Deine Blut-Kontakte werden dann bei einem Sturz benachrichtigt.',
  'fall.settings.failed': 'Die Einstellung konnte nicht gespeichert werden.',
  'fall.settings.offline': 'Offline: Die Einstellung wurde nicht gespeichert.',
} as const satisfies FallCatalog;

export default de;
