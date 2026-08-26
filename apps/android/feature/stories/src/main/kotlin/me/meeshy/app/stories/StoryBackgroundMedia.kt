package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaObject

/**
 * The resolved metadata of the media a composer slide has designated as its single
 * looping background — everything the reader needs to render it as the slide's
 * background layer and to derive the slide duration from it.
 *
 * The pure composer deck ([StorySlide.backgroundMediaId]) holds only the media *id*;
 * the ViewModel resolves that id to this value from the [me.meeshy.sdk.model.UploadedMedia]
 * it already tracks, so the wire mapping ([toMediaObject]) stays a pure, unit-tested
 * function rather than reaching into upload state.
 *
 * Mirrors iOS designating exactly one canvas media object `isBackground: true` per
 * slide; the produced object is what the Android viewer's `resolveBackgroundMedia`
 * (`firstOrNull { it.isBackground }`) and the `StorySlideDuration` `bgVideoDur` branch
 * already read on the reader side.
 */
data class StoryBackgroundMedia(
    val mediaId: String,
    val url: String,
    val mimeType: String,
    val durationSeconds: Double?,
    val loop: Boolean = true,
    val framing: StoryBackgroundFraming = StoryBackgroundFraming.IDENTITY,
) {
    /** A `video/…` MIME denotes a looping background video; anything else is an image. */
    val isVideo: Boolean get() = mimeType.startsWith("video", ignoreCase = true)

    /** The strictly-positive duration to publish (a video's loop period), or `null`. */
    private val publishableDuration: Double? get() = durationSeconds?.takeIf { it > 0.0 }

    /**
     * Builds the `isBackground` [StoryMediaObject] the reader honours. A video carries
     * its [durationSeconds] onto both `intrinsicDuration` and `duration` so the reader's
     * `StorySlideDuration` `bgVideoDur` branch can loop the slide to at least the video's
     * length; an image carries no duration (it does not drive slide length).
     *
     * [loop] is honoured **only for a video** — mirroring iOS's `supportsLoop` (looping is
     * a video/audio-background affordance, never an image's): the reader's video branch
     * reads `backgroundObject?.loop ?: true`, while its image branch is unconditionally
     * looping. Emitting the author's `loop = false` onto an image would be a wire value no
     * reader honours, so an image always publishes `loop = true`.
     *
     * [framing] (the author's pan/zoom) is carried as normalised `x`/`y`/`scale` **only for
     * an image** — the reader's image branch converts these back via
     * [StoryBackgroundObjectTransform.from], closing the author→reader loop; its video branch
     * keeps IDENTITY (a scoped-out follow-up), so a video publishes the bare centred defaults
     * rather than a framing no client would honour.
     */
    fun toMediaObject(): StoryMediaObject {
        val framed = if (isVideo) StoryBackgroundFraming.IDENTITY else framing
        return StoryMediaObject(
            id = mediaId,
            postMediaId = mediaId,
            mediaURL = url,
            mediaType = if (isVideo) "video" else "image",
            placement = "media",
            x = framed.x,
            y = framed.y,
            scale = framed.scale,
            isBackground = true,
            loop = if (isVideo) loop else true,
            intrinsicDuration = publishableDuration?.takeIf { isVideo },
            duration = publishableDuration?.takeIf { isVideo },
        )
    }
}
