package me.meeshy.app.reels

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.imageLoader
import coil.request.ImageRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.DeviceMediaTierSource
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * Le pool réel du préchargeur : fichier vidéo et son par le cache média (même source que le lecteur), poster par
 * Coil. Chaque réel a son travail, annulé dès qu'il quitte la fenêtre ; un préchargement raté n'est pas une erreur
 * (le média se chargera à l'affichage). Le lecteur lui-même se prépare à la composition de la page voisine.
 */
internal class CacheReelPreparationPool(
    private val context: Context,
    private val scope: CoroutineScope,
    private val condition: () -> NetworkCondition,
    private val videoPolicy: () -> AutoDownloadPolicy,
) : ReelPreparationPool {
    private val jobs = HashMap<String, Job>()

    override fun prepare(preparation: ReelPreparation) {
        jobs.remove(preparation.target.id)?.cancel()
        val cache = MeeshyMediaCache.get(context)
        val target = preparation.target
        jobs[target.id] = scope.launch {
            quietly { target.posterUrl?.let { context.imageLoader.execute(ImageRequest.Builder(context).data(it).build()) } }
            if (preparation.prefetchesAudio && condition() != NetworkCondition.OFFLINE) {
                target.audioUrls.forEach { url -> quietly { cache.prefetch(MediaCacheCategory.AUDIO, url) } }
            }
            val video = target.videoUrl ?: return@launch
            if (ReelPreloadConstraints.mayTransfer(preparation.tier, condition(), videoPolicy())) {
                quietly { cache.prefetch(MediaCacheCategory.VIDEO, video) }
            }
        }
    }

    override fun retire(reelId: String) {
        jobs.remove(reelId)?.cancel()
    }

    private suspend fun quietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (ignored: Exception) {
            // Un préchargement raté n'est pas une erreur : le média se chargera à l'affichage.
        }
    }
}

/** Possède le préchargeur le temps de l'écran des réels ; lit les contraintes de l'appareil à chaque réel posé. */
@HiltViewModel
class ReelPreloadViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val tierSource: DeviceMediaTierSource,
    private val network: NetworkConditionMonitor,
    private val preferences: MediaDownloadPreferencesStore,
) : ViewModel() {

    private val preloader = ReelPagerPreloader(
        pool = CacheReelPreparationPool(
            context = context,
            scope = viewModelScope,
            condition = { network.condition.value },
            videoPolicy = { preferences.preferences.value.video },
        ),
        contextFor = { visits -> ReelPreloadConstraints.context(readInputs(), visits) },
    )

    internal fun onSettled(index: Int, targets: List<ReelPrepTarget>) {
        preloader.enter(index, targets, SystemClock.elapsedRealtime())
    }

    internal fun releaseAll() = preloader.releaseAll()

    override fun onCleared() {
        preloader.releaseAll()
    }

    private fun readInputs(): ReelPreloadInputs {
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val power = context.getSystemService(PowerManager::class.java)
        val activity = context.getSystemService(ActivityManager::class.java)
        val memory = ActivityManager.MemoryInfo().also { activity?.getMemoryInfo(it) }
        return ReelPreloadInputs(
            dataSaverEnabled = connectivity?.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED,
            powerSaveMode = power?.isPowerSaveMode == true,
            thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) power?.currentThermalStatus ?: 0 else 0,
            isLowRamDevice = activity?.isLowRamDevice == true,
            totalMemBytes = memory.totalMem,
            memoryClassMb = activity?.memoryClass ?: 0,
            condition = network.condition.value,
            tier = runCatching { tierSource.current() }.getOrNull(),
        )
    }
}
