import { isSmallMediaAutoDownload, type SmallMediaAutoDownloadInput } from '@meeshy/shared/utils/small-media-auto-download';

/**
 * **CE QUE LE FIL PRÉCHARGE** (#14639) — sous 102 400 octets, une image ou une
 * vidéo se télécharge sans rien demander ; seul le hors-ligne l'en empêche.
 * Le seuil est celui de `@meeshy/shared` (miroirs Swift et Kotlin).
 *
 *  - une VIDÉO suit la politique de l'appareil (`use-auto-download.ts`,
 *    #6333), qui reprend ce seuil ;
 *  - une IMAGE légère monte en `loading="eager"` : elle n'attend pas d'entrer
 *    dans la fenêtre de défilement ; au-delà, `lazy`.
 */
export type FeedImageLoading = 'eager' | 'lazy';

export const feedImageLoading = (input: SmallMediaAutoDownloadInput): FeedImageLoading =>
  isSmallMediaAutoDownload(input) ? 'eager' : 'lazy';
