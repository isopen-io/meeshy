package me.meeshy.app.conversations

import android.content.Context
import coil.imageLoader
import coil.request.ImageRequest
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MediaAutoDownloadDecider
import me.meeshy.sdk.model.MediaAvailability
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.ui.component.media.MeeshyMediaCache

/** Ce que la passe lit et écrit des stories : le plateau en cache, le fil réseau, la sauvegarde. */
interface StoryPrefetchSource {
    /** Le plateau de stories est-il déjà en main (Room) ? Alors une autre voie l'a nourri et la passe s'efface. */
    suspend fun isTrayCached(): Boolean

    /** Les groupes servis par le réseau, `null` sur tout échec. */
    suspend fun fetchGroups(limit: Int): List<StoryGroup>?

    /** Sauvegarde le plateau ; n'est appelée que si le plateau est encore vide à la fin de la passe. */
    suspend fun saveTray()
}

/** Met un média entier dans le cache que l'écran de lecture relit. */
interface StoryMediaPrefetcher {
    suspend fun image(url: String)
    suspend fun video(url: String)
}

/**
 * Le réseau du moment et « Réglages › Médias » : économie de données et réseau facturé interdisent
 * les vidéos (et les images au-delà de leur propre préférence), hors ligne rien ne part.
 */
fun interface StoryPrefetchGate {
    fun allows(kind: MediaKind): Boolean

    companion object {
        val Open = StoryPrefetchGate { true }
    }
}

/** Les URL à précharger, uniques et dans l'ordre de lecture. */
class StoryPrefetchPlan(val images: List<String>, val videos: List<String>) {
    companion object {
        const val GROUP_LIMIT = 30
        const val FULL_GROUPS = 3
        const val STORIES_PER_GROUP = 2
        const val IMAGE_BATCH = 8
        const val VIDEO_BATCH = 4

        /** Tous les médias des [FULL_GROUPS] premiers groupes, puis [STORIES_PER_GROUP] stories par groupe. */
        fun of(groups: List<StoryGroup>): StoryPrefetchPlan {
            val media = groups.take(GROUP_LIMIT).withIndex().flatMap { (index, group) ->
                val stories = if (index < FULL_GROUPS) group.stories else group.stories.take(STORIES_PER_GROUP)
                stories.flatMap { it.media }
            }.filter { !it.url.isNullOrEmpty() }
            val (videos, others) = media.partition { it.type == FeedMediaType.VIDEO }
            return StoryPrefetchPlan(
                images = others.mapNotNull { it.url }.distinct(),
                videos = videos.mapNotNull { it.url }.distinct(),
            )
        }
    }
}

/**
 * **Le préchargement des stories** (miroir de `prefetchRecentStories`, iOS) : les 30 premiers groupes, tous les
 * médias des 3 premiers puis 2 stories par groupe ; images par lots de 8, vidéos par lots de 4, annulable à
 * chaque lot. Une passe en remplace une autre. Le plateau déjà en cache s'efface devant sa propre voie de
 * chargement, et n'est sauvegardé qu'à la fin, s'il est encore vide (une passe longue ne réécrit jamais un
 * plateau où l'utilisateur a entre-temps gravé ses vues).
 */
class ConversationStoryPrefetch(
    private val source: StoryPrefetchSource,
    private val media: StoryMediaPrefetcher,
    private val gate: () -> StoryPrefetchGate,
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private var running: Job? = null

    companion object {
        /** Un préchargement qui ne fait rien : le plateau est toujours « déjà en main ». */
        fun inert(): ConversationStoryPrefetch = ConversationStoryPrefetch(
            source = object : StoryPrefetchSource {
                override suspend fun isTrayCached() = true
                override suspend fun fetchGroups(limit: Int): List<StoryGroup>? = null
                override suspend fun saveTray() = Unit
            },
            media = object : StoryMediaPrefetcher {
                override suspend fun image(url: String) = Unit
                override suspend fun video(url: String) = Unit
            },
            gate = { StoryPrefetchGate.Open },
        )
    }

    /** Lance une passe, en remplaçant celle qui court. */
    fun start() {
        running?.cancel()
        running = scope.launch { guarded { run() } }
    }

    fun cancel() {
        running?.cancel()
        running = null
    }

    suspend fun join() = running?.join()

    private suspend fun run() {
        if (source.isTrayCached()) return
        val groups = source.fetchGroups(StoryPrefetchPlan.GROUP_LIMIT)?.takeIf { it.isNotEmpty() } ?: return
        val plan = StoryPrefetchPlan.of(groups)
        val policy = gate()
        if (policy.allows(MediaKind.IMAGE)) {
            plan.images.chunked(StoryPrefetchPlan.IMAGE_BATCH).forEach { batch -> fetchBatch(batch, media::image) }
        }
        if (policy.allows(MediaKind.VIDEO)) {
            plan.videos.chunked(StoryPrefetchPlan.VIDEO_BATCH).forEach { batch -> fetchBatch(batch, media::video) }
        }
        if (!source.isTrayCached()) source.saveTray()
    }

    private suspend fun fetchBatch(batch: List<String>, fetch: suspend (String) -> Unit) = coroutineScope {
        ensureActive()
        batch.map { url -> async { guarded { fetch(url) } } }.awaitAll()
    }

    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Un média qui ne descend pas ne coûte que son préchargement : la lecture le chargera.
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
object ConversationStoryPrefetchModule {
    @Provides
    @Singleton
    fun provideConversationStoryPrefetch(
        @ApplicationContext context: Context,
        stories: StoryRepository,
        network: NetworkConditionMonitor,
        preferences: MediaDownloadPreferencesStore,
    ): ConversationStoryPrefetch = ConversationStoryPrefetch(
        source = object : StoryPrefetchSource {
            override suspend fun isTrayCached() = stories.cachedStories().isNotEmpty()

            override suspend fun fetchGroups(limit: Int): List<StoryGroup>? =
                (stories.list(limit = limit) as? me.meeshy.sdk.net.NetworkResult.Success)?.data?.toStoryGroups()

            override suspend fun saveTray() = stories.refresh()
        },
        media = object : StoryMediaPrefetcher {
            override suspend fun image(url: String) {
                context.imageLoader.execute(ImageRequest.Builder(context).data(url).build())
            }

            override suspend fun video(url: String) {
                MeeshyMediaCache.get(context).prefetch(MediaCacheCategory.VIDEO, url)
            }
        },
        gate = {
            val condition = network.condition.value
            val prefs = preferences.preferences.value
            StoryPrefetchGate { kind ->
                MediaAutoDownloadDecider.decide(kind, MediaAvailability.NEEDS_DOWNLOAD, condition, prefs).shouldDownload
            }
        },
    )
}
