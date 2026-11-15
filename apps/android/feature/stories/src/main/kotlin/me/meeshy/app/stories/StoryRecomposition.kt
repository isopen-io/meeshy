package me.meeshy.app.stories

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.LocalMediaFileResolver
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.scene.SceneExportCoordinatorFactory
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryRepository
import java.io.File
import javax.inject.Inject

/**
 * **« Composer » depuis une story VUE sème la scène ENTIÈRE** (#13849, iOS `StoryRecomposition` + `StoryRecompositionSeeding`) :
 * textes, stickers, lieux, dessin, fond, médias posés et sons de la story, dans une scène NEUVE de l'auteur — jamais une
 * republication (aucun lien vers la source) ni une édition. Une publication réclame ses médias par des identifiants dont
 * l'auteur est le propriétaire : chaque média est donc rapatrié puis téléversé à nouveau sous son compte, et la scène ne
 * nomme que ces nouveaux identifiants. Un son de la bibliothèque n'est à personne : il voyage tel quel.
 */
internal object StoryRecomposition {

    /** Un média que la scène montre ou joue, à rapatrier : son identifiant d'origine, son adresse servie, son type. */
    data class Asset(val mediaId: String, val url: String, val mimeType: String)

    sealed interface Plan {
        /** La scène telle qu'elle s'ouvrira, et les médias à faire siens, dans l'ordre de [assets]. */
        data class Ready(val opening: StoryEditOpening, val assets: List<Asset>) : Plan

        /** Rien à recomposer, ou une part de la scène que le composeur ne sait pas tenir : jamais une scène amputée. */
        data object Refused : Plan
    }

    /**
     * « Composer » n'est OFFERT que sur une story que le composeur saura reprendre à l'identique (iOS `composableSlide`,
     * `StoryRecomposition.init?`) : aucun sticker qu'il ne sait pas tenir (image, modèle), et quelque chose à reprendre —
     * un média, un texte, un objet, un trait, un son, ou la seule couleur du fond. Le lecteur et le plan lisent la MÊME règle :
     * jamais une entrée qui s'ouvre sur un refus.
     */
    fun offered(effects: StoryEffects?, content: String?, mediaCount: Int): Boolean {
        val scene = effects ?: StoryEffects()
        if (scene.stickerObjects.orEmpty().any { !it.editable }) return false
        return mediaCount > 0 || !content.isNullOrBlank() || !scene.background.isNullOrBlank() ||
            scene.textObjects.isNotEmpty() || scene.stickerObjects.orEmpty().isNotEmpty() || scene.locationObjects.isNotEmpty() ||
            scene.drawingStrokes.orEmpty().isNotEmpty() || scene.audioPlayerObjects.orEmpty().isNotEmpty() ||
            scene.mediaObjects.orEmpty().isNotEmpty()
    }

    fun plan(post: ApiPost): Plan {
        if (!offered(post.storyEffects, post.content, post.media.orEmpty().size)) return Plan.Refused
        val opening = StoryEditOpening.open(post, mentionsKnown = false)
        if (opening.foreignStickers.isNotEmpty()) return Plan.Refused
        val slide = opening.slide
        val served = post.media.orEmpty().associateBy { it.id }
        val ids = (slide.mediaIds + slide.audio.map { it.postMediaId }).filter { it.isNotBlank() }.distinct()
        val assets = ids.map { id ->
            val media = served[id]
            val attached = opening.attachments.firstOrNull { it.id == id }
            val url = media?.fileUrl ?: attached?.url ?: slide.audio.firstOrNull { it.postMediaId == id }?.mediaURL
            val mime = media?.mimeType ?: attached?.mimeType
            if (url.isNullOrBlank() || mime.isNullOrBlank()) return Plan.Refused
            Asset(id, url, mime)
        }
        return Plan.Ready(opening, assets)
    }

