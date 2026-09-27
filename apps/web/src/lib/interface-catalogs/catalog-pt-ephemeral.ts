import type { EphemeralCatalogSlice } from './catalog-fr-ephemeral';

/** Composer ephemeral picker (#8304) — see `catalog-fr-ephemeral.ts`. */
const ptEphemeral = {
  'composer.ephemeral.afterRead': 'Desaparece após a leitura',
  'composer.ephemeral.duration.15': '15 segundos',
  'composer.ephemeral.duration.30': '30 segundos',
  'composer.ephemeral.duration.60': '1 minuto',
  'composer.ephemeral.duration.300': '5 minutos',
  'composer.ephemeral.duration.3600': '1 hora',
  'composer.ephemeral.duration.86400': '24 horas',
  'composer.ephemeral.activate': 'Ativar o modo efêmero',
  'composer.ephemeral.active': 'Modo efêmero ativo: {duration}',
  'composer.ephemeral.off': 'Desativado',
  'composer.ephemeral.rail': 'Tempo até a mensagem desaparecer',
} satisfies EphemeralCatalogSlice;

export default ptEphemeral;
