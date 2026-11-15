package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.mediacache.ByteSizeFormatter

/**
 * **La disponibilité d'une pièce média pour l'affichage** (miroir unifié d'`AudioAvailability`, `VideoAvailability` et du
 * badge d'image, iOS) : prête, à télécharger (avec sa taille), en téléchargement (avec ses octets) ou en échec
 * (« réessayer »). Une seule forme pour l'image, l'audio, l'audio traduit et la vidéo ; la vue la projette.
 */
public sealed interface MediaAvailabilityState {
    /** Sur l'appareil (cache, `file://` existant) ou optimiste local : aucun badge. */
    public data object Ready : MediaAvailabilityState

    /** À télécharger. [offline] : le toucher est inopérant et le badge le dit. [sizeBytes] 0 = inconnue. */
    public data class NeedsDownload(val sizeBytes: Long = 0L, val offline: Boolean = false) : MediaAvailabilityState {
        /** « 850 KB », ou `null` quand la taille est inconnue. */
        val sizeLabel: String? get() = sizeBytes.takeIf { it > 0 }?.let(ByteSizeFormatter::format)
    }

    /** En cours : [downloadedBytes] sur [totalBytes] (0 tant que la taille est inconnue). */
    public data class Downloading(val downloadedBytes: Long = 0L, val totalBytes: Long = 0L) : MediaAvailabilityState {
        /** Fraction bornée à [0, 1] ; 0 tant que la taille est inconnue. */
        val progress: Double
            get() = if (totalBytes > 0) (downloadedBytes.toDouble() / totalBytes).coerceIn(0.0, 1.0) else 0.0

        val percent: Int get() = (progress * 100).toInt()

        /** « 410 KB / 850 KB » ; « 410 KB » quand le total est inconnu. */
        val bytesLabel: String
            get() = if (totalBytes > 0) {
                "${ByteSizeFormatter.format(downloadedBytes)} / ${ByteSizeFormatter.format(totalBytes)}"
            } else {
                ByteSizeFormatter.format(downloadedBytes)
            }
    }

    /** Échec du dernier essai : badge « réessayer ». [gone] : média rappelé ou expiré, inutile de réessayer. */
    public data class Failed(val gone: Boolean = false, val sizeBytes: Long = 0L) : MediaAvailabilityState

    public val isReady: Boolean get() = this is Ready
}
