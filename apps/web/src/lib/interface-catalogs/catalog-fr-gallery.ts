/**
 * LA GALERIE DE LA COQUE ANDROID (#8308) — tranche du catalogue, extraite pour
 * tenir le budget de taille (motif `catalog-fr-mentions.ts`) : chaque langue
 * RÉPAND la sienne dans son catalogue.
 */
const frGallery = {
  'settings.gallery.auto_save': 'Enregistrer dans la galerie',
  'settings.gallery.auto_save.info': 'Les photos et vidéos reçues s’ajoutent une seule fois à l’album Meeshy — jamais les médias éphémères, floutés ou à vue unique.',
} as const;

export type GalleryCatalogSlice = Readonly<Record<keyof typeof frGallery, string>>;

export default frGallery;
