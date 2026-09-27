import type { EphemeralCatalogSlice } from './catalog-fr-ephemeral';

/** Composer ephemeral picker (#8304) — see `catalog-fr-ephemeral.ts`. */
const enEphemeral = {
  'composer.ephemeral.afterRead': 'Disappears after reading',
  'composer.ephemeral.duration.15': '15 seconds',
  'composer.ephemeral.duration.30': '30 seconds',
  'composer.ephemeral.duration.60': '1 minute',
  'composer.ephemeral.duration.300': '5 minutes',
  'composer.ephemeral.duration.3600': '1 hour',
  'composer.ephemeral.duration.86400': '24 hours',
  'composer.ephemeral.activate': 'Enable ephemeral mode',
  'composer.ephemeral.active': 'Ephemeral mode active: {duration}',
  'composer.ephemeral.off': 'Off',
  'composer.ephemeral.rail': 'Time before the message disappears',
} satisfies EphemeralCatalogSlice;

export default enEphemeral;
