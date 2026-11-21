/**
 * « EN APPEL » (#18753, ACT-01), langue « es » — chargée à la demande (`i18n-phone-call-catalog.ts`), jamais au
 * démarrage.
 */
import type { PhoneCallCatalog } from '../i18n-phone-call-catalog';

const es = {
  'call.announce.started': '{name} está en una llamada',
  'call.announce.startedSomeone': 'Alguien de tu Sangre está en una llamada',
  'call.announce.ended': '{name} ha colgado',
  'call.announce.endedSomeone': 'Alguien de tu Sangre ha colgado',
  'call.detail.title': 'En una llamada',
  'call.detail.sinceTime': 'En una llamada desde las {time}',
  'call.detail.sinceMinutes': 'En una llamada desde hace {count} min',
  'call.share.title': 'Mostrar que estoy en una llamada',
  'call.share.explain': '{name} ve que estás en una llamada, nunca con quién.',
  'call.share.globalOff': 'Desactivado para todos en tu perfil.',
  'call.global.short': 'Mostrar a mi Sangre que estoy en una llamada',
  'call.settings.failed': 'No se pudo guardar el ajuste.',
  'call.settings.offline': 'Sin conexión: el ajuste no se guardó.',
} as const satisfies PhoneCallCatalog;

export default es;
