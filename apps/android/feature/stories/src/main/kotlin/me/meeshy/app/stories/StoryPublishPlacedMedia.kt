package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.composer.SceneObjectCaps
import me.meeshy.sdk.model.scene.ForegroundMediaFrame

/** Les médias posés d'une slide tels qu'ils partent en `mediaObjects[]`, à côté du fond. */
internal object StoryPublishPlacedMedia {

    /**
     * Résout les médias posés de [slide] : seuls ceux que la slide porte encore et qui ne sont pas son fond, dans
     * l'ordre de pose. Un média encore en téléversement hors ligne part sans URL sous son `cmid` (comme le fond) : la
     * réécriture de l'outbox met l'identifiant réel.
     */
    fun resolve(slide: StorySlide, state: StoryComposerUiState): List<StoryMediaObject> =
        slide.placedMedia
            .filter { it.mediaId in slide.mediaIds && it.mediaId != slide.backgroundMediaId }
            .mapNotNull { placed ->
                state.attachments.firstOrNull { it.id == placed.mediaId }?.let { media ->
                    placed.toMediaObject(
                        url = media.url,
                        mimeType = media.mimeType,
                        durationSeconds = media.durationMs?.let { it / 1000.0 },
                        aspectRatio = ForegroundMediaFrame.measuredAspectRatio(media.width, media.height),
                    )
                } ?: state.pendingUploads.firstOrNull { it.cmid == placed.mediaId }?.let { pending ->
                    placed.toMediaObject(null, pending.item.mimeType, null)
                }
            }

    /** Le fond puis les médias posés, sans dépasser cinquante images ni cinquante vidéos par scène. */
    fun withinCaps(background: StoryMediaObject?, placed: List<StoryMediaObject>): List<StoryMediaObject> {
        val kept = mutableListOf<StoryMediaObject>()
        var images = 0
        var videos = 0
        (listOfNotNull(background) + placed).forEach { media ->
            val video = media.mediaType == "video"
            if (video && videos >= SceneObjectCaps.VIDEO) return@forEach
            if (!video && images >= SceneObjectCaps.IMAGE) return@forEach
            if (video) videos++ else images++
            kept += media
        }
        return kept
    }
}
