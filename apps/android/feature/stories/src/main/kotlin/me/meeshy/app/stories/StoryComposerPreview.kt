package me.meeshy.app.stories

import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.ui.component.retouch.ComposerLookAuthor

/**
 * « ⋯ › Aperçu » (#13845, iOS `performSoclePreview`) : la composition telle qu'elle sera LUE. Chaque diapo publiable devient
 * la story que la publication enverrait — la même charge que [publishPlans] — puis passe par la projection du lecteur
 * ([StorySlideProjector]) et le lecteur partagé ([StoryScenePlayer]) : l'aperçu ne recopie aucun rendu (loi 6). Un média
 * encore hors ligne n'a pas d'adresse lisible et ne s'y peint pas. La charge ne porte jamais de look (la publication le
 * cuit) : l'aperçu les remet à la projection ([scenes], #13841), pour montrer ce que les lecteurs verront.
 */
internal object StoryComposerPreview {

    fun items(state: StoryComposerUiState, language: String, floor: StoryBackgroundValue?): List<StoryItem> =
        publishPlans(state, language, floor = floor).mapIndexed { index, plan -> plan.request.toPreviewItem(index, state) }

    /**
     * Les looks de chaque diapo publiable, dans l'ordre de [items], par l'adresse que le lecteur charge : celle que la scène
     * nomme, et celle de la pièce téléversée.
     */
    fun looks(state: StoryComposerUiState, mediaBaseUrl: String?): List<Map<String, StoryMediaLook>> {
        val slides = state.deck.publishableSlides
        return publishPlans(state, LOOK_LANGUAGE, slides).zip(slides) { plan, slide ->
            slide.mediaLooks.flatMap { (id, look) -> plan.request.addressesOf(id, state.attachments, mediaBaseUrl).map { it to look } }.toMap()
        }
    }

    /** La taille debout, servie, de chaque vidéo réglée de chaque diapo publiable, par les mêmes adresses que [looks]. */
    private fun videoSizes(state: StoryComposerUiState, mediaBaseUrl: String?): List<Map<String, Pair<Int, Int>>> {
        val slides = state.deck.publishableSlides
        return publishPlans(state, LOOK_LANGUAGE, slides).zip(slides) { plan, slide ->
            slide.mediaLooks.keys.flatMap { id ->
                val size = state.attachments.firstOrNull { it.id == id }?.videoSize() ?: return@flatMap emptyList()
                plan.request.addressesOf(id, state.attachments, mediaBaseUrl).map { it to size }
            }.toMap()
        }
    }

    private fun UploadedMedia.videoSize(): Pair<Int, Int>? {
        if (!mimeType.startsWith("video", ignoreCase = true)) return null
        return width?.let { w -> height?.let { h -> w to h } }
    }

    /** Chaque diapo publiable et la scène que le lecteur en peint, ses looks compris quand [author] les signe. */
    fun scenes(
        state: StoryComposerUiState,
        language: String,
        floor: StoryBackgroundValue?,
        mediaBaseUrl: String?,
        author: ComposerLookAuthor?,
        project: (StoryItem) -> StorySlideView,
    ): List<Pair<StoryItem, StorySlideView>> {
        val looks = author?.let { looks(state, mediaBaseUrl) }.orEmpty()
        val sizes = author?.let { videoSizes(state, mediaBaseUrl) }.orEmpty()
        return items(state, language, floor).mapIndexed { index, item ->
            val view = project(item)
            val painted = author?.let { signer -> looks.getOrNull(index)?.let { StorySceneMediaLooks.of(it, signer, sizes.getOrNull(index).orEmpty()) } }
            item to if (painted == null) view else view.copy(composerLooks = painted)
        }
    }

    private fun CreateStoryRequest.toPreviewItem(index: Int, state: StoryComposerUiState): StoryItem = StoryItem(
        id = "$PREVIEW_ID_PREFIX$index",
        content = content,
        media = mediaIds.orEmpty().mapNotNull { id -> state.attachments.firstOrNull { it.id == id }?.toFeedMedia() },
        storyEffects = storyEffects,
        visibility = visibility,
        originalLanguage = originalLanguage,
    )

    /** Les adresses que le lecteur charge pour la pièce [id] : celles que la scène nomme, et celle de la pièce téléversée. */
    private fun CreateStoryRequest.addressesOf(id: String, attachments: List<UploadedMedia>, mediaBaseUrl: String?): List<String> {
        val piece = attachments.firstOrNull { it.id == id }
        val named = storyEffects?.mediaObjects.orEmpty().filter { it.postMediaId == id }.mapNotNull { it.mediaURL ?: piece?.url }
        return (named + listOfNotNull(piece?.url)).map { resolveMediaUrl(it, mediaBaseUrl) }
    }

    private fun UploadedMedia.toFeedMedia(): FeedMedia = FeedMedia(
        id = id,
        type = when {
            mimeType.startsWith("video", ignoreCase = true) -> FeedMediaType.VIDEO
            mimeType.startsWith("audio", ignoreCase = true) -> FeedMediaType.AUDIO
            else -> FeedMediaType.IMAGE
        },
        url = url,
        thumbnailUrl = thumbnailUrl,
        width = width,
        height = height,
        duration = durationMs?.let { (it / MILLIS_PER_SECOND).toInt() },
    )

    private const val PREVIEW_ID_PREFIX = "composer-preview-"
    private const val MILLIS_PER_SECOND = 1000L
    private const val LOOK_LANGUAGE = "und"
}
