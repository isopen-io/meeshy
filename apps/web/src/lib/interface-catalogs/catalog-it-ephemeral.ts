import type { EphemeralCatalogSlice } from './catalog-fr-ephemeral';

/** Composer ephemeral picker (#8304) — see `catalog-fr-ephemeral.ts`. */
const itEphemeral = {
  'composer.ephemeral.afterRead': 'Scompare dopo la lettura',
  'composer.ephemeral.duration.15': '15 secondi',
  'composer.ephemeral.duration.30': '30 secondi',
  'composer.ephemeral.duration.60': '1 minuto',
  'composer.ephemeral.duration.300': '5 minuti',
  'composer.ephemeral.duration.3600': '1 ora',
  'composer.ephemeral.duration.86400': '24 ore',
  'composer.ephemeral.activate': 'Attiva la modalità effimera',
  'composer.ephemeral.active': 'Modalità effimera attiva: {duration}',
  'composer.ephemeral.off': 'Disattivato',
  'composer.ephemeral.rail': 'Tempo prima che il messaggio scompaia',
  'composer.protection.imposed.blur': 'Sfocatura imposta dal messaggio citato',
  'composer.protection.imposed.ephemeral': 'Modalità effimera imposta dal messaggio citato: {duration}',
  'message.afterRead.a11y': 'Messaggio effimero, scompare dopo la lettura',
  'message.ephemeral.label.a11y': 'Messaggio effimero',
  'message.blurred.a11y': 'Sfocato',
  'message.viewOnce.a11y': 'Visualizzazione singola',
} satisfies EphemeralCatalogSlice;

export default itEphemeral;
