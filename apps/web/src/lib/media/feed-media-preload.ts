import { isSmallMediaAutoDownload, type SmallMediaAutoDownloadInput } from '@meeshy/shared/utils/small-media-auto-download';

/**
 * **CE QUE LE FIL PRÉCHARGE** (#14639) — sous 102 400 octets, une image ou une
 * vidéo se télécharge sans rien demander ; seul le hors-ligne l'en empêche.
 * Le seuil est celui de `@meeshy/shared` (miroirs Swift et Kotlin).
 *
 *  - une VIDÉO légère monte en `preload="auto"` : son fichier entier arrive
 *    avec la bulle, et le premier ▶︎ joue sans attente ; au-delà, `none` —
 *    une page de fil porte plusieurs vidéos, aucune ne part avant le geste ;
 *  - une IMAGE légère monte en `loading="eager"` : elle n'attend pas d'entrer
 *    dans la fenêtre de défilement ; au-delà, `lazy`.
 */
export type FeedVideoPreload = 'auto' | 'none';
export type FeedImageLoading = 'eager' | 'lazy';

export const feedVideoPreload = (input: SmallMediaAutoDownloadInput): FeedVideoPreload =>
  isSmallMediaAutoDownload(input) ? 'auto' : 'none';

export const feedImageLoading = (input: SmallMediaAutoDownloadInput): FeedImageLoading =>
  isSmallMediaAutoDownload(input) ? 'eager' : 'lazy';
