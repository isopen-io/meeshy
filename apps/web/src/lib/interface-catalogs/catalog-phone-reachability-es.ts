/**
 * El teléfono inaccesible de los allegados y de la Sangre (#18737, TEL-01), español — se carga bajo demanda
 * (`i18n-phone-reachability-catalog.ts`), nunca al inicio.
 */
import type { PhoneReachabilityCatalog } from '../i18n-phone-reachability-catalog';

const es = {
  'phone.announce.unreachable': 'El teléfono de {name} está inaccesible desde las {time}',
  'phone.announce.unreachableSomeone': 'El teléfono de un allegado está inaccesible desde las {time}',
  'phone.announce.reachable': 'El teléfono de {name} vuelve a responder',
  'phone.announce.reachableSomeone': 'El teléfono de un allegado vuelve a responder',
  'phone.a11y.unreachable': 'teléfono inaccesible desde las {time}',
  'phone.detail.title': 'Teléfono',
  'phone.detail.since': 'Teléfono inaccesible desde las {time}',
  'phone.cause.battery': 'Batería agotada, probablemente',
  'phone.cause.network': 'Sin red o en modo avión, probablemente',
  'phone.share.title': 'Avisar a {name} si mi teléfono está inaccesible',
  'phone.share.explainClose': '{name} sabrá desde cuándo tu teléfono no responde y el motivo probable. No se comparte nada hasta que lo actives.',
  'phone.share.explainBlood': 'Activado por defecto con tu Sangre. Puedes quitarlo en cualquier momento.',
  'phone.share.globalOff': 'Ya no avisas a nadie: está desactivado para todos, desde tu perfil.',
  'phone.global.title': 'Avisar a mis allegados si mi teléfono está inaccesible',
  'phone.global.short': 'Teléfono ilocalizable',
  'phone.global.explain': 'Tu Sangre, y los allegados a quienes lo concediste, saben desde cuándo tu teléfono no responde y el motivo probable. Nunca en una conversación.',
  'phone.global.question': '¿Quién recibe el aviso?',
  'phone.consent.title': '¿Avisar a {name} si tu teléfono deja de responder?',
  'phone.consent.body': '{name} sabrá que tu teléfono está inaccesible, desde cuándo, y si probablemente es la batería o la red. Puedes cambiarlo aquí cuando quieras.',
  'phone.consent.confirm': 'Continuar',
  'phone.settings.failed': 'No se pudo guardar el ajuste.',
  'phone.settings.offline': 'Sin conexión: el ajuste no se guardó.',
  'phone.webNote': 'Este navegador no cuenta: solo la app Meeshy de tu teléfono indica si está accesible.',
} as const satisfies PhoneReachabilityCatalog;

export default es;
