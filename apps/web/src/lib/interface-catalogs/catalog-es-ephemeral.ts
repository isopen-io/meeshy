import type { EphemeralCatalogSlice } from './catalog-fr-ephemeral';

/** Composer ephemeral picker (#8304) — see `catalog-fr-ephemeral.ts`. */
const esEphemeral = {
  'composer.ephemeral.afterRead': 'Desaparece tras la lectura',
  'composer.ephemeral.duration.15': '15 segundos',
  'composer.ephemeral.duration.30': '30 segundos',
  'composer.ephemeral.duration.60': '1 minuto',
  'composer.ephemeral.duration.300': '5 minutos',
  'composer.ephemeral.duration.3600': '1 hora',
  'composer.ephemeral.duration.86400': '24 horas',
  'composer.ephemeral.activate': 'Activar el modo efímero',
  'composer.ephemeral.active': 'Modo efímero activo: {duration}',
  'composer.ephemeral.off': 'Desactivado',
  'composer.ephemeral.rail': 'Tiempo antes de que desaparezca el mensaje',
} satisfies EphemeralCatalogSlice;

export default esEphemeral;
