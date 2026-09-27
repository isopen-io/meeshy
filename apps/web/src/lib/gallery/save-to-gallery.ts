import { galleryMediaEssence, type GallerySaveInput, type GallerySaver } from './gallery-saver';

/**
 * « ENREGISTRER » DANS LA VISIONNEUSE, SUR LA COQUE ANDROID (#8308) — une image
 * ou une vidéo part DROIT dans l'album « Meeshy », sans feuille de partage ni
 * dialogue. `null` ⇒ l'hôte n'a pas de galerie (navigateur, coque sans plugin)
 * ou la pièce n'est pas un média de galerie : la voie actuelle (téléchargement,
 * partage de fichier) reste inchangée.
 */
export type GallerySaveNotice = 'media.viewer.saved' | 'media.viewer.save_failed';

export async function saveToGallery(params: GallerySaveInput & { readonly saver: GallerySaver | null }): Promise<GallerySaveNotice | null> {
  const { saver, ...input } = params;
  if (saver === null || !saver.available || galleryMediaEssence(input.mimeType) === null) return null;
  return (await saver.save(input)) === 'saved' ? 'media.viewer.saved' : 'media.viewer.save_failed';
}
