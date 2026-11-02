import { galleryMediaEssence, type GallerySaveInput, type GallerySaver } from './gallery-saver';

/**
 * « ENREGISTRER » DANS LA VISIONNEUSE, SUR LA COQUE ANDROID (#8308) — une image
 * ou une vidéo part DROIT dans l'album « Meeshy », sans feuille de partage ni
 * dialogue. `null` ⇒ l'hôte n'a pas de galerie (navigateur, coque sans plugin)
 * ou la pièce n'est pas un média de galerie, ou trop lourde pour le pont : la
 * voie actuelle (téléchargement, partage de fichier) reste inchangée. Un
 * média déjà présent dans la galerie se dit « Déjà enregistré » (#14641).
 */
export type GallerySaveNotice = 'media.viewer.saved' | 'media.viewer.already_saved' | 'media.viewer.save_failed';

export async function saveToGallery(params: GallerySaveInput & { readonly saver: GallerySaver | null }): Promise<GallerySaveNotice | null> {
  const { saver, ...input } = params;
  if (saver === null || !saver.available || galleryMediaEssence(input.mimeType) === null) return null;
  const outcome = await saver.save(input);
  if (outcome === 'unavailable') return null;
  if (outcome === 'already-saved') return 'media.viewer.already_saved';
  return outcome === 'saved' ? 'media.viewer.saved' : 'media.viewer.save_failed';
}

/** Le média EST dans la galerie — écrit à l'instant, ou déjà là (#14641). */
export const isInGallery = (notice: GallerySaveNotice): boolean => notice !== 'media.viewer.save_failed';
