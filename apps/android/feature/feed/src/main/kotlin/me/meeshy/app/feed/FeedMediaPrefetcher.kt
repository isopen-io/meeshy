package me.meeshy.app.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.FeedPrefetchWindow
import me.meeshy.sdk.model.MediaDownloadPolicyEngine
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition

/** Ce qu'une passe de préchargement tire pour un média. */
internal sealed interface FeedPrefetchTarget {
    val url: String

    /** Une image distante (média image, ou vignette d'une vidéo). */
    data class Image(override val url: String) : FeedPrefetchTarget

    /** Une image extraite de la première frame d'une vidéo SANS vignette. */
    data class VideoFrame(override val url: String) : FeedPrefetchTarget

    /** Le fichier audio d'un post. */
    data class Audio(override val url: String) : FeedPrefetchTarget
}

/** Le côté effets de bord du préchargement — un faux dans les tests. */
internal interface FeedMediaFetcher {
    suspend fun fetch(target: FeedPrefetchTarget)
}

/** Ce que la politique d'auto-téléchargement permet, résolu UNE fois par passe. */
internal data class FeedPrefetchAllowance(val image: Boolean, val video: Boolean, val audio: Boolean) {
    companion object {
        fun resolve(condition: NetworkCondition, prefs: MediaDownloadPreferences) = FeedPrefetchAllowance(
            image = MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.IMAGE, condition, prefs),
            video = MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.VIDEO, condition, prefs),
            audio = MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.AUDIO, condition, prefs),
        )
    }
}

/**
 * Le préchargement des médias du fil autour de la rangée visible — miroir de
 * `FeedMediaPrefetcher` (iOS). La rangée visible déclenche, après
 * [FeedPrefetchWindow.DEBOUNCE_MS] d'anti-rebond et si elle a bougé d'au moins
 * [FeedPrefetchWindow.MIN_ROW_GAP] rangées, le préchargement de la fenêtre
 * `[i-2, i+7[`. Une nouvelle fenêtre annule la précédente. Le réseau ET les
 * préférences d'auto-téléchargement sont respectés pour l'image, la vidéo et l'audio.
 */
internal class FeedMediaPrefetcher(
    private val posts: () -> List<FeedPostPresentation>,
    private val network: NetworkConditionMonitor,
    private val preferences: MediaDownloadPreferencesStore,
    private val fetcher: FeedMediaFetcher,
    private val scope: CoroutineScope,
    private val debounceMs: Long = FeedPrefetchWindow.DEBOUNCE_MS,
) {
    private var lastIndex = FeedPrefetchWindow.NO_PREVIOUS_INDEX
    private var debounceJob: Job? = null
    private var prefetchJob: Job? = null

    /** Point d'entrée du défilement : anti-rebond, et ignoré sous deux rangées d'écart. */
    fun onRowVisible(postId: String) {
        val index = posts().indexOfFirst { it.id == postId }
        if (index < 0 || !FeedPrefetchWindow.shouldTrigger(index, lastIndex)) return
        lastIndex = index
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(debounceMs)
            prefetchAround(index)
        }
    }

    /** Précharge la fenêtre autour de [index], en annulant la passe précédente. */
    fun prefetchAround(index: Int) {
        prefetchJob?.cancel()
        val current = posts()
        val slice = FeedPrefetchWindow.window(index, current.size).map { current[it] }
        if (slice.isEmpty()) return
        val allowance = FeedPrefetchAllowance.resolve(network.condition.value, preferences.preferences.value)
        val targets = slice.flatMap { post -> post.media.flatMap { targetsFor(it, allowance) } }.distinct()
        prefetchJob = scope.launch {
            coroutineScope { targets.forEach { target -> launch { fetchQuietly(target) } } }
        }
    }

    /** Annule tout ce qui est en vol (le fil quitte l'écran). */
    fun cancel() {
        debounceJob?.cancel()
        prefetchJob?.cancel()
    }

    private suspend fun fetchQuietly(target: FeedPrefetchTarget) {
        try {
            fetcher.fetch(target)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (ignored: Exception) {
            // Un préchargement raté n'est pas une erreur : le média se chargera à l'affichage.
        }
    }

    companion object {
        /**
         * Décision PURE : ce média doit-il être préchargé, la politique étant déjà
         * résolue ? Une vidéo AVEC vignette ne tire qu'une image (`image`) ; SANS
         * vignette, la première frame du MP4 distant coûte des octets vidéo (`video`).
         * Un document n'est jamais préchargé.
         */
        fun shouldPrefetch(kind: FeedMediaType, hasThumbnail: Boolean, allowance: FeedPrefetchAllowance): Boolean =
            when (kind) {
                FeedMediaType.IMAGE -> allowance.image
                FeedMediaType.VIDEO -> if (hasThumbnail) allowance.image else allowance.video
                FeedMediaType.AUDIO -> allowance.audio
                FeedMediaType.DOCUMENT, FeedMediaType.LOCATION -> false
            }

        fun targetsFor(media: FeedMediaItem, allowance: FeedPrefetchAllowance): List<FeedPrefetchTarget> {
            val thumbnail = media.thumbnailUrl?.takeIf { it.isNotBlank() }
            if (!shouldPrefetch(media.type, thumbnail != null, allowance)) return emptyList()
            return when (media.type) {
                FeedMediaType.IMAGE -> listOfNotNull(thumbnail?.let { FeedPrefetchTarget.Image(it) }, FeedPrefetchTarget.Image(media.url))
                FeedMediaType.VIDEO ->
                    listOf(if (thumbnail != null) FeedPrefetchTarget.Image(thumbnail) else FeedPrefetchTarget.VideoFrame(media.url))
                FeedMediaType.AUDIO -> listOf(FeedPrefetchTarget.Audio(media.url))
                FeedMediaType.DOCUMENT, FeedMediaType.LOCATION -> emptyList()
            }
        }
    }
}