    /** La scène semée : chaque média renommé par celui de l'auteur ([uploaded], dans l'ordre du plan), sans lien vers la source. */
    fun applied(state: StoryComposerUiState, plan: Plan.Ready, uploaded: List<UploadedMedia>): StoryComposerUiState {
        if (uploaded.size != plan.assets.size) return state
        val renamed = plan.assets.map { it.mediaId }.zip(uploaded).toMap()
        fun id(old: String): String = renamed[old]?.id ?: old
        val source = plan.opening.slide
        val slide = source.copy(
            mediaIds = source.mediaIds.map(::id),
            backgroundMediaId = source.backgroundMediaId?.let(::id),
            placedMedia = source.placedMedia.map { it.copy(mediaId = id(it.mediaId), id = if (it.id == it.mediaId) id(it.id) else it.id) },
            audio = source.audio.map { track ->
                renamed[track.postMediaId]?.let { fresh -> track.copy(postMediaId = fresh.id, mediaURL = fresh.url) } ?: track
            },
        )
        return state.copy(
            editing = false,
            deck = StorySlideDeck(listOf(slide), slide.id),
            attachments = uploaded,
            pendingUploads = emptyList(),
            draft = state.draft.copy(repostOfId = null),
        ).mirrorDraftToSelection()
    }
}

/** La recomposition prête à semer : le plan et les médias désormais à l'auteur. */
internal data class StoryRecomposed(val plan: StoryRecomposition.Plan.Ready, val uploaded: List<UploadedMedia>)

/**
 * Prépare la recomposition de la story [recompose] : la relit (au serveur, sinon au cache), rapatrie chaque média ([fetch] :
 * le cache typé d'abord, le réseau ensuite), puis les téléverse sous le compte de l'auteur. `null` : la story n'est plus
 * là, une part de sa scène ne se tient pas, un média ne revient pas, ou le téléversement est refusé.
 */
internal class StoryRecomposer(
    private val reader: StoryServedReader,
    private val stories: StoryRepository,
    private val uploader: StoryMediaUploader,
    private val fetch: suspend (StoryRecomposition.Asset) -> MediaUploadItem?,
) {
    @Inject
    constructor(
        reader: StoryServedReader,
        stories: StoryRepository,
        uploader: StoryMediaUploader,
        fetcher: StoryRecompositionFetcher,
    ) : this(reader, stories, uploader, fetcher::fetch)

    suspend fun recompose(storyId: String): StoryRecomposed? {
        val post = reader.read(storyId)?.post ?: stories.cachedStories().firstOrNull { it.id == storyId } ?: return null
        val plan = StoryRecomposition.plan(post) as? StoryRecomposition.Plan.Ready ?: return null
        val items = coroutineScope { plan.assets.map { asset -> async { fetch(asset) } }.awaitAll() }
        if (items.any { it == null }) return null
        val uploaded = (uploader.upload(items.filterNotNull()) as? NetworkResult.Success)?.data ?: return null
        return StoryRecomposed(plan, uploaded).takeIf { uploaded.size == plan.assets.size }
    }
}

/** Rapatrie un média de story : le fichier du cache typé s'il y est, sinon le réseau ; copié dans le cache d'envoi. */
internal class StoryRecompositionFetcher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val factory: SceneExportCoordinatorFactory,
) {
    private val cache = LocalMediaFileResolver(MediaCacheDirs(context.cacheDir, context.cacheDir))

    suspend fun fetch(asset: StoryRecomposition.Asset): MediaUploadItem? = withContext(Dispatchers.IO) {
        val url = factory.mediaUrl(asset.url)
        val cached = cache.fileFor(categoryOf(asset.mimeType), url)
        if (cached != null) return@withContext copied(cached, asset)
        val target = File(context.cacheDir, "recompose-${System.nanoTime()}")
        try {
            factory.fetcher.fetch(url, target)
            copied(target, asset)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        } finally {
            target.delete()
        }
    }

    private fun copied(file: File, asset: StoryRecomposition.Asset): MediaUploadItem? =
        runCatching { file.inputStream().use { MediaIntake.copy(it, context.cacheDir, file.name, asset.mimeType) } }.getOrNull()

    private fun categoryOf(mime: String): MediaCacheCategory = when {
        mime.startsWith("video", ignoreCase = true) -> MediaCacheCategory.VIDEO
        mime.startsWith("audio", ignoreCase = true) -> MediaCacheCategory.AUDIO
        else -> MediaCacheCategory.IMAGES
    }
}
