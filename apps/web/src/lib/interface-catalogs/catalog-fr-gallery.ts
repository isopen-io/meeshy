/**
 * LA GALERIE (#8308, #14641) — tranche du catalogue, extraite pour tenir le
 * budget de taille (motif `catalog-fr-mentions.ts`) : chaque langue RÉPAND la
 * sienne dans son catalogue. « Sauvegarder média » reprend mot pour mot le
 * libellé d'iOS (`settings.privacy.save_media`, `Localizable.xcstrings`).
 */
const frGallery = {
  'settings.privacy.save_media': 'Sauvegarder média',
} as const;

export type GalleryCatalogSlice = Readonly<Record<keyof typeof frGallery, string>>;

export default frGallery;
