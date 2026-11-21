/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), langue « es » — chargée à la demande
 * (`i18n-inactivity-catalog.ts`), jamais au démarrage.
 */
import type { InactivityCatalog } from '../i18n-inactivity-catalog';

const es = {
  'inactivity.announce.alert': '{name} no respondió a «¿Todo bien?»',
  'inactivity.announce.alertSomeone': 'Alguien de tu Sangre no respondió a «¿Todo bien?»',
  'inactivity.announce.responded': '{name} está bien',
  'inactivity.announce.respondedSomeone': 'Alguien de tu Sangre está bien',
  'inactivity.detail.title': 'Inactividad',
  'inactivity.detail.since': 'Sin actividad desde {time}',
  'inactivity.detail.battery': 'Última batería: {value}',
  'inactivity.detail.map': 'Última ubicación',
  'inactivity.share.title': 'Avisar si no respondo',
  'inactivity.share.explain': 'Si tu teléfono queda inactivo y no respondes a «¿Todo bien?», se avisa a {name}.',
  'inactivity.global.title': 'Verificación de inactividad',
  'inactivity.global.off': 'Desactivada',
  'inactivity.global.hours': '{count} h',
  'inactivity.settings.failed': 'No se pudo guardar el ajuste.',
  'inactivity.settings.offline': 'Sin conexión: el ajuste no se guardó.',
} as const satisfies InactivityCatalog;

export default es;
