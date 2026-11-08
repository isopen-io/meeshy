package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.ReelPreloadWindow

/** La priorité d'un transfert de fichier vidéo. */
public enum class MediaTransferPriority { IMMEDIATE, DEFERRABLE }

/** Le profil réseau d'un transfert : sa priorité et son droit au réseau facturé. */
public data class MediaTransferProfile(
    val priority: MediaTransferPriority,
    val allowsExpensiveNetworkAccess: Boolean,
)

/**
 * **Quel profil réseau pour le fichier d'un réel, à quel palier** (iOS `ReelTransferPolicy`, #11283).
 *
 * Ce qu'on regarde ou qu'on va voir au geste suivant (play, decode, mount) passe sur tout réseau : le
 * bloquer sur cellulaire casserait la lecture. Ce qui se prépare pour plus tard (prime, idle) est
 * différable et ne part sur un réseau facturé que si le réglage vidéo de l'utilisateur autorise le
 * cellulaire.
 */
public object ReelTransferPolicy {

    public fun profile(tier: ReelPreloadWindow.Tier, videoPolicy: AutoDownloadPolicy): MediaTransferProfile {
        val priority = priority(tier)
        return MediaTransferProfile(
            priority = priority,
            allowsExpensiveNetworkAccess = priority == MediaTransferPriority.IMMEDIATE || allowsCellular(videoPolicy),
        )
    }

    public fun priority(tier: ReelPreloadWindow.Tier): MediaTransferPriority = when (tier) {
        ReelPreloadWindow.Tier.PLAY,
        ReelPreloadWindow.Tier.DECODE,
        ReelPreloadWindow.Tier.MOUNT,
        -> MediaTransferPriority.IMMEDIATE
        ReelPreloadWindow.Tier.PRIME,
        ReelPreloadWindow.Tier.IDLE,
        -> MediaTransferPriority.DEFERRABLE
    }

    private fun allowsCellular(policy: AutoDownloadPolicy): Boolean = when (policy) {
        AutoDownloadPolicy.ALWAYS, AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR -> true
        AutoDownloadPolicy.WIFI_ONLY, AutoDownloadPolicy.NEVER -> false
    }
}
