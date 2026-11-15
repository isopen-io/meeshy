package me.meeshy.ui.component.video

import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.ReelPreloadWindow
import me.meeshy.sdk.model.playback.MediaTransferPriority
import me.meeshy.sdk.model.playback.ReelTransferPolicy

/** Ce qu'un amorçage a décidé. */
internal enum class PrimeOutcome { PRIMED, ALREADY_CACHED, REFUSED_BY_NETWORK, FAILED }

/**
 * **L'amorçage du fichier d'un réel, par paliers** (iOS `ReelPrewarm` + `ReelTransferPolicy`).
 *
 * play, decode et mount sont toujours immédiats ; prime et idle sont différés et refusés sur un réseau
 * facturé quand le réglage vidéo de l'utilisateur interdit le cellulaire. Hors ligne, rien ne part.
 * Le fichier arrive par [prefetch] (cache disque `SimpleCache` + `CacheWriter`), le lecteur n'est
 * préparé qu'à N±1 : le fichier va plus loin que le décodeur.
 */
internal class VideoPrimeCache(
    private val prefetch: suspend (url: String) -> Boolean,
    private val videoPolicy: () -> AutoDownloadPolicy,
    private val network: () -> NetworkCondition,
) {
    private val inFlight = HashSet<String>()

    suspend fun prime(url: String, tier: ReelPreloadWindow.Tier): PrimeOutcome {
        val condition = network()
        if (condition == NetworkCondition.OFFLINE) return PrimeOutcome.REFUSED_BY_NETWORK
        val expensive = condition == NetworkCondition.GOOD_CELLULAR || condition == NetworkCondition.BAD_CELLULAR
        val profile = ReelTransferPolicy.profile(tier, videoPolicy())
        if (expensive && !profile.allowsExpensiveNetworkAccess) return PrimeOutcome.REFUSED_BY_NETWORK
        if (!claim(url)) return PrimeOutcome.ALREADY_CACHED
        return try {
            if (prefetch(url)) PrimeOutcome.PRIMED else PrimeOutcome.FAILED
        } finally {
            release(url)
        }
    }

    /** Le lecteur n'est préparé qu'aux paliers immédiats (N±1) ; au-delà, le fichier seul. */
    fun preparesPlayer(tier: ReelPreloadWindow.Tier): Boolean =
        ReelTransferPolicy.priority(tier) == MediaTransferPriority.IMMEDIATE

    @Synchronized
    private fun claim(url: String): Boolean = inFlight.add(url)

    @Synchronized
    private fun release(url: String) {
        inFlight.remove(url)
    }
}
