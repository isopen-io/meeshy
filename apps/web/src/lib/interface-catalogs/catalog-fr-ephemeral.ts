/**
 * LE SÉLECTEUR D'ÉPHÉMÈRE DU COMPOSEUR (#8304) — tranche du catalogue,
 * extraite pour tenir le budget de taille (motif `catalog-fr-mentions.ts`) :
 * la flamme-œil, les six durées et les libellés de la bascule, que chaque
 * langue RÉPAND dans son catalogue.
 */
const frEphemeral = {
  'composer.ephemeral.afterRead': 'Disparaît après lecture',
  'composer.ephemeral.duration.15': '15 secondes',
  'composer.ephemeral.duration.30': '30 secondes',
  'composer.ephemeral.duration.60': '1 minute',
  'composer.ephemeral.duration.300': '5 minutes',
  'composer.ephemeral.duration.3600': '1 heure',
  'composer.ephemeral.duration.86400': '24 heures',
  'composer.ephemeral.activate': 'Activer le mode éphémère',
  'composer.ephemeral.active': 'Mode éphémère actif : {duration}',
  'composer.ephemeral.off': 'Désactivé',
  'composer.ephemeral.rail': 'Durée avant disparition du message',
  'composer.protection.imposed.blur': 'Flou imposé par le message cité',
  'composer.protection.imposed.ephemeral': 'Mode éphémère imposé par le message cité : {duration}',
} as const;

export type EphemeralCatalogSlice = Readonly<Record<keyof typeof frEphemeral, string>>;

export default frEphemeral;
