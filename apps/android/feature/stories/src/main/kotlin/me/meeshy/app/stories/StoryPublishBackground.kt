package me.meeshy.app.stories

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.scene.StoryBackgroundFraming

/** Le fond média qu'une slide publie : le média désigné et son cadrage (le filtre de la scène voyage sur les effets). */
internal object StoryPublishBackground {

    /**
     * Resolves a [slide]'s designated background media to the [StoryBackgroundMedia] the
     * wire mapping needs, from the already-uploaded [attachments]. Returns `null` when
     * nothing is designated or the id has no uploaded media yet (a still-pending offline
     * upload has no server URL to point the reader's background layer at, so it publishes
     * as a plain flat-media slide until the upload lands) — never a broken object. Carries
     * the slide's author-chosen [StorySlide.backgroundLoop] (honoured only for a video) and
     * the [resolveBackgroundFraming] pan/zoom (honoured for a framed image or video alike).
     */
    fun resolve(slide: StorySlide, state: StoryComposerUiState): StoryBackgroundMedia? {
        val attachments = state.attachments
        val media = slide.backgroundMediaId?.let { bgId -> attachments.firstOrNull { it.id == bgId } } ?: return null
        return StoryBackgroundMedia(
            mediaId = media.id,
            url = media.url,
            mimeType = media.mimeType,
            durationSeconds = media.durationMs?.let { it / 1000.0 },
            loop = slide.backgroundLoop,
            framing = resolveBackgroundFraming(slide, media, state),
        )
    }

    /**
     * Projects the slide's canvas pan/zoom onto the wire's normalised framing — but only when
     * the designated background is the media the canvas actually frames. The composer canvas
     * renders (and the pan/zoom gesture reframes) the slide's **first** resolved attachment;
     * if the author designated a *different* attachment as the background, that gesture never
     * framed it, so its framing stays [StoryBackgroundFraming.IDENTITY] rather than borrowing a
     * pan the author applied to another attachment. Applies to an image or a video background
     * identically — each client's reader honours the framing on both.
     */
    private fun resolveBackgroundFraming(slide: StorySlide, media: UploadedMedia, state: StoryComposerUiState): StoryBackgroundFraming {
        val framedMediaId = slide.mediaIds.firstOrNull { id -> state.attachments.any { it.id == id } }
        if (media.id != framedMediaId) return StoryBackgroundFraming.IDENTITY
        return slide.transform.toBackgroundFraming(state.canvasWidthPx, state.canvasHeightPx)
    }
}
