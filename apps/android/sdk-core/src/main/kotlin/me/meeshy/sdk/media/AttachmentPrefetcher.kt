package me.meeshy.sdk.media

import me.meeshy.sdk.model.MediaDownloadPolicyEngine
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import javax.inject.Inject
import javax.inject.Singleton

/** Planifie, pour plus tard et hors réseau facturé, un préchargement que la liaison actuelle ne permet pas. */
interface DeferredMediaScheduler {
    fun scheduleUnmetered(url: String, expectedSize: Long, category: MediaCacheCategory)
}

/**
 * **Le préchargement silencieux** (miroir de `AttachmentDownloadCenter.prefetch`, iOS) : le média que l'écran montrera au
 * geste suivant. Il passe par le même registre que les taps — la surface montée plus tard REJOINT ce téléchargement ou
 * le trouve fini — avec un profil DIFFÉRABLE (discrétionnaire) dont le réseau facturé dépend du réglage de données
 * mobiles du type de média. Aucune vibration. Une lecture qui le rejoint l'escalade (le centre relève le profil) ;
 * [cancelPrefetch] ne touche jamais un téléchargement lancé par un tap.
 *
 * Quand la liaison ACTUELLE ne le permet pas (réglage « Wi-Fi seulement » sur cellulaire), le préchargement n'est pas
 * perdu : il passe en travail WorkManager sur réseau NON FACTURÉ, repris dès le Wi-Fi.
 */
@Singleton
class AttachmentPrefetcher @Inject constructor(
    private val center: AttachmentDownloadCenter,
    private val preferences: MediaDownloadPreferencesStore,
    private val network: NetworkConditionMonitor,
    private val scheduler: DeferredMediaScheduler,
) {
    fun prefetch(url: String, expectedSize: Long, category: MediaCacheCategory, kind: MediaKind) {
        val prefs = preferences.preferences.value
        val condition = network.condition.value
        if (condition == NetworkCondition.OFFLINE || url.isEmpty()) return
        if (MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition, prefs, expectedSize)) {
            center.prefetch(url, expectedSize, category, MediaTransferProfile.prefetch(meteredAllowed = allowsCellular(prefs.policy(kind))))
        } else if (prefs.policy(kind) != AutoDownloadPolicy.NEVER) {
            scheduler.scheduleUnmetered(url, expectedSize, category)
        }
    }

    fun cancelPrefetch(url: String) = center.cancelPrefetch(url)

    private fun allowsCellular(policy: AutoDownloadPolicy): Boolean =
        policy == AutoDownloadPolicy.ALWAYS || policy == AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR
}
