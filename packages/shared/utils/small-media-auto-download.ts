/**
 * **UN PETIT MÉDIA SE TÉLÉCHARGE SEUL** (#14639, directive porteur du
 * 2026-11-02) — sous 102 400 octets, une image ou une vidéo se télécharge sans
 * rien demander, quel que soit le réseau ; seul le hors-ligne l'en empêche.
 * Au-delà, la politique réseau de chaque client reprend la main.
 *
 * Les miroirs Swift (MeeshySDK) et Kotlin (Android) portent la même valeur.
 * Une taille inconnue (0, négative, non finie) ne décide rien : elle rend la
 * main à la politique réseau.
 */
export const SMALL_MEDIA_AUTO_DOWNLOAD_BYTES = 102_400;

export type SmallMediaAutoDownloadInput = {
  readonly sizeBytes: number;
  readonly online: boolean;
};

export function isSmallMediaAutoDownload({ sizeBytes, online }: SmallMediaAutoDownloadInput): boolean {
  return online && Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes < SMALL_MEDIA_AUTO_DOWNLOAD_BYTES;
}
