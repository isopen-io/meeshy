import type { EphemeralCatalogSlice } from './catalog-fr-ephemeral';

/** Composer ephemeral picker (#8304) — see `catalog-fr-ephemeral.ts`. */
const deEphemeral = {
  'composer.ephemeral.afterRead': 'Verschwindet nach dem Lesen',
  'composer.ephemeral.duration.15': '15 Sekunden',
  'composer.ephemeral.duration.30': '30 Sekunden',
  'composer.ephemeral.duration.60': '1 Minute',
  'composer.ephemeral.duration.300': '5 Minuten',
  'composer.ephemeral.duration.3600': '1 Stunde',
  'composer.ephemeral.duration.86400': '24 Stunden',
  'composer.ephemeral.activate': 'Ephemeren Modus aktivieren',
  'composer.ephemeral.active': 'Ephemerer Modus aktiv: {duration}',
  'composer.ephemeral.off': 'Aus',
  'composer.ephemeral.rail': 'Zeit, bis die Nachricht verschwindet',
  'composer.protection.imposed.blur': 'Unschärfe durch die zitierte Nachricht vorgegeben',
  'composer.protection.imposed.ephemeral': 'Ephemerer Modus durch die zitierte Nachricht vorgegeben: {duration}',
} satisfies EphemeralCatalogSlice;

export default deEphemeral;
