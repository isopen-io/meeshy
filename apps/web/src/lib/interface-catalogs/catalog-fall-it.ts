/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), langue « it » — chargée à la demande (`i18n-fall-catalog.ts`), jamais au
 * démarrage.
 */
import type { FallCatalog } from '../i18n-fall-catalog';

const it = {
  'fall.announce.detected': 'È stata rilevata una caduta sull’orologio di {name}',
  'fall.announce.detectedSomeone': 'È stata rilevata una caduta sull’orologio di un Sangue',
  'fall.announce.responded': '{name} sta bene',
  'fall.announce.respondedSomeone': 'Un Sangue sta bene',
  'fall.detail.title': 'Caduta rilevata',
  'fall.detail.at': 'Caduta rilevata alle {time}',
  'fall.detail.battery': 'Ultima batteria: {value}',
  'fall.detail.map': 'Ultima posizione',
  'fall.share.title': 'Avvisa se il mio orologio rileva una caduta',
  'fall.share.explain': 'Se il tuo Apple Watch rileva una caduta, {name} viene avvisato subito.',
  'fall.me.title': 'Rilevamento cadute',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': 'Da dove viene il rilevamento?',
  'fall.me.explain': 'Viene da un Apple Watch: il consenso si dà nell’app per iPhone, mai qui. I tuoi Sangue vengono quindi avvisati di una caduta.',
  'fall.settings.failed': 'Impossibile salvare l’impostazione.',
  'fall.settings.offline': 'Offline: l’impostazione non è stata salvata.',
} as const satisfies FallCatalog;

export default it;
