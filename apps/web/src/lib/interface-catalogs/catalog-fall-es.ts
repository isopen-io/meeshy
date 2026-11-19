/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), langue « es » — chargée à la demande (`i18n-fall-catalog.ts`), jamais au
 * démarrage.
 */
import type { FallCatalog } from '../i18n-fall-catalog';

const es = {
  'fall.announce.detected': 'Se detectó una caída en el reloj de {name}',
  'fall.announce.detectedSomeone': 'Se detectó una caída en el reloj de un Sangre',
  'fall.announce.responded': '{name} está bien',
  'fall.announce.respondedSomeone': 'Un Sangre está bien',
  'fall.detail.title': 'Caída detectada',
  'fall.detail.at': 'Caída detectada a las {time}',
  'fall.detail.battery': 'Última batería: {value}',
  'fall.detail.map': 'Última ubicación',
  'fall.share.title': 'Avisar si mi reloj detecta una caída',
  'fall.share.explain': 'Si tu Apple Watch detecta una caída, se avisa a {name} enseguida.',
  'fall.me.title': 'Detección de caídas',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': '¿De dónde viene la detección?',
  'fall.me.explain': 'Viene de un Apple Watch: el consentimiento se da en la app de iPhone, nunca aquí. Tus Sangre reciben entonces el aviso de una caída.',
  'fall.settings.failed': 'No se pudo guardar el ajuste.',
  'fall.settings.offline': 'Sin conexión: el ajuste no se guardó.',
} as const satisfies FallCatalog;

export default es;
