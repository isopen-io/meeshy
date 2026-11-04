package me.meeshy.sdk.story

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MediaDownloadPolicyEngine
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.StoryMediaStoreRouter
import me.meeshy.sdk.model.story.StoryPreloadMedia
import me.meeshy.sdk.model.story.StoryPreloadStory
import me.meeshy.sdk.model.story.StoryTrayPreloadPlan

/** Le côté effets de bord du préchargement : tire un média dans le magasin de son type EFFECTIF. */
interface StoryMediaFetcher {
    suspend fun fetch(url: String, kind: FeedMediaType)
}

/**
 * **Le préchargement des médias du plateau** (iOS `StoryTrayMediaPreloader`) : deux passes sur les huit premiers
 * groupes — la première slide non vue de chacun en haute priorité, puis jusqu'à quatre slides suivantes. La politique
 * d'auto-téléchargement est respectée par type EFFECTIF (extension d'URL, [StoryMediaStoreRouter]).
 *
 * Les URL sont RÉCLAMÉES avant d'être tirées : le plateau rappelle [preload] à chaque émission, la réclamation évite de
 * re-sonder des médias déjà en cache. Une passe interrompue rend ce qu'elle avait réclamé ; une URL sautée par la
 * politique est rendue aussi, et le retour d'une meilleure liaison relance la dernière demande pour la rattraper.
 */
class StoryMediaPreloader(
    private val network: NetworkConditionMonitor,
    private val preferences: MediaDownloadPreferencesStore,
    private val fetcher: StoryMediaFetcher,
    private val scope: CoroutineScope,
) {
    private val lock = Any()
    private val claimed = HashSet<String>()
    private var passes: List<Job> = emptyList()
    private var lastGroups: List<List<StoryPreloadStory>>? = null
    private var hasSkipped = false

    init {
        scope.launch {
            try {
                network.condition.drop(1).collect { retryIfSkipped() }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (ignored: Exception) {
            }
        }
    }

    /** Les URL actuellement réclamées (déjà tirées ou en cours). */
    fun claimedUrls(): Set<String> = synchronized(lock) { claimed.toSet() }

    /** Relance les deux passes sur [groups] ; celles en cours s'arrêtent et rendent leurs réclamations. */
    fun preload(groups: List<List<StoryPreloadStory>>) {
        cancel()
        synchronized(lock) {
            lastGroups = groups
            hasSkipped = false
        }
        val first = StoryTrayPreloadPlan.firstSlides(groups)
        val upcoming = StoryTrayPreloadPlan.upcomingSlides(groups)
        synchronized(lock) {
            passes = listOf(
                scope.launch { runQuietly { preloadFirst(first) } },
                scope.launch { runQuietly { preloadUpcoming(upcoming) } },
            )
        }
    }

    fun cancel() {
        val running = synchronized(lock) { passes.also { passes = emptyList() } }
        running.forEach { it.cancel() }
    }

    private fun retryIfSkipped() {
        val groups = synchronized(lock) { lastGroups.takeIf { hasSkipped } } ?: return
        preload(groups)
    }

    private suspend fun preloadFirst(stories: List<StoryPreloadStory>) = coroutineScope {
        stories.forEach { story ->
            val urls = claim(story)
            if (urls.isEmpty()) return@forEach
            launch { settle(urls) { fetchAll(urls) } }
        }
    }

    private suspend fun preloadUpcoming(stories: List<StoryPreloadStory>) {
        stories.forEach { story ->
            val urls = claim(story)
            if (urls.isNotEmpty()) settle(urls) { fetchAll(urls) }
        }
    }

    /** Rend les URL sautées ; si la passe est annulée, rend TOUT ce qu'elle avait réclamé. */
    private suspend fun settle(urls: List<StoryPreloadMedia>, body: suspend () -> List<StoryPreloadMedia>) {
        try {
            release(body(), skipped = true)
        } catch (cancelled: CancellationException) {
            release(urls, skipped = false)
            throw cancelled
        }
    }

    private suspend fun fetchAll(media: List<StoryPreloadMedia>): List<StoryPreloadMedia> {
        val condition = network.condition.value
        val prefs = preferences.preferences.value
        val skipped = ArrayList<StoryPreloadMedia>()
        media.forEach { item ->
            val kind = StoryMediaStoreRouter.effectiveKind(item.declaredType, item.url)
            if (!allows(kind, condition, prefs)) {
                skipped += item
                return@forEach
            }
            try {
                fetcher.fetch(item.url, kind)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (ignored: Exception) {
                // Un préchargement raté n'est pas une erreur : le média se chargera à l'ouverture.
            }
        }
        return skipped
    }

    private fun allows(kind: FeedMediaType, condition: me.meeshy.sdk.model.NetworkCondition, prefs: me.meeshy.sdk.model.MediaDownloadPreferences): Boolean {
        val mediaKind = when (kind) {
            FeedMediaType.VIDEO -> MediaKind.VIDEO
            FeedMediaType.AUDIO -> MediaKind.AUDIO
            else -> MediaKind.IMAGE
        }
        return MediaDownloadPolicyEngine.shouldAutoDownload(mediaKind, condition, prefs)
    }

    private fun claim(story: StoryPreloadStory): List<StoryPreloadMedia> = synchronized(lock) {
        val fresh = story.media.filter { it.url !in claimed }
        if (claimed.size > MAX_CLAIMS) claimed.clear()
        fresh.forEach { claimed += it.url }
        fresh
    }

    private fun release(media: List<StoryPreloadMedia>, skipped: Boolean) {
        if (media.isEmpty()) return
        synchronized(lock) {
            media.forEach { claimed -= it.url }
            hasSkipped = hasSkipped || skipped
        }
    }

    private suspend fun runQuietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (ignored: Exception) {
        }
    }

    private companion object {
        const val MAX_CLAIMS = 2_000
    }
}
